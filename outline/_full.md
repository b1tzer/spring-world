# Spring World 知识体系大纲

以 Spring 生态为核心，从底层原理到微服务架构，构建 Spring 开发者的完整能力栈。全书共七卷，按能力递进顺序编排。

---

## 能力递进路线

```
    第七卷 Spring 生态（安全/批处理/集成/原生化）
                        ↑
    第六卷 Spring Cloud（微服务如何治理？）
                        ↑
    第五卷 Spring Data（数据如何访问？）
                        ↑
    第四卷 Spring Boot（如何快速启动？）
                        ↑
    第三卷 Spring MVC（Web 请求如何处理？）
                        ↑
    第二卷 Spring AOP（横切关注点如何解耦？）
                        ↑
    第一卷 Spring 核心（IoC 容器如何工作？）
```

---

## 各卷定位与边界

**第一卷《Spring 核心》** — 回答"IoC 容器如何工作"。覆盖 IoC 思想、依赖注入方式、Bean 生命周期、BeanFactory vs ApplicationContext、资源加载、Environment 抽象。共 4 章。

**第二卷《Spring AOP》** — 回答"横切关注点如何从业务中解耦"。覆盖 AOP 核心概念、JDK/CGLIB 动态代理、@Aspect 注解驱动、声明式事务原理与传播行为。共 4 章。

**第三卷《Spring MVC》** — 回答"一个 HTTP 请求如何变成 Java 对象再变回响应"。覆盖 DispatcherServlet、HandlerMapping/Adapter、参数解析、异常处理、RESTful、内容协商、拦截器。共 6 章。

**第四卷《Spring Boot》** — 回答"如何用最少配置启动一个 Spring 应用"。覆盖自动配置原理、@EnableAutoConfiguration、Starter 机制、配置体系、内嵌容器、Actuator、日志与多环境。共 5 章。

**第五卷《Spring Data》** — 回答"Spring 如何统一数据访问"。覆盖 JdbcTemplate、数据源抽象、Spring Data JPA、MyBatis 整合、Redis 与缓存抽象、MongoDB。共 5 章。

**第六卷《Spring Cloud》** — 回答"微服务架构下服务如何协作"。覆盖服务注册发现、配置中心、API 网关、OpenFeign/负载均衡、熔断限流、链路追踪。共 6 章。

**第七卷《Spring 生态》** — 回答"Spring 的边界在哪里"。覆盖 Spring Security、Spring Batch、Spring Integration、Spring Native/GraalVM、测试体系。共 5 章。

---

## 主题归属原则

| 主题 | 归属卷 | 说明 |
|------|--------|------|
| IoC / DI / Bean 生命周期 | 第一卷 | 容器核心 |
| 动态代理 / 切面 / 事务 | 第二卷 | AOP 层 |
| DispatcherServlet / 参数解析 / REST | 第三卷 | Web 层 |
| 自动配置 / Starter / Actuator | 第四卷 | Boot 层 |
| JPA / MyBatis / Redis / 缓存 | 第五卷 | 数据层 |
| 注册发现 / 网关 / 熔断 / 配置中心 | 第六卷 | 微服务层 |
| Security / Batch / Native | 第七卷 | 生态扩展 |

---

## 章节目录总览

### 第一卷 Spring 核心（4 章）

1. **IoC 与依赖注入**
   - IoC 思想：从 new 到容器管理
   - 依赖注入方式：构造器 / Setter / 字段注入
   - @Autowired 与 @Resource 的区别
   - 循环依赖与三级缓存

2. **Bean 生命周期**
   - 实例化 → 属性填充 → 初始化 → 销毁
   - BeanPostProcessor 的扩展点
   - Aware 接口族
   - @PostConstruct / @PreDestroy / InitializingBean / DisposableBean

3. **容器体系**
   - BeanFactory vs ApplicationContext
   - BeanDefinition 与注册机制
   - FactoryBean 与普通 Bean
   - 层次容器与事件机制

4. **资源与环境**
   - Resource 抽象与 ResourceLoader
   - Environment 与 PropertySource
   - Profile 机制

### 第二卷 Spring AOP（4 章）

1. **AOP 核心概念**
   - 横切关注点与代码纠缠
   - JoinPoint / Pointcut / Advice / Aspect
   - Spring AOP vs AspectJ

2. **动态代理实现**
   - JDK 动态代理（接口代理）
   - CGLIB（子类代理）
   - 代理选择策略与性能差异

