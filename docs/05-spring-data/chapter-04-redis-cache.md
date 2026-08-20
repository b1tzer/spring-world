## 第四章 Redis 与缓存抽象

### 4.1 RedisTemplate / StringRedisTemplate：怎么用？

数据库扛不住了怎么办？加缓存。这是最直接、最有效的优化手段。读多写少的场景（商品详情、用户信息、配置数据），把热点数据放进内存，请求直接从内存返回，不走数据库，响应时间从毫秒级降到微秒级。

Redis 是目前最主流的缓存方案。Spring 提供了 `RedisTemplate` 来简化 Redis 操作。

先加依赖：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

配置连接信息：

```yaml
spring:
  redis:
    host: localhost
    port: 6379
    password: 
    database: 0
    lettuce:
      pool:
        max-active: 16
        max-idle: 8
        min-idle: 4
```

Spring Boot 2.x 以后默认用 Lettuce 作为 Redis 客户端（替代了 Jedis）。Lettuce 基于 Netty，支持异步和响应式编程，连接可以在多个线程间共享。

直接注入使用：

```java
@Service
public class CacheService {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    // ---- String 操作 ----
    public void setString() {
        redisTemplate.opsForValue().set("user:1001", new User(1001L, "张三", "zhangsan@test.com"));
        // 设置过期时间
        redisTemplate.opsForValue().set("token:abc123", "user:1001", 30, TimeUnit.MINUTES);
    }

    public User getString() {
        return (User) redisTemplate.opsForValue().get("user:1001");
    }

    // ---- Hash 操作 ----
    public void setHash() {
        String key = "user:1001:info";
        redisTemplate.opsForHash().put(key, "name", "张三");
        redisTemplate.opsForHash().put(key, "age", "28");
        redisTemplate.opsForHash().put(key, "city", "北京");
    }

    public Object getHashField(String field) {
        return redisTemplate.opsForHash().get("user:1001:info", field);
    }

    // ---- List 操作 ----
    public void addToList() {
        String key = "recent:search:1001";
        redisTemplate.opsForList().leftPush(key, "iPhone");
        redisTemplate.opsForList().leftPush(key, "MacBook");
        redisTemplate.opsForList().trim(key, 0, 9); // 只保留最近 10 条
    }

    // ---- Set 操作 ----
    public void addToSet() {
        String key = "user:1001:tags";
        redisTemplate.opsForSet().add(key, "VIP", "活跃用户", "数码爱好者");
    }

    // ---- ZSet（有序集合）操作 ----
    public void addToZSet() {
        String key = "hot:products";
        redisTemplate.opsForZSet().add(key, "iPhone 15", 1000);
        redisTemplate.opsForZSet().add(key, "MacBook Pro", 800);
        redisTemplate.opsForZSet().add(key, "AirPods", 1500);
        // 获取 Top 2
        Set<Object> top2 = redisTemplate.opsForZSet().reverseRange(key, 0, 1);
        // [AirPods, iPhone 15]
    }
}
```

`RedisTemplate` 和 `StringRedisTemplate` 的区别：

```java
// StringRedisTemplate: key 和 value 都是 String，序列化用 StringRedisSerializer
// 适合：key 和 value 都是字符串的场景

@Autowired
private StringRedisTemplate stringRedisTemplate;

stringRedisTemplate.opsForValue().set("name", "张三");
String name = stringRedisTemplate.opsForValue().get("name"); // "张三"


// RedisTemplate: value 可以是任意对象，需要配置序列化器
// 适合：缓存 Java 对象的场景

@Autowired
private RedisTemplate<String, Object> redisTemplate;

redisTemplate.opsForValue().set("user:1001", new User(1001L, "张三", "..."));
```

**一个大坑**：`RedisTemplate` 默认用 `JdkSerializationRedisSerializer` 序列化 value。这意味着存进 Redis 的数据是 Java 序列化后的二进制，在 Redis 客户端（redis-cli）里看到的是一堆乱码。而且序列化后的数据比 JSON 大得多。

生产环境建议换成 JSON 序列化：

