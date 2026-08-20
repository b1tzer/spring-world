# 待修复 SVG 清单

在 draw.io 中打开以下 SVG，修复布局问题后导出，再运行 `python3 fix_svg_colors.py` 替换色值。

## 文字重叠（7 张）

| 文件 | 问题 |
| :-- | :-- |
| `buffer-ops.svg` | Buffer 单元格文字重叠 |
| `concurrency-layered-arch.svg` | 分层标签重叠 |
| `ha-degradation.svg` | 流程节点文字重叠 |
| `hexagonal-arch.svg` | 端口标签重叠 |
| `seckill-arch.svg` | 多处标签重叠 |
| `tcc-flow.svg` | 步骤标签重叠 |
| `sync-monitor-flow.svg` | Monitor 内部文字重叠 |

## 方框过大（10 张）

| 文件 | 问题 |
| :-- | :-- |
| `db-performance-overview.svg` | 某些框高度 309px（平均 75） |
| `ddd战略设计.svg` | 某些框 425×153（平均 60） |
| `http-message-format.svg` | 两个大框 255/298×204 |
| `http-quic-stack.svg` | 大框 306×119 |
| `http2-multiplex.svg` | 大框 289×136 |
| `jdbc-architecture.svg` | 大框 306×374 |
| `jmm-memory-model.svg` | 大框 502×348 |
| `jvm-object-creation.svg` | 大框 323×170 |
| `microservice-request-flow.svg` | 大框 578×442 |
| `vt-decision-tree.svg` | 大框 527×170 |

## 两者兼有（3 张）

| 文件 | 问题 |
| :-- | :-- |
| `hexagonal-arch.svg` | 文字重叠 + 方框过大 |
| `mybatis-cache-flow.svg` | 两个大框 196×238/170 |
| `mybatis-interceptor-chain.svg` | 大框 272×280 |
| `netty-eventloop.svg` | 大框 340×136 |

## 工作流

1. 打开 https://app.diagrams.net
2. 拖入 SVG 文件
3. 图形化编辑（拖拽对齐、调整大小）
4. File → Export as SVG → 下载
5. 覆盖原文件
6. 运行色值替换：`python3 fix_svg_colors.py docs/public/diagrams/xxx.svg`
7. 提交
