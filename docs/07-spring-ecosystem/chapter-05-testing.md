# Testing 与测试体系

## 测试的困境

Spring 应用的测试有个尴尬的问题：你的代码跑在 Spring 容器里，依赖注入、AOP、事务管理都是容器的能力。单元测试把容器去掉，很多行为测不到。集成测试启动完整容器，又慢又重。

Spring 的测试体系就是在这两个极端之间找平衡：**用最小的上下文覆盖最多的场景**。

![Spring 测试金字塔](/diagrams/07-05-test-pyramid.svg)

这一章聚焦第二层：怎么用 Spring 的测试工具高效地写集成测试。

## @SpringBootTest：启动容器做集成测试

最基础的用法：

```java
@SpringBootTest
class UserServiceTest {

    @Autowired
    private UserService userService;

    @Test
    void shouldCreateUser() {
        User user = userService.createUser("zhangsan", "zhangsan@example.com");
        assertThat(user.getId()).isNotNull();
        assertThat(user.getName()).isEqualTo("zhangsan");
    }
}
```

`@SpringBootTest` 会启动完整的 Spring 上下文。**完整意味着慢**——一个中等复杂度的项目，启动上下文要 10-30 秒。

但你不一定需要完整上下文。Spring 提供了"切片测试"，只启动需要的部分：

```java
// 只启动 Web 层，不启动 Service、Repository
@WebMvcTest(UserController.class)
class UserControllerTest {
    // 只测试 Controller 的路由和参数绑定
}

// 只启动 JPA 相关的 Bean
@DataJpaTest
class UserRepositoryTest {
    // 只测试 Repository 层
}

// 只启动 JDBC 相关的 Bean
@JdbcTest
class JdbcTemplateTest {
    // 测试 JdbcTemplate 操作
}
```

切片测试的好处是**快**。`@DataJpaTest` 只启动 DataSource、EntityManager、Repository 这几个 Bean，2-3 秒就能跑完。

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// ↑ 不用内嵌数据库，用你配置的真实数据库
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldFindByEmail() {
        // TestEntityManager 是测试专用的，可以直接 persist 不走 Service
        User user = new User("zhangsan", "zhangsan@example.com");
        entityManager.persistAndFlush(user);

        Optional<User> found = userRepository.findByEmail("zhangsan@example.com");
        assertThat(found).isPresent();
        assertThat(found.get().getName()).isEqualTo("zhangsan");
    }

    @Test
    void shouldReturnEmptyForNonExistentEmail() {
        Optional<User> found = userRepository.findByEmail("notexist@example.com");
        assertThat(found).isEmpty();
    }
}
```

`@DataJpaTest` 默认用内嵌数据库（H2），并且**每个测试方法结束后自动回滚事务**。这意味着测试之间互不影响，也不需要手动清理数据。

**@SpringBootTest 的几个关键参数**：

```java
// 指定启动的配置类，而不是扫全部
@SpringBootTest(classes = UserService.class)
// 这样只加载 UserService 依赖的 Bean，更快

// 指定 webEnvironment
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
// RANDOM_PORT：启动真正的嵌入式服务器，用随机端口
// MOCK：不启动服务器，用 MockMvc 模拟（默认值）
```

## MockMvc / WebTestClient：Web 层测试

**MockMvc** 测试传统的 Servlet-based Spring MVC 应用：

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean  // Mock 掉 Controller 依赖的 Service
    private UserService userService;

    @Test
    void shouldReturnUser() throws Exception {
        // 准备 Mock 数据
        when(userService.findById(1L))
            .thenReturn(new UserVO(1L, "zhangsan", "zhangsan@example.com"));

        // 发请求 + 验证响应
        mockMvc.perform(get("/api/users/1")
                .header("Authorization", "Bearer test-token"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("zhangsan"))
            .andExpect(jsonPath("$.email").value("zhangsan@example.com"));
    }

    @Test
    void shouldReturn404WhenUserNotFound() throws Exception {
        when(userService.findById(999L))
            .thenThrow(new NotFoundException("用户不存在"));

        mockMvc.perform(get("/api/users/999"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.message").value("用户不存在"));
    }

    @Test
    void shouldCreateUser() throws Exception {
        UserVO created = new UserVO(1L, "zhangsan", "zhangsan@example.com");
        when(userService.createUser(any())).thenReturn(created);

        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"name": "zhangsan", "email": "zhangsan@example.com"}
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(1));
    }
}
```