```java
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);

        // key 用 String 序列化
        template.setKeySerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());

        // value 用 JSON 序列化
        Jackson2JsonRedisSerializer<Object> jsonSerializer = 
            new Jackson2JsonRedisSerializer<>(Object.class);
        
        ObjectMapper om = new ObjectMapper();
        om.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        om.activateDefaultTyping(om.getPolymorphicTypeValidator(), 
                                  ObjectMapper.DefaultTyping.NON_FINAL);
        jsonSerializer.setObjectMapper(om);

        template.setValueSerializer(jsonSerializer);
        template.setHashValueSerializer(jsonSerializer);
        
        template.afterPropertiesSet();
        return template;
    }
}
```

配置完后，Redis 里存的就是可读的 JSON 了：

```
redis-cli> GET user:1001
["com.example.entity.User",{"id":1001,"name":"张三","email":"zhangsan@test.com"}]
```

`activateDefaultTyping` 会在 JSON 中带上类的全限定名，反序列化时能正确还原成 Java 对象。这在缓存多种类型的对象时很有用，但也会让数据变大一些。如果你只缓存单一类型，可以不开启，用 `GenericJackson2JsonRedisSerializer` 替代。

### 4.2 @Cacheable / @CacheEvict 声明式缓存

手动调 `RedisTemplate` 能实现缓存，但代码里到处都是 `get` / `set` 的样板操作。Spring 的缓存抽象提供了一种更优雅的方式：**用注解声明缓存行为，框架自动处理读写。**

第一步，启用缓存：

```java
@SpringBootApplication
@EnableCaching  // 启用缓存
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

第二步，Service 方法加注解：

```java
@Service
public class ProductService {

    @Autowired
    private ProductRepository productRepository;

    /**
     * 查询商品 —— 先查缓存，缓存没有再查数据库，结果放进缓存
     */
    @Cacheable(value = "product", key = "#id")
    public Product getProductById(Long id) {
        // 这行代码只在缓存未命中时执行
        System.out.println("查询数据库: " + id);
        return productRepository.findById(id).orElse(null);
    }

    /**
     * 更新商品 —— 先更新数据库，再清除缓存
     */
    @CachePut(value = "product", key = "#product.id")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }

    /**
     * 删除商品 —— 删除数据库记录，同时清除缓存
     */
    @CacheEvict(value = "product", key = "#id")
    public void deleteProduct(Long id) {
        productRepository.deleteById(id);
    }

    /**
     * 清空商品缓存 —— 批量清除
     */
    @CacheEvict(value = "product", allEntries = true)
    public void clearProductCache() {
        // 不需要逻辑，注解会清除 "product" 下所有缓存
    }
}
```

核心注解说明：

| 注解 | 作用 | 执行时机 |
|------|------|---------|
| `@Cacheable` | 先查缓存，有就返回，没有就执行方法并将结果放入缓存 | 方法执行前 |
| `@CachePut` | 执行方法，并将结果放入缓存（总是执行方法） | 方法执行后 |
| `@CacheEvict` | 从缓存中删除指定 key | 方法执行后 |
| `@Caching` | 组合多个缓存操作 | - |

`key` 支持 SpEL 表达式：

```java
// 用方法参数作为 key
@Cacheable(value = "user", key = "#id")

// 用对象属性作为 key
@Cacheable(value = "user", key = "#user.id")

// 多个参数组合作为 key
@Cacheable(value = "user", key = "#name + ':' + #age")

// 使用方法名 + 参数作为 key（简单但不够精确）
@Cacheable(value = "user", key = "#root.methodName + ':' + #id")
```

还可以设置过期时间和条件：

```java
@Cacheable(
    value = "product",
    key = "#id",
    condition = "#id > 0",           // 只缓存 id > 0 的查询
    unless = "#result == null"       // 结果为 null 时不缓存
)
public Product getProductById(Long id) {
    return productRepository.findById(id).orElse(null);
}
```

`condition` 在方法执行前判断，为 false 时不走缓存也不写缓存。`unless` 在方法执行后判断，为 true 时不写缓存。两者配合可以精确控制缓存行为。

**需要注意的是**：`@Cacheable` 的过期时间需要在缓存配置中设置，注解本身不支持 `expire` 参数（Spring 的设计决策，有点反人类）。需要自定义 `CacheManager`：

```java
@Configuration
public class CacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(30))  // 默认 30 分钟过期
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()))
            .disableCachingNullValues();

        // 不同缓存空间不同过期时间
        Map<String, RedisCacheConfiguration> configMap = new HashMap<>();
        configMap.put("product", config.entryTtl(Duration.ofMinutes(10)));
        configMap.put("user", config.entryTtl(Duration.ofHours(1)));
        configMap.put("token", config.entryTtl(Duration.ofMinutes(30)));

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withInitialCacheConfigurations(configMap)
            .build();
    }
}
```

```mermaid
flowchart TD
    A[调用 getProductById] --> B{缓存中有数据?}
    B -->|命中| C[直接返回缓存数据]
    B -->|未命中| D[执行方法体<br/>查询数据库]
    D --> E[将结果放入缓存]
    E --> F[返回结果]
    
    style C fill:#90EE90
    style D fill:#FFB6C1
