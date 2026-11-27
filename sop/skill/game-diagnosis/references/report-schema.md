# 游戏诊断可视化 HTML 看板 JSON 数据协议（`report-schema`）

Phase 4 调用 `scripts/render_diagnosis_report.py --input <diagnosis.json> --output <diagnosis.html> --open` 时，输入 JSON 必须遵循本协议（UTF-8 编码）。

**核心原则（图表优先 + 事实严谨）**：
- **用图表说话，少堆文字**：优先把报表和源码中的真实数值填入 `overview_metrics`、`funnels`、`charts` 与 `recommendations[].visual`，让用户一眼看懂瓶颈、留存差、数值缺口和改前改后对照；长段文字证据自动收纳在可展开的「7 要素详情抽屉」中。
- **严禁编造**：所有图表数据必须来自本次只读分析的真实报表、文档或源码，**严禁编造预计提升幅度、虚构数据或猜测机制**。
- **上限 3 项**：`recommendations` 最多 3 条（0–3 条均可），每条必须完整填写 7 项核心字段。
- **密钥零泄漏**：严禁写入 `ga_org_*`、`ga_admin_*`、`ga_setup_*`（渲染脚本内置自动脱敏兜底）。

---

## 完整 JSON 结构示例

```json
{
  "meta": {
    "game_name": "小摊大亨",
    "game_id": "g_123456",
    "project_dir": "E:/games/my-game",
    "admin_host": "https://game-algo-admin.dictapis.cn",
    "generated_at": "2026-11-26 15:00",
    "analysis_window": "11-12 ~ 11-25（14天）",
    "platform": "TapTap Android / iOS",
    "version_scope": "v1.4.2 正式服",
    "cohort": "新增自然量玩家",
    "sample_size": "N = 18,420",
    "retention_window": "D1 完整观察期（T-2），D7 覆盖前 7 天队列",
    "milestone_health": "核心必经节点完整；M05 存在 v1.4.1 漏报已剔除"
  },
  "executive": {
    "headline": "前期流失集中在第 3 关战力断层，且结算双倍广告入口曝光不足",
    "summary": "基于 v1.4.2 新增队列与源码数值核对，定位出 2 个高确定性优化点（已剔除异常上报节点 M05）。"
  },
  "data_caveats": [
    {
      "severity": "warn",
      "title": "区分累计到达与首日到达",
      "detail": "里程碑总表为 7 日累计口径；新手漏斗已单独按首日到达口径核算。"
    },
    {
      "severity": "anomaly",
      "title": "异常节点 M05 已剔除，不计为真实流失",
      "detail": "v1.4.1 客户端漏报 milestone_shop_open，属埋点缺失而非真实流失。"
    }
  ],
  "overview_metrics": [
    {
      "label": "次日留存 (D1)",
      "value": "31.4%",
      "caliber": "D1 完整观察期",
      "status": "warn",
      "gauge_pct": 31.4,
      "delta": "-2.8pp vs v1.4.0",
      "note": "样本 N=15,210"
    },
    {
      "label": "第 3 关首日到达率",
      "value": "46.8%",
      "caliber": "首日到达",
      "status": "bad",
      "gauge_pct": 46.8,
      "delta": "步转化仅 55.6%",
      "note": "最大必经断层"
    },
    {
      "label": "第 3 关首通失败率",
      "value": "61.8%",
      "caliber": "首次挑战",
      "status": "bad",
      "gauge_pct": 61.8,
      "delta": "远高于前两关 12%",
      "note": "源码核对存在金币缺口"
    },
    {
      "label": "首日人均激励视频",
      "value": "1.24 次",
      "caliber": "首日活跃人均",
      "status": "neutral",
      "sparkline": [1.05, 1.12, 1.18, 1.21, 1.19, 1.24, 1.24],
      "delta": "复活位占 64%",
      "note": "双倍奖励位曝光偏低"
    }
  ],
  "funnels": [
    {
      "id": "onboarding",
      "name": "新手必经路径漏斗",
      "caliber": "首日到达 · v1.4.2 新增队列 N=9,850",
      "summary": "前两关平滑，第 3 关前出现最大断层（步转化骤降至 55.6%）",
      "steps": [
        { "name": "进入主界面 (M01)", "node_type": "required", "rate": 100.0, "step_conv": 100.0, "users": 9850, "caliber_tag": "首日到达", "note": "启动必经入口" },
        { "name": "通关第 1 关 (M02)", "node_type": "required", "rate": 84.2, "step_conv": 84.2, "users": 8294, "caliber_tag": "首日到达", "note": "新手引导保护期" },
        { "name": "打开商店页 (M03)", "node_type": "optional", "rate": 29.5, "step_conv": 35.0, "users": 2906, "caliber_tag": "首日到达", "note": "可选支线入口，非必经" },
        { "name": "通关第 3 关 (M04)", "node_type": "required", "rate": 46.8, "step_conv": 55.6, "users": 4610, "caliber_tag": "首日到达", "note": "怪物血量跳升 2.1x，前置金币缺口 60", "highlight_rec_id": "OPT-1" },
        { "name": "老版本埋点节点 (M05)", "node_type": "anomaly", "rate": 11.2, "step_conv": null, "users": 1103, "caliber_tag": "上报异常", "note": "v1.4.1 漏报，已剔除，不计为流失" }
      ]
    }
  ],
  "charts": [
    {
      "id": "retention_split",
      "type": "line",
      "title": "通关 vs 卡关人群留存衰减曲线",
      "subtitle": "第 3 关失败 ≥2 次的玩家次日留存低 19.3pp（D1~D7 观察期队列）",
      "unit": "%",
      "labels": ["D1", "D2", "D3", "D5", "D7"],
      "series": [
        { "name": "第 3 关顺利通关", "color": "#059669", "values": [41.2, 31.8, 25.4, 18.6, 14.8] },
        { "name": "第 3 关失败 ≥2 次", "color": "#DC2626", "values": [21.9, 14.2, 9.8, 6.2, 4.1] }
      ]
    },
    {
      "id": "stage_fail",
      "type": "bar",
      "title": "前 5 关首通失败率对比",
      "subtitle": "第 3 关失败率异常飙升至 61.8%，与源码怪物倍率跳升完全吻合",
      "unit": "%",
      "highlight_index": 2,
      "labels": ["第 1 关", "第 2 关", "第 3 关", "第 4 关", "第 5 关"],
      "series": [
        { "name": "首通失败率", "color": "#2563EB", "values": [8.4, 16.2, 61.8, 34.5, 42.0] }
      ]
    },
    {
      "id": "ad_share",
      "type": "donut",
      "title": "激励视频广告位观看占比",
      "subtitle": "复活位占 64%，结算双倍奖励位曝光不足",
      "center_label": "首日人均",
      "center_value": "1.24次",
      "segments": [
        { "label": "复活激励位", "value": 64, "unit": "%", "color": "#2563EB" },
        { "label": "结算双倍奖励", "value": 18, "unit": "%", "color": "#059669" },
        { "label": "离线收益翻倍", "value": 12, "unit": "%", "color": "#7C3AED" },
        { "label": "商店免费刷新", "value": 6, "unit": "%", "color": "#D97706" }
      ]
    }
  ],
  "decision_flow": [
    {
      "rec_id": "OPT-1",
      "rank": 1,
      "signal": "第3关转化 55.6% · 失败率 61.8%",
      "decision": "前两关保底金币(140) < 首升门槛(200)？",
      "action": "首升消耗 200→130；第3关血量 2.1x→1.65x",
      "verify": "A/B 远程参数实验 7 天 → 达标全量",
      "rollback": "次留或广告护栏异常 → 一键回滚默认参数"
    }
  ],
  "experience_flow": {
    "title": "玩家前期体验与改造落点图",
    "subtitle": "主干为必经关卡，上方虚线为可选/分支触点，绿色标注为建议修改落点",
    "nodes": [
      { "id": "N1", "lane": "main", "type": "start", "label": "进入主界面", "metric": "100%" },
      { "id": "N2", "lane": "main", "type": "step", "label": "通关第 1~2 关", "metric": "84.2% · 产140币", "edge_label": "新手引导" },
      { "id": "N3", "lane": "main", "type": "decision", "label": "金币≥200 升级?", "metric": "缺口 -60", "edge_label": "战力检定", "rec_id": "OPT-1", "modification": "首升消耗 200→130，打通首次正反馈" },
      { "id": "N4", "lane": "main", "type": "bottleneck", "label": "挑战第 3 关", "metric": "失败率 61.8%", "edge_label": "未升级硬打", "rec_id": "OPT-1", "modification": "Boss 血量倍率 2.1x→1.65x" },
      { "id": "N5", "lane": "main", "type": "goal", "label": "进入中期循环", "metric": "46.8%", "edge_label": "通关" },
      { "id": "B1", "lane": "top", "from": "N2", "type": "branch", "label": "商店支线", "metric": "可选 29.5%", "edge_label": "可选" },
      { "id": "B2", "lane": "top", "from": "N4", "type": "branch", "label": "复活激励视频", "metric": "占广告 64%", "edge_label": "失败触发" }
    ]
  },
  "recommendations": [
    {
      "id": "OPT-1",
      "rank": 1,
      "title": "平滑第 3 关战力门槛与首升金币缺口",
      "one_liner": "前两关保底仅产 140 金币，不够首次武器升级（200），叠加第 3 关血量 2.1x 跳升造成断层。",
      "category": "数值节奏",
      "priority_reason": "覆盖全体新手必经路径、数据与源码双重实锤、纯参数微调成本低。",
      "impact_level": "high",
      "evidence_level": "high",
      "cost_level": "low",
      "validation_mode": "A/B 实验（远程参数）",
      "visual": {
        "type": "before_after",
        "title": "拟调整数值对照（改前 → 改后）",
        "items": [
          { "label": "首次武器升级消耗", "before": "200 金币", "after": "130 金币", "before_num": 200, "after_num": 130, "note": "匹配前两关保底 140 金币产出" },
          { "label": "第 3 关 Boss 血量倍率", "before": "2.10x", "after": "1.65x", "before_num": 2.1, "after_num": 1.65, "note": "平滑首次升级后的击杀曲线" }
        ]
      },
      "data_facts": {
        "summary": "v1.4.2 新增玩家从第 2 关到第 3 关的必经步转化率仅为 55.6%（前序 >80%），第 3 关失败 ≥2 次人群次留低 19.3pp。",
        "highlights": [
          { "label": "M02→M04 转化", "value": "55.6%" },
          { "label": "第 3 关失败率", "value": "61.8%" },
          { "label": "卡关次留落差", "value": "-19.3pp" }
        ]
      },
      "mechanism_basis": {
        "summary": "源码配置核对：第 1~2 关通关累计保底金币 140，1 级武器升 2 级需 200 金币；第 3 关 Boss 血量相对第 2 关跳升 2.1 倍。",
        "references": ["config/levels.json:L88-L112", "config/weapons.json:L24", "系统描述：关卡解锁规则"]
      },
      "possible_causes": [
        { "type": "primary", "text": "数值门槛与保底产出不匹配（缺口 60 金币），被迫重复刷关或卡死流失。" },
        { "type": "secondary", "text": "首次失败结算页缺少武器升级入口引导。" },
        { "type": "ruled_out", "text": "第 3 关无新增强制插屏，已核对广告日志排除打断因素。" }
      ],
      "proposed_changes": [
        "首次武器升级消耗由 200 下调至 130 金币（或前两关保底产出提至 210）。",
        "第 3 关敌人血量倍率由 2.1x 平滑至 1.65x。"
      ],
      "validation_plan": {
        "summary": "远程参数 A/B 实验按新增用户 50%/50% 分流 7 天，不影响存量老玩家。",
        "primary_metrics": ["第 3 关首日到达率", "第 3 关首通率", "D1 / D3 留存"],
        "guardrail_metrics": ["首日激励视频渗透率", "人均通关时长", "第 5 关难度失衡率"],
        "experiment_draft_9": {
          "target_game_and_cohort": "待确认：目标游戏 g_123456，仅 v1.4.2+ 新增用户",
          "hypothesis_and_metrics": "消除金币缺口后第 3 关到达率与 D1 留存改善，且不损广告收益",
          "control_vs_treatment": "对照：首升 200 / 倍率 2.1x；实验：首升 130 / 倍率 1.65x",
          "params_or_script": "远程参数 upgrade_lv1_cost, stage3_hp_scale",
          "traffic": "50% / 50%（可先 20% 灰度）",
          "duration": "7 天 + 完整 D1/D3 观察期",
          "potential_impact": "第 3 关复活广告触发次数可能略降",
          "stop_loss": "实验组次留显著下降、报错上升或广告总收益超阈值下跌即止损",
          "rollback": "关闭实验分流并回切默认远程参数"
        }
      },
      "cost_and_risks": {
        "cost": "低：远程配置可热更，无需发版；否则仅改 2 个 JSON 配置项。",
        "risks": "若降幅过大可能削弱第 3 关复活广告诉求，需紧盯护栏指标。"
      },
      "unconfirmed_gaps": [
        "报表未细分“失败后重开”与“失败后直接杀进程”比例。",
        "需确认首升消耗是否已接通远程动态参数。"
      ]
    }
  ],
  "checked_sources": {
    "docs_and_reports": [
      { "type": "分析文档", "name": "gamepropel docs optimization", "detail": "按数据与游戏设计分析规范执行" },
      { "type": "线上报表", "name": "留存总览 / 新手里程碑漏斗 / 广告位报表", "detail": "11-12 ~ 11-25" }
    ],
    "code_files": [
      { "path": "config/levels.json", "note": "核对 1~5 关怪物倍率与保底奖励" },
      { "path": "config/weapons.json", "note": "核对首次升级消耗" }
    ]
  }
}
```

