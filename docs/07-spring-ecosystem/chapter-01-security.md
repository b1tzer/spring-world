# Spring Security

## 认证与授权：两个不同的问题

很多人把"登录"和"权限"混为一谈，其实这是两件事。

**认证（Authentication）** 回答的是"你是谁"。你掏出工牌，前台确认你是这家公司的人，放你进去。这就是认证。

**授权（Authorization）** 回答的是"你能干什么"。你进了公司，但你只能进普通办公区，财务室你进不去。这就是授权。

Spring Security 的核心模型就建立在这两个概念上：

```java
// 认证：构建 Authentication 对象
UsernamePasswordAuthenticationToken auth =
    new UsernamePasswordAuthenticationToken("zhangsan", "123456");

// 授权：认证成功后，会带上权限信息
// auth.getAuthorities() → [ROLE_ADMIN, READ_PRIVILEGE]
```

`Authentication` 接口有三个关键属性：
- `principal`：是谁（通常是用户名或 UserDetails 对象）
- `credentials`：凭据（通常是密码）
- `authorities`：权限集合（角色或具体权限）

整个认证流程可以用一张图说清楚：

![Spring Security 认证流程](/diagrams/07-01-auth-flow.svg)

这里有个容易踩的坑：**认证通过不代表能访问资源**。认证只证明"你是合法用户"，授权才决定"你有没有权限访问这个接口"。很多新手写的代码认证成功了却返回 403，就是因为没配置授权规则。

## FilterChain：Security 的骨架

Spring Security 本质上就是一堆 Filter 组成的链。每个请求进来，先过一遍这条链，链上的每个 Filter 负责一件事。

![Security FilterChain](/diagrams/07-01-filter-chain.svg)

核心的几个 Filter：

| Filter | 职责 |
|--------|------|
| `SecurityContextPersistenceFilter` | 从 SecurityContextRepository 读取/保存 SecurityContext |
| `UsernamePasswordAuthenticationFilter` | 处理表单登录 |
| `BasicAuthenticationFilter` | 处理 HTTP Basic 认证 |
| `ExceptionTranslationFilter` | 捕获认证/授权异常，返回 401/403 |
| `FilterSecurityInterceptor` | 最终的访问决策（授权判断） |

在 Spring Boot 中配置 Security，以前要继承 `WebSecurityConfigurerAdapter`，Spring Security 5.7+ 换成了组件式配置：

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .formLogin(form -> form
                .loginPage("/login")
                .defaultSuccessUrl("/dashboard")
            )
            .logout(logout -> logout
                .logoutSuccessUrl("/login?logout")
            )
            .csrf(csrf -> csrf.disable()); // API 场景通常关掉 CSRF

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

这段配置做了什么？拆开看：

1. `/api/public/**` 下的接口任何人都能访问
2. `/api/admin/**` 只有 `ROLE_ADMIN` 角色能访问
3. 其他接口都要登录
4. 自定义了登录页和登出后的跳转
5. 关闭了 CSRF（前后端分离的 API 项目一般关掉，表单项目建议开着）

**配置的顺序很重要**。`.authorizeHttpRequests()` 中的规则是按顺序匹配的，匹配到第一条就停。如果你把 `anyRequest().authenticated()` 放在第一条，后面的规则永远不会生效。

## OAuth2 / JWT：现代认证方案

传统的 Session 认证有个问题：服务器要存会话状态。用户多了，Session 存储就是瓶颈。前后端分离的项目更麻烦——前端可能跑在不同域名下，Cookie 跨域有各种限制。

JWT（JSON Web Token）的思路是：**把用户信息加密签名后放在 Token 里，服务器不存状态**。

```
JWT 的结构：Header.Payload.Signature

Header:  {"alg":"HS256","typ":"JWT"}
Payload: {"sub":"zhangsan","roles":["ADMIN"],"exp":1703366400}
Signature: HMACSHA256(base64(header) + "." + base64(payload), secret)
```

用 Spring Security 集成 JWT 的典型流程：

```java
// 1. 登录成功后，生成 JWT
@Component
public class JwtTokenProvider {
    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration:3600000}")
    private long expiration; // 默认 1 小时

    public String createToken(String username, List<String> roles) {
        Claims claims = Jwts.claims().setSubject(username);
        claims.put("roles", roles);

        return Jwts.builder()
            .setClaims(claims)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + expiration))
            .signWith(SignatureAlgorithm.HS256, secret)
            .compact();
    }

    public String getUsernameFromToken(String token) {
        return Jwts.parser()
            .setSigningKey(secret)
            .parseClaimsJws(token)
            .getBody()
            .getSubject();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser().setSigningKey(secret).parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
```

