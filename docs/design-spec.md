# AI 旅行拍照助手 — Demo 设计规格（design-spec）

> 来源：产品需求文档（18 页）+ 高保真原型（V12）+ 业务流程图。
> 本文档是实现的唯一依据。

## 1. 产品一句话

用户上传当前旅行环境照片 + 选择拍摄方式（同行拍摄 / 自拍），AI 分析环境后输出「原图标注 + 文字说明」的可执行拍摄方案（人物站位 / 构图 / 动作 / 拍摄提示）。

## 2. 核心流程

```
首页 → 点击"开始 AI 拍摄指导"
     → 上传环境照片(拍摄/相册) + 选择拍摄方式
     → 生成建议 ──图片信息不足──→ 异常页(重新拍摄/更换照片) ↺
     → AI 分析(3 步进度反馈)
     → 方案结果页(原图标注 + 4 类文字建议)
     → 修改拍摄条件 ↺ / 更换环境照片 ↺
     → 用户反馈(有帮助/没帮助)
```

## 3. 页面清单 & 路由表

| 编号 | 页面 | 路由 | 优先级 | 关键元素（原型 V12） |
|---|---|---|---|---|
| P01 | 首页 | `/` | P0 | hero 标语、开始按钮、示例效果(标注示意) |
| P02 | 创建拍摄任务 | `/task` | P0 | 上传区(空态/已传态)、模式双卡(同行/自拍)、生成按钮(照片+模式齐才可点) |
| P03 | AI 分析 | `/analysis` | P0 | spinner、3 步进度(理解环境→分析空间→生成建议) |
| P04 | 方案结果 | `/result` | P0 | 原图标注(站位框+三分线+方向箭头)、图例、4 张建议卡、修改条件/更换照片、反馈区 |
| P05 | 无法分析 | `/image-error` | P0 | 错误说明卡、重新拍摄/相册选择 |
| S01 | 相机弹层 | Sheet | P0 | 取景区、快门、重拍/使用 |
| S02 | 相册弹层 | Sheet | P0 | 真实文件选择(带"环境过近"风险样本逻辑由 AI 判定替代) |

MVP 暂不做：方案保存、历史记录、分享、社区、TabBar 类多模块导航 —— 本产品是**线性单流程**，导航为「顶栏返回键」，无底部 TabBar。

## 4. 功能映射

| 功能 | 实现 |
|---|---|
| 上传图片（P0） | input[type=file]（相机带 capture），前端 canvas 压缩至 ≤1280px |
| 模式选择（P0） | companion / selfie 双卡 |
| 场景分析 + 方案生成（P0） | **真实多模态 LLM 调用**（云服务免密钥模型），输出结构化 JSON |
| 原图标注（P0） | LLM 返回百分比坐标 → 前端绝对定位渲染站位框/三分线/方向箭头 |
| 图片基础检测（P1） | 前端压缩时校验；信息不足由 AI 返回 `insufficient` 状态驱动异常页 |
| 重新生成 / 保存 / 分享（P1） | 暂不做，保留入口注释 |
| 反馈（数据指标） | 有帮助/没帮助 → localStorage 记录 + 云端匿名聚合 |

**AI 真实性决策**：demo 调用真实多模态模型分析用户上传的真实照片，而非 setTimeout 假动画 —— 这是产品价值验证核心。AI 不可用时降级为规则版基础建议。

## 5. 组件清单

- `TopBar`（返回键 + 居中标题，首页/分析页隐藏返回）
- `Button`（primary 黑 / secondary 灰 / ghost 白描边 / disabled）
- `UploadBox`（空态双入口 + 隐私提示 / 已传态预览+来源+重拍更换）
- `ModeCard`（选中黑描边）
- `StepList`（○ → ● active → ✓ done）
- `AnnotatedPhoto`（站位框 zone、三分线、方向箭头、图例）
- `AdviceCard`（tag + 正文）
- `FeedbackBox`
- `Sheet`（底部弹层壳）→ `CameraSheet` / `GallerySheet`

## 6. 设计 token（取自原型 V12，黑白极简风）

| token | 值 |
|---|---|
| 主色（按钮/强调） | `#111111` |
| 页面背景 | `#ffffff`，外层 `#f2f3f5` |
| 卡片/分块背景 | `#f7f7f8`，次按钮 `#f1f1f3` |
| 主文字 | `#171717`，次要 `#666`，弱化 `#8a8a8a` |
| 错误 | 文字 `#b14646`，底 `#fff4f1` / 边 `#f0c8be` |
| 圆角 | 按钮 14px、卡片 16px、弹层顶部 24px、大块 18px |
| 字体 | -apple-system / PingFang SC 栈 |

## 7. 数据模型

```ts
type Mode = 'companion' | 'selfie'
interface PhotoInput { dataUrl: string; source: 'camera' | 'gallery'; name?: string }
interface Advice { position: string; composition: string; pose: string; shooting: string }
interface Zone { x: number; y: number; w: number; h: number } // 百分比
interface AnalysisResult {
  status: 'ok' | 'insufficient'
  zone?: Zone
  direction?: { x: number; y: number; rotate: number }
  advice?: Advice
  modeText?: string
}
interface Feedback { taskId: string; helpful: boolean; mode: Mode; at: number }
```

状态管理：Zustand 单 store（photo / mode / result / analyzing），页面守卫：未上传照片访问 `/result`、`/analysis` → 重定向 `/task`。

## 8. 待确认问题（不阻塞，按默认值实现）

1. ~~AI 是否真实调用~~ → 默认**真实调用**（评审可上传真实照片验证）
2. 反馈数据仅存本地浏览器（多人聚合统计后续接云数据库）
3. PC 端为响应式适配（内容限宽居中），交互按移动优先
