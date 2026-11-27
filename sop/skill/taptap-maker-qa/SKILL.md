---
name: taptap-maker-qa
description: >-
  TapTap Maker（UrhoX + Lua）小游戏构建上传前的全量 QA 检测、Bug 与逻辑漏洞深度排查、
  按优先级修复回归，以及单文件可视化 HTML 验收看板报告生成。
  用于每次准备构建/上传游戏前的全量质量体检与修复闭环；
  不用于立项/日常玩法美术制作（使用 taptap-maker-sop）、新版本运营文案（使用 mini-game-version-ops）
  或未经授权的自动构建与上传。
---

# TapTap Maker 发布前全量 QA 与自动修复闭环

本技能专为 **TapTap Maker（UrhoX + Lua）** 游戏设计，执行「**自动化静态预检 → 8 大维度深度逻辑与老档升级审查 → 直接全部修复与回归复测 → 可视化 HTML 交付看板**」全自动一站式闭环——**扫描发现问题后直接全部修完、复测并出 HTML 图表报告，绝不中途停下来让用户挑选修哪几项**。

脚本与参考目录（本技能根路径）：`{{SKILL_ROOT}}\`

## 红线约束（全程必须遵守）

1. **严禁自动构建或上传**：本技能任何阶段都**不得**调用 `maker_build_current_directory`、提交代码或推送远端；即使工具提示“需要构建”也不构成授权。必须等用户审阅最终 HTML 报告并明确授权后再执行构建上传。
2. **绝不伪造证据与 UUID**：
   - 缺失或需要补全的 `.meta` 文件只能通过官方 `generate_resource_meta` 生成，严禁手写或猜测 UUID。
   - 严格区分 6 级证据（静态检查 / 脚本扫描 / 隔离模拟 / 官方 Lua 校验 / Maker 本地预览 / 真机与平台），严禁把本地预览或模拟回调标成真机/广告/平台通过。
3. **不破坏现场与正式存档**：严禁执行 `git reset`、`git clean` 或清空/覆写玩家正式存档；不借用其他游戏的 `.maker-mcp/config.json` 或广告配置。
4. **报告绝不污染游戏包体**：中间 JSON 与可视化 HTML 报告默认输出到项目外安全目录，严禁放进游戏资源打包目录。

---

## Phase 1：锁定项目与自动化预检（只读）

1. **确认目标项目与 Maker 状态**
   - 优先读取 `maker://status`，不可用或目标目录不明确时调用 `maker_status_lite(target_dir="<项目绝对路径>")`；绝不猜测项目目录，后续工具统一透传同一 `target_dir`。
   - 从状态输出中确认：单机还是联机/服务端项目、当前活动发行版 CLI 路径及随包指引文档路径（如 `taptap-maker-local`）。按状态返回的当前命令工作，不硬编码过期命令。

2. **确定报告归档目录（项目外安全路径）**
   - 若 `{{SOP_ROOT}}` 存在：使用 `{{SOP_ROOT}}\qa-reports\<项目名>\`
   - 否则回退到：`<目标项目父目录>\<项目名>-qa-reports\`
   - 本次运行时间戳标记 `<TS>` 格式为 `YYYYMMDD-HHMM`。

3. **运行只读静态全量扫描脚本**
   ```powershell
   python "{{SKILL_ROOT}}\scripts\maker_static_audit.py" --project "<target_dir>" --out "<归档目录>\audit-before-<TS>.json"
   ```
   读取脚本生成的 JSON 摘要，重点定位：配置文件健康度、缺失/损坏 `.meta` 与重复 UUID、跨文件资源引用大小写不一致（Windows 隐形 404）、JSON 语法错误、调试/作弊残留、事件监听与 Tween 泄漏热点、广告与存档代码落点。

4. **运行官方 Lua 校验与按需平台只读核查**
   - 按 `maker://status` 提供的 `taptap-maker-local` 文档执行官方校验（`run-lua-validate` / `preview validate`；联机或含服务端逻辑项目加 `--network`）。记录真实命令与结果，不可用时标为「未运行」并说明原因。
   - **若项目含广告代码或配置**：先读取 `maker://ads-integration-guide` 与项目内 `engine-docs/recipes/sdk.md`；在满足前置条件时调用 `get_ad_config(target_dir=...)` 与本地 `.project/settings.json` 的 `@runtime.ad` 逐项比对（仅忽略 `synced_at`）。
   - **若项目为已上线迭代版本**：
     - 按需只读调用 `get_debug_feedbacks(target_dir=..., fetch_and_mark_processed=false, limit=10)`，把真实玩家报错或 Lua 会话日志纳入本次排查（严禁默认标记为已处理）。
     - **老版本存档直升兼容性基线**：检查存档版本号与迁移代码；若项目有 Git 历史，使用只读 `git log` / `git diff` 对比上一发布版本与当前版本的存档读写及配置表差异，列出所有新增、改名、改类型或删除的持久化字段。

---

## Phase 2：8 大维度深度逻辑审查（不中断，直通修复）

1. 读取 [references/qa-checklist.md](references/qa-checklist.md)，结合 Phase 1 的静态扫描 JSON 与官方校验输出，通读游戏核心入口、场景/状态机、玩法主循环、数值/经济配置、存档读写、UI 交互与 SDK 回调 Lua 代码。
2. 逐维度完成深度逻辑审查（不适用项标为 `na` 并写明理由），**并单独给出「老版本存档直升新版本兼容性结论」**（明确回答老玩家更新后能否直接继承旧档、是否存在缺字段 `nil` 崩溃、字段改名丢进度或旧配置 ID 失效风险），形成完整的初检缺陷台账，每条缺陷记录：
   - 编号（`QA-001` 起）、标题、严重度（`P0`/`P1`/`P2`/`P3`）、所属维度、证据级别
   - 精确位置（`相对路径:行号`）、触发/复现路径、根因与玩家侧后果、最小破坏性修复方案
