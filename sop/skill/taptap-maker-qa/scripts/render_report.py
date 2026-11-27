#!/usr/bin/env python3
"""
TapTap Maker Pre-Release QA Visual Chart Dashboard Generator.

Converts a structured QA report JSON (see references/report-schema.md) into a clean,
chart-first, zero-dependency single-file interactive HTML dashboard:
  - Above the fold: Release Gate + Old-Save Upgrade card + KPIs
  - Visual Chart Row: 8-Axis Health Radar Chart + Before/After Bar Chart + Category Donut Chart
  - Tabbed Details (no endless scroll): Collapsed single-line issue list (expand on click),
    8-dimension compact tiles, Old-Save & Changed Files, and persistent Real-Device Checklist.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import webbrowser
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


VERDICT_META = {
    "pass": {
        "badge": "可以构建上传",
        "icon": "✓",
        "color": "#10b981",
        "bg": "rgba(16, 185, 129, 0.14)",
        "border": "rgba(16, 185, 129, 0.45)",
    },
    "warn": {
        "badge": "有风险 · 先看提示",
        "icon": "!",
        "color": "#f59e0b",
        "bg": "rgba(245, 158, 11, 0.14)",
        "border": "rgba(245, 158, 11, 0.45)",
    },
    "block": {
        "badge": "禁止上传 · 有阻断项",
        "icon": "✕",
        "color": "#ef4444",
        "bg": "rgba(239, 68, 68, 0.14)",
        "border": "rgba(239, 68, 68, 0.48)",
    },
}

SAVE_UPGRADE_META = {
    "compatible": ("老存档可直接升级", "✓", "chk-pass", "#10b981"),
    "fixed_compatible": ("修复后可直接升级", "✓", "chk-pass", "#10b981"),
    "breaking": ("老存档不兼容", "✕", "chk-fail", "#ef4444"),
    "first_release": ("首次发版（无老档）", "★", "chk-na", "#38bdf8"),
    "unknown": ("待真机覆盖确认", "!", "chk-warn", "#f59e0b"),
}

STATUS_LABELS = {
    "fixed_verified": ("已修复", "st-fixed"),
    "fixed_pending_device": ("已修·待真机", "st-pending"),
    "deferred": ("暂缓", "st-deferred"),
    "open": ("未修复", "st-open"),
}

EVIDENCE_LABELS = {
    "static_review": "静态确认",
    "script_audit": "脚本扫描",
    "lua_validate": "官方校验",
    "isolated_sim": "模拟测试",
    "local_preview": "本地预览",
    "real_device": "真机实测",
    "suspected": "待确认",
    "not_run": "未运行",
}

CHECK_STATUS_LABELS = {
    "pass": ("通过", "chk-pass"),
    "warn": ("有告警", "chk-warn"),
    "fail": ("失败", "chk-fail"),
    "na": ("不适用", "chk-na"),
    "skipped": ("待真机", "chk-skip"),
}

CHANGE_TYPE_LABELS = {
    "modified": ("改", "ct-mod"),
    "added": ("增", "ct-add"),
    "meta_generated": (".meta", "ct-meta"),
    "deleted": ("删", "ct-del"),
}

DONUT_PALETTE = [
    "#38bdf8",
    "#a78bfa",
    "#34d399",
    "#fbbf24",
    "#f87171",
    "#fb7185",
    "#2dd4bf",
    "#94a3b8",
]

SHORT_DIM_NAMES = {
    "state_flow": "状态闭环",
    "lua_gameplay": "玩法帧率",
    "economy_logic": "数值经济",
    "save_persistence": "存档升级",
    "ui_interaction": "UI适配",
    "assets_lifecycle": "资源泄漏",
    "ads_sdk": "广告SDK",
    "release_hygiene": "发布卫生",
}


def esc(val: Any) -> str:
    if val is None:
        return ""
    return html.escape(str(val), quote=True)


def clamp_score(score: Any) -> int:
    try:
        v = int(round(float(score)))
        return max(0, min(100, v))
    except Exception:
        return 0


def short_dim_label(dim_id: str, raw_name: str) -> str:
    if dim_id in SHORT_DIM_NAMES:
        return SHORT_DIM_NAMES[dim_id]
    cleaned = re.sub(r"^\s*\d+[\.\、\s]+", "", str(raw_name or "")).strip()
    if "状态" in cleaned:
        return "状态闭环"
    if "玩法" in cleaned or "帧" in cleaned or "Lua" in cleaned:
        return "玩法帧率"
    if "数值" in cleaned or "经济" in cleaned:
        return "数值经济"
    if "存档" in cleaned:
        return "存档升级"
    if "UI" in cleaned or "交互" in cleaned or "适配" in cleaned:
        return "UI适配"
    if "资源" in cleaned or "meta" in cleaned.lower() or "泄漏" in cleaned:
        return "资源泄漏"
    if "广告" in cleaned or "SDK" in cleaned or "云端" in cleaned:
        return "广告SDK"
    if "卫生" in cleaned or "包体" in cleaned or "发布" in cleaned:
        return "发布卫生"
    return cleaned[:5] or "其他"


def truncate_text(text: str, max_len: int) -> str:
    s = str(text or "").strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def build_score_ring_svg(score: int, color: str) -> str:
    r = 40
    c = 2 * math.pi * r
    off = c * (1.0 - score / 100.0)
    return f"""
    <svg viewBox="0 0 100 100" width="96" height="96" aria-label="健康分 {score}">
      <circle cx="50" cy="50" r="{r}" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="9"/>
      <circle cx="50" cy="50" r="{r}" fill="none" stroke="{color}" stroke-width="9"
              stroke-linecap="round" stroke-dasharray="{c:.2f}" stroke-dashoffset="{off:.2f}"
              transform="rotate(-90 50 50)"/>
      <text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="#f8fafc" font-size="26" font-weight="800">{score}</text>
      <text x="50" y="72" text-anchor="middle" fill="#94a3b8" font-size="10">健康分</text>
    </svg>
    """


def build_radar_svg(dimensions: list[dict[str, Any]]) -> str:
    default_dims = [
        {"id": k, "name": v, "static_status": "pass", "runtime_status": "pass", "before_count": 0, "after_count": 0}
        for k, v in SHORT_DIM_NAMES.items()
    ]
    dims = dimensions[:8] if dimensions else default_dims
    while len(dims) < 3:
        dims.append(default_dims[len(dims)])

    n = len(dims)
    cx, cy = 185.0, 146.0
    max_r = 92.0

    def pt(index: int, pct: float, radius: float = max_r) -> tuple[float, float]:
        ang = -math.pi / 2.0 + (2.0 * math.pi * index / n)
        r = radius * max(0.12, min(1.0, pct / 100.0))
        return cx + r * math.cos(ang), cy + r * math.sin(ang)

    def dim_scores(d: dict[str, Any]) -> tuple[float, float]:
        b_cnt = int(d.get("before_count", 0))
        a_cnt = int(d.get("after_count", 0))
        st = str(d.get("static_status", "pass"))
        before_s = float(d.get("score_before", max(22, 100 - b_cnt * 24)))
        if "score_after" in d:
            after_s = float(d["score_after"])
        elif st == "fail":
            after_s = 30.0
        elif a_cnt > 0:
            after_s = float(max(25, 100 - a_cnt * 24))
        elif st == "warn":
            after_s = 82.0
        else:
            after_s = 100.0
        return before_s, after_s

    grid_svg = []
    for ring in (25, 50, 75):
        pts = " ".join(f"{pt(i, ring)[0]:.1f},{pt(i, ring)[1]:.1f}" for i in range(n))
        grid_svg.append(f'<polygon points="{pts}"/>')
    for i in range(n):
        x, y = pt(i, 100)
        grid_svg.append(f'<line x1="{cx:.1f}" y1="{cy:.1f}" x2="{x:.1f}" y2="{y:.1f}"/>')
    outer_pts = " ".join(f"{pt(i, 100)[0]:.1f},{pt(i, 100)[1]:.1f}" for i in range(n))

    before_pts = []
    after_pts = []
    dots_svg = []
    labels_svg = []

    for i, d in enumerate(dims):
        bs, as_ = dim_scores(d)
        bx, by = pt(i, bs)
        ax, ay = pt(i, as_)
        before_pts.append(f"{bx:.1f},{by:.1f}")
        after_pts.append(f"{ax:.1f},{ay:.1f}")
        dot_color = "#10b981" if as_ >= 90 else ("#f59e0b" if as_ >= 70 else "#ef4444")
        dots_svg.append(f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="3.6" fill="{dot_color}"/>')

        ang = -math.pi / 2.0 + (2.0 * math.pi * i / n)
        lx = cx + (max_r + 22) * math.cos(ang)
        ly = cy + (max_r + 18) * math.sin(ang)
        cos_a = math.cos(ang)
        anchor = "middle" if abs(cos_a) < 0.25 else ("start" if cos_a > 0 else "end")
        lbl = short_dim_label(str(d.get("id", "")), str(d.get("name", "")))
        labels_svg.append(f'<text x="{lx:.1f}" y="{ly:.1f}" text-anchor="{anchor}">{esc(lbl)}</text>')

    return f"""
    <svg class="chart-svg" viewBox="0 0 370 290" aria-label="8 大维度健康度雷达图">
      <g fill="none" stroke="rgba(148,163,184,0.12)" stroke-width="1">{"".join(grid_svg)}</g>
      <polygon points="{outer_pts}" fill="none" stroke="rgba(148,163,184,0.22)" stroke-width="1"/>
      <polygon points="{" ".join(before_pts)}" fill="rgba(245,158,11,0.16)" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="4 3"/>
      <polygon points="{" ".join(after_pts)}" fill="rgba(16,185,129,0.22)" stroke="#10b981" stroke-width="2.2"/>
      <g stroke="#0b1120" stroke-width="1.4">{"".join(dots_svg)}</g>
      <g dominant-baseline="central" fill="#cbd5e1" font-size="11.5" font-weight="600">{"".join(labels_svg)}</g>
    </svg>
    """


def build_bar_chart_svg(before: dict[str, int], after: dict[str, int]) -> str:
    levels = [
        ("P0", "P0 阻断", "#ef4444"),
        ("P1", "P1 严重", "#f59e0b"),
        ("P2", "P2 一般", "#38bdf8"),
        ("P3", "P3 建议", "#94a3b8"),
    ]
    max_val = max([1] + [before[k] for k, _, _ in levels] + [after[k] for k, _, _ in levels])
    chart_h = 156.0
    base_y = 204.0
    start_x = 46.0
    group_w = 80.0
    bar_w = 24.0
    gap = 6.0

    grid = []
    for step in range(5):
        gy = base_y - (chart_h * step / 4.0)
        grid.append(f'<line x1="24" y1="{gy:.1f}" x2="346" y2="{gy:.1f}" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>')

    bars = []
    for idx, (k, label, color) in enumerate(levels):
        gx = start_x + idx * group_w
        bv = before[k]
        av = after[k]
        bh = (bv / max_val) * chart_h if bv > 0 else 4.0
        ah = (av / max_val) * chart_h if av > 0 else 4.0
        by = base_y - bh
        ay = base_y - ah

        # Before bar
        bars.append(
            f'<rect x="{gx:.1f}" y="{by:.1f}" width="{bar_w}" height="{bh:.1f}" rx="5" fill="{color}" opacity="0.34"/>'
        )
        bars.append(
            f'<text x="{gx + bar_w / 2:.1f}" y="{by - 7:.1f}" text-anchor="middle" fill="#94a3b8" font-size="12" font-weight="700">{bv}</text>'
        )

        # After bar
        ax = gx + bar_w + gap
        after_fill = "#10b981" if av == 0 else color
        bars.append(
            f'<rect x="{ax:.1f}" y="{ay:.1f}" width="{bar_w}" height="{ah:.1f}" rx="5" fill="{after_fill}"/>'
        )
        after_txt = "✓0" if (av == 0 and bv > 0) else str(av)
        after_txt_color = "#34d399" if av == 0 else "#f8fafc"
        bars.append(
            f'<text x="{ax + bar_w / 2:.1f}" y="{ay - 7:.1f}" text-anchor="middle" fill="{after_txt_color}" font-size="12" font-weight="800">{after_txt}</text>'
        )

        # Label
        cx = gx + bar_w + gap / 2
        bars.append(
            f'<text x="{cx:.1f}" y="{base_y + 22:.1f}" text-anchor="middle" fill="#cbd5e1" font-size="12" font-weight="600">{label}</text>'
        )

    return f"""
    <svg class="chart-svg" viewBox="0 0 366 250" aria-label="修复前后缺陷清零柱状图">
      {"".join(grid)}
      {"".join(bars)}
    </svg>
    """


def build_donut_chart_html(issues: list[dict[str, Any]]) -> str:
    total = len(issues)
    r = 56.0
    circ = 2 * math.pi * r
    if total == 0:
        svg = f"""
        <svg viewBox="0 0 156 156" width="156" height="156" aria-label="问题分类占比">
          <circle cx="78" cy="78" r="{r}" fill="none" stroke="#10b981" stroke-width="18"/>
          <text x="78" y="74" text-anchor="middle" fill="#34d399" font-size="24" font-weight="800">0</text>
          <text x="78" y="94" text-anchor="middle" fill="#94a3b8" font-size="11">零缺陷</text>
        </svg>
        """
        return f'<div class="donut-wrap">{svg}<div class="donut-legend"><div class="legend-item"><span class="dot" style="background:#10b981"></span><span>全部通过，未发现缺陷</span><strong>100%</strong></div></div></div>'

    counts: Counter[str] = Counter()
    for iss in issues:
        lbl = short_dim_label("", str(iss.get("dimension") or "其他"))
        counts[lbl] += 1
    ordered = counts.most_common()

    segments = []
    legend_rows = []
    acc = 0.0
    for idx, (lbl, cnt) in enumerate(ordered):
        color = DONUT_PALETTE[idx % len(DONUT_PALETTE)]
        frac = cnt / total
        seg_len = circ * frac
        gap_len = 2.0 if len(ordered) > 1 else 0.0
        draw_len = max(1.0, seg_len - gap_len)
        offset = -circ * acc
        segments.append(
            f'<circle cx="78" cy="78" r="{r}" fill="none" stroke="{color}" stroke-width="18" '
            f'stroke-dasharray="{draw_len:.2f} {circ:.2f}" stroke-dashoffset="{offset:.2f}" '
            f'transform="rotate(-90 78 78)"/>'
        )
        pct = int(round(frac * 100))
        legend_rows.append(
            f'<div class="legend-item"><span class="dot" style="background:{color}"></span>'
            f'<span class="leg-name">{esc(lbl)}</span><strong>{cnt}</strong><span class="leg-pct">{pct}%</span></div>'
        )
        acc += frac

    fixed = sum(1 for i in issues if i.get("status") in ("fixed_verified", "fixed_pending_device"))
    svg = f"""
    <svg class="donut-svg" viewBox="0 0 156 156" width="124" height="124" aria-label="缺陷分布环形图">
      <circle cx="78" cy="78" r="{r}" fill="none" stroke="rgba(148,163,184,0.12)" stroke-width="18"/>
      {"".join(segments)}
      <text x="78" y="73" text-anchor="middle" fill="#f8fafc" font-size="24" font-weight="800">{total}</text>
      <text x="78" y="93" text-anchor="middle" fill="#94a3b8" font-size="11">已修 {fixed} 项</text>
    </svg>
    """
    return f'<div class="donut-wrap">{svg}<div class="donut-legend">{"".join(legend_rows)}</div></div>'


def render_dim_tiles_html(dimensions: list[dict[str, Any]]) -> str:
    if not dimensions:
        return '<div class="empty-hint">未提供 8 大维度数据。</div>'
    tiles = []
    for d in dimensions:
        st_lbl, st_cls = CHECK_STATUS_LABELS.get(str(d.get("static_status", "pass")), ("通过", "chk-pass"))
        rt_lbl, rt_cls = CHECK_STATUS_LABELS.get(str(d.get("runtime_status", "skipped")), ("待真机", "chk-skip"))
        b_cnt = int(d.get("before_count", 0))
        a_cnt = int(d.get("after_count", 0))
        short_name = short_dim_label(str(d.get("id", "")), str(d.get("name", "")))
        note = str(d.get("note") or "")
        short_note = truncate_text(note, 34)
        flow_cls = "cnt-clear" if a_cnt == 0 else "cnt-remain"
        tiles.append(f"""
        <div class="dim-tile" title="{esc(note)}">
          <div class="dim-tile-top">
            <span class="dim-tile-name">{esc(short_name)}</span>
            <span class="cnt-flow {flow_cls}">{b_cnt} → {a_cnt}</span>
          </div>
          <div class="dim-tile-pills">
            <span class="pill {st_cls}">静态:{esc(st_lbl)}</span>
            <span class="pill {rt_cls}">验证:{esc(rt_lbl)}</span>
          </div>
          <div class="dim-tile-note">{esc(short_note or "无异常")}</div>
        </div>
        """)
    return "\n".join(tiles)


def render_issues_html(issues: list[dict[str, Any]]) -> str:
    if not issues:
        return '<div class="empty-hint">本次全量扫描零缺陷，可直接查看真机确认清单。</div>'
    cards: list[str] = []
    for idx, issue in enumerate(issues):
        iid = str(issue.get("id") or f"QA-{idx + 1:03d}")
        sev = str(issue.get("severity") or "P2").upper()
        if sev not in ("P0", "P1", "P2", "P3"):
            sev = "P2"
        status_key = str(issue.get("status") or "open")
        st_lbl, st_cls = STATUS_LABELS.get(status_key, ("未修复", "st-open"))
        ev_lbl = EVIDENCE_LABELS.get(str(issue.get("evidence") or "static_review"), "")
        dim_raw = str(issue.get("dimension") or "其他")
        dim_short = short_dim_label("", dim_raw)
        title = str(issue.get("title") or "未命名问题")
        one_liner = str(issue.get("one_liner") or issue.get("fix_summary") or "")
        one_liner_short = truncate_text(one_liner, 42)
        location = str(issue.get("location") or "-")
        repro = str(issue.get("repro") or "")
        root_cause = str(issue.get("root_cause") or "")
        fix_summary = str(issue.get("fix_summary") or "")
        verification = str(issue.get("verification") or "")
        before_snip = str(issue.get("before_snippet") or "")
        after_snip = str(issue.get("after_snippet") or "")
        changed = issue.get("changed_files") or []

        diff_html = ""
        if before_snip or after_snip:
            diff_html = f"""
            <div class="diff-grid">
              <div class="diff-box diff-before">
                <div class="diff-head">修复前</div>
                <pre><code>{esc(before_snip or "-")}</code></pre>
              </div>
              <div class="diff-box diff-after">
                <div class="diff-head">修复后</div>
                <pre><code>{esc(after_snip or "-")}</code></pre>
              </div>
            </div>
            """

        files_html = ""
        if changed:
            preview = ", ".join(str(p) for p in changed[:4])
            if len(changed) > 4:
                preview += f" 等 {len(changed)} 个文件"
            files_html = f'<div class="meta-line"><strong>改动文件：</strong><code>{esc(preview)}</code></div>'

        # Only auto-open if STILL UNFIXED P0; all fixed items stay neatly collapsed!
        open_attr = " open" if (sev == "P0" and status_key == "open") else ""

        cards.append(f"""
        <details class="issue-row sev-border-{sev.lower()}"
                 data-sev="{esc(sev)}"
                 data-status="{esc(status_key)}"{open_attr}>
          <summary class="issue-head">
            <div class="issue-left">
              <span class="sev-badge sev-{sev.lower()}">{esc(sev)}</span>
              <span class="issue-title">{esc(title)}</span>
              <span class="issue-brief">{esc(one_liner_short)}</span>
            </div>
            <div class="issue-right">
              <span class="dim-mini">{esc(dim_short)}</span>
              <span class="pill {st_cls}">{esc(st_lbl)}</span>
              <span class="chev">▸</span>
            </div>
          </summary>
          <div class="issue-detail">
            <div class="meta-line">
              <strong>位置：</strong><code>{esc(location)}</code>
              <span class="sep">·</span>
              <strong>编号：</strong><code>{esc(iid)}</code>
              <span class="sep">·</span>
              <strong>证据：</strong><span>{esc(ev_lbl)}</span>
            </div>
            <div class="kv-grid">
              <div class="kv-box"><span>问题表现</span><p>{esc(repro or root_cause or "-")}</p></div>
              <div class="kv-box"><span>修复与复测</span><p>{esc(fix_summary or "-")}{f"（{esc(verification)}）" if verification else ""}</p></div>
            </div>
            {diff_html}
            {files_html}
          </div>
        </details>
        """)
    return "\n".join(cards)


def render_save_fields_html(save_upgrade: dict[str, Any]) -> str:
    fields = save_upgrade.get("field_checks") or []
    if not fields:
        return '<div class="empty-hint">无存档字段变更记录。</div>'
    rows = []
    for f in fields:
        compat = f.get("compatible")
        if compat is True:
            c_html = '<span class="pill chk-pass">兼容</span>'
        elif compat is False:
            c_html = '<span class="pill chk-fail">不兼容</span>'
        else:
            c_html = '<span class="pill chk-warn">待确认</span>'
        rows.append(f"""
        <tr>
          <td><code>{esc(f.get("field", "-"))}</code></td>
          <td>{esc(truncate_text(str(f.get("change", "-")), 24))}</td>
          <td>{c_html}</td>
          <td class="muted-cell">{esc(f.get("note", ""))}</td>
        </tr>
        """)
    return f"""
    <div class="table-wrap">
      <table>
        <thead><tr><th>字段</th><th>变化</th><th>结论</th><th>说明</th></tr></thead>
        <tbody>{"".join(rows)}</tbody>
      </table>
    </div>
    """


def render_changed_files_html(changed_files: list[dict[str, Any]]) -> str:
    if not changed_files:
        return '<div class="empty-hint">本次未改动文件。</div>'
    rows = []
    for cf in changed_files:
        ct_lbl, ct_cls = CHANGE_TYPE_LABELS.get(str(cf.get("change_type", "modified")), ("改", "ct-mod"))
        rows.append(f"""
        <div class="compact-line">
          <span class="pill {ct_cls}">{esc(ct_lbl)}</span>
          <code class="path-code">{esc(cf.get("path", ""))}</code>
          <span class="line-desc">{esc(truncate_text(str(cf.get("summary", "")), 44))}</span>
        </div>
        """)
    return "\n".join(rows)


def render_checks_strip_html(checks: list[dict[str, Any]]) -> str:
    if not checks:
        return ""
    chips = []
    for chk in checks:
        st_lbl, st_cls = CHECK_STATUS_LABELS.get(str(chk.get("status", "skipped")), ("未运行", "chk-skip"))
        detail = str(chk.get("detail") or "")
        chips.append(
            f'<div class="chk-pill-item" title="{esc(detail)}">'
            f'<span class="pill {st_cls}">{esc(st_lbl)}</span>'
            f'<span>{esc(chk.get("name", ""))}</span>'
            f'</div>'
        )
    return "\n".join(chips)


def render_manual_checklist_html(items: list[dict[str, Any]]) -> str:
    if not items:
        items = [
            {"id": "CHK-1", "category": "真机体验", "title": "真机试玩首局到结算与重开", "detail": "确认刘海屏安全区、触控与切后台恢复正常。"},
            {"id": "CHK-2", "category": "平台能力", "title": "真机复核广告、云存档与老档覆盖升级", "detail": "本地预览不替代真机平台表现。"},
        ]
    rows = []
    for idx, item in enumerate(items):
        cid = str(item.get("id") or f"CHK-{idx + 1:02d}")
        rows.append(f"""
        <label class="chk-item">
          <input type="checkbox" class="manual-box" data-id="{esc(cid)}">
          <div class="chk-content">
            <div class="chk-title-row">
              <span class="dim-mini">{esc(item.get("category", "核对"))}</span>
              <span class="chk-title">{esc(item.get("title", ""))}</span>
            </div>
            <div class="chk-desc">{esc(item.get("detail", ""))}</div>
          </div>
        </label>
        """)
    return "\n".join(rows)


def render_html(data: dict[str, Any]) -> str:
    meta = data.get("meta") or {}
    verdict = data.get("verdict") or {}
    save_upgrade = data.get("save_upgrade") or {}
    issues = data.get("issues") or []
    checks = data.get("checks") or []
    dimensions = data.get("dimensions") or []
    changed_files = data.get("changed_files") or []
    manual_checklist = data.get("manual_checklist") or []

    default_before = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
    default_after = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
    for iss in issues:
        s = str(iss.get("severity", "P2")).upper()
        if s in default_before:
            default_before[s] += 1
            if iss.get("status") not in ("fixed_verified", "fixed_pending_device"):
                default_after[s] += 1

    before = {k: int((data.get("summary_before") or default_before).get(k, 0)) for k in ("P0", "P1", "P2", "P3")}
    after = {k: int((data.get("summary_after") or default_after).get(k, 0)) for k in ("P0", "P1", "P2", "P3")}

    total_before = sum(before.values())
    total_after = sum(after.values())
    fixed_count = sum(1 for i in issues if i.get("status") in ("fixed_verified", "fixed_pending_device"))
    if fixed_count == 0 and total_before > total_after:
        fixed_count = total_before - total_after

    v_status = str(verdict.get("status") or ("block" if after["P0"] > 0 else ("warn" if after["P1"] > 0 else "pass")))
    if v_status not in VERDICT_META:
        v_status = "warn"
    vm = VERDICT_META[v_status]
    score = clamp_score(verdict.get("score", 100 if total_after == 0 else max(0, 100 - after["P0"] * 35 - after["P1"] * 15 - after["P2"] * 4 - after["P3"])))

    su_status = str(save_upgrade.get("status") or "unknown")
    su_def_lbl, su_icon, su_pill_cls, su_color = SAVE_UPGRADE_META.get(su_status, SAVE_UPGRADE_META["unknown"])
    su_label = str(save_upgrade.get("verdict_label") or su_def_lbl)
    su_ver_span = ""
    if save_upgrade.get("from_version") or save_upgrade.get("to_version"):
        su_ver_span = f'{save_upgrade.get("from_version") or "旧版"} → {save_upgrade.get("to_version") or "新版"}'
    su_short = truncate_text(str(save_upgrade.get("migration_summary") or "详情见「老存档与改动」标签页"), 48)

    # Explicit Yes / No upload recommendation
    raw_can_upload = verdict.get("can_upload")
    if isinstance(raw_can_upload, bool):
        can_upload = raw_can_upload
    else:
        can_upload = (v_status != "block") and (after["P0"] == 0) and (after["P1"] == 0) and (su_status != "breaking")
    upload_ans = "是" if can_upload else "否"
    upload_icon = "✓" if can_upload else "✕"
    upload_color = "#10b981" if can_upload else "#ef4444"
    upload_bg = "rgba(16, 185, 129, 0.14)" if can_upload else "rgba(239, 68, 68, 0.16)"
    upload_border = "rgba(16, 185, 129, 0.5)" if can_upload else "rgba(239, 68, 68, 0.55)"
    default_reason = (
        "P0/P1 已清零且老存档兼容，可直接构建上传"
        if can_upload
        else f"仍有 P0({after['P0']}) / P1({after['P1']}) 或不兼容风险，暂勿上传"
    )
    upload_reason = truncate_text(str(verdict.get("upload_reason") or default_reason), 34)

    game_name = str(meta.get("game_name") or "TapTap Maker 游戏")
    generated_at = str(meta.get("generated_at") or datetime.now().strftime("%Y-%m-%d %H:%M"))
    storage_key = f"taptap_maker_qa_v2::{game_name}::{generated_at}"

    sev_counts = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
    for iss in issues:
        s = str(iss.get("severity") or "P2").upper()
        if s in sev_counts:
            sev_counts[s] += 1

    manual_cnt = len(manual_checklist) if manual_checklist else 2

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(game_name)} · QA 体检看板</title>
<style>
  body {{
    --bg: #0b1120;
    --card: #111827;
    --card-2: #162033;
    --border: rgba(148, 163, 184, 0.16);
    --text: #f1f5f9;
    --muted: #94a3b8;
    --accent: #38bdf8;
    --ok: #10b981;
    --warn: #f59e0b;
    --bad: #ef4444;
    --font: "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
    --mono: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
    margin: 0;
    background: radial-gradient(circle at 15% 0%, rgba(56, 189, 248, 0.08), transparent 40%), var(--bg);
    color: var(--text);
    font-family: var(--font);
    line-height: 1.5;
    padding: 20px 18px 48px;
  }}
  * {{ box-sizing: border-box; }}
  .wrap {{ max-width: 1200px; margin: 0 auto; }}

  /* Top Compact Decision Strip (Optimized for both 720px IDE side-pane & 1280px browser) */
  .top-row {{
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 12px;
    margin-bottom: 12px;
  }}
  .sub-row {{
    display: grid;
    grid-template-columns: 1.45fr repeat(3, minmax(84px, 0.55fr));
    gap: 10px;
    margin-bottom: 14px;
  }}
  .upload-card {{
    background: linear-gradient(160deg, {upload_bg}, rgba(17, 24, 39, 0.96));
    border: 1.5px solid {upload_border};
    border-radius: 15px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 5px;
  }}
  .upload-q {{ font-size: 12px; color: #cbd5e1; font-weight: 600; }}
  .upload-ans {{
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 30px;
    font-weight: 900;
    line-height: 1.1;
    color: {upload_color};
  }}
  .upload-badge {{
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: {upload_color};
    color: #0b1120;
    font-size: 16px;
    font-weight: 900;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }}
  .upload-reason {{ font-size: 11.5px; color: #cbd5e1; line-height: 1.35; }}
  .hero-card {{
    background: linear-gradient(135deg, #111827, #172033);
    border: 1px solid {vm["border"]};
    border-radius: 15px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }}
  .hero-card svg {{ flex-shrink: 0; width: 84px; height: 84px; }}
  .hero-info {{ flex: 1; min-width: 0; }}
  .gate-pill {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    color: {vm["color"]};
    background: {vm["bg"]};
    border: 1px solid {vm["border"]};
    margin-bottom: 6px;
  }}
  .gate-dot {{
    width: 16px; height: 16px; border-radius: 50%;
    background: {vm["color"]}; color: #0b1120;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 900;
  }}
  h1 {{ margin: 0 0 4px; font-size: 19px; letter-spacing: -0.01em; }}
  .hero-sub {{ margin: 0; font-size: 13px; color: #cbd5e1; }}
  .hero-meta {{ margin-top: 6px; font-size: 11.5px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 6px 10px; }}

  .save-card {{
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 4px solid {su_color};
    border-radius: 12px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }}
  .save-top {{ display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-bottom: 3px; }}
  .save-title {{ font-size: 12px; color: var(--muted); font-weight: 600; }}
  .save-verdict {{ font-size: 15px; font-weight: 800; color: {su_color}; display: inline-flex; align-items: center; gap: 5px; }}
  .save-note {{ font-size: 12px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}

  .mini-kpi {{
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }}
  .mk-label {{ font-size: 11px; color: var(--muted); }}
  .mk-val {{ font-size: 18px; font-weight: 800; margin-top: 2px; font-family: var(--mono); white-space: nowrap; }}
  .c-ok {{ color: var(--ok); }}
  .c-bad {{ color: var(--bad); }}
  .c-warn {{ color: var(--warn); }}

  /* 3 Visual Charts Row (Bounded SVG height: never stretches huge in side pane!) */
  .charts-grid {{
    display: grid;
    grid-template-columns: 1.05fr 1.05fr 0.9fr;
    gap: 12px;
    margin-bottom: 14px;
  }}
  .card {{
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 16px;
    min-width: 0;
  }}
  .card-head {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }}
  .card-title {{ margin: 0; font-size: 14px; font-weight: 700; }}
  .chart-legend {{ display: flex; gap: 10px; font-size: 11px; color: var(--muted); }}
  .lg-item {{ display: inline-flex; align-items: center; gap: 4px; }}
  .dot {{ width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }}
  .chart-svg {{ width: 100%; max-width: 340px; max-height: 220px; height: auto; display: block; margin: 0 auto; }}
  .donut-svg {{ width: 116px; height: 116px; flex-shrink: 0; }}

  .donut-wrap {{
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    min-height: 180px;
  }}
  .donut-legend {{ display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 110px; }}
  .legend-item {{
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
  }}
  .leg-name {{ flex: 1; color: #cbd5e1; white-space: nowrap; }}
  .leg-pct {{ font-size: 11px; color: var(--muted); width: 32px; text-align: right; font-family: var(--mono); }}

  /* Tabs Workspace */
  .tabs-bar {{
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }}
  .tabs {{
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    background: var(--card);
    border: 1px solid var(--border);
    padding: 5px;
    border-radius: 12px;
  }}
  .tab-btn {{
    background: transparent;
    border: none;
    color: var(--muted);
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font);
    transition: background 0.15s, color 0.15s;
  }}
  .tab-btn:hover {{ color: var(--text); }}
  .tab-btn.active {{ background: rgba(56, 189, 248, 0.18); color: #f8fafc; }}
  .tab-panel {{ display: none; }}
  .tab-panel.active {{ display: block; }}

  .util-btn {{
    background: var(--card);
    color: #cbd5e1;
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 7px 12px;
    font-size: 12.5px;
    cursor: pointer;
    font-family: var(--font);
  }}
  .util-btn:hover {{ border-color: rgba(56, 189, 248, 0.5); color: #fff; }}

  /* Compact Single-Line Collapsible Issues */
  .filter-strip {{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
  }}
  .f-btn {{
    border: 1px solid var(--border);
    background: transparent;
    color: #cbd5e1;
    border-radius: 999px;
    padding: 4px 11px;
    font-size: 12px;
    cursor: pointer;
    font-family: var(--font);
  }}
  .f-btn.active {{ background: rgba(56, 189, 248, 0.2); border-color: var(--accent); color: #fff; font-weight: 600; }}
  .f-input {{
    margin-left: auto;
    background: #0f172a;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12.5px;
    min-width: 190px;
    font-family: var(--font);
  }}
  .issues-list {{ display: flex; flex-direction: column; gap: 8px; }}
  .issue-row {{
    background: var(--card-2);
    border: 1px solid var(--border);
    border-left-width: 4px;
    border-radius: 10px;
    overflow: hidden;
  }}
  .sev-border-p0 {{ border-left-color: var(--bad); }}
  .sev-border-p1 {{ border-left-color: var(--warn); }}
  .sev-border-p2 {{ border-left-color: var(--accent); }}
  .sev-border-p3 {{ border-left-color: var(--muted); }}
  .issue-head {{
    list-style: none;
    cursor: pointer;
    padding: 11px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }}
  .issue-head::-webkit-details-marker {{ display: none; }}
  .issue-left {{ display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }}
  .issue-title {{ font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .issue-brief {{ font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .issue-right {{ display: flex; align-items: center; gap: 8px; flex-shrink: 0; }}
  .chev {{ color: var(--muted); transition: transform 0.15s; font-size: 12px; }}
  .issue-row[open] .chev {{ transform: rotate(90deg); }}

  .issue-detail {{
    padding: 12px 14px 14px;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(11, 17, 32, 0.45);
  }}
  .meta-line {{ font-size: 12px; color: var(--muted); margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }}
  .meta-line code {{ font-family: var(--mono); color: #cbd5e1; background: rgba(15,23,42,0.85); padding: 1px 6px; border-radius: 4px; }}
  .sep {{ opacity: 0.45; }}
  .kv-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }}
  .kv-box {{ background: rgba(15,23,42,0.6); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; }}
  .kv-box span {{ display: block; font-size: 11px; color: var(--muted); font-weight: 700; margin-bottom: 3px; }}
  .kv-box p {{ margin: 0; font-size: 12.5px; color: #e2e8f0; }}

  .diff-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 8px; }}
  .diff-box {{ border-radius: 8px; border: 1px solid var(--border); background: #090e1a; overflow: hidden; }}
  .diff-head {{ font-size: 11px; font-weight: 700; padding: 5px 10px; font-family: var(--mono); }}
  .diff-before .diff-head {{ background: rgba(239,68,68,0.16); color: #fca5a5; }}
  .diff-after .diff-head {{ background: rgba(16,185,129,0.16); color: #6ee7b7; }}
  .diff-box pre {{ margin: 0; padding: 9px 10px; font-family: var(--mono); font-size: 11.5px; overflow-x: auto; color: #e2e8f0; }}

  /* 8 Dimension Compact Tiles */
  .dim-grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }}
  .dim-tile {{
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 13px 14px;
  }}
  .dim-tile-top {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }}
  .dim-tile-name {{ font-weight: 700; font-size: 14px; }}
  .dim-tile-pills {{ display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }}
  .dim-tile-note {{ font-size: 12px; color: var(--muted); }}
  .cnt-flow {{ font-family: var(--mono); font-size: 13px; font-weight: 800; }}
  .cnt-clear {{ color: var(--ok); }}
  .cnt-remain {{ color: var(--warn); }}

  /* Tab 3: Save & Files */
  .two-col {{ display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 14px; }}
  .table-wrap {{ overflow-x: auto; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
  th {{ text-align: left; color: var(--muted); font-size: 11.5px; padding: 8px 10px; border-bottom: 1px solid var(--border); }}
  td {{ padding: 9px 10px; border-bottom: 1px solid rgba(148,163,184,0.1); }}
  td code {{ font-family: var(--mono); font-size: 11.5px; color: #cbd5e1; }}
  .muted-cell {{ color: var(--muted); }}
  .compact-line {{
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    background: var(--card-2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 7px; font-size: 12.5px;
  }}
  .path-code {{ font-family: var(--mono); font-size: 12px; color: #e2e8f0; white-space: nowrap; }}
  .line-desc {{ color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  .checks-strip {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }}
  .chk-pill-item {{ display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #cbd5e1; background: var(--card-2); padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border); }}

  /* Tab 4: Checklist */
  .chk-progress {{ height: 7px; border-radius: 999px; background: rgba(148,163,184,0.16); overflow: hidden; margin-bottom: 12px; }}
  .chk-progress-bar {{ height: 100%; background: var(--ok); width: 0%; transition: width 0.2s; }}
  .chk-list {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }}
  .chk-item {{
    display: flex; align-items: flex-start; gap: 10px; cursor: pointer;
    background: var(--card-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px;
  }}
  .chk-item.checked {{ opacity: 0.6; border-color: rgba(16,185,129,0.4); }}
  .chk-item.checked .chk-title {{ text-decoration: line-through; }}
  .manual-box {{ margin-top: 3px; width: 16px; height: 16px; accent-color: var(--ok); flex-shrink: 0; }}
  .chk-title-row {{ display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }}
  .chk-title {{ font-weight: 700; font-size: 13.5px; }}
  .chk-desc {{ font-size: 12px; color: var(--muted); }}

  /* Badges */
  .pill, .sev-badge, .dim-mini {{
    display: inline-flex; align-items: center; border-radius: 999px;
    font-size: 11px; padding: 2px 8px; font-weight: 700; white-space: nowrap;
  }}
  .dim-mini {{ background: rgba(148,163,184,0.12); color: #cbd5e1; }}
  .sev-badge {{ border-radius: 6px; font-family: var(--mono); padding: 2px 7px; }}
  .sev-p0 {{ background: rgba(239,68,68,0.22); color: #fca5a5; }}
  .sev-p1 {{ background: rgba(245,158,11,0.2); color: #fcd34d; }}
  .sev-p2 {{ background: rgba(56,189,248,0.18); color: #7dd3fc; }}
  .sev-p3 {{ background: rgba(148,163,184,0.16); color: #cbd5e1; }}
  .chk-pass, .st-fixed {{ background: rgba(16,185,129,0.16); color: #34d399; }}
  .chk-warn, .st-pending {{ background: rgba(245,158,11,0.16); color: #fbbf24; }}
  .chk-fail, .st-open {{ background: rgba(239,68,68,0.18); color: #f87171; }}
  .chk-na, .chk-skip, .st-deferred {{ background: rgba(148,163,184,0.15); color: #94a3b8; }}
  .ct-mod {{ background: rgba(56,189,248,0.16); color: #38bdf8; }}
  .ct-add {{ background: rgba(16,185,129,0.16); color: #34d399; }}
  .ct-meta {{ background: rgba(168,85,247,0.18); color: #d8b4fe; }}
  .ct-del {{ background: rgba(239,68,68,0.18); color: #f87171; }}
  .empty-hint {{ text-align: center; color: var(--muted); padding: 20px; font-size: 13px; }}
  .footer {{ margin-top: 18px; text-align: center; font-size: 11.5px; color: var(--muted); }}

  @media (max-width: 1060px) {{
    .charts-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    .donut-card {{ grid-column: span 2; }}
    .donut-wrap {{ min-height: 104px; justify-content: flex-start; gap: 20px; padding: 2px 8px; }}
    .donut-svg {{ width: 92px; height: 92px; }}
    .donut-legend {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 8px 18px; }}
    .dim-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    .two-col, .kv-grid, .diff-grid, .chk-list {{ grid-template-columns: 1fr; }}
    .issue-brief {{ display: none; }}
  }}
  @media (max-width: 600px) {{
    .top-row, .sub-row, .charts-grid {{ grid-template-columns: 1fr; }}
    .donut-card {{ grid-column: span 1; }}
  }}
  @media print {{
    body {{ background: #fff; color: #111; padding: 0; }}
    .hero-card, .upload-card, .card, .save-card, .mini-kpi, .issue-row, .dim-tile {{ background: #fff !important; color: #111 !important; border-color: #cbd5e1 !important; }}
    .tabs-bar, .filter-strip {{ display: none !important; }}
    .tab-panel {{ display: block !important; margin-bottom: 16px; }}
  }}
</style>
</head>
<body>
<div class="wrap">
  <!-- 1. 一屏总览：第一行（健康分+游戏名 | 是否建议构建上传），第二行（老存档结论 | 3 个核心数字） -->
  <section class="top-row">
    <div class="hero-card">
      {build_score_ring_svg(score, vm["color"])}
      <div class="hero-info">
        <div class="gate-pill"><span class="gate-dot">{vm["icon"]}</span><span>{esc(verdict.get("title") or vm["badge"])}</span></div>
        <h1>{esc(game_name)}</h1>
        <p class="hero-sub">{esc(truncate_text(str(verdict.get("summary") or "已完成全量检测与自动修复。"), 68))}</p>
        <div class="hero-meta">
          <span>{esc(meta.get("mode") or "TapTap Maker")}</span>
          <span>·</span>
          <span>{esc(generated_at)}</span>
          {f'<span>·</span><span>{esc(truncate_text(str(meta.get("maker_binding")), 32))}</span>' if meta.get("maker_binding") else ''}
        </div>
      </div>
    </div>

    <div class="upload-card" aria-label="是否建议构建上传：{upload_ans}">
      <div class="upload-q">是否建议构建上传</div>
      <div class="upload-ans">
        <span class="upload-badge">{upload_icon}</span>
        <span>{upload_ans}</span>
      </div>
      <div class="upload-reason">{esc(upload_reason)}</div>
    </div>
  </section>

  <section class="sub-row">
    <div class="save-card" title="{esc(save_upgrade.get('migration_summary') or '')}">
      <div class="save-top">
        <span class="save-title">老存档直升</span>
        <span class="save-verdict"><span>{su_icon}</span><span>{esc(su_label)}</span></span>
        {f'<span class="dim-mini">{esc(truncate_text(su_ver_span, 24))}</span>' if su_ver_span else ''}
      </div>
      <div class="save-note">{esc(su_short)}</div>
    </div>
    <div class="mini-kpi">
      <div class="mk-label">发现 → 剩余</div>
      <div class="mk-val">{total_before} → <span class="{'c-ok' if total_after == 0 else 'c-warn'}">{total_after}</span></div>
    </div>
    <div class="mini-kpi">
      <div class="mk-label">P0 阻断</div>
      <div class="mk-val {'c-ok' if after['P0'] == 0 else 'c-bad'}">{before['P0']} → {after['P0']}</div>
    </div>
    <div class="mini-kpi">
      <div class="mk-label">已自动修复</div>
      <div class="mk-val c-ok">{fixed_count} 项</div>
    </div>
  </section>

  <!-- 2. 三大核心视觉图表：看图不看字 -->
  <section class="charts-grid">
    <div class="card">
      <div class="card-head">
        <h2 class="card-title">8 维健康度雷达</h2>
        <div class="chart-legend">
          <span class="lg-item"><span class="dot" style="background:#f59e0b"></span>修前</span>
          <span class="lg-item"><span class="dot" style="background:#10b981"></span>修后</span>
        </div>
      </div>
      {build_radar_svg(dimensions)}
    </div>

    <div class="card">
      <div class="card-head">
        <h2 class="card-title">修复前后清零对比</h2>
        <div class="chart-legend">
          <span class="lg-item"><span class="dot" style="background:rgba(148,163,184,0.5)"></span>初检</span>
          <span class="lg-item"><span class="dot" style="background:#10b981"></span>复测</span>
        </div>
      </div>
      {build_bar_chart_svg(before, after)}
    </div>

    <div class="card donut-card">
      <div class="card-head">
        <h2 class="card-title">问题分布占比</h2>
        <span class="dim-mini">按维度</span>
      </div>
      {build_donut_chart_html(issues)}
    </div>
  </section>

  <!-- 3. 分页明细区（默认只看精简清单，不无限堆字） -->
  <div class="tabs-bar">
    <div class="tabs" role="tablist">
      <button class="tab-btn active" data-tab="tab-issues" type="button">修复清单 ({len(issues)})</button>
      <button class="tab-btn" data-tab="tab-dims" type="button">8 大维度</button>
      <button class="tab-btn" data-tab="tab-save" type="button">老存档 & 改动 ({len(changed_files)})</button>
      <button class="tab-btn" data-tab="tab-manual" type="button">真机核对 ({manual_cnt})</button>
    </div>
    <button class="util-btn" onclick="window.print()" type="button">打印 / 导出 PDF</button>
  </div>

  <!-- Tab 1: 折叠单行缺陷列表 -->
  <section class="card tab-panel active" id="tab-issues">
    <div class="filter-strip">
      <button class="f-btn active" data-sev="ALL" type="button">全部 ({len(issues)})</button>
      <button class="f-btn" data-sev="P0" type="button">P0 ({sev_counts['P0']})</button>
      <button class="f-btn" data-sev="P1" type="button">P1 ({sev_counts['P1']})</button>
      <button class="f-btn" data-sev="P2" type="button">P2 ({sev_counts['P2']})</button>
      <button class="f-btn" data-sev="P3" type="button">P3 ({sev_counts['P3']})</button>
      <input class="f-input" id="searchInput" type="search" placeholder="搜索问题或文件（点击条目可展开详情）...">
    </div>
    <div class="issues-list" id="issuesList">
      {render_issues_html(issues)}
    </div>
    <div class="empty-hint" id="noMatchHint" style="display:none;">无匹配条目。</div>
  </section>

  <!-- Tab 2: 8 大维度清爽卡片 -->
  <section class="card tab-panel" id="tab-dims">
    <div class="dim-grid">
      {render_dim_tiles_html(dimensions)}
    </div>
    <div class="checks-strip">
      {render_checks_strip_html(checks)}
    </div>
  </section>

  <!-- Tab 3: 老存档字段表 & 修改文件 -->
  <section class="card tab-panel" id="tab-save">
    <div class="two-col">
      <div>
        <div class="card-head"><h2 class="card-title">老版本存档兼容明细</h2><span class="pill {su_pill_cls}">{esc(su_label)}</span></div>
        <p style="margin:0 0 10px;font-size:12.5px;color:#cbd5e1;">{esc(save_upgrade.get("migration_summary") or "")}</p>
        {render_save_fields_html(save_upgrade)}
      </div>
      <div>
        <div class="card-head"><h2 class="card-title">本次改动文件</h2><span class="dim-mini">{len(changed_files)} 个</span></div>
        {render_changed_files_html(changed_files)}
      </div>
    </div>
  </section>

  <!-- Tab 4: 真机最后确认 -->
  <section class="card tab-panel" id="tab-manual">
    <div class="card-head">
      <h2 class="card-title">构建上传前真机核对</h2>
      <span class="dim-mini" id="chkStat">已确认 0 / 0</span>
    </div>
    <div class="chk-progress"><div class="chk-progress-bar" id="chkProgressBar"></div></div>
    <div class="chk-list">
      {render_manual_checklist_html(manual_checklist)}
    </div>
  </section>

  <footer class="footer">
    taptap-maker-qa · 离线单文件图表看板 · 确认真机无误后再手动授权构建上传
  </footer>
</div>

<script>
(function() {{
  // Tabs
  const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  tabBtns.forEach(btn => {{
    btn.addEventListener('click', () => {{
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    }});
  }});

  // Issue filter
  const rows = Array.from(document.querySelectorAll('.issue-row'));
  const searchInput = document.getElementById('searchInput');
  const noMatch = document.getElementById('noMatchHint');
  let activeSev = 'ALL';

  function applyFilter() {{
    const q = (searchInput ? searchInput.value : '').trim().toLowerCase();
    let vis = 0;
    rows.forEach(r => {{
      const ok = (activeSev === 'ALL' || r.dataset.sev === activeSev) && (!q || (r.textContent || '').toLowerCase().includes(q));
      r.style.display = ok ? '' : 'none';
      if (ok) vis++;
    }});
    if (noMatch) noMatch.style.display = (rows.length > 0 && vis === 0) ? '' : 'none';
  }}

  document.querySelectorAll('.filter-strip .f-btn').forEach(btn => {{
    btn.addEventListener('click', () => {{
      document.querySelectorAll('.filter-strip .f-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSev = btn.dataset.sev;
      applyFilter();
    }});
  }});
  if (searchInput) searchInput.addEventListener('input', applyFilter);

  // Persistent real-device checklist
  const KEY = {json.dumps(storage_key, ensure_ascii=False)};
  const boxes = Array.from(document.querySelectorAll('.manual-box'));
  const statEl = document.getElementById('chkStat');
  const barEl = document.getElementById('chkProgressBar');
  let saved = {{}};
  try {{ saved = JSON.parse(localStorage.getItem(KEY) || '{{}}'); }} catch (e) {{ saved = {{}}; }}

  function syncChecklist() {{
    let done = 0;
    boxes.forEach(b => {{
      const item = b.closest('.chk-item');
      if (b.checked) {{ done++; if (item) item.classList.add('checked'); }}
      else {{ if (item) item.classList.remove('checked'); }}
    }});
    if (statEl) statEl.textContent = '已确认 ' + done + ' / ' + boxes.length;
    if (barEl) barEl.style.width = (boxes.length ? (done / boxes.length) * 100 : 0) + '%';
  }}

  boxes.forEach(b => {{
    if (saved[b.dataset.id]) b.checked = true;
    b.addEventListener('change', () => {{
      saved[b.dataset.id] = b.checked;
      try {{ localStorage.setItem(KEY, JSON.stringify(saved)); }} catch (e) {{}}
      syncChecklist();
    }});
  }});
  syncChecklist();
}})();
</script>
</body>
</html>
"""


