# 配置体系

一个真实的故事：线上有个服务，开发环境跑得好好的，部署到测试环境后数据库连不上。查了半天，发现 `application.yml` 里写的是 `spring.datasource.url`，但运维通过环境变量注入的是 `SPRING_DATASOURC_URL`——少了一个 `E`。环境变量的映射规则是 Spring Boot 自动做的，但运维不知道。

配置这件事，看起来简单，实际上坑很多。Spring Boot 的配置体系设计得很灵活，但灵活意味着你得搞清楚规则，否则就是"灵活地出错"。

## 配置文件的优先级：谁说了算

Spring Boot 支持 `application.properties`、`application.yml`、`application.yaml` 三种格式，本质一样，推荐用 `yml`——层级更清晰，写起来更舒服。

但真正让人困惑的问题是：**当有多个配置来源时，谁说了算？**

Spring Boot 的配置来源多达 17 种，记住最重要的几种就够了：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1（最高） | 命令行参数 | `--server.port=9090` |
| 2 | 系统属性 | `-Dserver.port=9090` |
| 3 | 环境变量 | `SERVER_PORT=9090` |
| 4 | `application-{profile}.yml` | profile 专属配置 |
| 5 | `application.yml` | 主配置文件 |
| 6（最低） | 默认值 | 代码里写的默认值 |

**核心规则：优先级高的覆盖优先级低的，但不是替换，是合并。**

举个例子，`application.yml` 里写了：

```yaml
server:
  port: 8080
  servlet:
    context-path: /api
app:
  name: my-service
  debug: false
```

启动时加了命令行参数：

```bash
java -jar myapp.jar --server.port=9090 --app.debug=true
```

最终生效的配置：

```yaml
server:
  port: 9090           # 命令行覆盖了 yml
  servlet:
    context-path: /api  # yml 的值保留
app:
  name: my-service     # yml 的值保留
  debug: true          # 命令行覆盖了 yml
```

**不会因为命令行覆盖了 `server.port`，就把整个 `server` 节点都替换了。** 每个配置项独立比较优先级。这一点很多人搞不清楚。

### 环境变量的映射规则

在 Docker 和 Kubernetes 环境里，环境变量是注入配置的标准方式。Spring Boot 的映射规则是：把 `.` 替换成 `_`，把 `-` 去掉，全大写。

- `server.port` → `SERVER_PORT`
- `spring.datasource.url` → `SPRING_DATASOURCE_URL`
- `app.my-config` → `APPMYCONFIG`

注意最后一条：**`-` 被去掉了**。这就是开头那个故事的根源——运维按直觉猜环境变量名，猜错了。

### 多 Profile 配置文件

除了 `application.yml`，你可以创建 profile 专属的配置文件：

```
application.yml          # 公共配置
application-dev.yml      # 开发环境
application-test.yml     # 测试环境
application-prod.yml     # 生产环境
```

**`application.yml` 和 `application-{profile}.yml` 是合并关系，不是替换关系。** profile 配置覆盖 `application.yml` 中的同名项，没有冲突的部分保留。

一个典型的用法：

```yaml
# application.yml — 公共配置
app:
  name: my-service
spring:
  jpa:
    show-sql: false
logging:
  level:
    root: INFO
```

```yaml
# application-dev.yml — 开发环境
spring:
  jpa:
    show-sql: true
  datasource:
    url: jdbc:mysql://localhost:3306/dev_db
    username: root
    password: root
logging:
  level:
    root: DEBUG
```

```yaml
# application-prod.yml — 生产环境
spring:
  datasource:
    url: jdbc:mysql://prod-db:3306/prod_db
    username: ${DB_USER}
    password: ${DB_PASSWORD}
logging:
  level:
    root: WARN
```

公共配置只写一次，环境差异各自独立。这个模式你以后会反复用。

## @ConfigurationProperties：类型安全的配置绑定

在 `application.yml` 里写了配置，怎么在代码里用？两种方式，但差距很大。

### @Value：能用，但别滥用

```java
@Value("${app.name}")
private String appName;
```

简单场景够用，但有几个问题：配置项多了到处写 `@Value`，维护困难；没有 IDE 自动提示；不支持复杂结构（嵌套对象、列表）；默认值写在注解里，和配置文件割裂。

### @ConfigurationProperties：推荐

```java
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String name;
    private String version = "1.0.0";  // 默认值
    private boolean debug;
    private List<String> servers = new ArrayList<>();
    private Map<String, String> metadata = new HashMap<>();

    private Security security = new Security();

    public static class Security {
        private boolean enabled = true;
        private long timeout = 3000;
        // getter / setter
    }

    // getter / setter
}
```

对应 `application.yml`：