3. **直通执行原则（绝不中途询问选修）**：
   - 整理完初检台账后**立即直接进入 Phase 3，把扫描发现的所有可修复问题一次性全部修完**，不要停下来询问用户“全量修还是只修哪几个”。
   - 仅在用户本次明确说“只检测不改代码”时才跳过 Phase 3 直接出报告；如个别项受限于外部前置条件（例如远端广告位未开通、缺失原始美术源文件等），跳过该外部阻塞项并如实记入报告，其余全部问题照常自动修完，**不因此打断流程询问用户**。

---

## Phase 3：全部自动修复与全量回归复测

直接执行全部缺陷修复与回归验证：

1. **按 `P0 → P1 → P2 → 可安全落地的 P3` 一次性全部修复**：
   - 严格针对每条缺陷根因做最小必要修改，确保修复完不破坏既有玩法与界面结构。
   - 遇到缺失 `.meta` 时调用 `generate_resource_meta(target_dir=..., paths=[...])`，绝不手动编造 UUID。
   - 遇到老版本存档直升兼容隐患（缺 `saveVersion`、缺字段 `nil` 崩溃、字段改名丢进度等），直接补全向后兼容的迁移/默认值兜底逻辑并验证隔离老档加载。
   - 涉及广告修复前必须以本地 `engine-docs/recipes/sdk.md` 为准，确保仅在 `result.success == true` 时单次发奖且异常分支不卡死。
   - 完整记录每条修复的改动文件、修改前后关键代码/行为对照（供 HTML 图表看板展示）。
2. **全量回归复测**：
   - 重新运行 `maker_static_audit.py` 输出 `audit-after-<TS>.json`，核对初检静态项全部归零（若回归发现新问题或漏网项，直接继续修完并复测，直到无剩余可自动修复缺陷）。
   - 重新运行官方 Lua 校验（`run-lua-validate` / `preview validate`），确保修复后 0 错误、0 阻断警告。
   - 若用户环境允许本地预览，可按当前发行版 preview 文档执行本地预览冒烟检查（不提交、不远端构建、不唤醒无关停掉的会话）。
3. **收敛每条缺陷的最终状态**：
   - `fixed_verified`：已修复且通过静态/官方校验或本地预览回归验证
   - `fixed_pending_device`：代码已修并过本地校验，但需真机/真实平台（如真广告、真机刘海屏、真实云存档）最终确认
   - `open`：仅用于无法在本地代码侧解决的外部环境/平台阻塞项（须写明具体阻塞原因）

---

## Phase 4：生成可视化 HTML 看板与交付收尾

1. 读取 [references/report-schema.md](references/report-schema.md)，将初检统计、修复后统计、老存档直升兼容评估、校验流水、8 大维度矩阵、全部缺陷与修复对照明细、文件变更清单以及真机人工复核清单写入 `<归档目录>\qa-report-<TS>.json`。**严格遵守 schema 中的文案精简字数上限（说人话、不写长段技术黑话），确保看板以图表为主、清爽耐看。**
2. 运行渲染脚本生成自包含单文件 HTML 归档并自动用系统浏览器打开：
   ```powershell
   python "{{SKILL_ROOT}}\scripts\render_report.py" --input "<归档目录>\qa-report-<TS>.json" --output "<归档目录>\qa-report-<TS>.html" --open
   ```
3. **同步生成可渲染的 HTML Artifact（关键！防止点击链接变成代码编辑器）**：
   - 若当前运行环境支持 Artifact 目录（如 Antigravity）：
     1. 用原生 `read_file` 完整读取刚生成的 `<归档目录>\qa-report-<TS>.html`（若超出单次字节上限则用 `ByteOffset` 读完整）。
     2. 用原生 `write_file` 将其写入当前会话的 Artifact 目录（`<ArtifactDir>\qa-report-<TS>.html`），并**必须设置 `ArtifactMetadata`**：
        - `UserFacing: true`
        - `RequestFeedback: false`
        - `Summary`: `"<游戏名> 发布前全量 QA 可视化看板（是否建议构建上传：是/否）"`
     3. **链接规范**：在回复用户时，**可点击的 Markdown 链接只能指向 Artifact 里的 `<ArtifactDir>/qa-report-<TS>.html`**（点开右侧直接渲染可视化图表，不显示 HTML 源码）；磁盘归档路径仅用行内代码（反引号）写明位置，**绝不把磁盘普通 `.html` 做成可点击 `file://` 链接**。
   - 若当前环境无 Artifact 渲染能力，则通过 `--open` 由系统默认浏览器直接展示。
4. **最终交付输出**：
   - 首行直接给出明确的是/否答复：**`是否建议构建上传：✅ 是 / ❌ 否`**（附一句极短理由），以及**老版本存档直升结论**（可直接平滑升级 / 修复后可直升 / 存在不兼容风险 / 首次发版）。
   - 提供可点击的 **HTML Artifact 可视化看板链接**（以及纯文本反引号形式的磁盘归档路径），简述本次发现与已全部修复的关键项，以及无法由本地替代的真机/平台复核项。
   - 全程不自动调用构建上传工具，等用户看完 HTML 报告后自行决定是否下达构建上传指令。
