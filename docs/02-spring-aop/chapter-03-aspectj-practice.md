# 切面编程实战

## 从 XML 到注解：@Aspect 驱动的切面编程

Spring AOP 最早是用 XML 配置的，写过的人大概都有心理阴影：

```xml
<aop:config>
    <aop:aspect id="loggingAspect" ref="loggingBean">
        <aop:pointcut id="servicePointcut"
            expression="execution(* com.example.service.*.*(..))"/>
        <aop:before method="logBefore" pointcut-ref="servicePointcut"/>
        <aop:after-returning method="logAfter" pointcut-ref="servicePointcut"
            returning="result"/>
    </aop:aspect>
</aop:config>

<bean id="loggingBean" class="com.example.aspect.LoggingAspect"/>
```

XML 配置有几个问题：切面逻辑在 Java 里，切面配置在 XML 里，两处分离，维护起来痛苦。而且 XML 里写错一个类名、方法名，编译期不会报错，只有运行时才发现。

Spring 2.0 引入了 `@Aspect` 注解，把切面定义和切面配置合二为一。从那以后，XML 配置基本退出了历史舞台。

用注解重写上面的 XML：

```java
@Aspect
@Component
public class LoggingAspect {

    @Pointcut("execution(* com.example.service.*.*(..))")
    private void serviceMethods() {}

    @Before("serviceMethods()")
    public void logBefore(JoinPoint joinPoint) {
        log.info("调用 {}({})", joinPoint.getSignature().getName(),
                 Arrays.toString(joinPoint.getArgs()));
    }

    @AfterReturning(pointcut = "serviceMethods()", returning = "result")
    public void logAfter(JoinPoint joinPoint, Object result) {
        log.info("{} 返回: {}", joinPoint.getSignature().getName(), result);
    }
}
```

`@Aspect` 声明这是一个切面类，`@Component` 让 Spring 扫描到它并注册为 Bean。两个注解缺一不可——`@Aspect` 告诉 Spring "这个类里有切面逻辑"，`@Component` 告诉 Spring "请管理这个 Bean 的生命周期"。

这里有个细节：Spring 的 AOP 基础设施在扫描 Bean 时，会检查每个 Bean 是否带有 `@Aspect` 注解。如果带了，Spring 不会把它当作普通 Bean，而是交给 `AnnotationAwareAspectJAutoProxyCreator` 处理。这个后处理器会解析切面里的 `@Pointcut` 和各种通知注解，然后为目标 Bean 创建代理。

---

## 五种通知类型与执行顺序

Spring AOP 提供了五种通知（Advice），它们在方法执行的不同阶段介入：

```java
@Aspect
@Component
public class AllAdviceAspect {

    @Pointcut("execution(* com.example.service.OrderService.*(..))")
    public void orderMethods() {}

    @Around("orderMethods()")
    public Object aroundAdvice(ProceedingJoinPoint pjp) throws Throwable {
        log.info("[Around] 前置 - 方法: {}", pjp.getSignature().getName());
        long start = System.currentTimeMillis();

        Object result = pjp.proceed();  // 必须调用 proceed()，否则目标方法不会执行

        long elapsed = System.currentTimeMillis() - start;
        log.info("[Around] 后置 - 耗时: {}ms", elapsed);
        return result;  // 可以修改返回值
    }

    @Before("orderMethods()")
    public void beforeAdvice(JoinPoint joinPoint) {
        log.info("[Before] 方法即将执行: {}", joinPoint.getSignature().getName());
    }

    @After("orderMethods()")
    public void afterAdvice(JoinPoint joinPoint) {
        log.info("[After] 方法执行完毕（无论是否异常）: {}", joinPoint.getSignature().getName());
    }

    @AfterReturning(pointcut = "orderMethods()", returning = "result")
    public void afterReturningAdvice(JoinPoint joinPoint, Object result) {
        log.info("[AfterReturning] 方法正常返回: {}", result);
    }

    @AfterThrowing(pointcut = "orderMethods()", throwing = "ex")
    public void afterThrowingAdvice(JoinPoint joinPoint, Exception ex) {
        log.error("[AfterThrowing] 方法抛出异常: {}", ex.getMessage());
    }
}
```

运行 `orderService.createOrder(1L, items)`，正常情况下输出顺序：

```
[Around] 前置 - 方法: createOrder
[Before] 方法即将执行: createOrder
--- 目标方法执行 ---
[Around] 后置 - 耗时: 23ms
[AfterReturning] 方法正常返回: Order@xxx
[After] 方法执行完毕（无论是否异常）: createOrder
```

如果目标方法抛了异常：

```
[Around] 前置 - 方法: createOrder
[Before] 方法即将执行: createOrder
--- 目标方法抛出异常 ---
[AfterThrowing] 方法抛出异常: xxx
[After] 方法执行完毕（无论是否异常）: createOrder
```

