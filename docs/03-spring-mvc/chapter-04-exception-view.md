# 异常处理与视图

## @ControllerAdvice + @ExceptionHandler：全局异常处理

代码写得再好，异常总会发生。参数格式错误、资源不存在、数据库连接超时、业务规则校验不通过——这些问题不可能在 Controller 方法里全部处理完。

在没有全局异常处理之前，代码长这样：

```java
@RestController
@RequestMapping("/users")
public class UserController {

    @GetMapping("/{id}")
    public Result<User> detail(@PathVariable Long id) {
        try {
            User user = userService.findById(id);
            if (user == null) {
                return Result.fail(404, "用户不存在");
            }
            return Result.success(user);
        } catch (BusinessException e) {
            return Result.fail(e.getCode(), e.getMessage());
        } catch (Exception e) {
            log.error("查询用户失败", e);
            return Result.fail(500, "系统内部错误");
        }
    }

    @PostMapping
    public Result<User> create(@RequestBody @Valid UserDTO dto) {
        try {
            return Result.success(userService.create(dto));
        } catch (DuplicateKeyException e) {
            return Result.fail(409, "用户名已存在");
        } catch (Exception e) {
            log.error("创建用户失败", e);
            return Result.fail(500, "系统内部错误");
        }
    }
    // 每个方法都要套 try-catch，烦不烦？
}
```

每个方法都要写一模一样的异常处理逻辑，重复代码满天飞。更糟糕的是，新加一个接口经常忘了加 try-catch，上线后直接暴露堆栈信息给前端。

Spring MVC 的解决方案是 `@ControllerAdvice` + `@ExceptionHandler`：

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 资源不存在
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResult> handleNotFound(ResourceNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResult.of(404, e.getMessage()));
    }

    // 业务异常
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResult> handleBusiness(BusinessException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResult.of(e.getCode(), e.getMessage()));
    }

    // 参数校验失败（@Valid）
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResult> handleValidation(
            MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest()
                .body(ErrorResult.of(400, message));
    }

    // 类型转换失败（比如把 "abc" 传给 int 参数）
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResult> handleTypeMismatch(
            MethodArgumentTypeMismatchException e) {
        return ResponseEntity.badRequest()
                .body(ErrorResult.of(400,
                    "参数类型错误: " + e.getName()));
    }

    // 兜底：所有未预期的异常
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResult> handleException(Exception e) {
        log.error("未预期的异常", e);  // 记日志，但不暴露给前端
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResult.of(500, "系统内部错误，请稍后重试"));
    }
}

// 统一错误响应
@Data
@AllArgsConstructor
public class ErrorResult {
    private int code;
    private String message;

    public static ErrorResult of(int code, String message) {
        return new ErrorResult(code, message);
    }
}
```

现在 Controller 方法变得干净了：

```java
@GetMapping("/{id}")
public User detail(@PathVariable Long id) {
    return userService.findById(id)
        .orElseThrow(() -> new ResourceNotFoundException("用户不存在: " + id));
}

@PostMapping
public User create(@RequestBody @Valid UserDTO dto) {
    return userService.create(dto);
}
```

不需要 try-catch，异常会自动被全局处理器捕获并转换为统一的错误响应。

### @RestControllerAdvice vs @ControllerAdvice

```java
// @ControllerAdvice = @Component + 支持返回视图（ModelAndView）
// @RestControllerAdvice = @ControllerAdvice + @ResponseBody（返回值直接写响应体）
```

如果你是纯 REST API 项目，用 `@RestControllerAdvice`。如果你有视图渲染的场景（比如错误页面），用 `@ControllerAdvice`。

### 精细化控制：只处理特定包/注解的 Controller

```java
// 只处理 api 包下的 Controller
@RestControllerAdvice(basePackages = "com.example.api")

// 只处理带 @RestController 注解的 Controller
@RestControllerAdvice(annotations = RestController.class)

// 只处理特定类
@RestControllerAdvice(assignableTypes = {UserController.class, OrderController.class})
```

多个 `@ControllerAdvice` 可以共存，用 `@Order` 控制优先级。这在大型项目中很有用——不同模块有自己的异常处理器，同时还有一个全局兜底。

---

## HandlerExceptionResolver：异常解析的优先级

`@ControllerAdvice` + `@ExceptionHandler` 背后是 `HandlerExceptionResolver` 在工作。但它是众多异常解析器中的一个，而不是唯一。

Spring MVC 默认注册了三个 `HandlerExceptionResolver`，按优先级排序：

### 1. ExceptionHandlerExceptionResolver（最高优先级）

处理 `@ExceptionHandler` 标注的方法。它先在当前 Controller 里找有没有匹配的 `@ExceptionHandler`，找不到再去 `@ControllerAdvice` 里找。

```java
@RestController
@RequestMapping("/users")
public class UserController {

