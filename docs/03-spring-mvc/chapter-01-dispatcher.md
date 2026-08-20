# DispatcherServlet

## 从 Servlet 到 DispatcherServlet

在 Spring MVC 出现之前，Java Web 开发的世界长这样：

```java
public class UserServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {
        String action = req.getParameter("action");
        
        if ("list".equals(action)) {
            // 查询用户列表
            List<User> users = userService.findAll();
            req.setAttribute("users", users);
            req.getRequestDispatcher("/WEB-INF/views/user/list.jsp")
               .forward(req, resp);
        } else if ("detail".equals(action)) {
            // 查询用户详情
            String id = req.getParameter("id");
            User user = userService.findById(Long.parseLong(id));
            req.setAttribute("user", user);
            req.getRequestDispatcher("/WEB-INF/views/user/detail.jsp")
               .forward(req, resp);
        } else if ("create".equals(action)) {
            // 创建用户... 又是几十行
        }
        // 还有 update、delete... 每个实体都要写这么一套
    }
}
```

然后在 `web.xml` 里注册一大堆 Servlet 映射：

```xml
<servlet>
    <servlet-name>userServlet</servlet-name>
    <servlet-class>com.example.UserServlet</servlet-class>
</servlet>
<servlet-mapping>
    <servlet-name>userServlet</servlet-name>
    <url-pattern>/user</url-pattern>
</servlet-mapping>
<!-- 还有 orderServlet、productServlet、adminServlet... -->
```

这段代码有三个致命问题：

**第一，URL 路由全靠 if-else。** 每个请求都走同一个 `service` 方法，里面用 `getParameter("action")` 来区分行为。稍微复杂的项目，一个 Servlet 里能写几百行 if-else，改一个分支要读完整个方法。

**第二，参数处理全靠手。** `req.getParameter("id")` 拿到的是 `String`，要自己转 `Long`，自己做校验，自己处理空值。参数多了，光是参数解析就要写一堆重复代码。

**第三，一个 URL 对应一个 Servlet 类。** 用户模块一个，订单模块一个，商品模块一个。每个类都是 `doGet` + `doPost` 的模板代码，真正的业务逻辑可能就占 20%。

Spring MVC 的解决方案很优雅：**用一个 Servlet 拦截所有请求，然后根据 URL 分发到不同的方法上去。** 这就是 `DispatcherServlet` 的核心思想。

```java
// Spring MVC 时代：一个方法搞定一个接口
@RestController
@RequestMapping("/users")
public class UserController {

    @GetMapping("/{id}")
    public User detail(@PathVariable Long id) {
        return userService.findById(id);
    }

    @PostMapping
    public User create(@RequestBody UserDTO dto) {
        return userService.create(dto);
    }
}
```

没有 if-else，没有手动参数解析，没有 `web.xml` 配置。一个 Controller 类就能搞定一个模块的所有接口。

这不是魔法，而是 **前端控制器模式（Front Controller）** 的经典实现。所有请求先到一个统一入口（DispatcherServlet），由它决定交给谁处理。你写的那些 `@GetMapping`、`@PostMapping` 只是在告诉它"这个 URL 交给我"。

---

## 启动与初始化流程

DispatcherServlet 本质上还是一个 Servlet，所以它的启动还是从 Servlet 容器（比如 Tomcat）开始。但 Spring Boot 时代，你已经看不到 `web.xml` 了，整个过程被自动化了。

我们先看传统方式，再看 Spring Boot 怎么把这套流程藏起来的。

### 传统方式：web.xml 驱动

```xml
<!-- Spring 的根容器：管理 Service、Repository 等 Bean -->
<context-param>
    <param-name>contextConfigLocation</param-name>
    <param-value>classpath:applicationContext.xml</param-value>
</context-param>
<listener>
    <listener-class>org.springframework.web.context.ContextLoaderListener</listener-class>
</listener>

<!-- Spring MVC 的子容器：管理 Controller、HandlerMapping 等 -->
<servlet>
    <servlet-name>dispatcher</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
    <init-param>
        <param-name>contextConfigLocation</param-name>
        <param-value>classpath:spring-mvc.xml</param-value>
    </init-param>
    <load-on-startup>1</load-on-startup>
</servlet>
```

这里有两个容器，是很多初学者搞混的地方：

- **Root WebApplicationContext**（根容器）：由 `ContextLoaderListener` 创建，装 Service、Repository、DataSource 这些全局 Bean
- **Servlet WebApplicationContext**（子容器）：由 `DispatcherServlet` 创建，装 Controller、HandlerMapping、ViewResolver 这些 MVC 相关的 Bean

子容器能看到父容器的 Bean（所以 Controller 能注入 Service），反过来不行。这是一个父子容器的设计。