注意 `@Around` 在异常时的处理：如果你在 `@Around` 里 catch 了异常不抛出，后面的 `@AfterThrowing` 就不会触发。这是 `@Around` 的特殊之处——它的权力最大，可以吞掉异常、修改返回值、甚至不调用 `proceed()` 让目标方法根本不执行。

![通知执行顺序流程图](/diagrams/2-3-advice-execution-order.svg)

**多个切面作用于同一个方法时，执行顺序怎么定？**

默认情况下，顺序是不确定的。要控制顺序，用 `@Order` 注解：

```java
@Aspect
@Component
@Order(1)  // 数字越小，优先级越高
public class LoggingAspect { ... }

@Aspect
@Component
@Order(2)
public class SecurityAspect { ... }
```

执行顺序：`LoggingAspect.around` → `SecurityAspect.around` → 目标方法 → `SecurityAspect.around后置` → `LoggingAspect.around后置`。像洋葱一样，先进后出。

**实际开发中的建议：** 90% 的场景用 `@Before` + `@AfterReturning` 或者 `@Around` 就够了。`@Around` 功能最全，但代码也最复杂，要记得调 `proceed()`，要处理返回值和异常。如果只是做日志记录这种不需要修改返回值的操作，用 `@Before` + `@AfterReturning` 更简洁。

---

## 切点表达式详解

切点表达式是 AOP 的核心技能，表达式写错了，切面就拦不到目标方法。

Spring AOP 支持多种切点指示器，最常用的有三个：`execution`、`@annotation`、`within`。

### execution：方法签名匹配

这是最常用的，按方法签名匹配：

```
execution(修饰符? 返回类型 类名.方法名(参数) 异常?)
```

常用示例：

```java
// 匹配 com.example.service 包下所有类的所有 public 方法
@Pointcut("execution(public * com.example.service.*.*(..))")

// 包含子包（两个点 ..）
@Pointcut("execution(* com.example.service..*.*(..))")

// 只匹配返回 Order 的方法
@Pointcut("execution(com.example.model.Order com.example.service.*.*(..))")

// 只匹配有两个参数的方法，第一个是 Long，第二个任意
@Pointcut("execution(* com.example.service.*.*(Long, ..))")

// 匹配以 create 开头的方法
@Pointcut("execution(* com.example.service.*.create*(..))")
```

`*` 匹配任意一个，`..` 匹配任意多个。参数列表里 `..` 表示零到多个参数。

### @annotation：注解匹配

匹配带有特定注解的方法。这是自定义切面最灵活的方式：

```java
// 匹配所有标注了 @Loggable 注解的方法
@Pointcut("@annotation(com.example.annotation.Loggable)")

// 匹配类上标注了 @Service 的 Bean 的所有方法
@Pointcut("@within(org.springframework.stereotype.Service)")
```

`@annotation` 和 `@within` 的区别：`@annotation` 匹配方法上的注解，`@within` 匹配类上的注解。

### within：类型匹配

匹配指定类型内的所有方法：

```java
// 匹配 OrderService 类的所有方法
@Pointcut("within(com.example.service.OrderService)")

// 匹配 service 包下所有类的所有方法
@Pointcut("within(com.example.service.*)")

// 匹配 service 包及子包下所有类的所有方法
@Pointcut("within(com.example.service..*)")
```

`within` 和 `execution` 的区别在于粒度：`within` 只能匹配到类级别，`execution` 能匹配到方法级别（包括参数、返回值等）。

### 组合表达式

用 `&&`、`||`、`!` 组合多个条件：

```java
// 匹配 service 包下所有方法，但排除 getter/setter
@Pointcut("execution(* com.example.service.*.*(..)) && !execution(* com.example.service.*.get*(..)) && !execution(* com.example.service.*.set*(..))")

// 匹配带有 @Transactional 注解且在 service 包下的方法
@Pointcut("@annotation(org.springframework.transaction.annotation.Transactional) && within(com.example.service..*)")
```

**实际建议：** 日常开发最常用的组合是 `execution` 做范围匹配 + `@annotation` 做精确匹配。比如"拦截 service 包下所有方法做日志"用 `execution`，"拦截标注了某个自定义注解的方法做特定处理"用 `@annotation`。

---

## 实战：自定义注解 + AOP 实现操作日志

理论讲够了，来一个完整的实战案例：实现一个操作日志记录功能。

需求：在需要记录日志的方法上加一个 `@OperationLog` 注解，AOP 自动记录谁、在什么时间、做了什么操作、结果如何。

