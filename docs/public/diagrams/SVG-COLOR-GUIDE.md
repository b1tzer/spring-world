# SVG 图表配色规范

本项目所有 SVG 图表统一使用 CSS 变量配色，一次定义全局生效，亮暗模式自动切换。

## 使用方式

Markdown 中用 Vue 组件引用（不是 `![]()`）：

```md
<SvgDiagram src="/diagrams/xxx.svg" />
```

SVG 内部所有颜色引用 `var(--diagram-*)` 变量，不硬编码色值。

## 变量速查表

### 基础层

| 变量 | 用途 | 亮色 | 暗色 |
| :-- | :-- | :-- | :-- |
| `--diagram-surface-1` | 图表主背景 | `#ffffff` | `#1a1a1a` |
| `--diagram-surface-2` | 次要背景/卡片 | `#f8f9fa` | `#222222` |
| `--diagram-surface-3` | 三层背景/已读区域 | `#ECEFF1` | `#2a2a2a` |
| `--diagram-stroke-1` | 主边框 | `#BDBDBD` | `#444444` |
| `--diagram-stroke-2` | 次要边框 | `#E0E0E0` | `#333333` |
| `--diagram-text-1` | 主文字/标题 | `#333333` | `#e0e0e0` |
| `--diagram-text-2` | 次要文字/说明 | `#666666` | `#b0b0b0` |
| `--diagram-text-3` | 注释/辅助信息 | `#888888` | `#808080` |
| `--diagram-arrow` | 箭头/连线 | `#555555` | `#b0b0b0` |
| `--diagram-ghost` | 已读/不可用/占位 | `#999999` | `#666666` |

### 强调色 — 蓝（主流程/Channel/网络层/主通道）

| 变量 | 用途 | 亮色 | 暗色 |
| :-- | :-- | :-- | :-- |
| `--diagram-accent-1` | 边框/图标描边 | `#1565C0` | `#5C9CE6` |
| `--diagram-accent-bg-1` | 背景填充 | `#E3F2FD` | `#0d2137` |
| `--diagram-accent-bg-1b` | 浅色背景（选中态） | `#BBDEFB` | `#1a3a5c` |
| `--diagram-accent-text-1` | 文字 | `#0D47A1` | `#90CAF9` |

### 强调色 — 绿（数据/Buffer/成功/输出）

| 变量 | 用途 | 亮色 | 暗色 |
| :-- | :-- | :-- | :-- |
| `--diagram-accent-2` | 边框/图标描边 | `#2E7D32` | `#66BB6A` |
| `--diagram-accent-bg-2` | 背景填充 | `#E8F5E9` | `#0d2818` |
| `--diagram-accent-bg-2b` | 浅色背景 | `#C8E6C9` | `#1b4332` |
| `--diagram-accent-text-2` | 文字 | `#1B5E20` | `#A5D6A7` |

### 强调色 — 紫（Selector/Reactor/高级特性/调度）

| 变量 | 用途 | 亮色 | 暗色 |
| :-- | :-- | :-- | :-- |
| `--diagram-accent-3` | 边框/图标描边 | `#7B1FA2` | `#CE93D8` |
| `--diagram-accent-bg-3` | 背景填充 | `#F3E5F5` | `#2d1b3d` |
| `--diagram-accent-bg-3b` | 浅色背景 | `#E1BEE7` | `#3d2550` |
| `--diagram-accent-text-3` | 文字 | `#4A148C` | `#E1BEE7` |

### 强调色 — 橙（警告/position 标记/重要节点）

| 变量 | 用途 | 亮色 | 暗色 |
| :-- | :-- | :-- | :-- |
| `--diagram-accent-4` | 边框/描边 | `#E65100` | `#FFB74D` |
| `--diagram-accent-bg-4` | 背景填充 | `#FFF3E0` | `#3d2d15` |
| `--diagram-accent-text-4` | 文字 | `#BF360C` | `#FFCC80` |

### 强调色 — 红（错误/limit/阻塞/危险操作）

| 变量 | 用途 | 亮色 | 暗色 |
| :-- | :-- | :-- | :-- |
| `--diagram-accent-5` | 边框/描边 | `#C62828` | `#EF9A9A` |
| `--diagram-accent-bg-5` | 背景填充 | `#FFCDD2` | `#3d1520` |
| `--diagram-accent-text-5` | 文字 | `#B71C1C` | `#FFCDD2` |

## 语义对照

画 SVG 时按**用途**选变量，不按**颜色**选：

| 你要表达的含义 | 用哪个变量 |
| :-- | :-- |
| 这是背景/底色 | `--diagram-surface-1/2/3` |
| 这是边框线 | `--diagram-stroke-1/2` |
| 这是正文/标题 | `--diagram-text-1/2/3` |
| 这是箭头/连线 | `--diagram-arrow` |
| 这是"不可用/已读/占位" | `--diagram-ghost` |
| 这是**主流程/核心组件/网络层** | `--diagram-accent-1` (蓝) |
| 这是**数据/缓存/输出/成功** | `--diagram-accent-2` (绿) |
| 这是**调度/事件驱动/高级机制** | `--diagram-accent-3` (紫) |
| 这是**警告/重点标记/注意** | `--diagram-accent-4` (橙) |
| 这是**错误/阻塞/危险/溢出** | `--diagram-accent-5` (红) |

## SVG 模板

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"
     font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="13">

  <!-- 背景 -->
  <rect width="600" height="400" fill="var(--diagram-surface-1)"/>

  <!-- 标题 -->
  <text x="300" y="30" text-anchor="middle" font-size="16" font-weight="bold"
        fill="var(--diagram-text-1)">标题</text>

  <!-- 卡片 -->
  <rect x="40" y="60" width="200" height="80" rx="8"
        fill="var(--diagram-accent-bg-1)" stroke="var(--diagram-accent-1)" stroke-width="1.5"/>
  <text x="140" y="100" text-anchor="middle" font-weight="bold"
        fill="var(--diagram-accent-text-1)">蓝色卡片</text>

  <!-- 箭头 -->
  <line x1="240" y1="100" x2="290" y2="100"
        stroke="var(--diagram-arrow)" stroke-width="1.5"/>

  <!-- 注释 -->
  <text x="300" y="380" text-anchor="middle"
        fill="var(--diagram-text-3)">底部注释文字</text>
</svg>
```
