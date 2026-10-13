# AI 分析接口返回示例（实测）

> 数据来源：2026-10-14 使用真实照片对线上模型通道实测所得，非手工构造。
> 测试照片为 Unsplash 公开图库素材。

## 1. 调用方式

- 通道：WorkBuddy 云服务 LLM（OpenAI 兼容 `chat.completions`）
- 模型：`kimi-k2.5`（固定，经横向实测选定，备选 `glm-5v-turbo`）
- 关键参数：`stream: true`、`response_format: { type: "json_object" }`、`temperature: 0.3`
- 输入：system 提示词 + `[image_url(照片), text(拍摄方式)]`

## 2. 模型原始返回

### 示例 A：正常方案（status = ok）

输入照片：巴黎塞纳河畔（河堤步道 + 埃菲尔铁塔，黄昏），同行拍摄模式。实测耗时 **8080ms**。

````json
{
  "status": "ok",
  "reason": null,
  "confidence": "high",
  "risk_level": "low",
  "zone": { "x": 15, "y": 72, "w": 25, "h": 20 },
  "direction": { "x": 20, "y": 75, "rotate": -5 },
  "modeText": "同行拍摄 · 已结合拍摄者操作条件",
  "advice": {
    "position": "请站在塞纳河左岸的河堤步道靠近水边的位置，让埃菲尔铁塔位于你的侧后方。",
    "composition": "拍摄者采用横构图，把人物放在画面左侧三分之一处，铁塔放在右侧三分之一处，水面和天空各占一半。",
    "pose": "可以侧身面向铁塔方向，一只手自然搭在河堤栏杆上，或者背对镜头回头微笑。",
    "shooting": "拍摄者稍微蹲下一点，手机或相机保持水平，让人物、铁塔和水面倒影同时入镜；黄昏光线柔和，无需补光。"
  },
  "notices": ["河堤边缘接近水面，注意脚下安全"]
}
````

