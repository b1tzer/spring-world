# JdbcTemplate 与数据源

每个写过原生 JDBC 的人，都会对那段代码有 PTSD。

一个简单的"按 ID 查用户"，你得先获取连接、创建 PreparedStatement、设置参数、执行查询、遍历 ResultSet、手动映射字段、最后在 finally 里依次关闭 ResultSet、PreparedStatement、Connection——少关一个就泄漏。真正干活的就两行，剩下的全是"仪式感"。

这不是夸张。你回忆一下自己写过的 DAO 层，有多少代码是在做"获取连接-关闭连接"这种重复劳动？改一个字段名，得改 N 个地方。加一个查询方法，又是那套 try-catch-finally 三件套。你不是在写业务逻辑，你是在写"数据库访问礼仪"。

Spring 的 JdbcTemplate 就是来把这些礼仪废掉的。

## 告别样板代码：JdbcTemplate 怎么做到三行查询

同样的"按 ID 查用户"，JdbcTemplate 版本：

```java
@Repository
public class UserRepository {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    public User findById(Long id) {
        return jdbcTemplate.queryForObject(
            "SELECT * FROM users WHERE id = ?",
            new BeanPropertyRowMapper<>(User.class),
            id
        );
    }
}
```

三行。Connection 的获取和释放？内部处理了。异常？Spring 把 `SQLException` 转成了自己的 `DataAccessException` 体系——unchecked 的，你不用强制 catch。结果映射？`BeanPropertyRowMapper` 通过反射自动把列值设到对象属性上。

来对比一下原生 JDBC 到底"疼"在哪：

![原生 JDBC 调用流程](/diagrams/05-01-jdbc-sequence.svg)

JdbcTemplate 帮你把上面虚线框里的"仪式"全包了，你只需要关注 SQL 和结果映射。

来看看 JdbcTemplate 最常用的几个方法：

```java
// 查询单个对象 —— 找不到会抛 EmptyResultDataAccessException
User user = jdbcTemplate.queryForObject(
    "SELECT * FROM users WHERE id = ?",
    new BeanPropertyRowMapper<>(User.class),
    1L
);

// 查询列表
List<User> users = jdbcTemplate.query(
    "SELECT * FROM users WHERE age > ?",
    new BeanPropertyRowMapper<>(User.class),
    18
);

// 插入
jdbcTemplate.update(
    "INSERT INTO users (name, email) VALUES (?, ?)",
    "张三", "zhangsan@example.com"
);

// 更新 / 删除（同一个方法）
jdbcTemplate.update("UPDATE users SET name = ? WHERE id = ?", "李四", 1L);
jdbcTemplate.update("DELETE FROM users WHERE id = ?", 1L);

// 查询单个值
Long count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Long.class);
```

注意一个细节：SQL 里的参数用 `?` 占位，底层走的是 `PreparedStatement`，天然防 SQL 注入。有些人图省事拼接字符串写 SQL——别这么干，JdbcTemplate 的占位符就是设计来替代这个的。

`BeanPropertyRowMapper` 要求数据库列名和 Java 属性名对应，默认按驼峰转换（`user_name` → `userName`）。如果你的命名不规范（比如数据库里叫 `usr_nm`），可以自己实现 `RowMapper`：

```java
RowMapper<User> userRowMapper = (rs, rowNum) -> {
    User user = new User();
    user.setId(rs.getLong("id"));
    user.setName(rs.getString("usr_nm"));
    return user;
};
```

**我的判断**：JdbcTemplate 在今天依然有它的位置。不是所有项目都需要 JPA 或 MyBatis 那套抽象层。如果你的 SQL 不复杂、不想引入 ORM 框架、或者在写一些工具类和脚手架代码，JdbcTemplate 是最轻量的选择——学习成本几乎为零，你只要会写 SQL 就行。

## 连接池：为什么不能每次都 new Connection

假设你写了一个最简单的数据库连接：

```java
Connection conn = DriverManager.getConnection(
    "jdbc:mysql://localhost:3306/mydb", "root", "password"
);
```

这行代码做了什么？TCP 三次握手建立连接 → MySQL 认证握手 → 分配服务端线程 → 执行查询 → 关闭连接释放资源。整个过程大概 50-100ms。

如果每个请求都这么搞一次，100 个并发就是 100 次连接建立。MySQL 默认 `max_connections` 是 151，超过就拒绝连接。更要命的是，建立连接的开销（网络往返 + 认证）比大多数查询本身还耗时。

**连接池的核心思想**：预先创建一批连接放在池子里，用的时候借出来，用完还回去，而不是每次新建再销毁。

![连接池工作原理](/diagrams/05-01-connection-pool.svg)

