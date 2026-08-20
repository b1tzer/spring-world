# MyBatis 整合

## 第三章 MyBatis 整合

### 3.1 @MapperScan 与 SqlSessionFactory：Spring 怎么管理 MyBatis？

先回到原生 MyBatis 的使用方式，理解 Spring 整合 MyBatis 到底帮你做了什么。

原生 MyBatis 的启动过程：

```java
// 1. 读取配置文件
String resource = "mybatis-config.xml";
InputStream inputStream = Resources.getResourceAsStream(resource);

// 2. 构建 SqlSessionFactory
SqlSessionFactory sqlSessionFactory = 
    new SqlSessionFactoryBuilder().build(inputStream);

// 3. 获取 SqlSession
SqlSession session = sqlSessionFactory.openSession();

// 4. 获取 Mapper 接口的代理对象
UserMapper mapper = session.getMapper(UserMapper.class);

// 5. 执行查询
User user = mapper.selectById(1L);

// 6. 关闭 session
session.close();
```

六步操作，每一步都得手动管理。`SqlSessionFactory` 是全局单例，但 `SqlSession` 不是——每次数据库操作都需要获取一个新的 `SqlSession`，用完关闭。忘了关闭就会连接泄漏。

Spring 整合 MyBatis 后，这些全部自动化了：

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>3.0.3</version>
</dependency>
```

```yaml
# application.yml
mybatis:
  mapper-locations: classpath:mapper/*.xml    # XML 映射文件位置
  type-aliases-package: com.example.entity    # 实体类包名
  configuration:
    map-underscore-to-camel-case: true        # 下划线转驼峰
    log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl  # 日志实现
```

```java
@SpringBootApplication
@MapperScan("com.example.mapper")  // 扫描 Mapper 接口
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

`@MapperScan` 做了什么？它告诉 Spring：扫描 `com.example.mapper` 包下的所有接口，为每个接口创建一个代理对象注册到 Spring 容器中。这个代理对象是 `MapperProxy` 的实例，调用任何方法时，它会：

1. 从 `SqlSessionFactory` 获取一个 `SqlSession`（Spring 管理的，不用你关）
2. 根据方法名找到对应的 SQL 语句（注解或 XML 中定义的）
3. 执行 SQL 并映射结果
4. 自动关闭 SqlSession

整个过程对使用者来说是透明的——你只需要注入 Mapper 接口，调方法就行。

```java
@Mapper  // 或者通过 @MapperScan 统一扫描
public interface UserMapper {

    @Select("SELECT * FROM users WHERE id = #{id}")
    User selectById(Long id);

    @Insert("INSERT INTO users (name, email) VALUES (#{name}, #{email})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User user);

    @Update("UPDATE users SET name = #{name}, email = #{email} WHERE id = #{id}")
    int update(User user);

    @Delete("DELETE FROM users WHERE id = #{id}")
    int deleteById(Long id);
}
```

`@MapperScan` 和 `@Mapper` 的区别：`@Mapper` 标注单个接口，`@MapperScan` 批量扫描整个包。实际项目中用 `@MapperScan` 更方便——新写一个 Mapper 接口不需要额外加注解。

```mermaid
graph TB
    subgraph "Spring 容器"
        SSF[SqlSessionFactory]
        SM[SqlSessionTemplate]
        MP1[UserMapper 代理]
        MP2[OrderMapper 代理]
    end
    
    subgraph "配置"
        MS[@MapperScan]
        DS[DataSource]
    end
    
    MS -->|扫描接口| MP1
    MS -->|扫描接口| MP2
    DS --> SSF
    SSF --> SM
    SM --> MP1
    SM --> MP2
    
    MP1 -->|执行| SM
    MP2 -->|执行| SM
    SM -->|委托| SSF
```

### 3.2 Spring 管理 SqlSession：和原生 MyBatis 的区别

这是 Spring 整合 MyBatis 最核心的改变，值得单独拿出来讲。

原生 MyBatis 中，`SqlSession` 的生命周期是你自己管理的：

```java
// 原生方式 —— 你必须手动管理
SqlSession session = sqlSessionFactory.openSession();
try {
    UserMapper mapper = session.getMapper(UserMapper.class);
    User user = mapper.selectById(1L);
    session.commit();  // 写操作需要手动提交
} catch (Exception e) {
    session.rollback();  // 出错手动回滚
} finally {
    session.close();  // 必须关闭，否则连接泄漏
}
```

Spring 整合后，`SqlSession` 被包装成了 `SqlSessionTemplate`，它做了两件关键的事：

**第一，线程安全。** 原生 `SqlSession` 不是线程的，不能在多线程间共享。`SqlSessionTemplate` 内部使用了代理模式，每次调用方法时从 `SqlSessionManager` 获取一个新的 `SqlSession`，用完自动关闭。你注入的 Mapper 代理对象可以在 Spring 单例 Bean 中安全使用。

**第二，和 Spring 事务集成。** 如果当前线程有一个活跃的 Spring 事务（`@Transactional`），`SqlSessionTemplate` 会复用这个事务绑定的 `SqlSession`，而不是创建新的。这样同一个事务内的所有数据库操作使用同一个连接，能正确回滚。

```java
@Service
public class UserService {

    @Autowired
    private UserMapper userMapper;
    
    @Autowired
    private OrderMapper orderMapper;

    @Transactional  // Spring 管理事务
    public void createUserWithOrder(User user, Order order) {
        // 这两个操作在同一个事务中
        // 使用同一个 SqlSession（同一个数据库连接）
        userMapper.insert(user);
        order.setUserId(user.getId());
        orderMapper.insert(order);
        
        if (order.getAmount() < 0) {
            throw new RuntimeException("金额不能为负");
            // 事务回滚，user 和 order 都不会插入
        }
    }
}
```

没有 `@Transactional` 时，每个 Mapper 方法调用就是一个独立的事务（auto-commit）。加了 `@Transactional` 后，整个方法在同一个事务中。

**和 XML 映射文件的配合：**

简单的 SQL 可以用注解（`@Select`、`@Insert` 等），但复杂查询建议用 XML：

```xml
<!-- mapper/UserMapper.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" 
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<mapper namespace="com.example.mapper.UserMapper">

    <resultMap id="userResultMap" type="User">
        <id property="id" column="id"/>
        <result property="userName" column="user_name"/>
        <result property="email" column="email"/>
        <result property="createTime" column="create_time"/>
    </resultMap>

    <select id="selectByCondition" resultMap="userResultMap">
        SELECT * FROM users
        <where>
            <if test="name != null and name != ''">
                AND user_name LIKE CONCAT('%', #{name}, '%')
            </if>
            <if test="status != null">
                AND status = #{status}
            </if>
            <if test="minAge != null">
                AND age >= #{minAge}
            </if>
            <if test="maxAge != null">
                AND age &lt;= #{maxAge}
            </if>
        </where>
        ORDER BY id DESC
    </select>

    <insert id="batchInsert" parameterType="list">
        INSERT INTO users (user_name, email, status)
        VALUES
        <foreach collection="list" item="item" separator=",">
            (#{item.userName}, #{item.email}, #{item.status})
        </foreach>
    </insert>

</mapper>
```

对应的 Mapper 接口：

```java
public interface UserMapper {
    
    List<User> selectByCondition(@Param("name") String name,
                                  @Param("status") String status,
                                  @Param("minAge") Integer minAge,
                                  @Param("maxAge") Integer maxAge);
    
    int batchInsert(@Param("list") List<User> users);
}
```

MyBatis 的动态 SQL（`<if>`、`<where>`、`<foreach>`、`<choose>` 等）是它最强大的特性之一。上面的 `selectByCondition` 方法，和 JPA 的 Specification 做的事一样——根据条件动态拼接 SQL。但写法更直观，SQL 就是 SQL，不需要学习 Criteria API。

### 3.3 JPA 和 MyBatis 到底选哪个？

这是 Java 社区永恒的争论。我的观点：**没有绝对的优劣，只有适不适合你的场景。**

先看对比：

| 维度 | Spring Data JPA | MyBatis |
|------|----------------|---------|
| 抽象层次 | 高（面向对象，操作实体） | 中低（面向 SQL） |
| SQL 控制 | 自动生成，复杂时可写 JPQL | 手动编写，完全控制 |
| 学习曲线 | 低（简单 CRUD 零 SQL）| 中（要会 SQL + 动态语法）|
| 复杂查询 | Specification 较繁琐 | XML 动态 SQL 很直观 |
| 性能调优 | 不透明，N+1 问题常见 | 透明，SQL 就是你写的 |
| 数据库迁移 | ORM 映射可能需要调整 | SQL 可能需要重写 |
| 适合场景 | CRUD 为主、业务模型清晰 | 查询复杂、需要精细 SQL |

**选 JPA 的场景：**

- 项目以 CRUD 为主，增删改查占 80% 以上
- 团队对 SQL 不太熟悉，希望用面向对象的方式操作数据
- 需要快速开发，减少样板代码
- 数据库设计规范，表结构和实体类基本一一对应

**选 MyBatis 的场景：**

- 查询逻辑复杂，多表关联、子查询、窗口函数
- 需要精细控制 SQL，做性能调优
- 存储过程调用
- 对数据库有深入了解的团队
- 国内项目（生态原因，MyBatis 在国内使用率远高于 JPA）

**一个务实的建议：** 如果你是新项目，团队没有特别偏好，先用 JPA。它的自动 CRUD 和方法名查询能省很多时间。遇到复杂查询搞不定的，再引入 MyBatis——两者可以在同一个项目中共存。Spring 不限制你只能用一种。

实际项目中的混用方式：

```java
// 简单 CRUD 用 JPA
public interface UserRepository extends JpaRepository<User, Long> {
    List<User> findByStatus(UserStatus status);
}

// 复杂查询用 MyBatis
public interface UserReportMapper {
    
    @Select("SELECT u.name, COUNT(o.id) as order_count, SUM(o.amount) as total_amount " +
            "FROM users u LEFT JOIN orders o ON u.id = o.user_id " +
            "WHERE u.create_time >= #{startDate} " +
            "GROUP BY u.id " +
            "HAVING COUNT(o.id) >= #{minOrders} " +
            "ORDER BY total_amount DESC")
    List<UserReport> getUserReports(@Param("startDate") LocalDate startDate,
                                     @Param("minOrders") int minOrders);
}
```

这不矛盾。JPA 处理实体的增删改查，MyBatis 处理复杂报表查询。各取所长。

**不要陷入"框架之争"。** 选什么不重要，重要的是理解原理。JPA 的 Repository 代理、MyBatis 的 MapperProxy，底层都是动态代理。理解了代理模式和 SQL 执行原理，框架只是工具。