注：实际返回偶发被 ` ```json ` 代码块包裹（如上），前端解析已做兼容。

### 示例 B：照片无法分析（status = needs_new_photo）

输入照片：纯蓝天白云风景照，同行拍摄模式。实测耗时 **5036ms**。

```json
{
  "status": "needs_new_photo",
  "reason": "no_environment"
}
```

输入照片：航拍/远山层叠眺望（无任何可站立地面），实测耗时 **4764ms**：

```json
{
  "status": "needs_new_photo",
  "reason": "aerial_view"
}
```

reason 枚举：`blurry`（模糊）| `selfie_only`（纯自拍）| `too_close`（背景过小）| `not_travel_scene`（与旅行无关）| `no_environment`（无可站立环境）| `aerial_view`（航拍/纯风景视角）。

## 3. 前端归一化后的结构（AnalysisResult）

模型输出经清洗（剥离代码块包裹）、坐标校验、二次校验与置信度评估后，进入前端 6 类状态之一：

```json
{
  "status": "ready",
  "modeText": "同行拍摄 · 已结合拍摄者操作条件",
  "zone": { "x": 15, "y": 72, "w": 25, "h": 20 },
  "direction": { "x": 20, "y": 75, "rotate": -5 },
  "advice": { "position": "…", "composition": "…", "pose": "…", "shooting": "…" },
  "notices": ["河堤边缘接近水面，注意脚下安全"],
  "confidence": "high",
  "source": "ai"
}
```

6 类状态与页面出口：

| status | 含义 | 页面 |
|---|---|---|
| `ready` | 正常方案 | 结果页（绿色路径） |
| `limited_uncertain` | 置信度不足 / 无有效站位框 | 结果页 + 黄条 + 虚线弱化框 |
| `limited_safety` | 站位区域存在安全风险 | 风险结果页（红卡，二次确认后显示红色虚线参考框） |
| `needs_new_photo` | 照片本身无法分析 | 无法分析页（细分原因 + 补拍提示） |
| `bad_image` | 图片无法读取 | 无法分析页（重新上传） |
| `failed` | 服务失败 | 无法分析页（重试） |

## 4. 本地降级返回（source = fallback）

模型不可用或输出不合法时，由本地摄影规则引擎产出，结构与上面一致。措辞与坐标含随机性，以下为一例：

```json
{
  "status": "ready",
  "modeText": "同行拍摄 · 已结合拍摄者操作条件",
  "zone": { "x": 63, "y": 41, "w": 23, "h": 47 },
  "direction": { "x": 21, "y": 63, "rotate": -13 },
  "advice": {
    "position": "站在画面边缘三分之一处，与主体保持一定距离，形成人与环境的呼应。",
    "composition": "采用横幅构图，把人物放在三分线附近，利用横向空间表现环境的开阔感。",
    "pose": "身体稍向主体方向侧转，手臂自然放松，可用行走或回头动作减少僵硬感。",
    "shooting": "拍摄者向主体反方向侧后方微调取景位置，优先保证主体不被裁切，再根据现场距离调整人物在画面中的大小。"
  },
  "source": "fallback"
}
```

照片分辨率过低（最短边 < 480px）时，返回 `status: "needs_new_photo"`，`reason: "low_resolution"`。

## 5. 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | 6 类枚举（见上表） | 分析结论 |
| `reason` | `string?` | 细分原因（needs_new_photo / bad_image / failed 时有） |
| `modeText` | `string?` | 一行说明，已结合的拍摄条件 |
| `zone` | `{x,y,w,h}` | 人物推荐站位区域，**百分比坐标**（0-100，x/y 为左上角，w/h 为宽高） |
| `direction` | `{x,y,rotate}` | 拍摄方向箭头位置（百分比坐标）+ 旋转角（-30 ~ 30） |
| `advice.position` | `string` | 人物站位建议（≤2 句） |
| `advice.composition` | `string` | 构图建议（≤2 句） |
| `advice.pose` | `string` | 动作建议（≤2 句） |
| `advice.shooting` | `string` | 拍摄提示；同行模式写给拍摄者，自拍模式写给用户本人 |
| `notices` | `string[]?` | 安全 / 注意提示（正常页为黄条，limited_safety 为红卡） |
| `confidence` | `"high" \| "medium" \| "low"?` | 模型自报置信度 |
| `source` | `"ai" \| "fallback"` | 结果来源：真实模型分析 / 本地规则引擎降级 |

## 6. 判定链路（模型返回后的四层校验）

1. **前端坐标校验**：坐标越界、框不贴地（`y+h < 65`）、尺寸异常（`h > 35` 或 `w > 25`）→ 放弃画框。宁可不画框，不可画错框。
2. **站位二次校验**（独立轻量调用，temperature 0）：区域不可站（天空/悬空）或不可进入（水面中央/车道中央/悬崖边缘）→ 被拦。
3. **轻量重试**：被拦后仅重新生成站位框（约 2-3s，不重跑整套方案），重试后仍未通过 → 按校验结论降级（不可站 → `needs_new_photo`；不安全 → `limited_safety`）。
4. **全图地面检查**：站位框缺失时，独立判断照片是否存在可站立地面；纯天空、云海、航拍等无地面照片 → `needs_new_photo`，不输出没有站位的保守建议。

其他边界：

- 模型置信度 ≠ high，或模型自报 `risk_level = high` → `limited_uncertain`（保守建议 + 黄条）。
- 模型不可用、返回不合法 JSON 或 `advice` 缺字段时，自动降级为本地规则引擎，流程不中断。
- 二次校验通道自身失败时放行（不阻断正常流程），由提示词稳定性兜底。

## 7. 实测结果（2026-10-14，6 张照片）

| 照片 | 判定 | 耗时 |
|---|---|---|
| 纯蓝天白云 | `needs_new_photo(no_environment)` | 5036ms |
| 云海（高空视角） | `needs_new_photo(no_environment)` | 6407ms |
| 远山层叠眺望 | `needs_new_photo(aerial_view)` | 4764ms |
| 沙漠公路（框先落车道中央） | 轻量重试后 `ready` + 车辆安全提示 | 23153ms |
| 清晨草地日出 | `ready` + 露水/逆光提示 | 9569ms |
| 湖上木栈桥 | `ready` + 码头边缘提示 | 11740ms |
