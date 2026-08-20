# 声明式事务

## @Transactional 背后的 AOP 机制

你一定用过 `@Transactional`，加一个注解就能让方法在事务里执行，出错自动回滚。但它到底是怎么做到的？

答案就是 AOP。`@Transactional` 的实现就是一个切面。Spring 在启动时注册了一个 `TransactionInterceptor`，它是一个 Advice，拦截所有标注了 `@Transactional` 的方法。流程长这样：

![事务拦截器调用流程](/diagrams/2-4-tx-interceptor-flow.svg)

看源码更清楚。`TransactionInterceptor.invoke()` 方法的核心逻辑：

```java
@Override
public Object invoke(MethodInvocation invocation) throws Throwable {
    Class<?> targetClass = (invocation.getThis() != null ?
            AopUtils.getTargetClass(invocation.getThis()) : null);

    // 调用模板方法，开启事务、执行业务、提交/回滚
    return invokeWithinTransaction(invocation.getMethod(), targetClass,
            new CoroutinesInvocationCallback() {
                @Override
                public Object proceedWithInvocation() throws Throwable {
                    return invocation.proceed();
                }
                @Override
                public Object getTarget() {
                    return invocation.getThis();
                }
                @Override
                public Object[] getArguments() {
                    return invocation.getArguments();
                }
            });
}
```

`invokeWithinTransaction` 是真正的核心，它做三件事：

1. **获取事务**：根据 `@Transactional` 的属性，通过 `TransactionManager` 获取或创建事务
2. **执行业务方法**：`invocation.proceed()` 调用真正的目标方法
3. **提交或回滚**：正常结束则 commit，抛出异常且满足回滚条件则 rollback

所以 `@Transactional` 不是什么魔法，就是标准的 AOP `@Around` 通知：前置开启事务，后置提交/回滚。

**一个关键细节：回滚条件。** 默认情况下，只有抛出 `RuntimeException`（unchecked exception）和 `Error` 时才会回滚，受检异常（checked exception）不会触发回滚。这是很多人踩的坑。

```java
@Transactional
public void transfer(Long fromId, Long toId, BigDecimal amount) throws IOException {
    accountRepo.deduct(fromId, amount);
    accountRepo.add(toId, amount);
    // 如果这里抛 IOException，事务不会回滚！
    // 因为 IOException 是 checked exception
    fileService.writeLog("transfer done");
}
```

想让 checked exception 也回滚，需要显式配置：

```java
@Transactional(rollbackFor = Exception.class)  // 所有异常都回滚
public void transfer(Long fromId, Long toId, BigDecimal amount) throws IOException {
    // ...
}
```

**我的建议：永远写 `rollbackFor = Exception.class`。** 没有任何理由只让 unchecked exception 回滚。Spring 的默认行为是历史遗留，不代表它合理。

---

## 事务传播行为：七种场景

传播行为（Propagation）决定的是：**当一个事务方法被另一个事务方法调用时，事务怎么处理？**

不是背诵七种枚举值，而是理解实际场景。核心的几种：

### REQUIRED（默认）

如果当前有事务，加入当前事务；如果没有，创建新事务。这是 90% 场景的选择。

```java
@Service
public class OrderService {
    @Autowired private InventoryService inventoryService;
    @Autowired private PaymentService paymentService;

    @Transactional(rollbackFor = Exception.class)
    public void createOrder(Long userId, OrderDTO dto) {
        orderRepo.save(order);           // 在事务里
        inventoryService.deduct(dto);    // 加入同一个事务
        paymentService.charge(userId, dto.getTotal());  // 加入同一个事务
        // 任何一步失败，全部回滚
    }
}

@Service
public class InventoryService {
    @Transactional(rollbackFor = Exception.class)  // REQUIRED（默认）
    public void deduct(OrderDTO dto) {
        // 如果这里抛异常，orderRepo.save 的操作也会回滚
        // 因为它们在同一个事务里
    }
}
```

三个 Service 的操作在同一个事务里，要么全成功，要么全回滚。这就是 `REQUIRED` 的含义。

### REQUIRES_NEW

不管当前有没有事务，都创建一个新事务。当前事务被挂起。