Spring Boot 默认使用 HikariCP 作为连接池（从 2.0 开始）。配置方式：

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/mydb?useSSL=false&serverTimezone=Asia/Shanghai
    username: root
    password: password
    hikari:
      maximum-pool-size: 10        # 最大连接数
      minimum-idle: 5              # 最小空闲连接数
      connection-timeout: 30000    # 获取连接超时时间（毫秒）
      idle-timeout: 600000         # 空闲连接存活时间
      max-lifetime: 1800000        # 连接最大存活时间
```

HikariCP 为什么是默认选择？一个字：快。它的作者做了大量极端优化——用 `ConcurrentBag` 替代 `BlockingQueue`、用 `javassist` 生成代理类避免反射、字节码级别优化。在大多数基准测试中，HikariCP 的吞吐量是其他连接池的 2-3 倍。

国内项目常用 Druid，阿里巴巴开源的。Druid 的优势不在速度（比 HikariCP 慢一些），而在**监控**。它内置了一个 Web 监控页面，能看 SQL 执行统计、慢查询、连接池状态：

```yaml
spring:
  datasource:
    druid:
      initial-size: 5
      max-active: 20
      min-idle: 5
      stat-view-servlet:
        enabled: true
        url-pattern: /druid/*
        login-username: admin
        login-password: admin
```

加上 `druid-spring-boot-starter` 依赖，访问 `/druid` 就能看到监控面板。生产环境排查慢 SQL 非常好用。

**选哪个？** 追求性能选 HikariCP（默认就好，不用额外配置）。需要 SQL 监控选 Druid。两者在功能上差别不大，性能差距在大多数场景下感知不到。别花太多时间在这个选择上。

## 一个应用连两个数据库：多数据源配置

一个真实场景：你的电商系统需要同时访问业务库（MySQL）和数据仓库（另一个 MySQL 实例）。一个 `DataSource` 显然不够。

Spring Boot 的自动配置在单数据源时很方便，但多数据源需要你手动接管。核心思路：**禁用自动配置，手动创建多个 DataSource Bean，并分别绑定到各自的 JdbcTemplate。**

```java
@Configuration
public class DataSourceConfig {

    // ---- 数据源 1：业务库 ----
    @Bean("businessDataSource")
    @ConfigurationProperties("spring.datasource.business")
    public DataSource businessDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean("businessJdbcTemplate")
    public JdbcTemplate businessJdbcTemplate(
            @Qualifier("businessDataSource") DataSource ds) {
        return new JdbcTemplate(ds);
    }

    // ---- 数据源 2：数据仓库 ----
    @Bean("warehouseDataSource")
    @ConfigurationProperties("spring.datasource.warehouse")
    public DataSource warehouseDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean("warehouseJdbcTemplate")
    public JdbcTemplate warehouseJdbcTemplate(
            @Qualifier("warehouseDataSource") DataSource ds) {
        return new JdbcTemplate(ds);
    }
}
```

对应的配置：

```yaml
spring:
  datasource:
    business:
      url: jdbc:mysql://localhost:3306/business_db
      username: root
      password: root123
      hikari:
        pool-name: business-pool
        maximum-pool-size: 10
    warehouse:
      url: jdbc:mysql://192.168.1.100:3306/warehouse_db
      username: reader
      password: reader123
      hikari:
        pool-name: warehouse-pool
        maximum-pool-size: 5
```

使用时通过 `@Qualifier` 注入对应的 JdbcTemplate：

```java
@Service
public class OrderService {

    @Autowired
    @Qualifier("businessJdbcTemplate")
    private JdbcTemplate businessJdbc;

    @Autowired
    @Qualifier("warehouseJdbcTemplate")
    private JdbcTemplate warehouseJdbc;

    public Order getOrder(Long orderId) {
        // 从业务库查订单
        Order order = businessJdbc.queryForObject(
            "SELECT * FROM orders WHERE id = ?",
            new BeanPropertyRowMapper<>(Order.class),
            orderId
        );

        // 从数据仓库查分析数据
        Map<String, Object> stats = warehouseJdbc.queryForMap(
            "SELECT * FROM order_stats WHERE order_id = ?",
            orderId
        );

        order.setStats(stats);
        return order;
    }
}
```

这里有个坑：启动类上要排除 `DataSourceAutoConfiguration`，否则 Spring Boot 会尝试自动配置一个数据源，跟你手动定义的冲突：

```java
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

![多数据源架构](/diagrams/05-01-multi-datasource.svg)

多数据源场景下事务管理就复杂了。`@Transactional` 默认用的是主数据源的事务管理器。跨数据源的分布式事务，要么用 JTA（太重了），要么在业务层手动控制。大多数场景下，能做到单数据源内的事务就够了，跨数据源的操作尽量设计成最终一致的。

**什么时候需要多数据源？** 读写分离（主库写、从库读）、多租户（每个租户一个库）、微服务拆分过渡期（一个服务暂时连两个库）、数据迁移。如果不是这些场景，尽量不要搞——它会显著增加配置复杂度和运维成本。
