# 项目规则（AGENTS.md）

> 本文件是 AI 旅行拍照助手 Demo 的强制工作规则，任何一次改动都必须遵守。
> 完整项目背景见 `.workbuddy/memory/MEMORY.md`，回归样本见 `docs/regression-samples.md`。

## 一、版本管理（最高优先级，2026-10-17 用户明确要求）

用户原话：「做好版本管理，保留旧文件，复制文件在修改」。

1. **改前必须先备份原文件**。修改任何已有文件之前，先执行：
   ```bash
   ./scripts/snapshot.sh file src/data/ai.ts src/pages/Result.tsx
   ```
   备份落在 `versions/files/<时间戳>/<原相对路径>`。**禁止先改后补备份。**
2. **禁止原地覆盖式重写**。整份文件重写（页面/模块重构）前，先整体快照：
   ```bash
   ./scripts/snapshot.sh full 改动主题
   ```
3. **不删旧文件**。被替代的旧实现用 `./scripts/snapshot.sh archive <文件>` 移入 `versions/archive/`，不要 `rm`。确需删除必须先问用户。
4. **一批改动一个 git 本地检查点**。每批改动构建通过后，本地 `git add -A && git commit`，信息格式 `feat|fix(scope): 说明`，正文写清「改了什么 / 为什么 / 影响哪些页面」。
   - 本地提交属于本机存档，无需授权；`git push` / `git remote add` 等对外动作**必须**用户当次明确允许。
5. **汇报必须说明版本动作**：告诉用户「旧版已备份到 X」「已本地提交 commit Y（无远程、未推送）」。
6. **可回滚承诺**：用户问「改之前是什么样」，立刻用 `./scripts/snapshot.sh list` + `restore` 或 `git show` 取回旧版，不要让用户自己找备份。

## 二、改动边界

- 涉及产品链路、页面流程、交互形态、文案、异常触发条件的改动 → **先向用户说明并获同意**再动手。
- 技术实现选择（构建工具、状态管理、路由、目录结构）可按工程惯例自行决定。
- 未经用户明确允许，不得对外发布、不得推送远程仓库。

## 三、发布约定（重要，别踩坑）

- **必须从 `dist/` 目录发布**（genie marker 的 localDir 指向 dist）。从项目根发布会误建新应用，且新应用跑 vite dev、没有云服务绑定。
- 生产域名：`https://ai-travel-photo.app.workbuddy.host/`
- 发布前必须 `npx tsc --noEmit && npx vite build` 通过。

## 四、验证约定

- 改判定逻辑（`src/data/ai.ts`）后，必须跑 `docs/regression-samples.md` 里的样本回归，至少覆盖：正常场景、俯拍越景、马路边有车。
- **本地预览必须重启**：`vite preview` 启动时会把 `dist` 缓存进内存，rebuild 后旧进程仍提供旧 bundle，会造成「改了没效果」的假象。每次 rebuild 换端口重启。
- 新增埋点事件名，必须同步更新数据库 `usage_events` 的 `usage_events_event_check` 白名单，否则写入被静默拒绝。

## 五、目录约定

```
src/            源码（改动前先 snapshot.sh file）
docs/           PRD 对齐说明、回归样本清单
tests/samples/  异常场景回归图
scripts/        工具脚本（snapshot.sh 版本快照）
versions/       本地版本存档（files/ 单文件备份、snapshots/ 整体快照、archive/ 废弃实现）
dist/           构建产物（唯一发布来源）
```
