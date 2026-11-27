# 可视化 HTML 报告 JSON 数据协议（`report-schema`）

Phase 4 调用 `scripts/render_report.py --input <report.json> --output <report.html>` 时，输入 JSON 必须遵循本协议（UTF-8 编码）。所有字符串字段将由渲染脚本自动进行 HTML 转义。

## 文案精简铁律（严禁长篇大论与堆砌黑话）

HTML 看板以**图表一眼决策**为主，填报 JSON 时必须说大白话、严格控字数，不要写冗长的技术作文：
- `verdict.summary`：**≤ 45 字**，一句话说清“查出几个、全修完了没有、能不能上传”。
- `save_upgrade.migration_summary`：**≤ 45 字**，直说“老玩家升上来会不会丢档/崩溃，怎么兼容的”。
- `dimensions[].note`：**≤ 24 字**，一句话结论，不罗列一堆函数名和变量名。
- `issues[].title`：**≤ 22 字**，优先说玩家会遇到的后果（如“第 3 关通关少发奖金”）。
- `issues[].one_liner`（推荐填写）：**≤ 30 字**，折叠行右侧的一句话大白话修复结果（如“补传奖池字段并解除结束锁”）。
- `issues[].repro` / `fix_summary`：**各 ≤ 45 字**，讲清触发与改法即可；代码放进 `before_snippet` / `after_snippet`（各 ≤ 5 行）。

## 完整结构说明

```json
{
  "meta": {
    "game_name": "游戏名称（如：小摊大亨）",
    "project_dir": "E:/games/my-maker-game",
    "mode": "单机 Lua | 联机/服务端 Lua",
    "generated_at": "2026-11-26 14:30",
    "fix_rounds": 1,
    "git_branch": "main (optional)",
    "git_commit": "abc1234 (optional)",
    "maker_binding": "已绑定 app_id=123456 / 未绑定说明"
  },
  "verdict": {
    "can_upload": true,
    "upload_reason": "P0/P1 已全部清零且老存档平滑兼容，可直接构建上传",
    "status": "pass | warn | block",
    "title": "可以构建上传 | 有风险需确认 | 禁止上传",
    "score": 92,
    "summary": "发现 5 个问题已全部修完，官方校验通过。",
    "next_action": "可直接构建上传（真机再抽测激励视频与刘海屏）。"
  },
  "summary_before": { "P0": 2, "P1": 3, "P2": 2, "P3": 1 },
  "summary_after":  { "P0": 0, "P1": 0, "P2": 1, "P3": 1 },
  "save_upgrade": {
    "status": "compatible | fixed_compatible | breaking | first_release | unknown",
    "verdict_label": "可直接平滑升级 | 修复后可直接升级 | 存在破坏性不兼容 | 首次发版(无老存档) | 未能确认",
    "from_version": "v1.2 (saveVersion=1 或无版本号)",
    "to_version": "v1.3 (saveVersion=2)",
    "migration_summary": "老版本存档读取时自动补齐新增子表默认值并保留原有货币、关卡与解锁进度，不会报 nil 崩溃或清档。",
    "field_checks": [
      {
        "field": "player.coins",
        "change": "保持不变",
        "compatible": true,
        "note": "完整继承老存档余额"
      },
      {
        "field": "player.pets",
        "change": "v1.3 新增表字段",
        "compatible": true,
        "note": "已补充 migrateV1ToV2：老存档缺失时默认初始化为 {}"
      }
    ]
  },
  "checks": [
    {
      "name": "静态全量扫描（初检）",
      "tool": "maker_static_audit.py",
      "evidence": "script_audit",
      "status": "warn",
      "detail": "发现 1 处资源路径大小写不匹配、1 处缺 .meta、2 处 print 刷屏"
    },
    {
      "name": "官方 Lua 校验（回归）",
      "tool": "preview validate",
      "evidence": "lua_validate",
      "status": "pass",
      "detail": "0 错误，0 阻断警告"
    }
  ],
  "dimensions": [
    {
      "id": "state_flow",
      "name": "1. 状态机与流程闭环",
      "static_status": "pass | warn | fail | na | skipped",
      "runtime_status": "pass | warn | fail | na | skipped",
      "evidence": "static_review | script_audit | lua_validate | isolated_sim | local_preview | real_device | not_run",
      "before_count": 1,
      "after_count": 0,
      "note": "已修复结算界面连点重开导致的重复初始化问题；真机切后台待人工确认。"
    }
  ],
  "issues": [
    {
      "id": "QA-001",
      "title": "商店图标路径大小写错导致404",
      "one_liner": "已统一改为小写路径并复测通过",
      "severity": "P0",
      "dimension": "6. 资源、.meta/UUID 与泄漏",
      "status": "fixed_verified",
      "evidence": "script_audit",
      "location": "assets/scripts/ui/ShopPanel.lua:48",
      "repro": "打开商店界面加载商品图标时，代码引用 assets/Image/coin.png，磁盘实际为 assets/image/coin.png。",
      "root_cause": "Windows 文件系统大小写不敏感掩盖了路径错误，构建上传至 TapTap 云端/移动端后会触发资源加载失败或白块。",
      "fix_summary": "将引用路径统一修正为与磁盘完全一致的 assets/image/coin.png。",
      "before_snippet": "icon:SetTexture(\"assets/Image/coin.png\")",
      "after_snippet": "icon:SetTexture(\"assets/image/coin.png\")",
      "changed_files": ["assets/scripts/ui/ShopPanel.lua"],
      "verification": "重跑 maker_static_audit.py 大小写检查归零，官方 Lua 校验通过。"
    }
  ],
  "changed_files": [
    {
      "path": "assets/scripts/ui/ShopPanel.lua",
      "change_type": "modified | added | meta_generated",
      "summary": "修正图标路径大小写并补充购买按钮防连点锁"
    }
  ],
  "manual_checklist": [
    {
      "id": "CHK-01",
      "category": "广告真机验证",
      "title": "真机测试激励视频完整观看、中途取消、无网络加载失败三条分支",
      "detail": "确认中途取消绝不发奖、加载失败按钮可恢复点击且无弹窗卡死。"
    }
  ]
}
```