### Spring Boot 时代：一切自动化

Spring Boot 没有 `web.xml`，那谁来启动 DispatcherServlet？答案是 `ServletWebServerFactory` + 自动配置。

```java
// Spring Boot 的自动配置帮你做了这些事：
// 1. 创建内嵌的 Tomcat
// 2. 注册 DispatcherServlet
// 3. 扫描 @Controller
// 4. 配置 HandlerMapping、ViewResolver 等
```

核心入口在 `DispatcherServletAutoConfiguration`：

```java
@AutoConfigureOrder(Ordered.HIGHEST_PRECEDENCE)
@Configuration
@ConditionalOnWebApplication(type = Type.SERVLET)
@ConditionalOnClass(DispatcherServlet.class)
public class DispatcherServletAutoConfiguration {

    @Bean(name = DEFAULT_DISPATCHER_SERVLET_BEAN_NAME)
    public DispatcherServlet dispatcherServlet() {
        return new DispatcherServlet();
    }

    @Bean(name = DEFAULT_DISPATCHER_SERVLET_REGISTRATION_BEAN_NAME)
    public DispatcherServletRegistrationBean dispatcherServletRegistration(
            DispatcherServlet dispatcherServlet) {
        // 默认映射 / 路径
        DispatcherServletRegistrationBean registration =
            new DispatcherServletRegistrationBean(dispatcherServlet, "/");
        registration.setName(DEFAULT_DISPATCHER_SERVLET_BEAN_NAME);
        return registration;
    }
}
```

注意映射路径是 `/`，这意味着 **DispatcherServlet 拦截所有请求**（除了 JSP 等特殊路径）。

### 初始化到底做了什么

DispatcherServlet 的初始化核心是 `initStrategies` 方法：

```java
protected void initStrategies(ApplicationContext context) {
    initMultipartResolver(context);    // 文件上传解析器
    initLocaleResolver(context);       // 国际化解析器
    initThemeResolver(context);        // 主题解析器
    initHandlerMappings(context);      // URL → 处理器的映射
    initHandlerAdapters(context);      // 处理器适配器
    initHandlerExceptionResolvers(context); // 异常解析器
    initRequestToViewNameTranslator(context); // 请求→视图名
    initViewResolvers(context);        // 视图解析器
    initFlashMapManager(context);      // Flash 属性管理
}
```

九个 `init` 方法，每个都从容器里找对应的 Bean，找不到就用默认值。整个过程就像一个组装线——先找到所有零件（从容器里 getBean），然后按顺序装上去。

用 Mermaid 画一下启动时序：

![DispatcherServlet 初始化时序](/diagrams/03-01-dispatcher-init-flow.svg)

一个关键细节：**DispatcherServlet 自身不持有这些组件的引用，而是从容器里按类型查找。** 这意味着你可以自定义任何组件——只需要往容器里注册一个 Bean，DispatcherServlet 就能自动发现并使用它。

---

## 九大组件概览

Spring MVC 的核心就是这九个组件，它们各司其职，共同完成从"收到请求"到"返回响应"的全流程。不需要每个都深入理解，先建立整体印象。

| 组件 | 接口 | 职责 |
|------|------|------|
| MultipartResolver | `MultipartResolver` | 解析文件上传请求 |
| LocaleResolver | `LocaleResolver` | 解析客户端区域信息（国际化） |
| ThemeResolver | `ThemeResolver` | 解析主题（现在基本没人用了） |
| HandlerMapping | `HandlerMapping` | 根据请求找到对应的 Handler |
| HandlerAdapter | `HandlerAdapter` | 执行 Handler（调用你的 Controller 方法） |
| HandlerExceptionResolver | `HandlerExceptionResolver` | 处理执行过程中的异常 |
| RequestToViewNameTranslator | `RequestToViewNameTranslator` | 当没有明确视图名时，从请求推断 |
| ViewResolver | `ViewResolver` | 将视图名解析为 View 对象 |
| FlashMapManager | `FlashMapManager` | 管理重定向时的 Flash 属性 |

挑几个最重要的说说：

**HandlerMapping**——DispatcherServlet 的"导航员"。当一个请求 `/api/users/1` 进来，HandlerMapping 负责找到能处理它的方法。Spring MVC 默认注册了多个 HandlerMapping，其中最常用的是 `RequestMappingHandlerMapping`，它读取 `@RequestMapping` 注解来建立映射关系。

**HandlerAdapter**——DispatcherServlet 的"翻译官"。找到了 Handler 之后，怎么调用它？不同的 Handler 有不同的调用方式——有的是 Controller 接口实现，有的是 `@RequestMapping` 方法。HandlerAdapter 把这些差异屏蔽掉，给 DispatcherServlet 统一的调用接口。

