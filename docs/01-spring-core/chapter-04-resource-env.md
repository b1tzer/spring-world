# 资源与环境

一个真实的故事。

小王写了一个 Spring Boot 应用，本地跑得好好的，dev 环境也正常。信心满满地部署到 prod，启动直接炸了：

```
org.springframework.beans.factory.BeanCreationException:
Error creating bean with name 'dataSource':
Failed to determine a suitable driver class
```

数据库驱动找不到？本地明明有啊。小王查了半小时，发现原因令人窒息——prod 环境的配置文件路径写错了，`application-prod.yml` 里少了一个字母 `s`，写成了 `application-prod.ym`。Spring 没有报错，只是静默地用了默认配置，默认配置里没有数据源信息。

这种事故，每个团队都经历过。**配置管理是软件开发中最容易出错、最难排查的环节之一。** Spring 的 Resource 和 Environment 体系，就是为了系统性地解决这个问题。

## Resource：万能充电器

你一定写过这样的代码：

```java
// 从文件系统读
InputStream is = new FileInputStream("/opt/app/config.properties");

// 从 classpath 读
InputStream is = getClass().getClassLoader().getResourceAsStream("config.properties");

// 从 URL 读
InputStream is = new URL("https://example.com/config.properties").openStream();
```

三种来源，三种 API。如果你的配置文件可能在文件系统里，也可能在 JAR 包里，可能在远程服务器上，你得写一堆 `if-else` 来处理不同的情况。

**类比：万能充电器。** 你有 iPhone、Android、iPad、Switch，每种设备的充电口都不一样。万能充电器的做法是：定义一个统一的接口，不管你是什么口，我都能充。

Spring 的 `Resource` 就是这个万能充电器：

```java
public interface Resource extends InputStreamSource {
    boolean exists();           // 能不能充上
    boolean isReadable();       // 有没有电
    InputStream getInputStream();  // 开始充电
    URL getURL();
    File getFile();
    long contentLength();
    String getFilename();
    // ...
}
```

Spring 内置了多种实现：

| 实现类 | 前缀 | 类比 |
|-------|------|------|
| `ClassPathResource` | `classpath:` | 家里的插座 |
| `FileSystemResource` | `file:` | 办公室的插座 |
| `UrlResource` | `http:`, `ftp:` | 共享充电宝 |
| `ByteArrayResource` | 无 | 充电宝（自带电量） |
| `ServletContextResource` | 无 | 酒店的插座 |

不管资源在哪里，你都用同样的方式读取：

```java
// 这三行代码读取不同来源的资源，但接口完全一样
Resource res1 = new ClassPathResource("config.properties");
Resource res2 = new FileSystemResource("/opt/app/config.properties");
Resource res3 = new UrlResource("https://example.com/config.properties");

// 统一的读取方式
InputStream is = res.getInputStream();
```

### ResourceLoader：自动识别前缀

手动创建 Resource 对象还是有点麻烦。Spring 提供了 ResourceLoader，它能根据路径前缀自动选择合适的 Resource 实现——就像万能充电器能自动识别设备类型。

```java
@Component
public class ConfigLoader {

    @Autowired
    private ResourceLoader resourceLoader;

    public void loadConfig() throws IOException {
        // 根据前缀自动选择实现
        Resource classpathRes = resourceLoader.getResource("classpath:config.properties");
        Resource fileRes = resourceLoader.getResource("file:/opt/app/config.properties");
        Resource urlRes = resourceLoader.getResource("https://example.com/config.properties");

        // 统一的读取方式
        try (InputStream is = classpathRes.getInputStream()) {
            Properties props = new Properties();
            props.load(is);
        }
    }
}
```

`ApplicationContext` 本身就是 `ResourceLoader`，所以你可以直接注入 `ApplicationContext` 来加载资源。但更好的做法是注入 `ResourceLoader`——依赖更小，语义更明确。

### @Value 注入资源

你可以直接把资源注入到 Bean 中：

```java
@Component
public class TemplateProcessor {

    @Value("classpath:templates/email.html")
    private Resource emailTemplate;

    public String process(Map<String, Object> model) throws IOException {
        try (InputStream is = emailTemplate.getInputStream()) {
            String template = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            // 替换模板变量...
            return template;
        }
    }
}
```

这比手动写 `getResourceAsStream()` 优雅多了。

## Environment：配置的层次体系