3. **切面编程实战**
   - @Aspect 注解驱动
   - 五种通知类型执行顺序
   - 切点表达式详解
   - 自定义注解 + AOP 实现日志/鉴权

4. **声明式事务**
   - @Transactional 原理
   - 事务传播行为七种
   - 事务隔离级别
   - 常见失效场景与排查

### 第三卷 Spring MVC（6 章）

1. **DispatcherServlet**
   - 从 Servlet 到 DispatcherServlet
   - 启动与初始化流程
   - 九大组件概览

2. **请求处理流程**
   - HandlerMapping 寻找处理器
   - HandlerAdapter 执行处理器
   - ModelAndView 到 ViewResolver

3. **参数解析与绑定**
   - HandlerMethodArgumentResolver
   - @RequestParam / @PathVariable / @RequestBody
   - 数据绑定与类型转换

4. **异常处理与视图**
   - @ControllerAdvice + @ExceptionHandler
   - HandlerExceptionResolver
   - 视图解析与模板引擎

5. **RESTful 与内容协商**
   - @RestController 与 HttpMessageConverter
   - 内容协商策略
   - CORS 配置

6. **拦截器与文件上传**
   - HandlerInterceptor 链式调用
   - MultipartResolver
   - 异步请求处理

### 第四卷 Spring Boot（5 章）

1. **自动配置原理**
   - @EnableAutoConfiguration
   - spring.factories / AutoConfiguration.imports
   - 条件装配：@Conditional 族

2. **Starter 机制**
   - Starter 的命名规范
   - 自定义 Starter 开发
   - 依赖管理与版本仲裁

3. **配置体系**
   - application.yml 优先级
   - @ConfigurationProperties
   - 配置加密与敏感信息

4. **内嵌容器与 Actuator**
   - Tomcat / Jetty / Undertow 切换
   - Actuator 端点与健康检查
   - 优雅停机

5. **日志与多环境**
   - Logback / Log4j2 集成
   - Profile 激活策略
   - 日志归档与 ELK 对接

### 第五卷 Spring Data（5 章）

1. **JdbcTemplate 与数据源**
   - JdbcTemplate 基本用法
   - 数据源抽象（HikariCP / Druid）
   - 多数据源配置

2. **Spring Data JPA**
   - Repository 接口体系
   - 方法名查询与 JPQL
   - Specification 动态查询
   - 审计字段自动填充

3. **MyBatis 整合**
   - @MapperScan 与 SqlSessionFactory
   - Spring 管理 SqlSession
   - 与 JPA 的选型对比

4. **Redis 与缓存抽象**
   - RedisTemplate / StringRedisTemplate
   - @Cacheable / @CacheEvict 缓存注解
   - 缓存穿透/击穿/雪崩

5. **MongoDB 与 NoSQL**
   - MongoTemplate 与 MongoRepository
   - 文档映射与索引

### 第六卷 Spring Cloud（6 章）

1. **微服务概览**
   - 单体 → 微服务的演进
   - Spring Cloud 版本体系
   - 技术选型全景图

2. **服务注册与发现**
   - Nacos / Eureka / Consul
   - 服务元数据与健康检查

3. **配置中心**
   - Nacos Config / Spring Cloud Config
   - 动态刷新与灰度配置

4. **API 网关**
   - Spring Cloud Gateway
   - 路由、过滤器、限流
   - 与 Zuul 对比

5. **服务调用与负载均衡**
   - OpenFeign 声明式调用
   - Spring Cloud LoadBalancer
   - 超时与重试策略

6. **熔断与限流**
   - Resilience4j / Sentinel
   - 熔断、降级、限流策略
   - 链路追踪（Micrometer Tracing）

### 第七卷 Spring 生态（5 章）

1. **Spring Security**
   - 认证与授权模型
   - FilterChain 机制
   - OAuth2 / JWT 集成
   - 方法级安全

2. **Spring Batch**
   - Job / Step / Chunk 模型
   - 读-处理-写流程
   - 容错与重启

3. **Spring Integration**
   - 消息通道与端点
   - 企业集成模式（EIP）

4. **Spring Native 与 GraalVM**
   - AOT 编译原理
   - Native Image 构建
   - 反射/资源/代理的配置

5. **Testing 与测试体系**
   - @SpringBootTest
   - MockMvc / WebTestClient
   - Testcontainers 集成测试