```java
@Service
public class AuditService {
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void saveAuditLog(AuditLog log) {
        auditRepo.save(log);
    }
}

@Service
public class OrderService {
    @Autowired private AuditService auditService;

    @Transactional(rollbackFor = Exception.class)
    public void createOrder(Long userId, OrderDTO dto) {
        orderRepo.save(order);
        auditService.saveAuditLog(new AuditLog("createOrder", userId));
        // 如果后续代码抛异常：
        // orderRepo.save 会回滚（外层事务）
        // auditRepo.save 不会回滚（独立事务，已经提交了）
        int i = 1 / 0;  // 异常！
    }
}
```

什么时候用 `REQUIRES_NEW`？**需要操作不受外层事务影响时。** 典型场景：审计日志、消息记录。就算业务操作失败回滚了，审计日志也得留下来——"用户尝试创建订单，但失败了"这条记录本身就是有价值的。

### NESTED

如果当前有事务，创建一个嵌套事务（savepoint）；如果没有，行为和 `REQUIRED` 一样。

```java
@Transactional(rollbackFor = Exception.class)
public void batchProcess(List<Item> items) {
    for (Item item : items) {
        try {
            processSingleItem(item);  // 嵌套事务
        } catch (Exception e) {
            log.error("处理 item {} 失败: {}", item.getId(), e.getMessage());
            // 单个 item 失败不影响其他 item
        }
    }
}

@Transactional(propagation = Propagation.NESTED, rollbackFor = Exception.class)
public void processSingleItem(Item item) {
    // 如果这里抛异常，只回滚这一个 item 的操作
    // 外层事务不受影响
}
```

`NESTED` 和 `REQUIRES_NEW` 的区别：`REQUIRES_NEW` 是完全独立的事务，互不影响；`NESTED` 是嵌套在外层事务里的子事务，嵌套事务回滚不影响外层，但如果外层事务回滚，嵌套事务也会跟着回滚。

用 Savepoint 的方式实现：

```java
// NESTED 的底层逻辑伪代码
Savepoint savepoint = connection.setSavepoint();
try {
    // 执行业务 SQL
    connection.releaseSavepoint(savepoint);
} catch (Exception e) {
    connection.rollback(savepoint);  // 只回滚到 savepoint
    // 外层事务还在
}
```

### SUPPORTS / NOT_SUPPORTED / MANDATORY / NEVER

这四种用得少，了解一下就行：

| 传播行为 | 有事务时 | 无事务时 | 典型场景 |
|---------|---------|---------|---------|
| SUPPORTS | 加入事务 | 非事务执行 | 查询方法（有事务就用，没有也行） |
| NOT_SUPPORTED | 挂起事务，非事务执行 | 非事务执行 | 不需要事务的操作 |
| MANDATORY | 加入事务 | 抛异常 | 强制要求在事务中调用 |
| NEVER | 抛异常 | 非事务执行 | 强制要求不在事务中调用 |

**实际建议：** 日常开发记住三个就够——`REQUIRED`（默认，90% 场景）、`REQUIRES_NEW`（独立事务，审计/消息）、`NESTED`（嵌套事务，批量处理部分失败）。

---

## 事务隔离级别

Spring 的事务隔离级别和数据库的隔离级别是对应关系，Spring 只是帮你设置到数据库连接上：

```java
@Transactional(isolation = Isolation.READ_COMMITTED)
public void someMethod() { ... }
```

Spring 提供五种隔离级别：

| Spring 隔离级别 | 含义 | 对应数据库 |
|----------------|------|-----------|
| DEFAULT | 使用数据库默认级别（推荐） | 取决于数据库配置 |
| READ_UNCOMMITTED | 读未提交，可能脏读 | 所有数据库都支持 |
| READ_COMMITTED | 读已提交，解决脏读 | Oracle 默认 |
| REPEATABLE_READ | 可重复读，解决不可重复读 | MySQL 默认 |
| SERIALIZABLE | 串行化，最严格 | 性能最差 |

**一个常见误解：** 很多人以为 Spring 的隔离级别能覆盖数据库的隔离级别。不能。Spring 只是通过 `Connection.setTransactionIsolation()` 设置数据库连接的隔离级别，最终行为取决于数据库的支持。

