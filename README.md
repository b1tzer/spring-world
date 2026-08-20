# Spring World

Spring 生态完整知识体系。七卷，从核心原理到微服务架构，构建 Spring 开发者的完整能力栈。

**📖 在线阅读：[https://thestack.xpro.wang/spring-world/](https://thestack.xpro.wang/spring-world/)**

## 内容结构

全书按能力递进编排，每一卷回答一个核心问题：

```
第七卷 Spring 生态     → 安全、批处理、集成、原生化？
第六卷 Spring Cloud   → 微服务如何治理？
第五卷 Spring Data    → 数据如何访问？
第四卷 Spring Boot    → 如何快速启动？
第三卷 Spring MVC     → Web 请求如何处理？
第二卷 Spring AOP     → 横切关注点如何解耦？
第一卷 Spring 核心    → IoC 容器如何工作？
```

| 卷 | 主题 | 章数 |
|----|------|------|
| 第一卷 | Spring 核心 — IoC、DI、Bean 生命周期、容器 | 4 |
| 第二卷 | Spring AOP — 动态代理、切面编程、声明式事务 | 4 |
| 第三卷 | Spring MVC — DispatcherServlet、请求处理、RESTful | 6 |
| 第四卷 | Spring Boot — 自动配置、Starter、Actuator | 5 |
| 第五卷 | Spring Data — JPA、MyBatis、Redis、MongoDB | 5 |
| 第六卷 | Spring Cloud — 注册发现、配置中心、网关、熔断 | 6 |
| 第七卷 | Spring 生态 — Security、Batch、Native、Testing | 5 |

## 技术栈

- [VitePress](https://vitepress.dev/) 1.6 — 静态站点生成器
- GitHub Actions + GitHub Pages — 自动部署

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建静态站点
npm run build

# 预览构建产物
npm run preview
```

## 项目结构

```
docs/                        # VitePress 源目录
├── .vitepress/config.mts    # 站点配置
├── 01-spring-core/          # 第一卷（index.md + 4 章）
├── 02-spring-aop/           # 第二卷（index.md + 4 章）
├── 03-spring-mvc/           # 第三卷（index.md + 6 章）
├── 04-spring-boot/          # 第四卷（index.md + 5 章）
├── 05-spring-data/          # 第五卷（index.md + 5 章）
├── 06-spring-cloud/         # 第六卷（index.md + 6 章）
├── 07-spring-ecosystem/     # 第七卷（index.md + 5 章）
├── index.md                 # 首页
└── public/                  # 静态资源
```