**第一步：定义注解**

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface OperationLog {
    String module() default "";       // 模块名
    String action() default "";       // 操作描述
}
```

**第二步：定义日志实体**

```java
@Data
public class OperationLogRecord {
    private Long userId;
    private String userName;
    private String module;
    private String action;
    private String method;
    private String params;
    private String result;
    private Long costMs;
    private boolean success;
    private String errorMsg;
    private LocalDateTime operateTime;
    private String ip;
}
```

**第三步：编写切面**

```java
@Aspect
@Component
@Slf4j
public class OperationLogAspect {

    @Autowired
    private OperationLogRepo logRepo;

    @Autowired
    private HttpServletRequest request;  // 注入当前请求

    @Around("@annotation(operationLog)")
    public Object around(ProceedingJoinPoint pjp, OperationLog operationLog) throws Throwable {
        OperationLogRecord record = new OperationLogRecord();
        record.setOperateTime(LocalDateTime.now());
        record.setModule(operationLog.module());
        record.setAction(operationLog.action());
        record.setMethod(pjp.getSignature().toShortString());
        record.setParams(JSON.toJSONString(pjp.getArgs()));
        record.setIp(getClientIp());

        // 获取当前登录用户
        User currentUser = SecurityUtils.getCurrentUser();
        if (currentUser != null) {
            record.setUserId(currentUser.getId());
            record.setUserName(currentUser.getUsername());
        }

        long start = System.currentTimeMillis();
        try {
            Object result = pjp.proceed();
            record.setSuccess(true);
            record.setResult(JSON.toJSONString(result));
            return result;
        } catch (Throwable ex) {
            record.setSuccess(false);
            record.setErrorMsg(ex.getMessage());
            throw ex;  // 不吞异常，继续抛出
        } finally {
            record.setCostMs(System.currentTimeMillis() - start);
            // 异步保存，不阻塞主流程
            AsyncExecutor.execute(() -> logRepo.save(record));
        }
    }

    private String getClientIp() {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty()) {
            ip = request.getRemoteAddr();
        }
        return ip.split(",")[0].trim();
    }
}
```

**第四步：使用**

```java
@Service
public class OrderService {

    @OperationLog(module = "订单", action = "创建订单")
    public Order createOrder(Long userId, List<Item> items) {
        // 纯业务逻辑，一行日志代码都不用写
        Order order = new Order();
        order.setUserId(userId);
        order.setItems(items);
        orderRepo.save(order);
        return order;
    }

    @OperationLog(module = "订单", action = "取消订单")
    public void cancelOrder(Long orderId) {
        // ...
    }
}
```

调用 `createOrder` 后，数据库里自动多了一条记录：

```json
{
    "userId": 1001,
    "userName": "zhangsan",
    "module": "订单",
    "action": "创建订单",
    "method": "OrderService.createOrder(..)",
    "params": "[1001, [{\"sku\":\"A001\",\"qty\":2}]]",
    "result": "{\"id\":5001,\"status\":\"CREATED\",\"total\":199.00}",
    "costMs": 45,
    "success": true,
    "errorMsg": null,
    "operateTime": "2024-01-15T10:30:00",
    "ip": "192.168.1.100"
}
```

整个过程，业务代码里没有一行日志相关的代码。要记录日志的方法，加一个注解就行。要改日志格式，只改切面一个地方。这就是 AOP 的价值。

**几个实战细节：**

1. **日志保存要异步**：别在切面里同步写数据库，会拖慢业务方法。用线程池异步保存，或者发消息到 MQ
2. **不要吞异常**：`@Around` 里 catch 住异常后，记得 `throw ex` 继续抛出，否则调用方不知道方法出错了
3. **参数序列化注意循环引用**：`JSON.toJSONString(pjp.getArgs())` 如果参数里有双向关联的对象（比如 JPA 实体），可能栈溢出。用 `SerializerFeature.DisableCircularReferenceDetect` 或者只序列化关键字段
4. **注解参数要可配置**：`module` 和 `action` 支持 SpEL 表达式会更灵活，比如 `@OperationLog(action = "删除用户 #userId")`

---

## 小结

这一章我们完成了从理论到实战的跨越：

1. **@Aspect 注解驱动**：比 XML 配置简洁得多，切面逻辑和配置在一个地方，编译期就能发现错误
2. **五种通知类型**：`@Around` 最强大但最复杂，`@Before` + `@AfterReturning` 够用于简单场景，多个切面用 `@Order` 控制顺序
3. **切点表达式**：`execution` 做方法签名匹配，`@annotation` 做注解匹配，`within` 做类型匹配，可以组合使用
4. **实战**：自定义注解 + AOP 是最常用的模式，一个注解搞定操作日志、权限校验、接口幂等性等通用需求

下一章我们聊 Spring 里最常用的 AOP 应用——声明式事务。`@Transactional` 背后就是 AOP，而且它失效的场景比你想象的多得多。
