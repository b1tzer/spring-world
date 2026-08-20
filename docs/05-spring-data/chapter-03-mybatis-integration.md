# MyBatis 整合

Java 社区有个永恒的争论：JPA 好还是 MyBatis 好？

每次技术选型会上，总有人拍桌子说"JPA 太重了，SQL 不可控"，另一边回怼"MyBatis 就是写 SQL，跟直接用 JDBC 有什么区别"。争来争去，最后往往变成信仰之争。

我的观点：**这不是对错问题，是场景问题。** 先搞清楚它们各自擅长什么，再做选择。但在此之前，得先理解 Spring 是怎么把 MyBatis 管起来的。

## Spring 怎么接管 MyBatis

回到原生 MyBatis 的使用方式，理解 Spring 整合到底帮你做了什么：

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

六步操作，每一步都得手动管理。`SqlSessionFactory` 是全局单例，但 `SqlSession` 不是——每次数据库操作都需要获取一个新的 `SqlSession`，用完关闭。忘了关闭就连接泄漏。

Spring 整合 MyBatis 后，这些全部自动化了。加依赖：

```xml
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>3.0.3</version>
</dependency>
```

配置：

```yaml
mybatis:
  mapper-locations: classpath:mapper/*.xml
  type-aliases-package: com.example.entity
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl
```

启动类加 `@MapperScan`：

```java
@SpringBootApplication
@MapperScan("com.example.mapper")
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

`@MapperScan` 做了什么？它告诉 Spring：扫描 `com.example.mapper` 包下的所有接口，为每个接口创建一个代理对象注册到容器中。这个代理对象是 `MapperProxy` 的实例，调用任何方法时：

1. 从 `SqlSessionFactory` 获取一个 `SqlSession`（Spring 管理的，不用你关）
2. 根据方法名找到对应的 SQL 语句（注解或 XML 中定义的）
3. 执行 SQL 并映射结果
4. 自动关闭 SqlSession

整个过程对使用者来说是透明的——你只需要注入 Mapper 接口，调方法就行。

```java
@Mapper
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

![Spring 整合 MyBatis 架构](/diagrams/05-03-mybatis-spring.svg)

## SqlSession 的管理：Spring 帮你做了什么

这是 Spring 整合 MyBatis 最核心的改变，值得单独拿出来讲。

原生 MyBatis 中，`SqlSession` 的生命周期是你自己管理的：

```java
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

**第一，线程安全。** 原生 `SqlSession` 不是线程安全的，不能在多线程间共享。`SqlSessionTemplate` 内部使用了代理模式，每次调用方法时获取一个新的 `SqlSession`，用完自动关闭。你注入的 Mapper 代理对象可以在 Spring 单例 Bean 中安全使用。

**第二，和 Spring 事务集成。** 如果当前线程有一个活跃的 Spring 事务（`@Transactional`），`SqlSessionTemplate` 会复用这个事务绑定的 `SqlSession`，而不是创建新的。这样同一个事务内的所有数据库操作使用同一个连接，能正确回滚。

```java
@Service
public class UserService {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private OrderMapper orderMapper;

    @Transactional
    public void createUserWithOrder(User user, Order order) {
        // 这两个操作在同一个事务中，使用同一个连接
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

## 动态 SQL：MyBatis 最强大的武器

简单查询用注解就行，但复杂查询建议用 XML。MyBatis 的动态 SQL 是它最强大的特性——没有之一。

```xml
<!-- mapper/UserMapper.xml -->
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

`selectByCondition` 做的事和 JPA 的 Specification 一样——根据条件动态拼接 SQL。但写法更直观：SQL 就是 SQL，不需要学 Criteria API。`<where>` 标签自动处理多余的 AND/OR，`<if>` 标签根据条件决定是否拼接片段。

批量插入用 `<foreach>`，一条 SQL 插入多条记录，比循环调用单条 INSERT 高效得多。这是 MyBatis 的经典用法，在需要批量导入数据时非常实用。

**我的经验**：复杂查询用 XML，简单查询用注解。不要在一个项目里混着来——要么全用 XML，要么简单用注解 + 复杂用 XML。风格统一比什么都重要。

## JPA 和 MyBatis 到底选哪个

这是你必须面对的选择。我的判断标准很简单：

**选 JPA 的场景：**
- 项目以 CRUD 为主，增删改查占 80% 以上
- 团队对 SQL 不太熟悉，希望用面向对象的方式操作数据
- 需要快速开发，减少样板代码
- 数据库设计规范，表结构和实体类基本一一对应

**选 MyBatis 的场景：**
- 查询逻辑复杂，多表关联、子查询、窗口函数
- 需要精细控制 SQL，做性能调优
- 存储过程调用
- 国内项目（生态原因，MyBatis 在国内使用率远高于 JPA）

| 维度 | Spring Data JPA | MyBatis |
|------|----------------|---------|
| 抽象层次 | 高（面向对象，操作实体） | 中低（面向 SQL） |
| SQL 控制 | 自动生成，复杂时可写 JPQL | 手动编写，完全控制 |
| 学习曲线 | 低（简单 CRUD 零 SQL）| 中（要会 SQL + 动态语法）|
| 复杂查询 | Specification 较繁琐 | XML 动态 SQL 很直观 |
| 性能调优 | 不透明，N+1 问题常见 | 透明，SQL 就是你写的 |

**一个务实的建议：** 如果你是新项目，团队没有特别偏好，先用 JPA。它的自动 CRUD 和方法名查询能省很多时间。遇到复杂查询搞不定的，再引入 MyBatis——两者可以在同一个项目中共存。

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