def compact_html(raw: str) -> str:
    """Compact CSS and inter-tag indentation while keeping <pre> and <script> verbatim."""
    def _min_style(match: re.Match[str]) -> str:
        css = re.sub(r"/\*.*?\*/", "", match.group(1), flags=re.S)
        css = re.sub(r"\s+", " ", css)
        css = re.sub(r"\s*([{}:;,])\s*", r"\1", css)
        return f"<style>{css.strip()}</style>"

    out = re.sub(r"<style>(.*?)</style>", _min_style, raw, flags=re.S)
    # Protect <pre>...</pre> and <script>...</script> blocks before trimming indentation
    saved_blocks: list[str] = []

    def _stash(match: re.Match[str]) -> str:
        idx = len(saved_blocks)
        saved_blocks.append(match.group(0))
        return f"__STASH_BLOCK_{idx}__"

    out = re.sub(r"<pre>.*?</pre>|<script>.*?</script>", _stash, out, flags=re.S)
    out = re.sub(r"<!--.*?-->", "", out, flags=re.S)
    out = re.sub(r">\s+<", "><", out)
    lines = [line.strip() for line in out.splitlines() if line.strip()]
    out = "\n".join(lines)
    for idx, block in enumerate(saved_blocks):
        out = out.replace(f"__STASH_BLOCK_{idx}__", block)
    return out + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render TapTap Maker QA JSON report into visual chart HTML dashboard")
    parser.add_argument("--input", required=True, help="Input QA report JSON file path")
    parser.add_argument("--output", required=True, help="Output standalone HTML file path")
    parser.add_argument("--open", action="store_true", help="Open the generated HTML report in the default browser")
    args = parser.parse_args()

    in_path = Path(args.input).resolve()
    if not in_path.exists():
        print(f"输入 JSON 不存在: {in_path}", file=sys.stderr)
        return 2

    try:
        data = json.loads(in_path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        print(f"解析输入 JSON 失败: {exc}", file=sys.stderr)
        return 2

    if not isinstance(data, dict):
        print("输入 JSON 根节点必须为对象", file=sys.stderr)
        return 2

    out_path = Path(args.output).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    html_text = compact_html(render_html(data))
    out_path.write_text(html_text, encoding="utf-8")

    print(json.dumps({
        "status": "ok",
        "output": str(out_path),
        "bytes": len(html_text.encode("utf-8")),
    }, ensure_ascii=False))

    if args.open:
        try:
            webbrowser.open(out_path.as_uri())
        except Exception as exc:
            print(f"自动打开浏览器失败（报告已正常生成）: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