比如你设置 `READ_UNCOMMITTED`，但数据库强制最低 `READ_COMMITTED`（像 Oracle），那实际还是 `READ_COMMITTED`。

**另一个误解：** `REPEATABLE_READ` 就真的不会出现幻读了吗？在 MySQL 的 InnoDB 引擎下，`REPEATABLE_READ` 通过 MVCC + Gap Lock 解决了大部分幻读场景，但不是 100%。比如：

```sql
-- 事务 A
START TRANSACTION;
SELECT * FROM orders WHERE status = 'PENDING';  -- 返回 3 条

-- 事务 B（另一个连接）
INSERT INTO orders (status) VALUES ('PENDING');  -- 插入成功
COMMIT;

-- 事务 A
SELECT * FROM orders WHERE status = 'PENDING';  -- 还是 3 条（MVCC 快照）
INSERT INTO orders (status, amount)
SELECT 'PENDING', 100 FROM orders WHERE status = 'PENDING';
-- 这时候可能插入了 4 条（因为 INSERT 用的是当前读，不是快照读）
```

**我的建议：** 除非你非常清楚自己在做什么，否则用 `DEFAULT`，让数据库决定隔离级别。在数据库层面调隔离级别比在代码里调更可控。

---

## @Transactional 十种失效场景与排查清单

这是面试高频题，也是实际开发中的高频 bug。我把常见的失效场景整理成清单，每个都附上原因和解决方案。

### 1. 方法不是 public 的

```java
@Service
public class UserService {
    @Transactional
    protected void updateUser(User user) {  // 失效！
        userRepo.save(user);
    }
}
```

**原因：** Spring AOP 默认只能拦截 public 方法。`DefaultPointcutAdvisor` 的切点匹配规则排除了非 public 方法。

**解决：** 改为 public，或者使用 AspectJ 织入（不依赖代理）。

### 2. 自调用问题

```java
@Service
public class OrderService {
    public void createOrder(Long userId, OrderDTO dto) {
        // 调用自己的另一个方法
        this.doCreateOrder(userId, dto);  // doCreateOrder 的 @Transactional 失效！
    }

    @Transactional(rollbackFor = Exception.class)
    public void doCreateOrder(Long userId, OrderDTO dto) {
        // ...
    }
}
```

**原因：** `this.doCreateOrder()` 直接调用了目标对象的方法，绕过了代理。第一章和第二章都讲过这个问题。

**解决：**
- 注入自身：`@Autowired private OrderService self;`，然后 `self.doCreateOrder()`
- 使用 `AopContext`：`((OrderService) AopContext.currentProxy()).doCreateOrder()`（需要 `@EnableAspectJAutoProxy(exposeProxy = true)`）
- 把方法拆到另一个 Bean

### 3. 异常被吞了

```java
@Transactional(rollbackFor = Exception.class)
public void createOrder(Long userId, OrderDTO dto) {
    try {
        orderRepo.save(order);
        paymentService.charge(userId, dto.getTotal());
    } catch (Exception e) {
        log.error("创建订单失败", e);
        // 异常被 catch 了，事务不知道出错了，不会回滚！
    }
}
```

**原因：** 事务切面只能感知到从方法中抛出的异常。你 catch 住了，它就看不到。

**解决：** 不要在 `@Transactional` 方法里 catch 异常后不抛出。如果必须 catch，手动回滚：

```java
@Transactional(rollbackFor = Exception.class)
public void createOrder(Long userId, OrderDTO dto) {
    try {
        orderRepo.save(order);
        paymentService.charge(userId, dto.getTotal());
    } catch (Exception e) {
        log.error("创建订单失败", e);
        // 手动标记回滚
        TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        throw e;  // 或者重新抛出
    }
}
```

### 4. 异常类型不匹配

```java
@Transactional  // 注意：没有 rollbackFor
public void importData(String filePath) throws IOException {
    // 抛 IOException（checked exception）
    // 默认不回滚！
    List<Data> dataList = parseFile(filePath);
    dataRepo.saveAll(dataList);
}
```

**原因：** 默认只对 `RuntimeException` 和 `Error` 回滚。

**解决：** `@Transactional(rollbackFor = Exception.class)`。

### 5. 数据库引擎不支持事务