**HandlerExceptionResolver**——DispatcherServlet 的"消防员"。Controller 方法抛异常了怎么办？不是直接返回 500，而是交给异常解析器去处理。`@ControllerAdvice` + `@ExceptionHandler` 背后就是这个组件在工作。

后面几章会分别深入讲这些组件，这里先记住它们的存在。

---

## 从源码看 DispatcherServlet 的请求处理

虽然下一章会详细讲请求处理流程，但 DispatcherServlet 本身的 `doDispatch` 方法值得先看一眼，因为它是整个 Spring MVC 的心脏：

```java
protected void doDispatch(HttpServletRequest request, HttpServletResponse response)
        throws Exception {
    
    HttpServletRequest processedRequest = request;
    HandlerExecutionChain mappedHandler = null;
    boolean multipartRequestParsed = false;

    try {
        ModelAndView mv = null;
        Exception dispatchException = null;

        try {
            // 1. 检查是否是文件上传请求
            processedRequest = checkMultipart(request);
            multipartRequestParsed = (processedRequest != request);

            // 2. 根据请求找到 Handler（包括拦截器链）
            mappedHandler = getHandler(processedRequest);
            if (mappedHandler == null) {
                noHandlerFound(processedRequest, response);
                return;
            }

            // 3. 找到对应的 HandlerAdapter
            HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());

            // 4. 执行拦截器的 preHandle
            if (!mappedHandler.applyPreHandle(processedRequest, response)) {
                return;
            }

            // 5. 真正执行 Controller 方法
            mv = ha.handle(processedRequest, response,
                          mappedHandler.getHandler());

            // 6. 执行拦截器的 postHandle
            mappedHandler.applyPostHandle(processedRequest, response, mv);
        }

        // 7. 处理结果（渲染视图或写响应）
        processDispatchResult(processedRequest, response,
                             mappedHandler, mv, dispatchException);
    }
    finally {
        // 8. 执行拦截器的 afterCompletion
        if (mappedHandler != null) {
            mappedHandler.triggerAfterCompletion(request, response, null);
        }
    }
}
```

这段代码读起来就像一份清单：

1. 检查文件上传
2. 找到谁来处理这个请求
3. 找到怎么调用它
4. 拦截器说"放行"
5. 调用你的 Controller 方法
6. 拦截器说"后处理"
7. 把结果渲染出去
8. 拦截器说"收工"

每一步都可以被替换、被扩展。这就是 Spring MVC 的设计哲学：**核心流程固定，每一步的实现可插拔。**

---

## DispatcherServlet 的继承链

最后聊一个容易忽略但很有意思的点：DispatcherServlet 不是一个人，它有很长的家族史。

```
HttpServlet (javax.servlet)
  └─ GenericServlet (javax.servlet)
      └─ HttpServlet (javax.servlet)
          └─ FrameworkServlet (Spring)
              └─ DispatcherServlet (Spring)
```

**HttpServlet**：Servlet 规范的实现，提供 `doGet`、`doPost` 等方法。

**FrameworkServlet**：Spring 在 Servlet 基础上的第一层抽象。它做了一件关键的事——**创建并管理 WebApplicationContext**。`processRequest` 方法在这里，它负责把请求交给子类处理。

**DispatcherServlet**：最终的执行者。它重写了 `onRefresh` 和 `doService`，把九大组件的初始化和请求分发逻辑放了进来。

为什么要搞这么长的继承链？因为 Spring 要考虑"不是 DispatcherServlet"的场景。比如你可能想写一个自定义的 Servlet 但又想用 Spring 容器管理的 Bean——直接继承 `FrameworkServlet` 就行，不需要 DispatcherServlet 那套分发逻辑。

这种分层设计看起来繁琐，但给了你选择的自由度。

---

## 小结

DispatcherServlet 是 Spring MVC 的入口，它的核心思想是**前端控制器模式**：所有请求统一进入一个 Servlet，由它分发给不同的处理器。

启动时，它从 Spring 容器中发现并组装九大组件（HandlerMapping、HandlerAdapter、ViewResolver 等）。这些组件各司其职，共同完成请求处理。

要记住的关键点：

1. **一个 Servlet 拦截所有请求**，而不是一个 URL 一个 Servlet
2. **父子容器设计**——Root 容器放 Service/Repository，MVC 容器放 Controller/组件
3. **组件可插拔**——每一步都可以替换默认实现
4. **Spring Boot 自动配置**帮你在幕后完成了所有初始化

下一章，我们来看 `doDispatch` 方法里的具体流程：一个请求从进入 DispatcherServlet 到返回响应，中间到底经历了什么。
