# 内嵌容器与 Actuator

用过传统 Spring MVC 的人一定经历过这个流程：把项目打成 war 包，丢到 Tomcat 的 `webapps` 目录下，启动 Tomcat。Tomcat 是一个独立安装的 Web 服务器，你的应用只是它里面的一个"租户"。每次部署都要和运维协调 Tomcat 版本、端口冲突、目录权限——光环境配置就能搞半天。

Spring Boot 换了一个思路：**把 Tomcat 塞进你的应用里，而不是把你的应用丢进 Tomcat 里。** 这一个反转，改变了整个 Java Web 应用的部署方式。

## 内嵌容器是怎么做到的

来看 `spring-boot-starter-web` 的依赖链：

```
spring-boot-starter-web
  └── spring-boot-starter-tomcat
        ├── tomcat-embed-core
        ├── tomcat-embed-el
        └── tomcat-embed-websocket
```

`tomcat-embed-core` 这个 jar 包里包含了完整的 Tomcat 内嵌 API。Spring Boot 启动时，创建一个内嵌的 Tomcat 实例，把 `DispatcherServlet` 注册上去，然后启动 Tomcat。

核心逻辑在 `ServletWebServerApplicationContext` 里：

```java
// 简化后的逻辑
private void createWebServer() {
    // 1. 从容器里找 WebServerFactory（Tomcat/Jetty/Undertow）
    WebServerFactory factory = getWebServerFactory();
    // 2. 创建 WebServer（内嵌 Tomcat 实例）
    this.webServer = factory.getWebServer(getSelfInitializer());
    // 3. 启动
    this.webServer.start();
}
```

关键在 `getWebServerFactory()`——它根据 classpath 里有什么来决定用哪个容器。引入了 `tomcat-embed` 就用 Tomcat，引入了 `jetty-server` 就用 Jetty。**又是一个条件装配的应用。**

启动日志长这样：

```
Tomcat initialized with port(s): 8080 (http)
Starting service [Tomcat]
Starting Servlet engine: [Apache Tomcat/10.1.16]
Root WebApplicationContext: initialization completed in 1234 ms
Tomcat started on port(s): 8080 (http) with context path ''
```

内嵌容器的好处是显而易见的：

1. **部署简单**：一个 fat jar，`java -jar myapp.jar` 直接跑。
2. **环境可控**：不用担心运维装的 Tomcat 版本和你开发用的不一样。
3. **适合容器化**：Docker 镜像里只需要一个 JRE，不需要装 Tomcat。
4. **适合微服务**：每个服务独立运行，不共享 Tomcat。

**这四点加在一起，就是 Spring Boot 能成为微服务基础设施的根本原因。**

## 换个容器：Tomcat / Jetty / Undertow

Spring Boot 默认用 Tomcat，但你完全可以换成 Jetty 或 Undertow。操作非常简单——排除默认依赖，引入新的：

### 切换到 Jetty

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
        </exclusion>
    </exclusions>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jetty</artifactId>
</dependency>
```

### 切换到 Undertow

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
        </exclusion>
    </exclusions>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-undertow</artifactId>
</dependency>
```

代码层面零改动。启动日志会变成对应容器的信息。

**怎么选？说说我的看法：**

| 容器 | 特点 | 适合场景 |
|------|------|---------|
| **Tomcat** | 社区最大，文档最全，Spring Boot 默认 | 绝大多数场景，不用纠结 |
| **Jetty** | 更轻量，长连接友好 | WebSocket 重度使用、资源敏感场景 |
| **Undertow** | 性能最好，内存占用最低 | 高并发、对性能有极致追求 |

**90% 的项目用 Tomcat 就够了。** 换 Undertow 能提升 10-20% 的吞吐量，但代价是社区资源少、出了问题排查更难。除非你有明确的性能基准测试证明 Tomcat 是瓶颈，否则别折腾。

## Actuator：生产环境的眼睛

应用上线之后，你怎么知道它是否健康？数据库连接还正常吗？磁盘空间够不够？JVM 内存用了多少？

没有 Actuator 的时候，你可能要自己写一堆 `/health`、`/info` 接口，每个服务写一遍，格式还不统一。Actuator 帮你把这件事标准化了。

引入依赖：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

启动后访问 `http://localhost:8080/actuator`，就能看到所有可用端点。

### 最重要的端点

| 端点 | 用途 | 默认暴露 |
|------|------|---------|
| `/actuator/health` | 健康检查 | ✅ 是 |
| `/actuator/info` | 应用信息 | ✅ 是 |
| `/actuator/metrics` | 性能指标 | ❌ 否 |
| `/actuator/env` | 环境变量和配置 | ❌ 否 |
| `/actuator/loggers` | 日志级别管理 | ❌ 否 |
| `/actuator/heapdump` | 堆 dump | ❌ 否 |

