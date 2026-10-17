# 异常场景回归样本集（判定稳定性回归）

> 目的：每次修改判定提示词 / 校验器逻辑后，用固定样本集在本地或线上走一遍完整流程（上传 → 分析），
> 核对「期望结果」列，防止改好一处、坏掉另一处。
> 操作方式：`npx vite preview` 或线上域名，用浏览器上传样本图、任选模式、点击生成，观察结果页状态。

## 样本清单

| # | 样本文件 / 描述 | 场景类别 | 期望结果 | 期望 status / reason |
|---|----------------|----------|----------|---------------------|
| 01 | `tests/samples/overhead-cliff.jpg`（2026-10-17 用户实测误判图：阳台俯拍海岸悬崖） | 俯拍越景 | 判无法分析，不允许出现远处站位框 | needs_new_photo / unreachable_view（或 aerial_view） |
| 02 | `src/assets/sample-scene.jpg`（湖边步道，前景有开阔地面） | 正常场景 | 正常方案，站位框落在前景地面 | ready |
| 03 | 大面积海面/天空，无任何道路、平台 | 纯风景 | 判无法分析 | needs_new_photo / no_environment 或 aerial_view |
| 04 | 近距离人物特写，背景占比 < 20% | 过近 | 判无法分析 | needs_new_photo / too_close |
| 05 | 手机纯自拍，几乎无环境 | 自拍 | 判无法分析 | needs_new_photo / selfie_only |
| 06 | 站位框候选落在车道中央 / 水边湿滑岩石的照片（可用任意街景+车位图触发） | 安全风险 | 不提供站位，红色安全卡 | limited_safety |
| 07 | 强逆光 / 夜间低光正常场景 | 低置信 | 黄色提示条 + 保守建议 | limited_uncertain |
| 08 | 玻璃后拍摄（隔窗看街景 / 水族馆） | 阻隔越景 | 判无法分析 | needs_new_photo / unreachable_view |
| 09 | 分辨率 < 480px 的截图 | 低分辨率 | 判无法分析 | needs_new_photo / low_resolution（本地引擎） |
| 10 | 室内物品 / 宠物等无关照片 | 无关场景 | 判无法分析 | needs_new_photo / not_travel_scene |

## 回归步骤

1. `npm run build && npx vite preview`（或直接用线上域名）
2. 逐张上传样本 → 点击「生成拍摄建议」→ 等待结果
3. 核对状态与期望列一致；站位框类结果额外检查：框是否落在前景地面、点击建议卡联动是否正常
4. 记录通过 / 失败；失败时先确认是提示词问题还是校验器问题，修完重跑全量

## 关键实现位置

- 判定提示词（needs_new_photo 枚举 + 站位三要素）：`src/data/ai.ts` SYSTEM_PROMPT
- 站位二次校验（standable / reachable / safe / sure 四维）：`src/data/ai.ts` verifyZone
- 全图地面检查（含俯拍越景 → false）：`src/data/ai.ts` checkHasGround
- 补拍文案：`src/data/ai.ts` NEEDS_NEW_PHOTO_COPY
- 结果页站位可达性快捷反馈（zone_feedback 事件）：`src/pages/Result.tsx` ZoneReachFeedback
- 数据库事件白名单：usage_events_event_check CHECK 约束（新增事件名必须同步，否则静默丢失）