```yaml
app:
  name: my-service
  version: 2.0.0
  debug: true
  servers:
    - server1.example.com
    - server2.example.com
  metadata:
    team: backend
    env: production
  security:
    enabled: true
    timeout: 5000
```

注册方式有两种。第一种，配合 `@EnableConfigurationProperties`：

```java
@EnableConfigurationProperties(AppProperties.class)
@Configuration
public class AppConfig {
}
```

第二种，直接加 `@Component`：

```java
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {
}
```

我更推荐第一种——语义更清晰，"这个属性类是被配置体系启用的"，而不是"它是一个普通的 Spring Bean"。

`@ConfigurationProperties` 的优势在于**类型安全**。`name` 就是 `String`，`debug` 就是 `boolean`，编译期就能检查。引入 `spring-boot-configuration-processor` 依赖后，IDE 还能自动提示 `app.*` 下有哪些配置项——这在配置项多的时候非常救命。

### JSR-303 校验：fail-fast 比 fail-silent 好一万倍

```java
@ConfigurationProperties(prefix = "app")
@Validated
public class AppProperties {

    @NotBlank(message = "app.name 不能为空")
    private String name;

    @Min(value = 1, message = "端口号必须大于 0")
    private int port = 8080;

    @Pattern(regexp = "^(dev|test|prod)$", message = "环境必须是 dev/test/prod")
    private String env;
}
```

启动时如果配置不合法，直接抛异常，不会带着错误配置跑起来。**在生产环境，一个配置错误导致的静默失败，比启动失败难排查一百倍。**

整个绑定流程：

![配置绑定流程](/diagrams/04-03-config-bind.svg)

## 配置加密：密码不能明文

数据库密码、API Key、第三方服务密钥——这些敏感信息放在 `application.yml` 里是明文的，代码一提交到 Git，所有人都能看到。这是安全隐患，不是"可能"，是"一定"。

### 环境变量：最简单的方式

```yaml
spring:
  datasource:
    username: ${DB_USER}
    password: ${DB_PASSWORD}
```

启动时注入：

```bash
export DB_USER=admin
export DB_PASSWORD=s3cret!@#
java -jar myapp.jar
```

优点：简单直接，密码不出现在代码里。缺点：环境变量在某些场景下也容易泄露（`/proc/1/environ`、日志、调试工具）。

### Jasypt 加密：推荐方案

[Jasypt](http://www.jasypt.org/)（Java Simplified Encryption）是 Java 世界最常用的配置加密方案。

引入依赖：

```xml
<dependency>
    <groupId>com.github.ulisesbocchio</groupId>
    <artifactId>jasypt-spring-boot-starter</artifactId>
    <version>3.0.5</version>
</dependency>
```

先加密你的密码：

```bash
java -cp jasypt-1.9.3.jar org.jasypt.intf.cli.JasyptPBEStringEncryptionCLI \
    input="s3cret!@#" \
    password="my-encryption-key" \
    algorithm=PBEWithMD5AndDES
```

输出：`ENC(G6N718/uNv2p8VzYkPL0hQ==)`

然后在 `application.yml` 里：

```yaml
spring:
  datasource:
    password: ENC(G6N718/uNv2p8VzYkPL0hQ==)

jasypt:
  encryptor:
    password: ${JASYPT_KEY}  # 加密密钥通过环境变量传入
```

应用启动时，Jasypt 自动识别 `ENC(...)` 格式的值，解密后注入。对业务代码完全透明。

加密密钥本身怎么传？**绝对不要写在配置文件里**，通过环境变量或启动参数传入：

```bash
java -DJASYPT_KEY=my-encryption-key -jar myapp.jar
```

### Vault：企业级方案

如果你的团队使用 HashiCorp Vault，Spring Cloud Vault 可以直接从 Vault 拉取密钥：

```yaml
spring:
  cloud:
    vault:
      uri: https://vault.example.com:8200
      token: ${VAULT_TOKEN}
      kv:
        enabled: true
```

代码里直接用 `@Value("${database.password}")`，值来自 Vault，本地配置文件里根本没有密码。

### 我的建议

| 场景 | 推荐方案 |
|------|---------|
| 个人项目 / 小团队 | 环境变量，够用 |
| 中型项目 | Jasypt 加密 + 环境变量传密钥 |
| 大型企业 / 合规要求高 | Vault 或 KMS |

不管用哪种方案，有一个原则：**密码永远不要以明文形式出现在代码仓库里。** 这不是建议，是底线。

## 配置加载的完整流程

最后用一张图把整个配置体系串起来：

![配置加载完整流程](/diagrams/04-03-config-sources.svg)

**配置体系的本质就是一个多源的 PropertySource 合并机制。** 理解了优先级规则和绑定方式，你就能灵活应对各种配置场景——也能在配置"不生效"的时候，快速定位是哪个环节出了问题。
