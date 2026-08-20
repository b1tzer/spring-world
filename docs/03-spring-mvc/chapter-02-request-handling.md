# 请求处理流程

## HandlerMapping 寻找处理器

上一章我们看到了 `doDispatch` 方法的大致流程。这一章我们拆开来看每一个步骤。

第一个关键步骤是：**这个请求该交给谁处理？**

```java
// DispatcherServlet.doDispatch() 中的第 2 步
mappedHandler = getHandler(processedRequest);
```

`getHandler` 方法遍历所有注册的 `HandlerMapping`，问每一个："你能处理这个请求吗？"

```java
protected HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception {
    if (this.handlerMappings != null) {
        for (HandlerMapping mapping : this.handlerMappings) {
            HandlerExecutionChain handler = mapping.getHandler(request);
            if (handler != null) {
                return handler;
            }
        }
    }
    return null;
}
```

Spring MVC 默认注册了几个 HandlerMapping，最重要的有两个：

**RequestMappingHandlerMapping**：读取 `@RequestMapping`（包括 `@GetMapping`、`@PostMapping` 等）注解，建立 URL 到方法的映射。这是你用得最多的。

**BeanNameUrlHandlerMapping**：根据 Bean 的名字来映射，比如一个叫 `/users` 的 Bean 会处理 `/users` 请求。这是古老的方式，现在很少用了。

### RequestMappingHandlerMapping 的工作原理

当 Spring 启动扫描到 `@Controller` 类时，`RequestMappingHandlerMapping` 会遍历类中所有带 `@RequestMapping` 的方法，把它们注册到一个内部的映射表里。

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")        // 注册为：GET /api/users/{id}
    public User detail(@PathVariable Long id) { ... }

    @PostMapping               // 注册为：POST /api/users
    public User create(@RequestBody UserDTO dto) { ... }

    @GetMapping                // 注册为：GET /api/users
    public List<User> list() { ... }
}
```

启动后，RequestMappingHandlerMapping 内部维护了一张类似这样的映射表：

```
GET  /api/users      → UserController#list()
GET  /api/users/{id} → UserController#detail()
POST /api/users      → UserController#create()
```

当请求 `GET /api/users/42` 进来时，它会匹配 `GET /api/users/{id}` 这个模式，然后返回对应的 `HandlerMethod` 对象（封装了 Controller 实例和方法的引用）。

### HandlerExecutionChain：不只是一个方法

注意 `getHandler` 返回的不是简单的 Handler，而是一个 `HandlerExecutionChain`：

```java
public class HandlerExecutionChain {
    private final Object handler;                    // 实际的处理器
    private final List<HandlerInterceptor> interceptorList; // 拦截器链
}
```

它把处理器和拦截器打包在一起了。这样 DispatcherServlet 后面就可以按顺序执行拦截器的 `preHandle` → 执行处理器 → 执行拦截器的 `postHandle`。

### 匹配的优先级问题

如果多个 `@RequestMapping` 都能匹配同一个请求怎么办？

```java
@GetMapping("/api/users/{id}")
public User getUserById(@PathVariable Long id) { ... }

