# cyc-012 · 对话地层学 · 关系考古发掘系统

纯前端关系考古挖掘可视化系统。用户导入微信/QQ/短信聊天记录文件，系统以考古挖掘的隐喻将时间序列深度切片为五层地质构造，分层展示关系温度变化、话题演变、情感词汇沉积，并可出土对话化石及生成完整《关系考古报告》。

## 架构说明（分层架构：核心层 / 端口层 / 适配器层）

- `src/core`：领域模型（`ChatMessage`、`StrataLayer`、`ArchaeologyReport`、`FossilArtifact`）与地层沉积分析引擎，纯算法与领域规则，无外部依赖。
- `src/ports`：端口层定义契约（`ChatParserPort` 聊天解析端口、`ArchaeologyPort` 发掘分析端口）。
- `src/adapters`：适配器层（通用微信/QQ/短信文本解析适配器、内置三大历史遗址标本适配器、考古分析引擎适配器）。
- `src/ui`：原生 CSS 视觉呈现层，包含地层岩芯柱交互、温度计、情感光谱条、文物展示抽屉与报告弹窗。

## 本地运行

```bash
npm install
npm run dev
```

## 构建验证

```bash
npm run build
```

## 容量边界

为防止超大聊天文件 / 超长消息阻塞解析、撑破化石陈列或导致浏览器失去响应，系统在
`src/core/capacity-limits.ts` 中定义了统一容量边界（单一事实源），解析、分析、展示与导出均引用同一口径：

| 边界 | 上限 | 超限行为 |
| --- | --- | --- |
| 导入文件 | 20 MB | 读取文件内容前直接拦截并提示 |
| 原始文本 | 10,000,000 字符 | 仅解析前缀并提示 |
| 消息总条数 | 100,000 条 | 保留最早消息，精确统计丢弃条数 |
| 单条消息 | 8,000 字符 | 展示/分析使用裁剪文本，`wordCount` 保留真实字数 |
| 化石引文 | 120 字符 | 统一 `clipText` 裁剪（含此前未截断的原点化石） |
| 每层化石 | 2 件 | 陈列数量封顶 |
| 文本导出 | 2 MB（UTF-8） | 超限拒绝产出并提示 |

核心统计（报告总条数、各层计数之和、真实字数）始终基于同一批实际纳入分析的消息；
界面、报告弹窗与「导出有界文本档案」共用同一份报告快照，统计口径一致。

容量边界自检：

```bash
npx esbuild scripts/verify-capacity.ts --bundle --platform=node --format=esm \
  --outfile=scripts/.verify-capacity.mjs && node scripts/.verify-capacity.mjs
```

## Docker 容器化部署

```bash
docker compose up --build
```
访问：`http://localhost:8012`
