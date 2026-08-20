import { defineConfig } from 'vitepress'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openInEditor } from 'vitepress-plugin-open-in-editor'

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsDir = resolve(__dirname, '..')
const SITE_BASE = '/spring-world/'

// 一次实例化，导出三块能力给 VitePress 的不同扩展点使用。
const editorIntegration = openInEditor({
  docsDir,
  base: SITE_BASE,
  buttonText: '编辑此行',
})

export default defineConfig({
  title: 'Spring World',
  description: 'Spring 生态完整知识体系',
  lang: 'zh-CN',
  base: SITE_BASE,
  lastUpdated: true,
  sitemap: {
    hostname: 'https://thestack.xpro.wang/spring-world/',
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/spring-world/favicon.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Spring World' }],
    ['meta', { property: 'og:description', content: 'Spring 生态完整知识体系 — 七卷' }],
    ['meta', { property: 'og:url', content: 'https://thestack.xpro.wang/spring-world/' }],
    ['meta', { property: 'og:image', content: 'https://thestack.xpro.wang/spring-world/logo.svg' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'theme-color', content: '#2563eb' }],
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }],
    // open-in-editor 的样式与客户端脚本已由 vite 插件通过 transformIndexHtml 自动注入。
  ],

  themeConfig: {
    siteTitle: 'Spring World',
    logo: '/spring-world/logo.svg',

    nav: [
      { text: '首页', link: '/' },
      {
        text: '目录',
        items: [
          { text: '第一卷 Spring 核心', link: '/01-spring-core/' },
          { text: '第二卷 Spring AOP', link: '/02-spring-aop/' },
          { text: '第三卷 Spring MVC', link: '/03-spring-mvc/' },
          { text: '第四卷 Spring Boot', link: '/04-spring-boot/' },
          { text: '第五卷 Spring Data', link: '/05-spring-data/' },
          { text: '第六卷 Spring Cloud', link: '/06-spring-cloud/' },
          { text: '第七卷 Spring 生态', link: '/07-spring-ecosystem/' },
        ]
      },
      { text: 'GitHub', link: 'https://github.com/b1tzer/spring-world' },
    ],

    sidebar: [
      {
        text: '第一卷 Spring 核心',
        collapsed: false,
        items: [
          { text: 'IoC 与依赖注入', link: '/01-spring-core/chapter-01-ioc-di' },
          { text: 'Bean 生命周期', link: '/01-spring-core/chapter-02-bean-lifecycle' },
          { text: '容器体系', link: '/01-spring-core/chapter-03-container' },
          { text: '资源与环境', link: '/01-spring-core/chapter-04-resource-env' },
        ]
      },
      {
        text: '第二卷 Spring AOP',
        collapsed: false,
        items: [
          { text: 'AOP 核心概念', link: '/02-spring-aop/chapter-01-aop-concepts' },
          { text: '动态代理实现', link: '/02-spring-aop/chapter-02-dynamic-proxy' },
          { text: '切面编程实战', link: '/02-spring-aop/chapter-03-aspectj-practice' },
          { text: '声明式事务', link: '/02-spring-aop/chapter-04-declarative-tx' },
        ]
      },
      {
        text: '第三卷 Spring MVC',
        collapsed: false,
        items: [
          { text: 'DispatcherServlet', link: '/03-spring-mvc/chapter-01-dispatcher' },
          { text: '请求处理流程', link: '/03-spring-mvc/chapter-02-request-handling' },
          { text: '参数解析与绑定', link: '/03-spring-mvc/chapter-03-parameter-binding' },
          { text: '异常处理与视图', link: '/03-spring-mvc/chapter-04-exception-view' },
          { text: 'RESTful 与内容协商', link: '/03-spring-mvc/chapter-05-restful' },
          { text: '拦截器与文件上传', link: '/03-spring-mvc/chapter-06-interceptor-upload' },
        ]
      },
      {
        text: '第四卷 Spring Boot',
        collapsed: false,
        items: [
          { text: '自动配置原理', link: '/04-spring-boot/chapter-01-autoconfig' },
          { text: 'Starter 机制', link: '/04-spring-boot/chapter-02-starter' },
          { text: '配置体系', link: '/04-spring-boot/chapter-03-configuration' },
          { text: '内嵌容器与 Actuator', link: '/04-spring-boot/chapter-04-embedded-actuator' },
          { text: '日志与多环境', link: '/04-spring-boot/chapter-05-logging-profiles' },
        ]
      },
      {
        text: '第五卷 Spring Data',
        collapsed: false,
        items: [
          { text: 'JdbcTemplate 与数据源', link: '/05-spring-data/chapter-01-jdbc-datasource' },
          { text: 'Spring Data JPA', link: '/05-spring-data/chapter-02-data-jpa' },
          { text: 'MyBatis 整合', link: '/05-spring-data/chapter-03-mybatis-integration' },
          { text: 'Redis 与缓存抽象', link: '/05-spring-data/chapter-04-redis-cache' },
          { text: 'MongoDB 与 NoSQL', link: '/05-spring-data/chapter-05-mongodb-nosql' },
        ]
      },
      {
        text: '第六卷 Spring Cloud',
        collapsed: false,
        items: [
          { text: '微服务概览', link: '/06-spring-cloud/chapter-01-overview' },
          { text: '服务注册与发现', link: '/06-spring-cloud/chapter-02-discovery' },
          { text: '配置中心', link: '/06-spring-cloud/chapter-03-config-center' },
          { text: 'API 网关', link: '/06-spring-cloud/chapter-04-gateway' },
          { text: '服务调用与负载均衡', link: '/06-spring-cloud/chapter-05-feign-lb' },
          { text: '熔断与限流', link: '/06-spring-cloud/chapter-06-circuit-breaker' },
        ]
      },
      {
        text: '第七卷 Spring 生态',
        collapsed: false,
        items: [
          { text: 'Spring Security', link: '/07-spring-ecosystem/chapter-01-security' },
          { text: 'Spring Batch', link: '/07-spring-ecosystem/chapter-02-batch' },
          { text: 'Spring Integration', link: '/07-spring-ecosystem/chapter-03-integration' },
          { text: 'Spring Native 与 GraalVM', link: '/07-spring-ecosystem/chapter-04-native' },
          { text: 'Testing 与测试体系', link: '/07-spring-ecosystem/chapter-05-testing' },
        ]
      },
    ],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },

    editLink: {
      pattern: editorIntegration.editLinkPattern,
      text: '在编辑器中打开源文件',
    },

    footer: {
      message: '基于 MIT 发布',
      copyright: '© 2026 Spring World'
    },

    outline: { level: [2, 3], label: '本章目录' },
    docFooter: { prev: '上一章', next: '下一章' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/b1tzer/spring-world' }
    ],
  },

  markdown: {
    lineNumbers: true,
    config(md) {
      editorIntegration.markdown(md)
    },
  },

  vite: {
    plugins: [editorIntegration.vite()],
  },
})