读取配置文件只是第一步。实际应用中，配置的来源五花八门：

- `application.properties` / `application.yml` 文件
- 系统环境变量（`DB_HOST=localhost`）
- JVM 系统属性（`-Dapp.port=8080`）
- 命令行参数（`--server.port=9090`）
- 代码里硬编码的默认值

问题来了：**同一个配置项在多个地方都定义了，到底用哪个？**

这就是 Environment 要解决的问题。

### PropertySource：配置的来源

每个配置来源都是一个 PropertySource。Environment 把所有 PropertySource 组织成一个 **有序列表**，查找配置时从前往后找，第一个匹配的就返回。

**类比：快递地址校验。** 你填了一个地址，系统先查精确地址库（命令行参数），查不到查街道地址库（环境变量），再查不到查城市地址库（配置文件），最后用默认地址（代码默认值）。

![PropertySource 配置优先级](/diagrams/4-1-property-source-priority.svg)

**命令行参数优先级最高**，代码里的默认值优先级最低。这意味着你可以通过命令行参数覆盖任何配置：

```bash
# 覆盖 application.properties 里的 server.port
java -jar app.jar --server.port=9090

# 覆盖数据源配置
java -jar app.jar --spring.datasource.url=jdbc:mysql://prod-server:3306/db
```

这个设计非常实用——同一份代码，通过不同的启动参数来适配不同环境。**再也不用手动注释代码来切换环境了。**

### @Value：逐个注入

```java
@Component
public class MailConfig {

    @Value("${mail.host:localhost}")     // :localhost 是默认值
    private String host;

    @Value("${mail.port:25}")
    private int port;

    @Value("${mail.username}")
    private String username;
}
```

简单、直接。但如果你有 20 个配置项，写 20 个 `@Value` 就很痛苦了。

### @ConfigurationProperties：批量绑定

**类比：快递地址校验。** `@Value` 是你手动一个字段一个字段地输入地址，`@ConfigurationProperties` 是系统自动从你的历史地址里填充，还帮你校验格式。

```java
@Component
@ConfigurationProperties(prefix = "mail")
@Validated
public class MailProperties {

    @NotBlank
    private String host;

    @Min(1)
    @Max(65535)
    private int port;

    @Email
    private String username;

    private String password;

    private Properties properties = new Properties();

    // getter / setter
}
```

对应的 YAML：

```yaml
mail:
  host: smtp.example.com
  port: 587
  username: user@example.com
  password: secret
  properties:
    mail.smtp.auth: true
    mail.smtp.starttls.enable: true
```

`@ConfigurationProperties` 的优势：

- **批量绑定** —— 一个类对应一个配置前缀，不用写 20 个 `@Value`
- **类型安全** —— 编译期就能发现类型错误
- **数据校验** —— `@Validated` + `@Min`、`@Email` 等注解，启动时就校验
- **嵌套支持** —— 复杂的嵌套配置也能绑定
- **松散绑定** —— `mail-host`、`mailHost`、`MAIL_HOST` 都能绑定到 `mailHost`

**选择建议：** 简单的单个配置用 `@Value`，复杂的、有结构的配置用 `@ConfigurationProperties`。

## Profile：换装系统

几乎每个项目都有多个环境：开发（dev）、测试（test）、生产（prod）。每个环境的配置不同。

最原始的做法是注释代码：

```java
// String dbUrl = "jdbc:mysql://dev-server:3306/dev_db";
String dbUrl = "jdbc:mysql://prod-server:3306/prod_db";  // 上线前手动切换
```

这种方式充满了灾难的气息。开头那个小王的故事，就是这么来的。

**类比：换装系统。** 同一个人，不同场合穿不同衣服。上班穿西装，周末穿休闲，运动穿运动服。人还是那个人（同一份代码），但衣服不同（不同环境的配置）。

### Profile 基本用法

```properties
# application.yml（公共配置——你的常服）
app.name=MyApp

---
# application-dev.yml（开发环境——休闲装）
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/dev_db
logging:
  level:
    root: DEBUG

---
# application-prod.yml（生产环境——正装）
spring:
  datasource:
    url: jdbc:mysql://prod-server:3306/prod_db
logging:
  level:
    root: WARN
```

激活 Profile 的方式：

