# 配置中心

## 配置改了要重启服务怎么办？

一个真实的故事：线上有个服务的超时时间设成了 3 秒，结果某个下游服务偶尔会慢一点，导致大量超时报错。运维想临时改成 10 秒，但这个值写在 `application.yml` 里，改了得重启才能生效。重启意味着短暂不可用，高峰期不敢动。

于是运维等到了凌晨三点，重启了服务。

这个故事本来可以不这么惨。如果用了配置中心，改个值点一下鼠标，服务几秒钟内就用上新配置，不用重启。

配置中心解决的核心问题是：**把配置从代码里抽出来，集中管理，支持动态更新。**

![Nacos 配置推送](/diagrams/06-03-nacos-config-push.svg)

---

## Nacos Config：和注册中心一体化

如果你用了 Nacos 做注册中心，配置中心几乎零成本——同一个 Nacos Server，同一个控制台，只是多一个"配置管理"的 Tab。

### 基本用法

添加依赖（如果你已经引入了 `spring-cloud-starter-alibaba-nacos-discovery`，再加一个 config 的就行）：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-config</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bootstrap</artifactId>
</dependency>
```

> **注意：** Spring Cloud 2020.0 以后，默认不再加载 `bootstrap.yml`。如果你要用 Nacos Config，需要加 `spring-cloud-starter-bootstrap` 依赖，或者使用新的配置导入方式（`spring.config.import`）。

创建 `bootstrap.yml`（或 `application.yml`，取决于你选择的方式）：

```yaml
spring:
  application:
    name: order-service
  cloud:
    nacos:
      config:
        server-addr: localhost:8848
        file-extension: yaml
```

然后在 Nacos 控制台创建一个配置：

- **Data ID：** `order-service.yaml`
- **Group：** `DEFAULT_GROUP`
- **配置内容：**

```yaml
order:
  timeout: 5000
  max-retry: 3
```

在代码中读取：

```java
@RestController
@RefreshScope  // 关键注解：支持动态刷新
public class OrderController {

    @Value("${order.timeout}")
    private int timeout;

    @Value("${order.max-retry}")
    private int maxRetry;

    @GetMapping("/order/config")
    public String showConfig() {
        return "timeout=" + timeout + ", maxRetry=" + maxRetry;
    }
}
```

在 Nacos 控制台修改 `order.timeout` 的值，几秒钟后再次访问接口，你会发现新值已经生效了，**服务没有重启**。

### 配置的 Data ID 规则

Nacos 的配置由三个维度定位：`Namespace + Group + Data ID`。

Data ID 的命名规则默认是 `${spring.application.name}.${file-extension}`，比如 `order-service.yaml`。

你也可以自定义：

```yaml
spring:
  cloud:
    nacos:
      config:
        name: custom-name.yaml   # 自定义 Data ID
        group: ORDER_GROUP        # 自定义 Group
        namespace: dev-namespace  # 自定义 Namespace
```

---

## 动态刷新的原理

为什么加了 `@RefreshScope` 就能动态刷新？我们拆解一下这个过程。

![Nacos 长轮询机制](/diagrams/06-03-nacos-long-polling.svg)

关键机制是**长轮询（Long Polling）**。客户端不是傻乎乎地每秒问一次"配置变了吗"，而是发一个请求到 Nacos，这个请求会"挂"在服务端 30 秒。如果 30 秒内配置变了，Nacos 立刻返回；如果没变，30 秒后超时返回，客户端再发起下一次长轮询。

这种设计在实时性和性能之间取得了很好的平衡——配置变更通常几秒内就能感知到，同时不会给服务端造成太大压力。

### 哪些能动态刷新，哪些不能

`@Value` 注入的简单类型（String、int、boolean 等）可以动态刷新。但有些东西改了是没法动态生效的：

- **数据库连接池配置**（datasource url、username 等）——连接池已经创建了，改配置不会重新创建
- **线程池核心参数**——核心线程数改了不会自动调整
- **`@ConfigurationProperties` 绑定的复杂对象**——需要加 `@RefreshScope` 才行

对于数据库连接池这类场景，通常的做法是：配置变更 → 触发一个自定义的监听器 → 手动重建连接池。

---

## 多环境配置管理

实际项目中，你通常有 dev、test、prod 三套环境。怎么管理它们的配置？

### 方案一：用 Namespace 隔离

在 Nacos 中创建三个 Namespace，每个 Namespace 下放对应环境的配置：

```
Namespace: dev
  ├── order-service.yaml (timeout=3000)
  └── user-service.yaml