```

声明式缓存的优势是代码干净，缓存逻辑和业务逻辑分离。但它也有局限：**只适合简单的缓存场景。** 如果你需要在方法内部根据不同的条件决定缓存策略，或者需要异步更新缓存，还是得手动用 `RedisTemplate`。

### 4.3 缓存穿透、击穿、雪崩：三个经典问题

加了缓存就万事大吉了？天真。缓存引入了新的复杂性，最典型的就是三个经典问题。

#### 缓存穿透：查一个根本不存在的数据

**问题**：有人恶意请求 `GET /product/99999999`。这个商品根本不存在，缓存里没有，数据库里也没有。每次请求都打到数据库。如果这种请求量很大，数据库就崩了。

```mermaid
sequenceDiagram
    participant Attacker as 攻击者
    participant Cache as 缓存
    participant DB as 数据库

    Attacker->>Cache: 查询 id=99999999
    Cache-->>Attacker: 缓存未命中
    Cache->>DB: 查询 id=99999999
    DB-->>Cache: 不存在
    Cache-->>Attacker: null
    
    Attacker->>Cache: 查询 id=99999998
    Cache-->>Attacker: 缓存未命中
    Cache->>DB: 查询 id=99999998
    DB-->>Cache: 不存在
    Note over Cache,DB: 每次请求都打到数据库！
```

**解决方案：缓存空值。** 查不到的数据也放进缓存，设一个较短的过期时间：

```java
@Cacheable(value = "product", key = "#id", unless = "#result == null")
public Product getProductById(Long id) {
    return productRepository.findById(id).orElse(null);
}
```

默认 `unless = "#result == null"` 时，null 结果不会被缓存。改成：

```java
public Product getProductById(Long id) {
    Product product = productRepository.findById(id).orElse(null);
    if (product == null) {
        // 缓存空值，5 分钟过期
        stringRedisTemplate.opsForValue().set(
            "product:" + id, "", 5, TimeUnit.MINUTES);
    }
    return product;
}
```

更彻底的方案是**布隆过滤器**：在缓存之前加一层布隆过滤器，判断 key 是否可能存在。如果布隆过滤器说不存在，直接返回，不查缓存也不查数据库。代价是需要维护布隆过滤器的数据（数据变更时要同步更新）。

#### 缓存击穿：热点 key 过期的瞬间

**问题**：某个热点数据（比如秒杀商品）缓存过期了。同一时刻大量请求涌入，发现缓存没有，全部打到数据库。数据库瞬间压力暴增。

```mermaid
sequenceDiagram
    participant Req1 as 请求1
    participant Req2 as 请求2
    participant ReqN as 请求N...
    participant Cache as 缓存
    participant DB as 数据库

    Note over Cache: 热点 key 刚过期
    Req1->>Cache: 查热点数据
    Req2->>Cache: 查热点数据
    ReqN->>Cache: 查热点数据
    Cache-->>Req1: 未命中
    Cache-->>Req2: 未命中
    Cache-->>ReqN: 未命中
    Req1->>DB: 查数据库
    Req2->>DB: 查数据库
    ReqN->>DB: 查数据库
    Note over DB: 数据库被击穿！