@GetMapping("/api/users/me")
public User getCurrentUser() { ... }
```

请求 `GET /api/users/me` 会匹配谁？答案是 `getCurrentUser()`。因为 Spring 会优先匹配**更具体的路径**——没有路径变量的比有路径变量的具体，字面量多的比字面量少的具体。

如果你的映射有歧义，Spring 启动时就会报错：`Ambiguous handler methods mapped`。这是一个好机制——宁可启动失败，也不要运行时随机选择。

---

## HandlerAdapter 执行处理器

找到了处理器，下一步是执行它。但 DispatcherServlet 不直接调用 Handler，而是通过 `HandlerAdapter` 来调用。

```java
// DispatcherServlet.doDispatch() 中的第 3、5 步
HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());
mv = ha.handle(processedRequest, response, mappedHandler.getHandler());
```

为什么要多此一举？直接调用不行吗？

### 为什么需要 Adapter 模式

问题在于：Spring MVC 支持多种形式的处理器。

**形式一：Controller 接口（老方式）**

```java
public class UserController implements Controller {
    @Override
    public ModelAndView handleRequest(HttpServletRequest req,
                                       HttpServletResponse resp) {
        return new ModelAndView("user/list", "users", userService.findAll());
    }
}
```

**形式二：@RequestMapping 方法（主流方式）**

```java
@GetMapping("/users")
public List<User> list() {
    return userService.findAll();
}
```

**形式三：HttpRequestHandler（静态资源处理）**

```java
public class ResourceHttpRequestHandler implements HttpRequestHandler {
    @Override
    public void handleRequest(HttpServletRequest req,
                               HttpServletResponse resp) {
        // 返回静态资源文件
    }
}
```

这三种处理器的调用方式完全不同。Controller 接口是 `handleRequest(request, response)`，`@RequestMapping` 方法是通过反射调用，HttpRequestHandler 又是另一套。

如果没有 Adapter，DispatcherServlet 就得写一堆 `if-else` 来判断处理器类型，然后用不同的方式调用。这正是第一章里 Servlet 时代的毛病。

有了 Adapter，DispatcherServlet 只需要问："谁能调用这个处理器？" 然后交给 Adapter 就行了。

### HandlerAdapter 的实现

Spring MVC 默认注册了几个 HandlerAdapter：

| Adapter | 处理的 Handler 类型 |
|---------|-------------------|
| `RequestMappingHandlerAdapter` | `@RequestMapping` 方法（HandlerMethod） |
| `HttpRequestHandlerAdapter` | `HttpRequestHandler` 实现 |
| `SimpleControllerHandlerAdapter` | `Controller` 接口实现 |

`getHandlerAdapter` 的逻辑很简单——遍历所有 Adapter，问它 `supports(handler)` 返回 true 就用它。

```java
protected HandlerAdapter getHandlerAdapter(Object handler) throws ServletException {
    if (this.handlerAdapters != null) {
        for (HandlerAdapter adapter : this.handlerAdapters) {
            if (adapter.supports(handler)) {
                return adapter;
            }
        }
    }
    throw new ServletException("No adapter for handler [" + handler + "]");
}
```

对于 `@RequestMapping` 方法，`RequestMappingHandlerAdapter` 会通过反射调用你的 Controller 方法。它在调用前还会做参数解析（下一章讲）、数据绑定等准备工作。

这整个设计就是经典的 **适配器模式**——DispatcherServlet 是调用方，HandlerAdapter 是适配器，各种 Handler 是被适配的对象。新增一种 Handler 类型，只需要加一个 Adapter，DispatcherServlet 的代码一行不用改。

---

## ModelAndView 到 ViewResolver

Controller 方法执行完后，返回值被封装成 `ModelAndView`。但先别急着看 ViewResolver，我们先搞清楚一个现实问题。

### 前后端分离时代还需要了解这些吗？

说实话，**在纯 REST API 项目里，你基本不会直接用到 ViewResolver。** 因为 `@RestController` 的方法返回值直接通过 `HttpMessageConverter` 写入响应体，根本不会走视图渲染流程。

但了解它有两个好处：

1. **理解 Spring MVC 的完整设计**——视图渲染是 MVC 模式的核心环节，不理解它就只能算"会用注解"。
2. **有些场景还是需要**——比如导出 PDF/Excel、邮件模板渲染、服务端渲染的管理后台。

### 传统的视图渲染流程

在前后端不分离的时代（JSP、Thymeleaf），Controller 返回的是"数据 + 视图名"：

```java
@GetMapping("/users")
public String list(Model model) {
    List<User> users = userService.findAll();
    model.addAttribute("users", users);
    return "user/list"; // 视图名
}
```

这个 `"user/list"` 字符串会被 `ViewResolver` 解析成一个实际的 View 对象。比如 `InternalResourceViewResolver` 会把它映射到 `/WEB-INF/views/user/list.jsp`。

![请求处理与视图解析时序](/diagrams/03-02-request-view-flow.svg)

### HandlerMethodReturnValueHandler

在到达 ViewResolver 之前，Controller 方法的返回值要先被处理。这里有一个关键接口：`HandlerMethodReturnValueHandler`。

```java
public interface HandlerMethodReturnValueHandler {
    boolean supportsReturnType(MethodParameter returnType);
    void handleReturnValue(Object returnValue, MethodParameter returnType,
                          ModelAndViewContainer mavContainer,
                          NativeWebRequest webRequest) throws Exception;
}
```

不同的返回值类型有不同的处理器：

- `String` → `ViewNameMethodReturnValueHandler`：当作视图名
- `ModelAndView` → `ModelAndViewMethodReturnValueHandler`：直接用
- `@ResponseBody` 标注的方法 → `RequestResponseBodyMethodProcessor`：写响应体（不走视图）
- `void` → `ViewMethodReturnValueHandler`：不处理返回值

这就是为什么 `@RestController` 不走视图——它隐含了 `@ResponseBody`，返回值处理器直接把结果序列化为 JSON 写入响应，`ModelAndView` 的 view 是 null，DispatcherServlet 看到 view 为 null 就跳过视图渲染。

```java
// @RestController 注解的定义
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Controller
@ResponseBody  // <--- 就是这个
public @interface RestController {
    // ...
}
```

---

## 完整的请求处理流程

现在把所有步骤串起来，画一张完整的流程图：

![doDispatch 完整请求处理流程](/diagrams/03-02-dodispatch-flow.svg)

用文字再过一遍：

1. **请求进入** DispatcherServlet 的 `doDispatch` 方法
2. **检查文件上传**——如果是 multipart 请求，包装一下
3. **查找 Handler**——遍历所有 HandlerMapping，找到匹配的 Handler + 拦截器链
4. **查找 HandlerAdapter**——找到能调用这个 Handler 的适配器
5. **执行拦截器 preHandle**——任何一个拦截器返回 false 就中断
6. **执行 Controller 方法**——通过 HandlerAdapter 调用，返回 ModelAndView
7. **执行拦截器 postHandle**——可以修改 ModelAndView
8. **处理返回结果**——如果有视图就渲染，没有就直接写响应
9. **执行拦截器 afterCompletion**——无论成功失败都会执行

整个过程设计得像一条流水线，每个环节都可以被替换或扩展。Spring MVC 的大部分自定义功能——参数解析、异常处理、消息转换——都是在这条流水线的不同节点上插入自定义逻辑。

---

## 一个实际例子

把上面的知识串起来，看一个完整的请求生命周期：

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")
    public User detail(@PathVariable Long id) {
        return userService.findById(id);
    }
}
```