    // Controller 级别的异常处理（优先级高于 @ControllerAdvice）
    @ExceptionHandler(ResourceNotFoundException.class)
    public ErrorResult handleNotFound(ResourceNotFoundException e) {
        return ErrorResult.of(404, e.getMessage());
    }
}
```

查找顺序：**当前 Controller 的 @ExceptionHandler → @ControllerAdvice 的 @ExceptionHandler**。

### 2. ResponseStatusExceptionResolver

处理 `@ResponseStatus` 注解标记的异常，以及直接抛出的 `ResponseStatusException`。

```java
// 方式一：注解标记自定义异常
@ResponseStatus(code = HttpStatus.NOT_FOUND, reason = "资源不存在")
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}

// 方式二：直接抛 ResponseStatusException（更灵活）
@GetMapping("/users/{id}")
public User detail(@PathVariable Long id) {
    return userService.findById(id)
        .orElseThrow(() -> new ResponseStatusException(
            HttpStatus.NOT_FOUND, "用户不存在: " + id));
}
```

方式二更推荐，因为它不需要定义自定义异常类，且状态码和消息可以动态设置。

### 3. DefaultHandlerExceptionResolver（最低优先级）

处理 Spring MVC 自己抛出的框架级异常，比如：

- `MissingServletRequestParameterException` → 400
- `HttpRequestMethodNotSupportedException` → 405
- `HttpMediaTypeNotSupportedException` → 415
- `NoHandlerFoundException` → 404

它的处理方式是返回 Spring 默认的错误页面或 JSON 格式，通常不够友好。这就是为什么你需要用 `@ControllerAdvice` 来覆盖它。

### 异常解析的完整流程

```mermaid
flowchart TD
    A[Controller 方法抛出异常] --> B[ExceptionHandlerExceptionResolver]
    B --> C{当前 Controller 有<br/>@ExceptionHandler?}
    C -->|是| D[执行匹配的 Handler]
    C -->|否| E{@ControllerAdvice 有<br/>匹配的 Handler?}
    E -->|是| D
    E -->|否| F[ResponseStatusExceptionResolver]
    F --> G{异常有 @ResponseStatus?}
    G -->|是| H[返回对应状态码]
    G -->|否| I[DefaultHandlerExceptionResolver]
    I --> J{是框架级异常?}
    J -->|是| K[返回默认错误响应]
    J -->|否| L[返回 500]
```

### 自定义 HandlerExceptionResolver

如果你的异常处理逻辑很特殊（比如要写审计日志、做告警），可以实现自己的 `HandlerExceptionResolver`：

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)  // 最高优先级
public class AuditExceptionResolver implements HandlerExceptionResolver {

    private static final Logger auditLog = LoggerFactory.getLogger("AUDIT");

    @Override
    public ModelAndView resolveException(HttpServletRequest request,
                                         HttpServletResponse response,
                                         Object handler, Exception ex) {
        // 记录审计日志
        auditLog.warn("异常审计 | URI={} | Method={} | Exception={}",
            request.getRequestURI(),
            request.getMethod(),
            ex.getClass().getSimpleName());

        // 返回 null 表示不处理，交给下一个解析器
        // 返回 ModelAndView 表示已经处理
        return null;
    }
}
```

注意：如果你返回了非 null 的 ModelAndView，后续的解析器就不会再执行了。所以自定义解析器要么只做辅助工作（记日志、发告警），要么确保能处理所有情况。

---

## 视图解析与模板引擎

虽然前后端分离是主流，但了解视图解析机制还是有价值的——至少你看老项目代码时不会一脸懵。

### 视图解析的工作原理

Controller 方法返回一个字符串（视图名），`ViewResolver` 把它解析为具体的 `View` 对象，然后 `View` 负责渲染。

```java
@Controller  // 注意：不是 @RestController
public class PageController {

    @GetMapping("/about")
    public String about(Model model) {
        model.addAttribute("title", "关于我们");
        model.addAttribute("content", companyService.getAbout());
        return "about"; // 视图名
    }
}
```

Spring Boot 默认配置的 ViewResolver 是 `InternalResourceViewResolver`（用于 JSP）和/或 `ThymeleafViewResolver`（用于 Thymeleaf）。

### Thymeleaf：现代的模板引擎

如果你真的需要服务端渲染，Thymeleaf 是目前最好的选择。它比 JSP 强太多：