```

**解决方案：互斥锁（分布式锁）。** 只让一个请求去查数据库，其他请求等待：

```java
public Product getProductWithLock(Long id) {
    String cacheKey = "product:" + id;
    String lockKey = "lock:product:" + id;
    
    // 1. 先查缓存
    String value = stringRedisTemplate.opsForValue().get(cacheKey);
    if (value != null) {
        return JSON.parseObject(value, Product.class);
    }
    
    // 2. 缓存没有，尝试获取分布式锁
    Boolean locked = stringRedisTemplate.opsForValue()
        .setIfAbsent(lockKey, "1", 10, TimeUnit.SECONDS);
    
    if (Boolean.TRUE.equals(locked)) {
        try {
            // 3. 获得锁，查数据库并写入缓存
            Product product = productRepository.findById(id).orElse(null);
            if (product != null) {
                stringRedisTemplate.opsForValue().set(
                    cacheKey, JSON.toJSONString(product), 
                    30, TimeUnit.MINUTES);
            }
            return product;
        } finally {
            stringRedisTemplate.delete(lockKey);  // 释放锁
        }
    } else {
        // 4. 没获得锁，等一会儿重试
        Thread.sleep(50);
        return getProductWithLock(id);  // 递归重试
    }
}
```

另一种方案是**逻辑过期**：缓存不设物理过期时间，而是在 value 中存一个逻辑过期时间。读取时判断是否逻辑过期，过期了就异步更新缓存，当前请求返回旧数据。这样不会有任何请求打到数据库（代价是可能短暂返回过期数据）。

#### 缓存雪崩：大面积缓存同时过期

**问题**：大量缓存 key 设置了相同的过期时间（比如都是"启动后 30 分钟"），它们会在同一时刻过期。瞬间所有请求都打到数据库，数据库直接宕机。

**解决方案：过期时间加随机值。**

```java
// 不要这样写（所有 key 同时过期）
stringRedisTemplate.opsForValue().set(key, value, 30, TimeUnit.MINUTES);

// 加随机偏移量
int baseTtl = 30;  // 基础过期时间 30 分钟
int randomOffset = ThreadLocalRandom.current().nextInt(10);  // 0-9 分钟随机偏移
stringRedisTemplate.opsForValue().set(key, value, 
    baseTtl + randomOffset, TimeUnit.MINUTES);
```

这样即使 key 是同时创建的，过期时间也会分散在一个 10 分钟的窗口内，不会集中过期。

**另一个关键策略：多级缓存。** 在 Redis 之前加一层本地缓存（Caffeine、Guava Cache）：

```mermaid
graph LR
    A[请求] --> B{本地缓存<br/>Caffeine}
    B -->|命中| C[返回]
    B -->|未命中| D{Redis 缓存}
    D -->|命中| E[返回并写入本地缓存]
    D -->|未命中| F[查数据库]
    F --> G[写入 Redis 和本地缓存]
    G --> C
    
    style B fill:#90EE90
    style D fill:#87CEEB
```

```java
@Service
public class ProductService {

    // 本地缓存（进程内，最快）
    private final Cache<Long, Product> localCache = Caffeine.newBuilder()
        .maximumSize(1000)
        .expireAfterWrite(5, TimeUnit.MINUTES)
        .build();

    public Product getProduct(Long id) {
        // 1. 查本地缓存
        Product product = localCache.getIfPresent(id);
        if (product != null) return product;

        // 2. 查 Redis
        String json = stringRedisTemplate.opsForValue().get("product:" + id);
        if (json != null) {
            product = JSON.parseObject(json, Product.class);
            localCache.put(id, product);
            return product;
        }

        // 3. 查数据库
        product = productRepository.findById(id).orElse(null);
        if (product != null) {
            // 写入 Redis 和本地缓存
            stringRedisTemplate.opsForValue().set(
                "product:" + id, JSON.toJSONString(product),
                30 + ThreadLocalRandom.current().nextInt(10), TimeUnit.MINUTES);
            localCache.put(id, product);
        }
        return product;
    }
}
```

本地缓存命中率高（因为数据量有限且访问集中），即使 Redis 挂了，本地缓存还能顶一阵。这是应对缓存雪崩的最后防线。

**三个问题的本质**：缓存穿透是"查不存在的数据"，缓存击穿是"热点 key 过期"，缓存雪崩是"大面积 key 同时过期"。理解了本质，解决方案就很好记了：缓存空值（穿透）、加锁（击穿）、随机过期时间（雪崩）。