**WebTestClient** 测试 WebFlux 应用，也可以用于 MVC：

```java
@WebFluxTest(UserController.class)
class UserControllerWebFluxTest {

    @Autowired
    private WebTestClient webClient;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUser() {
        when(userService.findById(1L))
            .thenReturn(Mono.just(new UserVO(1L, "zhangsan", "zhangsan@example.com")));

        webClient.get().uri("/api/users/1")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.name").isEqualTo("zhangsan")
            .jsonPath("$.email").isEqualTo("zhangsan@example.com");
    }

    @Test
    void shouldReturnFluxUsers() {
        when(userService.findAll())
            .thenReturn(Flux.just(
                new UserVO(1L, "zhangsan", "zhangsan@example.com"),
                new UserVO(2L, "lisi", "lisi@example.com")
            ));

        webClient.get().uri("/api/users")
            .exchange()
            .expectStatus().isOk()
            .expectBodyList(UserVO.class)
            .hasSize(2);
    }
}
```

MockMvc 和 WebTestClient 的区别：

| | MockMvc | WebTestClient |
|---|---------|---------------|
| 编程模型 | 同步 | 响应式（WebFlux） |
| 适用场景 | Spring MVC | WebFlux / 两者通用 |
| 断言风格 | `andExpect` 链式 | `expectBody` 链式 |
| 是否启动服务器 | 否（模拟请求） | 否（默认），也可以配真实端口 |

**MockMvc 的局限**：它不会真的发 HTTP 请求，而是直接调用 DispatcherServlet 内部方法。这意味着 Filter 链不会完整执行。如果你的 Security 逻辑在 Filter 里，MockMvc 测不到。

解决办法：在测试中加载 Security 配置。

```java
@WebMvcTest(UserController.class)
@Import(SecurityConfig.class)  // 手动导入安全配置
class UserControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturn401WithoutToken() throws Exception {
        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "ADMIN")  // 模拟已认证的 ADMIN 用户
    void shouldAllowAdminAccess() throws Exception {
        when(userService.findById(1L))
            .thenReturn(new UserVO(1L, "zhangsan", "zhangsan@example.com"));

        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void shouldDenyUserAccess() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
            .andExpect(status().isForbidden());
    }
}
```

## Testcontainers：用容器跑真实数据库

内嵌数据库（H2）在测试中很方便，但有个致命问题：**H2 和 MySQL 的行为不完全一样**。

```java
// H2 里跑得通的 SQL
@Query("SELECT u FROM User u WHERE u.name LIKE '%:keyword%'")

// MySQL 里可能报错——CONCAT 和 LIKE 的语法差异
// H2 支持的函数 MySQL 不一定支持，反之亦然
```

更常见的坑：JSON 函数、全文索引、存储过程——H2 和 MySQL/PostgreSQL 的实现差异会导致"测试全过，线上全挂"。

Testcontainers 的解决方案：**测试时启动一个真实的数据库容器**。

```xml
<!-- 依赖 -->
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>mysql</artifactId>
    <scope>test</scope>
</dependency>
```