Namespace: prod
  ├── order-service.yaml (timeout=10000)
  └── user-service.yaml
```

通过 Spring Profile 激活不同的 Namespace：

```yaml
# application-dev.yml
spring:
  cloud:
    nacos:
      config:
        namespace: dev-namespace-id

# application-prod.yml
spring:
  cloud:
    nacos:
      config:
        namespace: prod-namespace-id
```

启动时指定 `--spring.profiles.active=prod` 即可。

### 方案二：用 shared-configs 共享公共配置

很多配置是所有服务共用的，比如数据库连接信息、Redis 地址。把这些放在共享配置里，避免每个服务重复写：

```yaml
spring:
  cloud:
    nacos:
      config:
        shared-configs:
          - data-id: common-datasource.yaml
            group: SHARED_GROUP
            refresh: true
          - data-id: common-redis.yaml
            group: SHARED_GROUP
            refresh: true
```

**配置优先级：** 服务自身的配置 > shared-configs 中后声明的 > shared-configs 中先声明的。也就是说，你可以在服务自己的配置里覆盖共享配置的值。

---

## 灰度配置：先让一部分服务用新配置

有些配置变更风险很高，比如支付网关的地址、限流阈值。你不想一次性让所有实例都用新配置，而是想先让一两个实例试试，没问题再全量推。

Nacos 原生不直接支持"按实例灰度推送配置"，但你可以通过变通方式实现：

**方案：利用 Namespace + 实例标签**

1. 在 Nacos 中创建一个灰度 Namespace
2. 将灰度 Namespace 的配置设为新值
3. 让需要灰度的实例启动时指向灰度 Namespace（通过环境变量或启动参数控制）
4. 验证没问题后，把正式 Namespace 的配置也改成新值

这不是真正的"热灰度"（不用重启），但对于配置变更这种低频操作来说，重启一两个实例的代价是可以接受的。

如果需要真正的配置灰度，可以考虑在应用层面做——用一个开关字段控制走新逻辑还是旧逻辑，配合服务元数据做路由。

---

## Spring Cloud Config：Git 仓库方案

Spring Cloud Config 是 Spring Cloud 原生的配置中心，它把配置存在 Git 仓库里。

### 工作方式

![Spring Cloud Config 工作方式](/diagrams/06-03-spring-cloud-config.svg)

配置存在 Git 里有天然的优势：**版本管理**。每次配置变更都有 commit 记录，随时可以回滚。

```yaml
# Config Server 配置
spring:
  cloud:
    config:
      server:
        git:
          uri: https://github.com/your-org/config-repo
          default-label: main
          search-paths: '{application}'
```

Git 仓库里的文件结构：

```
config-repo/
├── order-service.yaml
├── user-service.yaml
└── application.yaml     # 所有服务共享
```

### Nacos Config vs Spring Cloud Config

| 特性 | Nacos Config | Spring Cloud Config |
|---|---|---|
| 配置存储 | 内置数据库 | Git 仓库 |
| 动态推送 | 长轮询，秒级 | 需要配合 Bus + MQ |
| 版本管理 | 有版本记录，但不如 Git | 天然 Git 版本管理 |
| 管理界面 | 完善的 Web 控制台 | 需要自己搭建或用第三方 |
| 多环境 | Namespace 隔离 | Git 分支 / Profile |

**选择建议：** 如果你已经在用 Nacos 做注册中心，直接用 Nacos Config，省事。如果你对配置的版本管理要求很高（比如金融行业的合规要求），Spring Cloud Config + Git 的方案更适合。

---

## 小结

配置中心的核心价值是**解耦配置和代码**，让你能在不重启服务的情况下调整运行参数。

几个要点：

1. **`@RefreshScope` 是动态刷新的关键。** 但要知道哪些配置能动态生效，哪些不能。
2. **用 Namespace 做环境隔离，用 shared-configs 做公共配置复用。** 避免每个服务重复维护相同的配置。
3. **长轮询是 Nacos 配置推送的核心机制。** 比定时拉取更实时，比 WebSocket 更轻量。
4. **不是所有配置都适合动态刷新。** 数据库连接池、线程池核心参数这类"基础设施级"配置，通常需要手动重建。

下一章我们来看 API 网关——当外部请求涌进来时，怎么统一入口、统一鉴权、统一路由。