```java
// 2. 写一个 Filter，每次请求都校验 Token
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {

        String header = request.getHeader("Authorization");

        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);

            if (tokenProvider.validateToken(token)) {
                String username = tokenProvider.getUsernameFromToken(token);
                // 从 token 中解析出角色，构建 Authentication
                UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(username, null, getAuthorities(token));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }

        chain.doFilter(request, response);
    }
}
```

```java
// 3. 注册到 FilterChain
http.addFilterBefore(jwtAuthenticationFilter,
    UsernamePasswordAuthenticationFilter.class);
```

**JWT 不是银弹**。它解决了无状态的问题，但引入了新问题：
- Token 一旦签发，无法主动吊销（除非上黑名单，那又变有状态了）
- Token 过期时间设太长不安全，设太短用户体验差
- Payload 是 Base64 编码的，不是加密的——别往里面放敏感信息

**我的建议**：内部系统用 Session 就好，没必要硬上 JWT。只有在需要跨服务、跨域认证的场景，JWT 才有明确优势。如果你选了 JWT，配合 Redis 做 Token 黑名单是常见做法。

对于完整的 OAuth2 授权服务器，Spring 推荐用 [Spring Authorization Server](https://spring.io/projects/spring-authorization-server)，它替代了之前 Spring Security OAuth 中被废弃的部分。

## 方法级安全：比 URL 配置更精细

有时候你想控制的不是某个 URL 能不能访问，而是某个 Service 方法的调用权限。比如"只有管理员能删除用户"，但删除用户的接口 URL 和查看用户信息是同一个 Controller。

Spring Security 提供了方法级安全注解：

```java
@Service
public class UserService {

    // 只有 ADMIN 角色才能调用这个方法
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteUser(Long userId) {
        userRepository.deleteById(userId);
    }

    // 只有本人或管理员才能查看用户详情
    @PreAuthorize("#userId == authentication.principal.id or hasRole('ADMIN')")
    public UserVO getUserDetail(Long userId) {
        return userRepository.findById(userId)
            .map(UserVO::from)
            .orElseThrow(() -> new NotFoundException("用户不存在"));
    }

    // 方法执行后检查返回值——只能看到自己部门的数据
    @PostAuthorize("returnObject.department == authentication.principal.department")
    public Report getReport(Long reportId) {
        return reportRepository.findById(reportId).orElseThrow();
    }
}
```

启用方法级安全需要加一个注解：

```java
@Configuration
@EnableMethodSecurity  // Spring Security 6+ 用这个
// @EnableGlobalMethodSecurity(prePostEnabled = true)  // 老版本用这个
public class MethodSecurityConfig {
}
```

三个核心注解的对比：

| 注解 | 时机 | 典型用途 |
|------|------|----------|
| `@PreAuthorize` | 方法执行前 | 最常用，SpEL 表达式做权限判断 |
| `@PostAuthorize` | 方法执行后 | 根据返回值决定是否放行 |
| `@Secured` | 方法执行前 | 简单角色检查，不支持 SpEL |

`@PreAuthorize` 的 SpEL 表达式很强大，可以引用方法参数、Spring Bean、认证信息：

```java
// 调用自定义的权限检查 Bean
@PreAuthorize("@permissionChecker.canAccess(#projectId, authentication)")
public Project getProject(Long projectId) {
    return projectRepository.findById(projectId).orElseThrow();
}
```

**什么时候用 URL 级配置，什么时候用方法级注解？**

我的经验是：**粗粒度的用 URL 配置，细粒度的用方法注解**。URL 配置管的是"这条路要不要门卫"，方法注解管的是"进了门之后，每个房间的钥匙"。两者不冲突，配合使用最灵活。

方法级安全的局限是它基于 AOP 代理实现，**同类内部调用不会触发权限检查**。如果你在 `UserService` 内部直接调 `this.deleteUser()`，`@PreAuthorize` 不会生效。这是 Spring AOP 的通病，不是 Security 的问题。解决办法是把需要权限控制的方法放到不同的 Bean 里，或者注入自身代理：

```java
@Service
public class UserService {
    @Autowired
    @Lazy
    private UserService self; // 注入代理对象

    public void someMethod() {
        // 这样调用才能触发 AOP 拦截
        self.deleteUser(1L);
    }
}
```

Spring Security 的学习曲线确实陡，但核心就两点：**认证解决身份问题，授权解决权限问题**。FilterChain 是骨架，各种注解和配置是血肉。理解了这个，剩下的就是查文档拼积木。