```java
@Transactional
public void saveLog(Log log) {
    logRepo.save(log);  // 如果表是 MyISAM 引擎，事务无效
}
```

**原因：** MySQL 的 MyISAM 引擎不支持事务。InnoDB 才支持。

**解决：** 确保表使用 InnoDB 引擎。MySQL 5.5+ 默认就是 InnoDB。

### 6. Bean 没有被 Spring 管理

```java
public class OrderService {  // 没有 @Service / @Component
    @Transactional
    public void createOrder(Long userId, OrderDTO dto) {
        // ...
    }
}
// 手动 new 出来用
OrderService orderService = new OrderService();
orderService.createOrder(userId, dto);  // 事务不生效
```

**原因：** `new` 出来的对象不受 Spring 管理，没有代理。

**解决：** 让 Spring 管理 Bean，通过 `@Autowired` 注入使用。

### 7. 多线程调用

```java
@Service
public class OrderService {
    @Autowired private PaymentService paymentService;

    @Transactional(rollbackFor = Exception.class)
    public void createOrder(Long userId, OrderDTO dto) {
        orderRepo.save(order);

        // 在新线程里调用
        new Thread(() -> {
            paymentService.charge(userId, dto.getTotal());
            // 这个调用不在事务里！
        }).start();
    }
}
```

**原因：** Spring 的事务是通过 `ThreadLocal` 存储数据库连接的。新线程拿不到原线程的事务上下文。

**解决：** 不要在事务方法里开新线程做数据库操作。如果必须异步，让异步方法自己管理事务。

### 8. 构造器中调用事务方法

```java
@Service
public class OrderService {
    @Autowired private SomeService someService;

    public OrderService() {
        this.init();  // 构造器里调用，代理还没创建好
    }

    @Transactional
    public void init() {
        // 失效
    }
}
```

**原因：** Bean 的构造器执行时，AOP 代理还没创建完成。

**解决：** 使用 `@PostConstruct` 或 `InitializingBean.afterPropertiesSet()`。

### 9. final 方法或 final 类

```java
@Service
public class OrderService {
    @Transactional
    public final void createOrder(Long userId, OrderDTO dto) {  // 失效！
        // ...
    }
}
```

**原因：** Spring Boot 默认用 CGLIB 代理，CGLIB 通过继承实现，`final` 方法不能被重写。

**解决：** 去掉 `final`。

### 10. propagation 设置不当

```java
@Transactional(propagation = Propagation.NOT_SUPPORTED)
public void createOrder(Long userId, OrderDTO dto) {
    // 非事务执行，出了错不会回滚
}
```

**原因：** 传播行为设成了不需要事务的模式。

**解决：** 检查传播行为配置。`NOT_SUPPORTED`、`NEVER`、`SUPPORTS`（无外部事务时）都不会开启事务。

---

## 排查清单

遇到 `@Transactional` 不生效时，按以下顺序排查：

![事务失效排查流程图](/diagrams/2-4-tx-troubleshoot.svg)

**快速验证方法：** 在方法第一行加断点，看 `this` 的类型。如果显示 `OrderService$$EnhancerBySpringCGLIB`，说明代理生效了；如果显示 `OrderService`，说明没走代理。

---

## 小结

这一章我们把 `@Transactional` 的里里外外都翻了一遍：

1. **原理**：本质是 AOP 的 `@Around` 通知，前置开事务，后置提交/回滚。通过 `TransactionInterceptor` 实现
2. **传播行为**：`REQUIRED`（默认，加入或创建）、`REQUIRES_NEW`（独立事务）、`NESTED`（嵌套事务），记住这三个就够
3. **隔离级别**：Spring 只是设置数据库连接的隔离级别，最终行为取决于数据库。日常用 `DEFAULT`
4. **失效场景**：public 限制、自调用、异常被吞、异常类型、数据库引擎、Bean 管理、多线程、构造器、final、propagation——十种场景，按清单排查

到这里，Spring AOP 四章正文就全部写完了。从概念到底层实现，从切面编程到声明式事务，你应该对 AOP 有了完整的认知。记住核心：AOP 不是什么高深的技术，它就是"把重复的非业务逻辑抽出来，用代理机制在运行时自动织入"。理解了代理，就理解了一切。