```bash
# 方式一：配置文件
spring.profiles.active=dev

# 方式二：环境变量
export SPRING_PROFILES_ACTIVE=prod

# 方式三：命令行参数（推荐——部署时指定，不改代码）
java -jar app.jar --spring.profiles.active=prod
```

### Profile 条件化 Bean

不只是配置文件，Bean 也可以按 Profile 来条件化创建：

```java
@Configuration
public class DataSourceConfig {

    @Bean
    @Profile("dev")
    public DataSource devDataSource() {
        // 开发环境：内存数据库，轻量快速
        return new EmbeddedDatabaseBuilder()
            .setType(EmbeddedDatabaseType.H2)
            .build();
    }

    @Bean
    @Profile("prod")
    public DataSource prodDataSource() {
        // 生产环境：连接池，性能优先
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://prod-server:3306/db");
        return new HikariDataSource(config);
    }
}
```

当 `dev` Profile 激活时，只有 `devDataSource()` 会被执行；`prod` 激活时，只有 `prodDataSource()` 会被执行。就像你打开衣柜，根据场合自动选出合适的衣服。

### 多 Profile 组合

```bash
# 同时激活多个 Profile
spring.profiles.active=prod,us-east,high-availability
```

```java
@Profile("prod & us-east")    // 必须同时满足
@Profile("prod | staging")    // 满足其一即可
@Profile("!dev")              // 非 dev
```

Spring Boot 2.4+ 还支持 Profile Group：

```properties
spring.profiles.group.production=proddb,prodmq,prodcache
```

激活 `production` 就等于同时激活 `proddb`、`prodmq`、`prodcache`。

### 配置文件的加载顺序

![Profile 配置文件加载顺序](/diagrams/4-2-config-loading-order.svg)

同一个配置项，位置越靠前优先级越高。

## @Conditional 家族

Profile 只是条件化的一种。Spring 提供了更灵活的条件机制——这是 Spring Boot 自动配置的核心。

```java
// 只在 classpath 中有 Redis 依赖时才创建
@ConditionalOnClass(name = "redis.clients.jedis.Jedis")
@Bean
public RedisTemplate<String, Object> redisTemplate() { ... }

// 只在配置了某个属性时才创建
@ConditionalOnProperty(name = "cache.enabled", havingValue = "true")
@Bean
public CacheManager cacheManager() { ... }

// 只在容器中没有某个 Bean 时才创建
@ConditionalOnMissingBean(DataSource.class)
@Bean
public DataSource defaultDataSource() { ... }
```

当你引入 `spring-boot-starter-data-redis` 时，Spring Boot 自动帮你配置好 `RedisTemplate`，就是靠 `@ConditionalOnClass` 判断的——classpath 里有 Redis 的类，就自动配置；没有，就跳过。

这就是"约定优于配置"的实现原理。

## 工程实践：一个典型的多环境配置结构

```
src/main/resources/
├── application.yml              # 公共配置（常服）
├── application-dev.yml          # 开发环境（休闲装）
├── application-test.yml         # 测试环境（工装）
├── application-prod.yml         # 生产环境（正装）
└── application-local.yml        # 本地开发（睡衣——不提交到 Git）
```

`application-local.yml` 存放本地独有的配置（比如你本地的数据库密码），加入 `.gitignore` 避免提交。

**敏感配置不要提交到代码仓库：**

```yaml
# application-prod.yml
spring:
  datasource:
    url: ${DB_URL}          # 从环境变量读取
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
```

启动时通过环境变量或配置中心提供这些值，而不是写在配置文件里。

## 回到开头的故事

小王的问题是什么？配置文件名写错了，Spring 没有报错，静默地用了默认配置。

如果他用了 Profile + `@ConfigurationProperties` + 启动校验，这个问题在部署时就能发现：

```java
@Bean
@ConfigurationProperties(prefix = "spring.datasource")
@Validated
public DataSourceProperties dataSourceProperties() {
    return new DataSourceProperties();
}
```

配置缺失或格式错误，启动直接报错，不会等到运行时才爆炸。

**Resource 统一了资源访问**，不管你配置文件在哪里。**Environment 管理了配置的优先级**，同一份代码适配不同环境。**Profile 实现了环境切换**，不用注释代码。**`@ConfigurationProperties` 提供了类型安全的配置绑定**，启动时就能发现配置错误。

这四者构成了 Spring 的配置体系。理解了它们，你就不会再在代码里硬编码配置，也不会再手动注释代码来切换环境了。