---

## 支持的可视化图表类型一览

1. **`overview_metrics[]` 迷你可视化**：
   - `gauge_pct`（0–100）：渲染 SVG 环形进度仪。
   - `sparkline`（数值数组）：渲染 SVG 趋势微折线面积图。
2. **`funnels[]` 真梯形阶梯漏斗 SVG**：
   - 按 `rate` 比例绘制真实梯形漏斗 + 相邻步转化率箭头 + 瓶颈红标直达对应优化点；`node_type: "anomaly"` 自动隔离在漏斗底部虚线区，不污染漏斗形态。
3. **`charts[]` 专项大图区（推荐提供 2–3 张最核心的图表）**：
   - `type: "line"`：多曲线折线对比图（如留存衰减曲线、版本对比趋势）。
   - `type: "bar"`：柱状对比图（如各关失败率、各广告位曝光/完播对比），支持 `highlight_index` 标红异常柱。
   - `type: "donut"`：环形占比图（如广告位贡献占比、流失原因分布、资源消耗构成）。
4. **`decision_flow[]` 与 `experience_flow` 流程图与决策图（强烈推荐）**：
   - `decision_flow[]`：4 阶段决策流程图（① 线上卡点信号 → ② 根因判断 ◇ → ③ 建议修改动作 → ④ 验证达标 / 异常止损回滚双分支）；若未显式填写，渲染器也会根据 `recommendations` 自动合成。
   - `experience_flow`：玩家体验流转与改造落点流程图（`lane: "main"` 为必经主干，`lane: "top" | "bottom"` + `from` 为可选/分支节点；支持 `type: "start" | "step" | "decision" | "bottleneck" | "branch" | "goal"` 与 `modification` 绿色改造落点标注）。
5. **`recommendations[].visual` 单条优化点内嵌图**：
   - `type: "before_after"`：改前 vs 改后可视化数值条对照（一眼看懂改动幅度）。
   - `type: "compare"`：两组实测数据柱对比（如 `items: [{"label": "前置保底金币", "value": 140, "unit": "金币", "color": "#DC2626"}, {"label": "首次升级门槛", "value": 200, "unit": "金币", "color": "#2563EB"}]`，附带 `gap_note: "缺口 -60 金币"`）。