请求 `GET /api/users/42` 进来后：

1. **HandlerMapping** 匹配到 `GET /api/users/{id}`，返回 `HandlerMethod(UserController, detail)`
2. **HandlerAdapter** 是 `RequestMappingHandlerAdapter`（因为 Handler 是 `HandlerMethod` 类型）
3. **参数解析** 把路径中的 `42` 解析为 `Long id`
4. **调用** `userController.detail(42L)`
5. **返回值处理** 因为有 `@ResponseBody`，通过 `HttpMessageConverter` 把 User 对象序列化为 JSON
6. **响应** 直接返回 JSON，不走视图渲染

整个过程中，你只写了一行 `return userService.findById(id);`，剩下的都是框架帮你做的。

---

## 小结

这一章的核心是三个步骤：**找 Handler → 用 Adapter 调用 → 处理返回值**。

关键设计思想：

1. **HandlerMapping 的职责单一**——只负责"URL 到处理器"的映射，不关心怎么调用
2. **Adapter 模式解耦**——DispatcherServlet 不需要知道 Handler 的具体类型，通过 Adapter 统一调用
3. **返回值处理可插拔**——通过 `HandlerMethodReturnValueHandler` 支持各种返回值类型
4. **视图渲染是可选的**——在 REST API 场景下完全跳过

下一章我们深入看参数解析：Controller 方法上的那些 `@RequestParam`、`@PathVariable`、`@RequestBody` 到底是怎么工作的。