默认只暴露 `health` 和 `info`——**这是安全考量，不是偷懒。** 其他端点包含大量内部信息，需要手动开启：

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,env,loggers
  endpoint:
    health:
      show-details: always
```

### 健康检查：Kubernetes 的生命线

`/actuator/health` 是最重要的端点。Kubernetes 的 liveness probe 和 readiness probe 通常就指向它。

```json
{
    "status": "UP",
    "components": {
        "db": {
            "status": "UP",
            "details": {
                "database": "MySQL"
            }
        },
        "diskSpace": {
            "status": "UP",
            "details": {
                "total": 500107862016,
                "free": 234567890123
            }
        },
        "redis": {
            "status": "UP"
        }
    }
}
```

`status` 有四种值：`UP`（健康）、`DOWN`（不健康）、`OUT_OF_SERVICE`（暂停服务）、`UNKNOWN`（未知）。Kubernetes 根据这个值决定是否把流量导到这个 Pod。

Spring Boot 会自动检测你引入了哪些依赖，注册对应的 HealthIndicator。引入了 Redis Starter 就有 Redis 健康检查，引入了 JPA Starter 就有数据库健康检查——**又是一个自动配置的应用。**

你也可以自定义：

```java
@Component
public class ExternalApiHealthIndicator implements HealthIndicator {

    @Override
    public Health health() {
        if (isExternalApiReachable()) {
            return Health.up()
                    .withDetail("external-api", "reachable")
                    .build();
        }
        return Health.down()
                .withDetail("external-api", "unreachable")
                .withDetail("reason", "connection timeout")
                .build();
    }
}
```

### 生产环境必须保护 Actuator

Actuator 端点暴露了大量应用内部信息，**在生产环境裸奔等于自杀。**

最简单的做法是用独立管理端口：

```yaml
management:
  server:
    port: 9090
```

业务请求走 8080，Actuator 走 9090，防火墙只对内部网络开放 9090。

配合 Spring Security 做细粒度控制：

```java
@Configuration
public class ActuatorSecurityConfig {

    @Bean
    public SecurityFilterChain actuatorSecurity(HttpSecurity http) throws Exception {
        http
            .securityMatcher("/actuator/**")
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/actuator/**").hasRole("ADMIN")
            )
            .httpBasic(Customizer.withDefaults());
        return http.build();
    }
}
```

健康检查接口放行（Kubernetes 需要访问），其他端点只有 ADMIN 角色才能访问。

## 优雅停机：一个被大多数人忽略的配置

你有没有遇到过这种情况：应用重启时，正在处理的请求突然断了，用户看到 502 错误？或者正在写数据库的事务被强制中断，数据不一致？

这就是"优雅停机"要解决的问题。Spring Boot 2.3 开始内置了这个支持，**一行配置就能避免很多线上事故：**

```yaml
server:
  shutdown: graceful

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

配置后的流程：

1. 收到停机信号（`SIGTERM` 或 `kill`）。
2. **不再接受新请求。**
3. **等待已有的请求处理完成**，最多等 30 秒。
4. 30 秒后还有请求没处理完？强制关闭。
5. 销毁 Spring 容器。

![优雅关闭时序图](/diagrams/04-04-graceful-shutdown.svg)

在 Kubernetes 环境里，这和 Pod 的 `terminationGracePeriodSeconds` 配合使用：

```yaml
apiVersion: v1
kind: Pod
spec:
  terminationGracePeriodSeconds: 60
  containers:
    - name: myapp
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]
```

**K8s 的 `terminationGracePeriodSeconds` 必须大于 Spring Boot 的 `timeout-per-shutdown-phase`。** 否则 K8s 可能在你还没处理完请求时就强制 kill 了——那就白配了。

`preStop` 里的 `sleep 5` 是干什么的？给 K8s 时间从 Service 摘除这个 Pod。否则 SIGTERM 发出后，kube-proxy 还没更新规则，新的请求还会打过来。

### 配合注册中心

如果你用了 Nacos、Eureka 这样的注册中心，还有一个问题：应用收到 SIGTERM 后，注册中心可能还不知道这个实例要下线，还会继续把流量导过来。

解决办法是监听 `ContextClosedEvent`，在容器销毁前主动注销：

```java
@Component
public class GracefulShutdownListener {

    private final Registration registration;
    private final RegistrationService registrationService;

    public GracefulShutdownListener(Registration registration,
                                     RegistrationService registrationService) {
        this.registration = registration;
        this.registrationService = registrationService;
    }

    @EventListener(ContextClosedEvent.class)
    public void onShutdown() {
        registrationService.deregister(registration);
        try { Thread.sleep(3000); } catch (InterruptedException ignored) {}
    }
}
```

等 3 秒是给负载均衡器更新的时间。这个细节很多人不知道，结果配了优雅停机还是会出 502。

**优雅停机不是什么高级特性，是生产环境的必需品。** 如果你的服务还没配这个，现在就去加。