```java
@SpringBootTest
@Testcontainers
class UserRepositoryIntegrationTest {

    // 声明一个 MySQL 容器
    @Container
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.0")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test")
        .withInitScript("schema.sql");  // 启动时执行建表脚本

    // 动态覆盖数据源配置
    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired
    private UserRepository userRepository;

    @Test
    void shouldPersistAndQuery() {
        User user = new User("zhangsan", "zhangsan@example.com");
        userRepository.save(user);

        Optional<User> found = userRepository.findByEmail("zhangsan@example.com");
        assertThat(found).isPresent();
    }

    @Test
    void shouldExecuteComplexQuery() {
        // 这个查询用了 MySQL 特有的函数，H2 可能不支持
        // 但有了真实的 MySQL 容器，完全没问题
        userRepository.save(new User("zhangsan", "zhangsan@example.com"));

        List<User> users = userRepository.findByEmailDomain("example.com");
        assertThat(users).hasSize(1);
    }
}
```

`@Container` 注解标记的容器会在测试类启动时自动拉取镜像、启动容器，测试结束后自动销毁。`@DynamicPropertySource` 把容器的连接信息动态注入到 Spring 配置里。

**Testcontainers 不只是数据库**，它支持各种基础设施：

```java
// Redis
@Container
static GenericContainer<?> redis = new GenericContainer<>("redis:7")
    .withExposedPorts(6379);

// Kafka
@Container
static KafkaContainer kafka = new KafkaContainer(
    DockerImageName.parse("confluentinc/cp-kafka:7.3.0"));

// Elasticsearch
@Container
static ElasticsearchContainer es = new ElasticsearchContainer(
    DockerImageName.parse("docker.elastic.co/elasticsearch/elasticsearch:8.5.0"));

// 通用容器
@Container
static GenericContainer<?> minio = new GenericContainer<>("minio/minio:latest")
    .withExposedPorts(9000)
    .withCommand("server /data");
```

**组合使用示例**：一个完整的集成测试，包含数据库 + Redis + Mock 外部 HTTP 服务。

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class OrderServiceIntegrationTest {

    @Container
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.0")
        .withDatabaseName("orderdb");

    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7")
        .withExposedPorts(6379);

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
        registry.add("spring.redis.host", redis::getHost);
        registry.add("spring.redis.port", () -> redis.getMappedPort(6379));
    }

    // 用 WireMock 模拟外部支付服务
    @RegisterExtension
    static WireMockExtension paymentService = WireMockExtension.newInstance()
        .options(wireMockConfig().port(8089))
        .build();

    @Test
    void shouldCreateOrderWithPayment() {
        // 模拟支付服务返回成功
        paymentService.stubFor(post("/api/payments")
            .willReturn(okJson("{\"status\":\"SUCCESS\"}")));

        // 发起真实的下单请求
        // 数据库写入是真的，Redis 缓存是真的，支付服务是 Mock
        Order order = orderService.createOrder(buildOrderRequest());
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PAID);
    }
}
```

**性能优化技巧**：

Testcontainers 的容器启动是有开销的。用 `@Container` + `static` 可以让整个测试类共享同一个容器：

```java
// static 容器：整个测试类只启动一次，所有测试方法共享
@Container
static MySQLContainer<?> mysql = ...;

// 非 static 容器：每个测试方法启动一个新的容器（慢，通常不推荐）
@Container
MySQLContainer<?> mysql = ...;
```

还可以用 Singleton Container 模式，跨测试类共享：

```java
public abstract class BaseIntegrationTest {
    static final MySQLContainer<?> mysql;

    static {
        mysql = new MySQLContainer<>("mysql:8.0");
        mysql.start();  // 只启动一次，JVM 关闭时自动销毁
    }
}

// 所有集成测试继承这个基类
class UserRepositoryTest extends BaseIntegrationTest { ... }
class OrderServiceTest extends BaseIntegrationTest { ... }
```

**测试的最终目标不是覆盖率数字，而是信心**。Testcontainers 给你的信心是：测试环境和生产环境尽可能一致。100% 的 H2 测试覆盖率，不如 80% 的真实数据库测试覆盖率来得靠谱。