```html
<!-- src/main/resources/templates/user/list.html -->
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<head>
    <title th:text="${title}">用户列表</title>
</head>
<body>
    <h1 th:text="${title}">默认标题</h1>

    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>邮箱</th>
            </tr>
        </thead>
        <tbody>
            <tr th:each="user : ${users}">
                <td th:text="${user.id}">1</td>
                <td th:text="${user.name}">张三</td>
                <td th:text="${user.email}">test@example.com</td>
            </tr>
        </tbody>
    </table>
</body>
</html>
```

Controller：

```java
@Controller
@RequestMapping("/admin/users")
public class AdminUserController {

    @GetMapping
    public String list(Model model) {
        model.addAttribute("title", "用户管理");
        model.addAttribute("users", userService.findAll());
        return "user/list";  // 解析为 templates/user/list.html
    }
}
```

Thymeleaf 的优势是：**HTML 文件可以直接在浏览器中打开预览**（没有运行时数据时显示默认值），而 JSP 不行。

### 什么时候该用视图渲染？

我的判断：

- **纯 API 服务**（移动端后端、微服务）→ 不需要，用 `@RestController`
- **管理后台** → 考虑用 Thymeleaf + 简单的 Bootstrap，开发效率高
- **需要 SEO 的页面**（博客、官网）→ 服务端渲染，Thymeleaf 或 Next.js
- **复杂交互的前端** → 前后端分离，Vue/React + REST API

不要为了"前后端分离"而前后端分离。一个内部管理后台用 Thymeleaf 写，开发效率比 Vue + 配套后端 API 高得多。

### Thymeleaf 在 Spring Boot 中的使用

引入依赖：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-thymeleaf</artifactId>
</dependency>
```

配置（`application.yml`）：

```yaml
spring:
  thymeleaf:
    prefix: classpath:/templates/
    suffix: .html
    cache: false  # 开发时关闭缓存，方便热更新
```

不需要额外配置 ViewResolver，Spring Boot 的自动配置会帮你搞定。

---

## 异常处理的最佳实践

综合前面的内容，给一个实际项目中推荐的异常处理方案：

**第一步：定义业务异常体系**

```java
// 基础业务异常
public class BusinessException extends RuntimeException {
    private final int code;

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() { return code; }
}

// 资源不存在
public class NotFoundException extends BusinessException {
    public NotFoundException(String message) {
        super(404, message);
    }
}

// 权限不足
public class ForbiddenException extends BusinessException {
    public ForbiddenException(String message) {
        super(403, message);
    }
}
```

**第二步：全局异常处理器**

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResult> handleNotFound(NotFoundException e) {
        return ResponseEntity.status(404).body(ErrorResult.of(404, e.getMessage()));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResult> handleForbidden(ForbiddenException e) {
        return ResponseEntity.status(403).body(ErrorResult.of(403, e.getMessage()));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResult> handleBusiness(BusinessException e) {
        return ResponseEntity.badRequest().body(ErrorResult.of(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResult> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(ErrorResult.of(400, msg));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResult> handleException(Exception e,
                                                        HttpServletRequest request) {
        log.error("未预期异常 | {} {}", request.getMethod(), request.getRequestURI(), e);
        return ResponseEntity.status(500)
                .body(ErrorResult.of(500, "系统内部错误"));
    }
}
```

**第三步：Controller 保持干净**

```java
@RestController
@RequestMapping("/users")
public class UserController {

    @GetMapping("/{id}")
    public User detail(@PathVariable Long id) {
        return userService.findById(id)
            .orElseThrow(() -> new NotFoundException("用户不存在: " + id));
    }

    @PostMapping
    public User create(@RequestBody @Valid UserDTO dto) {
        return userService.create(dto);
    }
}
```

Controller 只管业务逻辑，异常处理全部交给全局处理器。代码简洁，错误格式统一，新增接口不需要考虑异常处理。

---

## 小结

异常处理的核心是 `HandlerExceptionResolver`，Spring MVC 通过优先级链来依次尝试不同的解析器。

`@ControllerAdvice` + `@ExceptionHandler` 是最常用的全局异常处理方式，它的查找顺序是：当前 Controller 的 Handler → 全局 ControllerAdvice 的 Handler。

视图渲染在前后端分离时代不再是主流，但 Thymeleaf 仍然是内部工具和管理后台的好选择。

关键记忆点：

1. 异常解析有优先级：`@ExceptionHandler` > `@ResponseStatus` > 框架默认处理
2. 全局异常处理器应该**兜底**——最宽泛的 `Exception` 处理器放在最后
3. 生产环境不要把堆栈信息暴露给前端，**记日志 + 返回友好提示**
4. 视图名解析是可插拔的，`ViewResolver` 的实现决定了视图名怎么变成实际的 View

下一章我们看 REST API 的核心：`@RestController` 背后的 `HttpMessageConverter`、内容协商和 CORS。