## 枚举约定

- `verdict.can_upload`（必填布尔值，对应看板顶部的**「是否建议构建上传：是 / 否」**大印章）：
  - `true`（**是**）：P0 与 P1 已全部清零、官方校验无错、且老存档升级不为 `breaking`
  - `false`（**否**）：存在未解决 P0/P1 阻断、官方校验失败、或老存档直升为 `breaking`
- `verdict.upload_reason`：**≤ 28 字**，一句话说明为什么答“是”或“否”。
- `verdict.status`:
  - `pass`：无剩余 `open` 的 P0 与 P1（允许存在少量已评估的 P2/P3 或常规真机复核提示）
  - `warn`：无剩余 `open` 的 P0，但存在未闭环 P1 或关键 `fixed_pending_device` 项需真机最终确认
  - `block`：仍存在未解决的 P0 阻断项或官方校验失败
- `save_upgrade.status`：
  - `compatible`（老版本存档可直接平滑升级到新版本）
  - `fixed_compatible`（初检发现直升隐患，本次修复后已可直接平滑升级）
  - `breaking`（存在破坏性不兼容，老存档直升会崩溃或丢进度——此时总发布结论必须为 `block`）
  - `first_release`（全新首版上线，尚无历史线上传档）
  - `unknown`（缺少旧版本基线或无法静态确认，需人工/真机覆盖升级验证）
- `issues[].severity`：`P0` | `P1` | `P2` | `P3`
- `issues[].status`：
  - `fixed_verified`（已修复并复测通过）
  - `fixed_pending_device`（已修复待真机复核）
  - `deferred`（暂缓处理）
  - `open`（未修复）
- `issues[].evidence` / `checks[].evidence`：`static_review` | `script_audit` | `lua_validate` | `isolated_sim` | `local_preview` | `real_device` | `suspected` | `not_run`
- `checks[].status` / `dimensions[].*_status`：`pass` | `warn` | `fail` | `na` | `skipped`

## 健康度分值参考计算

可在组装 JSON 时按回归后剩余问题与复测覆盖度估算 `verdict.score`（0–100）：
- 满分 100 起扣：每个剩余未修 `P0` 扣 35 分（且封顶不超过 49 分并强制 `block`）；每个剩余未修 `P1` 扣 15 分；每个剩余 `P2` 扣 4 分；每个 `P3` 扣 1 分；若官方 Lua 校验未通过强制 `block` 且封顶 45 分；最低 0 分。
