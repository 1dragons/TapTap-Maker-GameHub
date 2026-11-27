#!/usr/bin/env python3
"""
GamePropel Game Diagnosis Visual Analytics Dashboard Generator (Chart-First Daylight Edition).

Converts a structured diagnosis JSON (see references/report-schema.md) into a single,
self-contained, offline-ready interactive HTML dashboard with zero external CDN dependencies.

Design philosophy:
- Chart-first, low text density: KPI gauges/sparklines, proportional SVG trapezoid funnel,
  multi-series SVG line/bar/donut analytics charts, priority scatter + 3-axis bars, and
  per-recommendation before/after or gap visual charts.
- Progressive disclosure: full 7-element evidence & 9-item experiment drafts are neatly tucked
  into expandable drawers so the main canvas stays scannable in seconds.
- Strictly eye-friendly daylight light palette (zero dark mode, zero harsh glare).
- Built-in secret redaction for ga_org_*, ga_admin_*, ga_setup_*.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any


SECRET_PATTERN = re.compile(r"\bga_(?:org|admin|setup)_[A-Za-z0-9_\-]{4,}\b")

LEVEL_SCORE = {"high": 3, "medium": 2, "low": 1}
COST_EASE = {"low": 3, "medium": 2, "high": 1}
LEVEL_ZH = {"high": "高", "medium": "中", "low": "低"}
EVIDENCE_ZH = {"high": "强", "medium": "中", "low": "弱"}

NODE_TYPE_META = {
    "required": ("必经", "#2563EB", "#DBEAFE"),
    "optional": ("可选", "#7C3AED", "#EDE9FE"),
    "branch": ("分支", "#0D9488", "#CCFBF1"),
    "anomaly": ("异常上报", "#D97706", "#FEF3C7"),
}

METRIC_STATUS_META = {
    "good": ("健康", "#059669", "ms-good"),
    "warn": ("需关注", "#D97706", "ms-warn"),
    "bad": ("核心瓶颈", "#DC2626", "ms-bad"),
    "neutral": ("基准", "#2563EB", "ms-neutral"),
    "anomaly": ("口径异常", "#D97706", "ms-anom"),
}

CAVEAT_META = {
    "info": ("口径说明", "cav-info"),
    "warn": ("口径注意", "cav-warn"),
    "anomaly": ("异常已剔除", "cav-anom"),
}

CAUSE_TYPE_META = {
    "primary": ("核心主因", "cause-primary"),
    "secondary": ("叠加因素", "cause-secondary"),
    "ruled_out": ("已排除", "cause-ruled-out"),
}

EXPERIMENT_9_LABELS = [
    ("target_game_and_cohort", "1. 目标游戏和人群"),
    ("hypothesis_and_metrics", "2. 假设与指标"),
    ("control_vs_treatment", "3. 对照组与实验组精确差异"),
    ("params_or_script", "4. 参数或脚本"),
    ("traffic", "5. 流量分配"),
    ("duration", "6. 实验周期"),
    ("potential_impact", "7. 潜在影响"),
    ("stop_loss", "8. 止损条件"),
    ("rollback", "9. 回滚方案"),
]

DEFAULT_PALETTE = ["#2563EB", "#059669", "#7C3AED", "#D97706", "#0D9488", "#E11D48"]


def redact_secrets(obj: Any, hits: list[str]) -> Any:
    if isinstance(obj, str):
        found = SECRET_PATTERN.findall(obj)
        if found:
            hits.extend(found)
            return SECRET_PATTERN.sub("[REDACTED_GAMEPROPEL_SECRET]", obj)
        return obj
    if isinstance(obj, list):
        return [redact_secrets(item, hits) for item in obj]
    if isinstance(obj, dict):
        return {k: redact_secrets(v, hits) for k, v in obj.items()}
    return obj


def esc(val: Any) -> str:
    if val is None:
        return ""
    return html.escape(str(val), quote=True)


def clamp_pct(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        return max(0.0, min(100.0, float(val)))
    except Exception:
        return None


def safe_float(val: Any) -> float | None:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except Exception:
        return None


def safe_rank(val: Any, fallback: int) -> int:
    try:
        return max(1, min(3, int(val)))
    except Exception:
        return max(1, min(3, fallback))


def fmt_int(val: Any) -> str:
    if val is None or val == "":
        return "-"
    try:
        return f"{int(val):,}"
    except Exception:
        return str(val)


def fmt_num(val: float, unit: str = "") -> str:
    if abs(val - round(val)) < 1e-6:
        s = f"{int(round(val))}"
    else:
        s = f"{val:.1f}"
    return f"{s}{unit}"


def wrap_text(text: str, max_units: float = 13.0, max_lines: int = 2) -> list[str]:
    """Wrap mixed CJK/ASCII text cleanly without splitting short ASCII words/numbers."""
    s = str(text or "").strip()
    if not s:
        return [""]
    # Tokenize into ASCII words/numbers (kept atomic if short) and individual CJK/punctuation chars
    tokens = re.findall(r"[A-Za-z0-9._/%+\-→]+|.", s)
    lines: list[str] = []
    cur = ""
    width = 0.0
    for tok in tokens:
        tw = sum(1.0 if ord(c) > 127 else 0.56 for c in tok)
        if cur and width + tw > max_units:
            lines.append(cur.rstrip())
            if len(lines) >= max_lines:
                lines[-1] = lines[-1][:-1] + "…" if len(lines[-1]) > 1 else lines[-1]
                return lines
            cur = tok.lstrip()
            width = sum(1.0 if ord(c) > 127 else 0.56 for c in cur)
        else:
            cur += tok
            width += tw
    if cur.strip():
        lines.append(cur.strip())
    return lines[:max_lines] or [""]


def svg_multiline(x: float, cy: float, lines: list[str], font_size: float = 11.5, fill: str = "#0F172A", weight: str = "600", line_h: float = 15.0) -> str:
    if not lines:
        return ""
    start_y = cy - (len(lines) - 1) * line_h / 2.0 + font_size * 0.35
    parts = [
        f'<text x="{x:.1f}" y="{start_y + i * line_h:.1f}" text-anchor="middle" fill="{fill}" font-size="{font_size}" font-weight="{weight}">{esc(ln)}</text>'
        for i, ln in enumerate(lines)
    ]
    return "".join(parts)


# ---------------------------------------------------------------------------
# 1. KPI Mini-Chart Renderers (Gauge Ring & Sparkline Area)
# ---------------------------------------------------------------------------
def build_kpi_gauge_svg(pct: float, color: str) -> str:
    r = 22
    c = 2 * math.pi * r
    off = c * (1.0 - max(0.0, min(100.0, pct)) / 100.0)
    return f"""
    <svg class="kpi-gauge" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
      <circle cx="28" cy="28" r="{r}" fill="none" stroke="#E8EDF4" stroke-width="6"/>
      <circle cx="28" cy="28" r="{r}" fill="none" stroke="{color}" stroke-width="6"
              stroke-linecap="round" stroke-dasharray="{c:.2f}" stroke-dashoffset="{off:.2f}"
              transform="rotate(-90 28 28)"/>
      <text x="28" y="31.5" text-anchor="middle" fill="#1E293B" font-size="11" font-weight="700">{pct:.0f}%</text>
    </svg>
    """


def build_kpi_sparkline_svg(values: list[Any], color: str) -> str:
    nums = [safe_float(v) for v in values]
    nums = [v for v in nums if v is not None]
    if len(nums) < 2:
        return ""
    w, h = 92, 42
    pad = 4
    mn, mx = min(nums), max(nums)
    span = (mx - mn) if mx > mn else 1.0
    pts: list[tuple[float, float]] = []
    for i, v in enumerate(nums):
        x = pad + (w - 2 * pad) * (i / (len(nums) - 1))
        y = h - pad - (h - 2 * pad) * ((v - mn) / span)
        pts.append((x, y))
    line_d = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(pts))
    area_d = f"{line_d} L{pts[-1][0]:.1f},{h - 2} L{pts[0][0]:.1f},{h - 2} Z"
    lx, ly = pts[-1]
    return f"""
    <svg class="kpi-spark" viewBox="0 0 {w} {h}" width="{w}" height="{h}" aria-hidden="true">
      <path d="{area_d}" fill="{color}" fill-opacity="0.12"/>
      <path d="{line_d}" fill="none" stroke="{color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="{lx:.1f}" cy="{ly:.1f}" r="3.2" fill="{color}" stroke="#FFFFFF" stroke-width="1.5"/>
    </svg>
    """


def render_kpi_strip(metrics: list[dict[str, Any]]) -> str:
    if not metrics:
        return ""
    cards: list[str] = []
    for m in metrics:
        st = str(m.get("status") or "neutral").lower()
        st_lbl, color, st_cls = METRIC_STATUS_META.get(st, METRIC_STATUS_META["neutral"])
        val_str = str(m.get("value") or "-")
        caliber = str(m.get("caliber") or "")
        delta = str(m.get("delta") or "")
        note = str(m.get("note") or "")

        # Auto-infer gauge_pct if value looks like "31.4%" and neither gauge_pct nor sparkline is provided
        gauge_pct = clamp_pct(m.get("gauge_pct"))
        sparkline = m.get("sparkline")
        if gauge_pct is None and not sparkline and val_str.endswith("%"):
            gauge_pct = clamp_pct(val_str[:-1].strip())

        viz_html = ""
        if isinstance(sparkline, list) and len(sparkline) >= 2:
            viz_html = build_kpi_sparkline_svg(sparkline, color)
        elif gauge_pct is not None:
            viz_html = build_kpi_gauge_svg(gauge_pct, color)

        cards.append(
            f"""
            <div class="kpi-card">
              <div class="kpi-main">
                <div class="kpi-label-row">
                  <span class="kpi-label">{esc(m.get("label") or "指标")}</span>
                  <span class="kpi-status {st_cls}"><i></i>{esc(st_lbl)}</span>
                </div>
                <div class="kpi-value">{esc(val_str)}</div>
                <div class="kpi-foot">
                  {f'<span class="kpi-delta {st_cls}">{esc(delta)}</span>' if delta else ''}
                  {f'<span class="kpi-cal">{esc(caliber)}</span>' if caliber else ''}
                  {f'<span class="kpi-note">{esc(note)}</span>' if (note and not delta) else ''}
                </div>
              </div>
              {f'<div class="kpi-viz">{viz_html}</div>' if viz_html else ''}
            </div>
            """
        )
    return f"""
    <section class="section" id="sec-kpi">
      <div class="kpi-grid">{"".join(cards)}</div>
    </section>
    """


# ---------------------------------------------------------------------------
# 2. Proportional SVG Trapezoid Funnel Chart
# ---------------------------------------------------------------------------
def build_funnel_svg(steps: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    normal_steps = [s for s in steps if str(s.get("node_type") or "required").lower() != "anomaly"]
    anomaly_steps = [s for s in steps if str(s.get("node_type") or "required").lower() == "anomaly"]
    if not normal_steps:
        return '<div class="empty-text">暂无可绘制的漏斗节点。</div>', anomaly_steps

    svg_w = 680
    left_label_w = 188
    right_info_w = 148
    funnel_x0 = left_label_w
    funnel_w = svg_w - left_label_w - right_info_w
    funnel_cx = funnel_x0 + funnel_w / 2.0

    row_h = 54
    gap_h = 18
    pad_t = 14
    pad_b = 14
    n = len(normal_steps)
    svg_h = pad_t + pad_b + n * row_h + max(0, n - 1) * gap_h

    rates = [clamp_pct(s.get("rate")) or 0.0 for s in normal_steps]
    max_rate = max([100.0] + rates)

    def width_for(r: float) -> float:
        ratio = max(0.14, min(1.0, r / max_rate))
        return funnel_w * ratio

    elements: list[str] = []

    for i, step in enumerate(normal_steps):
        y = pad_t + i * (row_h + gap_h)
        r = rates[i]
        nt = str(step.get("node_type") or "required").lower()
        nt_lbl, color, soft_bg = NODE_TYPE_META.get(nt, NODE_TYPE_META["required"])
        rec_id = str(step.get("highlight_rec_id") or "")
        is_bottleneck = bool(rec_id)
        if is_bottleneck:
            color = "#E11D48"
            soft_bg = "#FFE4E6"

        top_w = width_for(r)
        # Taper slightly toward the next required step or gently by 6% for trapezoid shape
        if i + 1 < n:
            next_r = rates[i + 1]
            bot_w = width_for((r + next_r) / 2.0) if next_r <= r else top_w * 0.96
        else:
            bot_w = top_w * 0.90

        x_tl = funnel_cx - top_w / 2.0
        x_tr = funnel_cx + top_w / 2.0
        x_bl = funnel_cx - bot_w / 2.0
        x_br = funnel_cx + bot_w / 2.0
        y_bot = y + row_h

        name = str(step.get("name") or f"节点 {i + 1}")
        short_name = name if len(name) <= 13 else name[:12] + "…"
        users = step.get("users")
        step_conv = clamp_pct(step.get("step_conv"))
        note = str(step.get("note") or "")
        caliber = str(step.get("caliber_tag") or "")

        tooltip_text = f"{name}｜到达 {r:.1f}%"
        if step_conv is not None:
            tooltip_text += f"｜步转化 {step_conv:.1f}%"
        if users is not None:
            tooltip_text += f"｜{fmt_int(users)} 人"
        if note:
            tooltip_text += f"｜{note}"

        # Subtle background band for bottleneck
        if is_bottleneck:
            elements.append(
                f'<rect x="4" y="{y - 4}" width="{svg_w - 8}" height="{row_h + 8}" rx="10" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1"/>'
            )

        # Left label: step badge + name + node type
        elements.append(
            f"""
            <g class="funnel-step-g" data-tip="{esc(tooltip_text)}" {f'data-jump="rec-{esc(rec_id)}" style="cursor:pointer"' if rec_id else ''}>
              <rect x="12" y="{y + 10}" width="24" height="20" rx="6" fill="{soft_bg}"/>
              <text x="24" y="{y + 24}" text-anchor="middle" fill="{color}" font-size="10.5" font-weight="700">{i + 1:02d}</text>
              <text x="42" y="{y + 24}" fill="#0F172A" font-size="12.5" font-weight="700">{esc(short_name)}</text>
              <text x="42" y="{y + 41}" fill="#64748B" font-size="10.5">{esc(nt_lbl)}{f' · {esc(caliber)}' if caliber else ''}</text>

              <!-- Trapezoid body -->
              <polygon points="{x_tl:.1f},{y} {x_tr:.1f},{y} {x_br:.1f},{y_bot} {x_bl:.1f},{y_bot}"
                       fill="{color}" fill-opacity="{0.92 if is_bottleneck else (0.88 if nt == 'required' else 0.72)}"
                       stroke="#FFFFFF" stroke-width="1.5"/>
              <text x="{funnel_cx:.1f}" y="{y + 25}" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="800">{r:.1f}%</text>
              {f'<text x="{funnel_cx:.1f}" y="{y + 42}" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-size="10.5">{esc(fmt_int(users))} 人</text>' if users is not None else ''}
            </g>
            """
        )

        # Right side: step conversion & bottleneck pill
        rx = funnel_x0 + funnel_w + 14
        if is_bottleneck:
            elements.append(
                f"""
                <g data-jump="rec-{esc(rec_id)}" style="cursor:pointer">
                  <rect x="{rx}" y="{y + 7}" width="{right_info_w - 22}" height="22" rx="11" fill="#E11D48"/>
                  <text x="{rx + (right_info_w - 22)/2:.1f}" y="{y + 21.5}" text-anchor="middle" fill="#FFFFFF" font-size="10.5" font-weight="700">瓶颈 → {esc(rec_id)}</text>
                  {f'<text x="{rx + 2}" y="{y + 43}" fill="#BE123C" font-size="11" font-weight="700">步转化 {step_conv:.1f}%</text>' if step_conv is not None else ''}
                </g>
                """
            )
        else:
            conv_lbl = f"步转化 {step_conv:.1f}%" if step_conv is not None else "起始基线"
            elements.append(
                f"""
                <text x="{rx + 2}" y="{y + 24}" fill="#334155" font-size="11.5" font-weight="600">{esc(conv_lbl)}</text>
                {f'<text x="{rx + 2}" y="{y + 40}" fill="#94A3B8" font-size="10">{esc(note[:11] + ("…" if len(note) > 11 else ""))}</text>' if note else ''}
                """
            )

        # Connector chevron between steps
        if i + 1 < n:
            cy_mid = y_bot + gap_h / 2.0
            elements.append(
                f'<path d="M{funnel_cx - 6:.1f},{y_bot + 5} L{funnel_cx:.1f},{y_bot + 12} L{funnel_cx + 6:.1f},{y_bot + 5}" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            )

    svg = f"""
    <svg class="chart-svg funnel-svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-label="体验路径比例漏斗图">
      {"".join(elements)}
    </svg>
    """
    return svg, anomaly_steps


def render_funnels_card(funnels: list[dict[str, Any]]) -> str:
    if not funnels:
        return ""
    tabs: list[str] = []
    panels: list[str] = []
    for idx, f in enumerate(funnels):
        fid = str(f.get("id") or f"funnel-{idx + 1}")
        name = str(f.get("name") or f"核心漏斗 #{idx + 1}")
        caliber = str(f.get("caliber") or "")
        summary = str(f.get("summary") or "")
        steps = f.get("steps") or []
        active = " active" if idx == 0 else ""

        tabs.append(f'<button type="button" class="seg-btn{active}" data-funnel-tab="{esc(fid)}">{esc(name)}</button>')
        svg_html, anomalies = build_funnel_svg(steps)

        anom_html = ""
        if anomalies:
            a_chips: list[str] = []
            for a in anomalies:
                a_rate = clamp_pct(a.get("rate"))
                a_rate_txt = f"{a_rate:.1f}%" if a_rate is not None else "-"
                a_chips.append(
                    f'<div class="anom-chip"><strong>{esc(a.get("name") or "异常节点")}</strong><span>{esc(a_rate_txt)} · {esc(a.get("note") or "上报异常，已剔除")}</span></div>'
                )
            a_items = "".join(a_chips)
            anom_html = f'<div class="anom-strip"><span class="anom-title">已剔除异常节点（不计真实流失）</span><div class="anom-list">{a_items}</div></div>'

        panels.append(
            f"""
            <div class="funnel-panel{active}" data-funnel-panel="{esc(fid)}">
              <div class="chart-subbar">
                {f'<span class="pill-soft">{esc(caliber)}</span>' if caliber else ''}
                <span class="chart-takeaway">{esc(summary)}</span>
              </div>
              {svg_html}
              {anom_html}
            </div>
            """
        )

    tab_bar = f'<div class="seg-control">{"".join(tabs)}</div>' if len(funnels) > 1 else ""
    return f"""
    <div class="card chart-card">
      <div class="card-head">
        <div>
          <h3>体验路径阶梯漏斗</h3>
          <p class="card-sub">宽窄直观反映到达占比 · 鼠标悬停查看节点详情</p>
        </div>
        {tab_bar}
      </div>
      <div class="mini-legend">
        <span><i class="ldot" style="background:#2563EB"></i>必经</span>
        <span><i class="ldot" style="background:#7C3AED"></i>可选</span>
        <span><i class="ldot" style="background:#0D9488"></i>分支</span>
        <span><i class="ldot" style="background:#E11D48"></i>核心瓶颈</span>
      </div>
      {"".join(panels)}
    </div>
    """


# ---------------------------------------------------------------------------
# 3. General Visual Charts Gallery (Line / Bar / Donut SVG)
# ---------------------------------------------------------------------------
def build_line_chart_svg(chart: dict[str, Any]) -> str:
    labels = [str(x) for x in (chart.get("labels") or [])]
    series = chart.get("series") or []
    unit = str(chart.get("unit") or "")
    if not labels or not series:
        return '<div class="empty-text">暂无折线数据。</div>'

    all_vals: list[float] = []
    parsed_series: list[tuple[str, str, list[float | None]]] = []
    for idx, s in enumerate(series):
        if not isinstance(s, dict):
            continue
        name = str(s.get("name") or f"系列 {idx + 1}")
        color = str(s.get("color") or DEFAULT_PALETTE[idx % len(DEFAULT_PALETTE)])
        vals = [safe_float(v) for v in (s.get("values") or [])]
        all_vals.extend(v for v in vals if v is not None)
        parsed_series.append((name, color, vals))
    if not all_vals:
        return '<div class="empty-text">暂无有效数值。</div>'

    w, h = 480, 260
    pad_l, pad_r, pad_t, pad_b = 46, 20, 22, 36
    pw, ph = w - pad_l - pad_r, h - pad_t - pad_b

    max_v = max(all_vals)
    min_v = min(0.0, min(all_vals))
    # Nice ceiling
    top_v = max(1.0, math.ceil(max_v * 1.15 / 5.0) * 5.0 if max_v >= 10 else max_v * 1.2)
    span = top_v - min_v if top_v > min_v else 1.0

    elems: list[str] = []
    # Grid lines (4 intervals)
    for g in range(5):
        frac = g / 4.0
        yv = min_v + span * frac
        yy = pad_t + ph * (1.0 - frac)
        elems.append(f'<line x1="{pad_l}" y1="{yy:.1f}" x2="{pad_l + pw}" y2="{yy:.1f}" stroke="#E8EDF4" stroke-dasharray="{"0" if g == 0 else "3 3"}"/>')
        elems.append(f'<text x="{pad_l - 8}" y="{yy + 4:.1f}" text-anchor="end" fill="#94A3B8" font-size="10.5">{esc(fmt_num(yv, unit))}</text>')

    # X labels
    n_pts = len(labels)
    def x_at(i: int) -> float:
        return pad_l + (pw * i / max(1, n_pts - 1)) if n_pts > 1 else pad_l + pw / 2.0

    for i, lbl in enumerate(labels):
        xx = x_at(i)
        elems.append(f'<text x="{xx:.1f}" y="{h - 12}" text-anchor="middle" fill="#64748B" font-size="11">{esc(lbl)}</text>')

    # Series areas, lines, and points
    for s_idx, (name, color, vals) in enumerate(parsed_series):
        pts: list[tuple[int, float, float, float]] = []
        for i in range(min(n_pts, len(vals))):
            v = vals[i]
            if v is None:
                continue
            xx = x_at(i)
            yy = pad_t + ph * (1.0 - (v - min_v) / span)
            pts.append((i, xx, yy, v))
        if not pts:
            continue
        path_d = " ".join(f"{'M' if k == 0 else 'L'}{x:.1f},{y:.1f}" for k, (_, x, y, _) in enumerate(pts))
        area_d = f"{path_d} L{pts[-1][1]:.1f},{pad_t + ph:.1f} L{pts[0][1]:.1f},{pad_t + ph:.1f} Z"
        elems.append(f'<path d="{area_d}" fill="{color}" fill-opacity="0.08"/>')
        elems.append(f'<path d="{path_d}" fill="none" stroke="{color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>')
        for idx_pt, xx, yy, v in pts:
            tip = f"{name} · {labels[idx_pt]}：{fmt_num(v, unit)}"
            lbl_dy = -10 if s_idx == 0 else 15
            elems.append(
                f"""
                <g class="chart-pt" data-tip="{esc(tip)}">
                  <circle cx="{xx:.1f}" cy="{yy:.1f}" r="4.5" fill="{color}" stroke="#FFFFFF" stroke-width="2"/>
                  <text x="{xx:.1f}" y="{yy + lbl_dy:.1f}" text-anchor="middle" fill="{color}" font-size="10" font-weight="700">{esc(fmt_num(v, unit))}</text>
                </g>
                """
            )

    legend = "".join(
        f'<span><i class="ldot" style="background:{esc(c)}"></i>{esc(n)}</span>'
        for n, c, _ in parsed_series
    )
    return f"""
    <div class="mini-legend">{legend}</div>
    <svg class="chart-svg" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(chart.get('title') or '折线图')}">
      {"".join(elems)}
    </svg>
    """


def build_bar_chart_svg(chart: dict[str, Any]) -> str:
    labels = [str(x) for x in (chart.get("labels") or [])]
    series = chart.get("series") or []
    unit = str(chart.get("unit") or "")
    hl_idx = chart.get("highlight_index")
    if not labels or not series:
        return '<div class="empty-text">暂无柱状图数据。</div>'

    parsed_series: list[tuple[str, str, list[float]]] = []
    all_vals: list[float] = []
    for idx, s in enumerate(series):
        if not isinstance(s, dict):
            continue
        name = str(s.get("name") or f"系列 {idx + 1}")
        color = str(s.get("color") or DEFAULT_PALETTE[idx % len(DEFAULT_PALETTE)])
        vals = [safe_float(v) or 0.0 for v in (s.get("values") or [])]
        all_vals.extend(vals)
        parsed_series.append((name, color, vals))
    if not all_vals:
        return '<div class="empty-text">暂无有效数值。</div>'

    w, h = 480, 260
    pad_l, pad_r, pad_t, pad_b = 46, 18, 24, 38
    pw, ph = w - pad_l - pad_r, h - pad_t - pad_b
    max_v = max(all_vals)
    top_v = max(1.0, math.ceil(max_v * 1.18 / 10.0) * 10.0 if max_v >= 10 else max_v * 1.25)

    elems: list[str] = []
    for g in range(5):
        frac = g / 4.0
        yv = top_v * frac
        yy = pad_t + ph * (1.0 - frac)
        elems.append(f'<line x1="{pad_l}" y1="{yy:.1f}" x2="{pad_l + pw}" y2="{yy:.1f}" stroke="#E8EDF4" stroke-dasharray="{"0" if g == 0 else "3 3"}"/>')
        elems.append(f'<text x="{pad_l - 8}" y="{yy + 4:.1f}" text-anchor="end" fill="#94A3B8" font-size="10.5">{esc(fmt_num(yv, unit))}</text>')

    n_cats = len(labels)
    n_ser = len(parsed_series)
    cat_w = pw / max(1, n_cats)
    group_w = min(cat_w * 0.68, 54.0 * n_ser)
    bar_gap = 4.0 if n_ser > 1 else 0.0
    bar_w = max(10.0, (group_w - bar_gap * (n_ser - 1)) / max(1, n_ser))

    for ci, lbl in enumerate(labels):
        cx = pad_l + (ci + 0.5) * cat_w
        short_lbl = lbl if len(lbl) <= 7 else lbl[:6] + "…"
        is_hl = (hl_idx is not None and ci == int(hl_idx))
        elems.append(
            f'<text x="{cx:.1f}" y="{h - 12}" text-anchor="middle" fill="{"#DC2626" if is_hl else "#64748B"}" font-size="11" font-weight="{"700" if is_hl else "500"}">{esc(short_lbl)}</text>'
        )
        start_x = cx - group_w / 2.0
        for si, (sname, scolor, vals) in enumerate(parsed_series):
            val = vals[ci] if ci < len(vals) else 0.0
            bh = ph * (val / top_v)
            bx = start_x + si * (bar_w + bar_gap)
            by = pad_t + ph - bh
            fill = "#E11D48" if (is_hl and n_ser == 1) else scolor
            tip = f"{lbl} · {sname}：{fmt_num(val, unit)}"
            elems.append(
                f"""
                <g class="chart-pt" data-tip="{esc(tip)}">
                  <rect x="{bx:.1f}" y="{by:.1f}" width="{bar_w:.1f}" height="{max(2.0, bh):.1f}" rx="5" fill="{fill}" fill-opacity="{0.95 if is_hl else 0.85}"/>
                  <text x="{bx + bar_w/2:.1f}" y="{by - 6:.1f}" text-anchor="middle" fill="{fill if is_hl else '#334155'}" font-size="10.5" font-weight="700">{esc(fmt_num(val, unit))}</text>
                </g>
                """
            )

    legend_html = ""
    if n_ser > 1:
        legend_html = '<div class="mini-legend">' + "".join(
            f'<span><i class="ldot" style="background:{esc(c)}"></i>{esc(n)}</span>' for n, c, _ in parsed_series
        ) + "</div>"
    elif hl_idx is not None:
        legend_html = '<div class="mini-legend"><span><i class="ldot" style="background:#2563EB"></i>常规节点</span><span><i class="ldot" style="background:#E11D48"></i>异常峰值 / 核心瓶颈</span></div>'

    return f"""
    {legend_html}
    <svg class="chart-svg" viewBox="0 0 {w} {h}" role="img" aria-label="{esc(chart.get('title') or '柱状图')}">
      {"".join(elems)}
    </svg>
    """


def build_donut_chart_svg(chart: dict[str, Any]) -> str:
    segs = [s for s in (chart.get("segments") or []) if isinstance(s, dict)]
    if not segs:
        return '<div class="empty-text">暂无占比数据。</div>'
    total = sum(max(0.0, safe_float(s.get("value")) or 0.0) for s in segs)
    if total <= 0:
        return '<div class="empty-text">暂无有效占比。</div>'

    r = 66
    c = 2 * math.pi * r
    acc = 0.0
    arcs: list[str] = []
    legend_rows: list[str] = []

    for idx, s in enumerate(segs):
        val = max(0.0, safe_float(s.get("value")) or 0.0)
        frac = val / total
        seg_len = c * frac
        color = str(s.get("color") or DEFAULT_PALETTE[idx % len(DEFAULT_PALETTE)])
        lbl = str(s.get("label") or f"分类 {idx + 1}")
        unit = str(s.get("unit") or "%")
        tip = f"{lbl}：{fmt_num(val, unit)}（占比 {frac * 100:.1f}%）"

        arcs.append(
            f"""
            <circle class="chart-pt" data-tip="{esc(tip)}" cx="90" cy="90" r="{r}"
                    fill="none" stroke="{color}" stroke-width="24"
                    stroke-dasharray="{max(0.0, seg_len - 1.5):.2f} {c:.2f}"
                    stroke-dashoffset="{-acc:.2f}"
                    transform="rotate(-90 90 90)"/>
            """
        )
        acc += seg_len

        legend_rows.append(
            f"""
            <div class="donut-row">
              <div class="donut-row-top">
                <span><i class="ldot" style="background:{color}"></i>{esc(lbl)}</span>
                <strong>{esc(fmt_num(val, unit))}</strong>
              </div>
              <div class="donut-bar-track"><div class="donut-bar-fill" style="width:{frac * 100:.1f}%;background:{color}"></div></div>
            </div>
            """
        )

    c_lbl = str(chart.get("center_label") or "总计")
    c_val = str(chart.get("center_value") or f"{total:.0f}")

    return f"""
    <div class="donut-layout">
      <svg class="donut-svg" viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="{esc(chart.get('title') or '占比环图')}">
        <circle cx="90" cy="90" r="{r}" fill="none" stroke="#EEF2F6" stroke-width="24"/>
        {"".join(arcs)}
        <text x="90" y="85" text-anchor="middle" fill="#64748B" font-size="11">{esc(c_lbl)}</text>
        <text x="90" y="106" text-anchor="middle" fill="#0F172A" font-size="18" font-weight="800">{esc(c_val)}</text>
      </svg>
      <div class="donut-legend">{"".join(legend_rows)}</div>
    </div>
    """


def render_chart_card(chart: dict[str, Any]) -> str:
    ctype = str(chart.get("type") or "bar").lower()
    if ctype == "line":
        body = build_line_chart_svg(chart)
    elif ctype == "donut":
        body = build_donut_chart_svg(chart)
    else:
        body = build_bar_chart_svg(chart)
    return f"""
    <div class="card chart-card">
      <div class="card-head">
        <div>
          <h3>{esc(chart.get("title") or "数据分析图表")}</h3>
          {f'<p class="card-sub">{esc(chart.get("subtitle"))}</p>' if chart.get("subtitle") else ''}
        </div>
      </div>
      {body}
    </div>
    """


def render_visual_analytics_hub(funnels: list[dict[str, Any]], charts: list[dict[str, Any]]) -> str:
    if not funnels and not charts:
        return ""
    blocks: list[str] = []
    # Top visual row: Funnel (left, wider) + First supplementary chart (right) if both exist
    if funnels and charts:
        blocks.append(
            f"""
            <div class="viz-hero-grid">
              {render_funnels_card(funnels)}
              {render_chart_card(charts[0])}
            </div>
            """
        )
        rest_charts = charts[1:]
    elif funnels:
        blocks.append(render_funnels_card(funnels))
        rest_charts = []
    else:
        rest_charts = charts

    if rest_charts:
        cols = "grid-2" if len(rest_charts) >= 2 else "grid-1"
        cards = "".join(render_chart_card(c) for c in rest_charts)
        blocks.append(f'<div class="viz-sub-grid {cols}">{cards}</div>')

    return f"""
    <section class="section" id="sec-charts">
      {"".join(blocks)}
    </section>
    """


# ---------------------------------------------------------------------------
# 3.5 Interactive Flowchart & Decision Diagram (Pure SVG, Collision-Free)
# ---------------------------------------------------------------------------
def build_decision_flow_svg(decision_lanes: list[dict[str, Any]], recs: list[dict[str, Any]]) -> str:
    """4-Stage Decision Flowchart: Signal -> Decision Diamond -> Proposed Change -> Verify / Rollback Fork."""
    lanes = decision_lanes[:]
    if not lanes and recs:
        # Auto-synthesize decision lanes directly from recommendations so every report has a decision diagram
        for idx, rec in enumerate(recs):
            rid = str(rec.get("id") or f"OPT-{idx + 1}")
            rank = safe_rank(rec.get("rank"), idx + 1)
            df = rec.get("data_facts")
            hl = (df.get("highlights") or []) if isinstance(df, dict) else []
            signal = f"{hl[0].get('label', '')} {hl[0].get('value', '')}".strip() if (hl and isinstance(hl[0], dict)) else str(rec.get("title") or "")
            causes = rec.get("possible_causes") or []
            decision_q = ""
            if isinstance(causes, list) and causes:
                c0 = causes[0]
                decision_q = str(c0.get("text") if isinstance(c0, dict) else c0)
            if not decision_q:
                decision_q = str(rec.get("one_liner") or "机制卡点核实？")
            changes = rec.get("proposed_changes") or []
            action = str(changes[0]) if (isinstance(changes, list) and changes) else str(rec.get("title") or "")
            vmode = str(rec.get("validation_mode") or "A/B 实验验证")
            lanes.append(
                {
                    "rec_id": rid,
                    "rank": rank,
                    "signal": signal,
                    "decision": decision_q,
                    "action": action,
                    "verify": f"{vmode} · 达标推全",
                    "rollback": "护栏异常 · 立即止损回滚",
                }
            )
    if not lanes:
        return '<div class="empty-text">暂无可绘制的优化决策流程图。</div>'

    svg_w = 1120
    header_h = 42
    lane_h = 116
    pad_b = 14
    svg_h = header_h + len(lanes) * lane_h + pad_b

    # Column geometry
    c1_x, c1_w = 16, 206
    c2_x, c2_w = 270, 214
    c3_x, c3_w = 536, 256
    c4_x, c4_w = 858, 246

    elems: list[str] = [
        """
        <defs>
          <marker id="df-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#94A3B8"/>
          </marker>
          <marker id="df-arr-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#059669"/>
          </marker>
          <marker id="df-arr-bad" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#DC2626"/>
          </marker>
        </defs>
        """
    ]

    # Column header pills
    col_headers = [
        (c1_x + c1_w / 2, "① 线上异常 / 卡点信号", "#BE123C", "#FFF1F2"),
        (c2_x + c2_w / 2, "② 根因决策判断 ◇", "#B45309", "#FFFBEB"),
        (c3_x + c3_w / 2, "③ 建议修改动作（点击直达）", "#059669", "#ECFDF5"),
        (c4_x + c4_w / 2, "④ 实验验证与止损闭环", "#2563EB", "#EFF6FF"),
    ]
    for hx, htxt, hcol, hbg in col_headers:
        elems.append(
            f'<rect x="{hx - 96:.1f}" y="8" width="192" height="24" rx="12" fill="{hbg}"/>'
            f'<text x="{hx:.1f}" y="24" text-anchor="middle" fill="{hcol}" font-size="11.5" font-weight="700">{esc(htxt)}</text>'
        )

    for idx, lane in enumerate(lanes[:3]):
        y0 = header_h + idx * lane_h
        cy = y0 + lane_h / 2.0
        rid = str(lane.get("rec_id") or f"OPT-{idx + 1}")
        rank = safe_rank(lane.get("rank"), idx + 1)

        # Subtle alternating swimlane strip
        if idx % 2 == 1:
            elems.append(f'<rect x="6" y="{y0 + 4}" width="{svg_w - 12}" height="{lane_h - 8}" rx="12" fill="#F8FAFC"/>')

        # 1. Signal Box
        s_lines = wrap_text(str(lane.get("signal") or ""), 13.5, 3)
        elems.append(
            f"""
            <g class="chart-pt" data-tip="数据卡点：{esc(lane.get('signal') or '')}">
              <rect x="{c1_x}" y="{cy - 34:.1f}" width="{c1_w}" height="68" rx="10" fill="#FFF1F2" stroke="#FDA4AF" stroke-width="1.4"/>
              <rect x="{c1_x + 8}" y="{cy - 43:.1f}" width="54" height="17" rx="8.5" fill="#E11D48"/>
              <text x="{c1_x + 35}" y="{cy - 31.5:.1f}" text-anchor="middle" fill="#FFFFFF" font-size="9.5" font-weight="700">#{rank} {esc(rid)}</text>
              {svg_multiline(c1_x + c1_w / 2, cy + 2, s_lines, 11.5, "#881337", "700", 15.0)}
            </g>
            """
        )

        # Arrow 1 -> 2
        elems.append(
            f'<line x1="{c1_x + c1_w}" y1="{cy:.1f}" x2="{c2_x - 3}" y2="{cy:.1f}" stroke="#94A3B8" stroke-width="1.8" marker-end="url(#df-arr)"/>'
            f'<text x="{(c1_x + c1_w + c2_x)/2:.1f}" y="{cy - 7:.1f}" text-anchor="middle" fill="#64748B" font-size="9.5">下钻</text>'
        )

        # 2. Decision Hexagon / Diamond Node
        d_lines = wrap_text(str(lane.get("decision") or ""), 12.0, 3)
        dx0, dx1 = c2_x, c2_x + c2_w
        d_pts = f"{dx0 + 22},{cy - 38:.1f} {dx1 - 22},{cy - 38:.1f} {dx1},{cy:.1f} {dx1 - 22},{cy + 38:.1f} {dx0 + 22},{cy + 38:.1f} {dx0},{cy:.1f}"
        elems.append(
            f"""
            <g class="chart-pt" data-tip="机制判断：{esc(lane.get('decision') or '')}">
              <polygon points="{d_pts}" fill="#FFFBEB" stroke="#F59E0B" stroke-width="1.6"/>
              {svg_multiline(c2_x + c2_w / 2, cy, d_lines, 11.0, "#92400E", "600", 14.5)}
            </g>
            """
        )

        # Arrow 2 -> 3
        elems.append(
            f'<line x1="{c2_x + c2_w}" y1="{cy:.1f}" x2="{c3_x - 3}" y2="{cy:.1f}" stroke="#059669" stroke-width="2" marker-end="url(#df-arr-ok)"/>'
            f'<text x="{(c2_x + c2_w + c3_x)/2:.1f}" y="{cy - 7:.1f}" text-anchor="middle" fill="#059669" font-size="9.5" font-weight="700">实锤</text>'
        )

        # 3. Action Box (clickable -> jumps to rec card)
        a_lines = wrap_text(str(lane.get("action") or ""), 17.5, 3)
        elems.append(
            f"""
            <g class="chart-pt" data-jump="rec-{esc(rid)}" data-tip="点击查看 {esc(rid)} 完整方案：{esc(lane.get('action') or '')}" style="cursor:pointer">
              <rect x="{c3_x}" y="{cy - 36:.1f}" width="{c3_w}" height="72" rx="11" fill="#ECFDF5" stroke="#10B981" stroke-width="1.8"/>
              {svg_multiline(c3_x + c3_w / 2, cy, a_lines, 11.5, "#065F46", "700", 15.5)}
            </g>
            """
        )

        # 4. Forked Verification (top) & Rollback (bottom)
        fx0 = c3_x + c3_w
        fy_top = cy - 22
        fy_bot = cy + 22
        mid_x = (fx0 + c4_x) / 2.0

        # Smooth fork curves
        elems.append(
            f'<path d="M{fx0},{cy:.1f} C{mid_x:.1f},{cy:.1f} {mid_x:.1f},{fy_top:.1f} {c4_x - 3},{fy_top:.1f}" fill="none" stroke="#059669" stroke-width="1.8" marker-end="url(#df-arr-ok)"/>'
            f'<text x="{mid_x:.1f}" y="{fy_top - 5:.1f}" text-anchor="middle" fill="#059669" font-size="9.5" font-weight="700">达标</text>'
            f'<path d="M{fx0},{cy:.1f} C{mid_x:.1f},{cy:.1f} {mid_x:.1f},{fy_bot:.1f} {c4_x - 3},{fy_bot:.1f}" fill="none" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#df-arr-bad)"/>'
            f'<text x="{mid_x:.1f}" y="{fy_bot + 13:.1f}" text-anchor="middle" fill="#DC2626" font-size="9.5" font-weight="600">止损</text>'
        )

        v_lines = wrap_text(str(lane.get("verify") or "A/B 实验验证 · 达标推全"), 19.5, 2)
        rb_lines = wrap_text(str(lane.get("rollback") or "触发护栏 · 一键回滚"), 19.5, 2)
        elems.append(
            f"""
            <g class="chart-pt" data-tip="验证路径：{esc(lane.get('verify') or '')}">
              <rect x="{c4_x}" y="{fy_top - 18:.1f}" width="{c4_w}" height="36" rx="8" fill="#EFF6FF" stroke="#93C5FD" stroke-width="1.3"/>
              {svg_multiline(c4_x + c4_w / 2, fy_top, v_lines, 10.5, "#1E40AF", "700", 13.0)}
            </g>
            <g class="chart-pt" data-tip="止损回滚：{esc(lane.get('rollback') or '')}">
              <rect x="{c4_x}" y="{fy_bot - 17:.1f}" width="{c4_w}" height="34" rx="8" fill="#FEF2F2" stroke="#FCA5A5" stroke-width="1.2" stroke-dasharray="4 2"/>
              {svg_multiline(c4_x + c4_w / 2, fy_bot, rb_lines, 10.5, "#991B1B", "600", 13.0)}
            </g>
            """
        )

    return f"""
    <svg class="chart-svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-label="诊断归因与修改决策流程图">
      {"".join(elems)}
    </svg>
    """


def build_experience_flow_svg(flow: dict[str, Any]) -> str:
    """Horizontal Player Experience Loop with Bottleneck & Modification Callouts + Optional/Branch Side Nodes."""
    nodes = [n for n in (flow.get("nodes") or []) if isinstance(n, dict)]
    if not nodes:
        return '<div class="empty-text">暂无体验流转节点数据。</div>'

    main_nodes = [n for n in nodes if str(n.get("lane") or "main").lower() == "main"]
    branch_nodes = [n for n in nodes if str(n.get("lane") or "main").lower() != "main"]
    if not main_nodes:
        main_nodes = nodes
        branch_nodes = []

    n_main = len(main_nodes)
    node_w = 146
    node_h = 56
    gap_x = 68
    pad_x = 24
    svg_w = max(960, pad_x * 2 + n_main * node_w + max(0, n_main - 1) * gap_x)
    # Distribute main spine evenly across svg_w
    step_x = (svg_w - pad_x * 2 - node_w) / max(1, n_main - 1) if n_main > 1 else 0
    has_top_branch = any(str(b.get("lane") or "").lower() == "top" for b in branch_nodes)
    has_bot_branch = any(str(b.get("lane") or "").lower() == "bottom" for b in branch_nodes)
    has_mod = any(n.get("modification") for n in nodes)

    main_y = 128 if has_top_branch else 62
    svg_h = main_y + node_h + (126 if (has_bot_branch or has_mod) else 36)

    pos_map: dict[str, tuple[float, float]] = {}
    elems: list[str] = [
        """
        <defs>
          <marker id="ef-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#94A3B8"/>
          </marker>
          <marker id="ef-arr-br" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#7C3AED"/>
          </marker>
        </defs>
        """
    ]

    style_map = {
        "start": ("#EFF6FF", "#2563EB", "#1E40AF"),
        "step": ("#FFFFFF", "#94A3B8", "#0F172A"),
        "decision": ("#FFFBEB", "#F59E0B", "#92400E"),
        "bottleneck": ("#FFF1F2", "#E11D48", "#881337"),
        "branch": ("#F5F3FF", "#7C3AED", "#5B21B6"),
        "goal": ("#ECFDF5", "#059669", "#065F46"),
    }

    # Place and draw main spine nodes
    for i, node in enumerate(main_nodes):
        nid = str(node.get("id") or f"N{i + 1}")
        nx = pad_x + i * step_x if n_main > 1 else (svg_w - node_w) / 2.0
        ny = main_y
        pos_map[nid] = (nx + node_w / 2.0, ny + node_h / 2.0)

        # Connector from previous main node
        if i > 0:
            px = pad_x + (i - 1) * step_x + node_w
            edge_lbl = str(node.get("edge_label") or "")
            elems.append(
                f'<line x1="{px:.1f}" y1="{ny + node_h/2:.1f}" x2="{nx - 3:.1f}" y2="{ny + node_h/2:.1f}" stroke="#94A3B8" stroke-width="2" marker-end="url(#ef-arr)"/>'
            )
            if edge_lbl:
                elems.append(
                    f'<text x="{(px + nx)/2:.1f}" y="{ny + node_h/2 - 8:.1f}" text-anchor="middle" fill="#64748B" font-size="10" font-weight="600">{esc(edge_lbl)}</text>'
                )

        ntype = str(node.get("type") or "step").lower()
        bg, bd, fg = style_map.get(ntype, style_map["step"])
        title = str(node.get("label") or nid)
        metric = str(node.get("metric") or "")
        rec_id = str(node.get("rec_id") or "")
        mod = str(node.get("modification") or "")
        tip = f"{title}{f'（{metric}）' if metric else ''}{f'｜改造：{mod}' if mod else ''}"

        lines = wrap_text(title, 10.5, 2)
        cx = nx + node_w / 2.0
        cy = ny + node_h / 2.0

        if ntype == "decision":
            pts = f"{nx + 16:.1f},{ny} {nx + node_w - 16:.1f},{ny} {nx + node_w:.1f},{cy:.1f} {nx + node_w - 16:.1f},{ny + node_h} {nx + 16:.1f},{ny + node_h} {nx:.1f},{cy:.1f}"
            shape = f'<polygon points="{pts}" fill="{bg}" stroke="{bd}" stroke-width="1.8"/>'
        else:
            shape = f'<rect x="{nx:.1f}" y="{ny}" width="{node_w}" height="{node_h}" rx="11" fill="{bg}" stroke="{bd}" stroke-width="{2.0 if ntype == "bottleneck" else 1.5}"/>'

        badge = ""
        if ntype == "bottleneck":
            badge = (
                f'<rect x="{cx - 32:.1f}" y="{ny - 11}" width="64" height="17" rx="8.5" fill="#E11D48"/>'
                f'<text x="{cx:.1f}" y="{ny + 0.5}" text-anchor="middle" fill="#FFFFFF" font-size="9.5" font-weight="700">核心卡点</text>'
            )

        elems.append(
            f"""
            <g class="chart-pt" data-tip="{esc(tip)}" {f'data-jump="rec-{esc(rec_id)}" style="cursor:pointer"' if rec_id else ''}>
              {shape}
              {badge}
              {svg_multiline(cx, cy - (6 if metric else 0), lines, 11.5, fg, "700", 14.0)}
              {f'<text x="{cx:.1f}" y="{ny + node_h - 8}" text-anchor="middle" fill="{bd}" font-size="10" font-weight="700">{esc(metric)}</text>' if metric else ''}
            </g>
            """
        )

        # Pinned modification callout directly below the bottleneck/target node
        if mod:
            my = ny + node_h + 26
            mw = max(node_w + 26, 174)
            mx = max(8.0, min(svg_w - mw - 8.0, cx - mw / 2.0))
            m_lines = wrap_text(mod, 12.5, 2)
            elems.append(
                f"""
                <g class="chart-pt" {f'data-jump="rec-{esc(rec_id)}" style="cursor:pointer"' if rec_id else ''} data-tip="建议改造：{esc(mod)}">
                  <line x1="{cx:.1f}" y1="{ny + node_h}" x2="{cx:.1f}" y2="{my}" stroke="#059669" stroke-width="1.8" stroke-dasharray="3 2"/>
                  <circle cx="{cx:.1f}" cy="{ny + node_h + 2}" r="3.2" fill="#059669"/>
                  <rect x="{mx:.1f}" y="{my}" width="{mw:.1f}" height="48" rx="9" fill="#ECFDF5" stroke="#10B981" stroke-width="1.6"/>
                  <rect x="{mx + 8:.1f}" y="{my - 9}" width="{72 if rec_id else 58}" height="16" rx="8" fill="#059669"/>
                  <text x="{mx + 8 + (36 if rec_id else 29):.1f}" y="{my + 2}" text-anchor="middle" fill="#FFFFFF" font-size="9" font-weight="700">{esc(f'改 · {rec_id}' if rec_id else '建议改动')}</text>
                  {svg_multiline(mx + mw / 2.0, my + 27, m_lines, 10.5, "#065F46", "700", 13.5)}
                </g>
                """
            )

    # Draw side branch / optional nodes
    for idx, b in enumerate(branch_nodes):
        parent_id = str(b.get("from") or "")
        px, py = pos_map.get(parent_id, (svg_w / 2.0, main_y + node_h / 2.0))
        lane = str(b.get("lane") or "top").lower()
        bw, bh = 148, 46
        bx = max(12.0, min(svg_w - bw - 12.0, px - bw / 2.0))
        by = 18 if lane == "top" else (main_y + node_h + 38)
        bg, bd, fg = style_map.get(str(b.get("type") or "branch").lower(), style_map["branch"])
        b_title = str(b.get("label") or "")
        b_metric = str(b.get("metric") or "")
        edge_lbl = str(b.get("edge_label") or "分支")
        rec_id = str(b.get("rec_id") or "")
        mod = str(b.get("modification") or "")

        if lane == "top":
            elems.append(
                f'<line x1="{px:.1f}" y1="{main_y}" x2="{px:.1f}" y2="{by + bh + 3}" stroke="{bd}" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ef-arr-br)"/>'
                f'<text x="{px + 8:.1f}" y="{(main_y + by + bh)/2 + 3:.1f}" fill="{bd}" font-size="9.5" font-weight="600">{esc(edge_lbl)}</text>'
            )
        else:
            elems.append(
                f'<line x1="{px:.1f}" y1="{main_y + node_h}" x2="{px:.1f}" y2="{by - 3}" stroke="{bd}" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ef-arr-br)"/>'
                f'<text x="{px + 8:.1f}" y="{(main_y + node_h + by)/2 + 3:.1f}" fill="{bd}" font-size="9.5" font-weight="600">{esc(edge_lbl)}</text>'
            )

        b_lines = wrap_text(b_title, 10.5, 2)
        elems.append(
            f"""
            <g class="chart-pt" data-tip="{esc(b_title)} {esc(b_metric)} {esc(mod)}" {f'data-jump="rec-{esc(rec_id)}" style="cursor:pointer"' if rec_id else ''}>
              <rect x="{bx:.1f}" y="{by}" width="{bw}" height="{bh}" rx="9" fill="{bg}" stroke="{bd}" stroke-width="1.4" stroke-dasharray="4 2"/>
              {svg_multiline(bx + bw / 2.0, by + bh / 2.0 - (5 if b_metric else 0), b_lines, 11.0, fg, "700", 13.5)}
              {f'<text x="{bx + bw / 2.0:.1f}" y="{by + bh - 6}" text-anchor="middle" fill="{bd}" font-size="9.5" font-weight="600">{esc(b_metric)}</text>' if b_metric else ''}
            </g>
            """
        )

    return f"""
    <svg class="chart-svg" viewBox="0 0 {svg_w} {svg_h}" role="img" aria-label="玩家体验与改造落点流程图">
      {"".join(elems)}
    </svg>
    """


def render_flowcharts_section(data: dict[str, Any], recs: list[dict[str, Any]]) -> str:
    decision_lanes = data.get("decision_flow") or []
    exp_flow = data.get("experience_flow")
    has_exp = isinstance(exp_flow, dict) and bool(exp_flow.get("nodes"))
    if not decision_lanes and not recs and not has_exp:
        return ""

    tabs: list[str] = []
    panels: list[str] = []

    # Tab 1: Decision & Modification Flowchart (always present when recs or decision_flow exist)
    if decision_lanes or recs:
        tabs.append('<button type="button" class="seg-btn active" data-flow-tab="decision">修改建议决策流程图</button>')
        panels.append(
            f"""
            <div class="flow-panel active" data-flow-panel="decision">
              {build_decision_flow_svg(decision_lanes, recs)}
            </div>
            """
        )

    # Tab 2: Player Experience & Modification Map Flowchart (if supplied)
    if has_exp:
        is_first = not (decision_lanes or recs)
        tabs.append(f'<button type="button" class="seg-btn{" active" if is_first else ""}" data-flow-tab="experience">{esc(exp_flow.get("title") or "体验路径与改造落点图")}</button>')
        panels.append(
            f"""
            <div class="flow-panel{" active" if is_first else ""}" data-flow-panel="experience">
              {f'<p class="chart-takeaway" style="margin:0 0 10px">{esc(exp_flow.get("subtitle"))}</p>' if exp_flow.get("subtitle") else ''}
              {build_experience_flow_svg(exp_flow)}
            </div>
            """
        )

    tab_bar = f'<div class="seg-control">{"".join(tabs)}</div>' if len(tabs) > 1 else ""
    return f"""
    <section class="section card" id="sec-flow">
      <div class="card-head">
        <div>
          <h3>诊断归因与修改决策流程图</h3>
          <p class="card-sub">从线上卡点 → 根因判断 → 具体改动 → 实验验证与止损回滚一图看懂 · 点击绿框直达对应建议</p>
        </div>
        {tab_bar}
      </div>
      {"".join(panels)}
    </section>
    """


# ---------------------------------------------------------------------------
# 4. Priority Visual Comparison (2D Quadrant SVG + 3-Axis Grouped Bars SVG)
# ---------------------------------------------------------------------------
def build_priority_quadrant_svg(recs: list[dict[str, Any]]) -> str:
    w, h = 340, 236
    pad_l, pad_r, pad_t, pad_b = 46, 16, 18, 38
    pw, ph = w - pad_l - pad_r, h - pad_t - pad_b

    def x_for(lvl: str) -> float:
        return pad_l + (LEVEL_SCORE.get(lvl, 2) - 0.5) * (pw / 3.0)

    def y_for(lvl: str) -> float:
        return pad_t + (3.5 - LEVEL_SCORE.get(lvl, 2)) * (ph / 3.0)

    cost_colors = {"low": "#059669", "medium": "#D97706", "high": "#DC2626"}
    cost_fills = {"low": "#ECFDF5", "medium": "#FFFBEB", "high": "#FEF2F2"}
    placed: dict[tuple[int, int], int] = {}
    bubbles: list[str] = []

    for idx, rec in enumerate(recs):
        rid = str(rec.get("id") or f"OPT-{idx + 1}")
        rank = safe_rank(rec.get("rank"), idx + 1)
        imp = str(rec.get("impact_level") or "medium").lower()
        ev = str(rec.get("evidence_level") or "medium").lower()
        cost = str(rec.get("cost_level") or "medium").lower()
        key = (LEVEL_SCORE.get(ev, 2), LEVEL_SCORE.get(imp, 2))
        dup = placed.get(key, 0)
        placed[key] = dup + 1
        cx = x_for(ev) + ((dup % 2) * 26 - (13 if dup > 0 else 0))
        cy = y_for(imp) + (5 if imp == "high" else 0) + (dup // 2) * 20
        stroke = cost_colors.get(cost, "#2563EB")
        fill = cost_fills.get(cost, "#EFF6FF")
        tip = f"#{rank} {rid}：{rec.get('title') or ''}（影响:{LEVEL_ZH.get(imp)} / 证据:{EVIDENCE_ZH.get(ev)} / 成本:{LEVEL_ZH.get(cost)}）"
        bubbles.append(
            f"""
            <g class="matrix-node chart-pt" data-target="rec-{esc(rid)}" data-tip="{esc(tip)}" style="cursor:pointer">
              <circle cx="{cx:.1f}" cy="{cy:.1f}" r="20" fill="{fill}" stroke="#FFFFFF" stroke-width="3.5"/>
              <circle cx="{cx:.1f}" cy="{cy:.1f}" r="18.5" fill="{fill}" stroke="{stroke}" stroke-width="2.2"/>
              <text x="{cx:.1f}" y="{cy - 1:.1f}" text-anchor="middle" fill="#0F172A" font-size="11.5" font-weight="800">#{rank}</text>
              <text x="{cx:.1f}" y="{cy + 10:.1f}" text-anchor="middle" fill="{stroke}" font-size="8.5" font-weight="700">{esc(rid)}</text>
            </g>
            """
        )

    x1, x2 = pad_l + pw / 3.0, pad_l + 2 * pw / 3.0
    y1, y2 = pad_t + ph / 3.0, pad_t + 2 * ph / 3.0

    return f"""
    <svg class="chart-svg" viewBox="0 0 {w} {h}" role="img" aria-label="影响范围与证据强度矩阵">
      <rect x="{pad_l}" y="{pad_t}" width="{pw}" height="{ph}" rx="10" fill="#FAFBFD" stroke="#E2E8F0"/>
      <rect x="{x2:.1f}" y="{pad_t}" width="{pw/3.0:.1f}" height="{ph/3.0:.1f}" rx="8" fill="#ECFDF5"/>
      <text x="{pad_l + pw - 6:.1f}" y="{pad_t + 12}" text-anchor="end" fill="#059669" font-size="9" font-weight="700">优先区</text>
      <line x1="{x1:.1f}" y1="{pad_t}" x2="{x1:.1f}" y2="{pad_t + ph}" stroke="#E2E8F0" stroke-dasharray="3 3"/>
      <line x1="{x2:.1f}" y1="{pad_t}" x2="{x2:.1f}" y2="{pad_t + ph}" stroke="#E2E8F0" stroke-dasharray="3 3"/>
      <line x1="{pad_l}" y1="{y1:.1f}" x2="{pad_l + pw}" y2="{y1:.1f}" stroke="#E2E8F0" stroke-dasharray="3 3"/>
      <line x1="{pad_l}" y1="{y2:.1f}" x2="{pad_l + pw}" y2="{y2:.1f}" stroke="#E2E8F0" stroke-dasharray="3 3"/>
      <text x="{pad_l - 8}" y="{pad_t + ph*(1/6) + 4:.1f}" text-anchor="end" fill="#64748B" font-size="10.5">高</text>
      <text x="{pad_l - 8}" y="{pad_t + ph*(3/6) + 4:.1f}" text-anchor="end" fill="#64748B" font-size="10.5">中</text>
      <text x="{pad_l - 8}" y="{pad_t + ph*(5/6) + 4:.1f}" text-anchor="end" fill="#64748B" font-size="10.5">低</text>
      <text x="14" y="{pad_t + ph/2:.1f}" text-anchor="middle" fill="#475569" font-size="11" font-weight="600" transform="rotate(-90 14 {pad_t + ph/2:.1f})">影响范围</text>
      <text x="{pad_l + pw*(1/6):.1f}" y="{pad_t + ph + 16}" text-anchor="middle" fill="#64748B" font-size="10.5">弱</text>
      <text x="{pad_l + pw*(3/6):.1f}" y="{pad_t + ph + 16}" text-anchor="middle" fill="#64748B" font-size="10.5">中</text>
      <text x="{pad_l + pw*(5/6):.1f}" y="{pad_t + ph + 16}" text-anchor="middle" fill="#64748B" font-size="10.5">强</text>
      <text x="{pad_l + pw/2:.1f}" y="{h - 6}" text-anchor="middle" fill="#475569" font-size="11" font-weight="600">证据强度</text>
      {"".join(bubbles)}
    </svg>
    """


def build_priority_bars_html(recs: list[dict[str, Any]]) -> str:
    rows: list[str] = []
    for idx, rec in enumerate(recs):
        rid = str(rec.get("id") or f"OPT-{idx + 1}")
        rank = safe_rank(rec.get("rank"), idx + 1)
        title = str(rec.get("title") or "未命名优化点")
        imp = str(rec.get("impact_level") or "medium").lower()
        ev = str(rec.get("evidence_level") or "medium").lower()
        cost = str(rec.get("cost_level") or "medium").lower()
        vmode = str(rec.get("validation_mode") or "")

        imp_w = LEVEL_SCORE.get(imp, 2) / 3.0 * 100
        ev_w = LEVEL_SCORE.get(ev, 2) / 3.0 * 100
        ease_w = COST_EASE.get(cost, 2) / 3.0 * 100

        rows.append(
            f"""
            <div class="pbar-item" data-jump="rec-{esc(rid)}">
              <div class="pbar-head">
                <div class="pbar-title-wrap">
                  <span class="rank-pill rank-{rank}">#{rank}</span>
                  <strong>{esc(title)}</strong>
                </div>
                {f'<span class="pill-blue">{esc(vmode)}</span>' if vmode else ''}
              </div>
              <div class="pbar-metrics">
                <div class="pbar-m">
                  <span class="pm-k">影响范围</span>
                  <div class="pm-track"><div class="pm-fill" style="width:{imp_w:.0f}%;background:#2563EB"></div></div>
                  <span class="pm-v">{esc(LEVEL_ZH.get(imp, imp))}</span>
                </div>
                <div class="pbar-m">
                  <span class="pm-k">证据强度</span>
                  <div class="pm-track"><div class="pm-fill" style="width:{ev_w:.0f}%;background:#0D9488"></div></div>
                  <span class="pm-v">{esc(EVIDENCE_ZH.get(ev, ev))}</span>
                </div>
                <div class="pbar-m">
                  <span class="pm-k">落地轻便</span>
                  <div class="pm-track"><div class="pm-fill" style="width:{ease_w:.0f}%;background:#059669"></div></div>
                  <span class="pm-v">{esc(LEVEL_ZH.get(cost, cost))}成本</span>
                </div>
              </div>
            </div>
            """
        )
    return f'<div class="pbar-list">{"".join(rows)}</div>'


def render_priority_section(recs: list[dict[str, Any]], truncated: bool) -> str:
    if not recs:
        return """
        <section class="section card" id="sec-priority">
          <div class="card-head"><div><h3>推荐优化顺序</h3><p class="card-sub">宁缺毋滥：当前证据条件下暂未形成明确优化点</p></div></div>
        </section>
        """
    trunc = '<div class="anom-strip" style="margin-bottom:14px">已按上限约束仅展示前 3 项优化点</div>' if truncated else ""
    return f"""
    <section class="section card" id="sec-priority">
      <div class="card-head">
        <div>
          <h3>优化优先级对比</h3>
          <p class="card-sub">气泡位置看「影响 × 证据」、颜色看「成本」；右侧三轴条直观对比投入产出</p>
        </div>
        <div class="mini-legend" style="margin:0">
          <span><i class="ldot" style="background:#059669"></i>低成本</span>
          <span><i class="ldot" style="background:#D97706"></i>中成本</span>
          <span><i class="ldot" style="background:#DC2626"></i>高成本</span>
        </div>
      </div>
      {trunc}
      <div class="prio-visual-grid">
        <div class="matrix-wrap">{build_priority_quadrant_svg(recs)}</div>
        {build_priority_bars_html(recs)}
      </div>
    </section>
    """


# ---------------------------------------------------------------------------
# 5. Per-Recommendation Visual Card (Chart Front + Expandable 7-Element Drawer)
# ---------------------------------------------------------------------------
def build_rec_visual_html(rec: dict[str, Any]) -> str:
    vis = rec.get("visual")
    if isinstance(vis, dict):
        vtype = str(vis.get("type") or "").lower()
        vtitle = str(vis.get("title") or "")
        items = vis.get("items") or []

        if vtype == "before_after" and items:
            rows: list[str] = []
            for it in items:
                if not isinstance(it, dict):
                    continue
                lbl = str(it.get("label") or "")
                b_txt = str(it.get("before") or "-")
                a_txt = str(it.get("after") or "-")
                bn = safe_float(it.get("before_num"))
                an = safe_float(it.get("after_num"))
                mx = max([1.0] + [x for x in (bn, an) if x is not None])
                bw = (bn / mx * 100.0) if bn is not None else 75.0
                aw = (an / mx * 100.0) if an is not None else 55.0
                rows.append(
                    f"""
                    <div class="ba-row">
                      <div class="ba-label">{esc(lbl)}</div>
                      <div class="ba-bars">
                        <div class="ba-line">
                          <span class="ba-tag tag-cur">现状</span>
                          <div class="ba-track"><div class="ba-fill fill-cur" style="width:{bw:.1f}%"></div></div>
                          <span class="ba-num">{esc(b_txt)}</span>
                        </div>
                        <div class="ba-line">
                          <span class="ba-tag tag-new">建议</span>
                          <div class="ba-track"><div class="ba-fill fill-new" style="width:{aw:.1f}%"></div></div>
                          <span class="ba-num num-new">{esc(a_txt)}</span>
                        </div>
                      </div>
                    </div>
                    """
                )
            return f"""
            <div class="rec-visual-box">
              {f'<div class="rv-title">{esc(vtitle)}</div>' if vtitle else ''}
              {"".join(rows)}
            </div>
            """

        if vtype == "compare" and items:
            vals = [safe_float(it.get("value")) or 0.0 for it in items if isinstance(it, dict)]
            mx = max([1.0] + vals)
            rows = []
            for idx, it in enumerate(items):
                if not isinstance(it, dict):
                    continue
                v = safe_float(it.get("value")) or 0.0
                w_pct = max(8.0, v / mx * 100.0)
                col = str(it.get("color") or DEFAULT_PALETTE[idx % len(DEFAULT_PALETTE)])
                unit = str(it.get("unit") or "")
                rows.append(
                    f"""
                    <div class="cmp-bar-row">
                      <span class="cmp-lbl">{esc(it.get("label") or "")}</span>
                      <div class="ba-track"><div class="ba-fill" style="width:{w_pct:.1f}%;background:{col}"></div></div>
                      <strong class="cmp-val" style="color:{col}">{esc(fmt_num(v, unit))}</strong>
                    </div>
                    """
                )
            gap_note = str(vis.get("gap_note") or "")
            return f"""
            <div class="rec-visual-box">
              <div class="rv-head">
                <span class="rv-title">{esc(vtitle or "关键数据对比")}</span>
                {f'<span class="gap-badge">{esc(gap_note)}</span>' if gap_note else ''}
              </div>
              {"".join(rows)}
            </div>
            """

    # Fallback: visual metric tiles from data_facts.highlights
    df = rec.get("data_facts")
    hl = df.get("highlights") if isinstance(df, dict) else None
    if hl and isinstance(hl, list):
        tiles = "".join(
            f'<div class="stat-tile"><span>{esc(h.get("label") or "")}</span><strong>{esc(h.get("value") or "")}</strong></div>'
            for h in hl
            if isinstance(h, dict)
        )
        return f'<div class="stat-tiles">{tiles}</div>'
    return ""


def render_experiment_draft(draft: dict[str, Any] | None) -> str:
    if not draft or not isinstance(draft, dict):
        return ""
    rows = "".join(
        f'<div class="exp-cell"><div class="exp-k">{esc(lbl)}</div><div class="exp-v">{esc(draft.get(k) or "（待确认）")}</div></div>'
        for k, lbl in EXPERIMENT_9_LABELS
    )
    return f"""
    <details class="exp-drawer">
      <summary><span>实验发布前 9 要素审批草案（仅只读草案 · 未发布）</span><span>展开 ▾</span></summary>
      <div class="exp-body">
        <p class="exp-warn">正式发布前须单独向你确认全部 9 项并获明确授权；方案实质变化须重新授权。</p>
        <div class="exp-grid">{rows}</div>
      </div>
    </details>
    """


def render_recommendations_section(recs: list[dict[str, Any]]) -> str:
    if not recs:
        return ""
    cards: list[str] = []
    for idx, rec in enumerate(recs):
        rid = str(rec.get("id") or f"OPT-{idx + 1}")
        rank = safe_rank(rec.get("rank"), idx + 1)
        title = str(rec.get("title") or "未命名优化点")
        cat = str(rec.get("category") or "体验优化")
        vmode = str(rec.get("validation_mode") or "")
        imp = str(rec.get("impact_level") or "medium").lower()
        ev = str(rec.get("evidence_level") or "medium").lower()
        cost = str(rec.get("cost_level") or "medium").lower()

        df = rec.get("data_facts")
        df_summary = str(df.get("summary") or "") if isinstance(df, dict) else str(df or "")
        one_liner = str(rec.get("one_liner") or df_summary)
        if len(one_liner) > 95:
            one_liner = one_liner[:94] + "…"

        mb = rec.get("mechanism_basis")
        mb_summary = str(mb.get("summary") or "") if isinstance(mb, dict) else str(mb or "")
        mb_refs = (mb.get("references") or []) if isinstance(mb, dict) else []
        refs_html = (
            '<div class="chip-wrap" style="margin-top:6px">' + "".join(f'<span class="code-ref">{esc(r)}</span>' for r in mb_refs) + "</div>"
            if mb_refs
            else ""
        )

        causes = rec.get("possible_causes") or []
        if isinstance(causes, str):
            causes_html = f"<p>{esc(causes)}</p>"
        else:
            c_li = []
            for c in causes:
                if isinstance(c, dict):
                    clbl, ccls = CAUSE_TYPE_META.get(str(c.get("type") or "primary").lower(), CAUSE_TYPE_META["primary"])
                    c_li.append(f'<li><span class="ctag {ccls}">{esc(clbl)}</span>{esc(c.get("text") or "")}</li>')
                else:
                    c_li.append(f"<li>{esc(c)}</li>")
            causes_html = f'<ul class="clean-ul">{"".join(c_li)}</ul>' if c_li else '<p class="muted">未补充</p>'

        changes = rec.get("proposed_changes") or []
        if isinstance(changes, str):
            changes_list = [changes]
        else:
            changes_list = [str(x) for x in changes]
        short_changes = "".join(f'<li>{esc(ch)}</li>' for ch in changes_list[:2])
        full_changes = "".join(f'<li>{esc(ch)}</li>' for ch in changes_list)

        vp = rec.get("validation_plan")
        exp_draft = None
        if isinstance(vp, dict):
            vp_summary = str(vp.get("summary") or "")
            pm = vp.get("primary_metrics") or []
            gm = vp.get("guardrail_metrics") or []
            exp_draft = vp.get("experiment_draft_9")
            vp_html = (
                f"<p>{esc(vp_summary)}</p>"
                + ('<div class="chip-wrap" style="margin-top:6px">' + "".join(f'<span class="m-pill m-ok">核心：{esc(x)}</span>' for x in pm) + "".join(f'<span class="m-pill m-warn">护栏：{esc(x)}</span>' for x in gm) + "</div>" if (pm or gm) else "")
            )
        else:
            vp_html = f"<p>{esc(vp or '未补充')}</p>"

        cr = rec.get("cost_and_risks")
        if isinstance(cr, dict):
            cr_html = f'<p><strong>成本：</strong>{esc(cr.get("cost") or "-")}</p><p style="margin-top:4px"><strong>风险：</strong>{esc(cr.get("risks") or "-")}</p>'
        else:
            cr_html = f"<p>{esc(cr or '未补充')}</p>"

        gaps = rec.get("unconfirmed_gaps") or []
        if isinstance(gaps, str):
            gaps_html = f"<p>{esc(gaps)}</p>"
        elif gaps:
            gaps_html = '<ul class="dot-ul">' + "".join(f"<li>{esc(g)}</li>" for g in gaps) + "</ul>"
        else:
            gaps_html = '<p class="muted">无额外未确认项</p>'

        def seg_meter(score: int, color: str) -> str:
            return "".join(
                f'<i class="seg-dot" style="background:{color if i < score else "#E2E8F0"}"></i>'
                for i in range(3)
            )

        cards.append(
            f"""
            <article class="rec-card" id="rec-{esc(rid)}" data-rec-id="{esc(rid)}" data-rec-title="{esc(title)}">
              <div class="rec-top">
                <div class="rec-top-left">
                  <div class="rec-tags">
                    <span class="rank-pill rank-{rank}">推荐 #{rank}</span>
                    <span class="mono-id">{esc(rid)}</span>
                    <span class="pill-soft">{esc(cat)}</span>
                    {f'<span class="pill-blue">{esc(vmode)}</span>' if vmode else ''}
                  </div>
                  <h3>{esc(title)}</h3>
                </div>
                <label class="pick-btn">
                  <input type="checkbox" class="rec-checkbox" value="{esc(rid)}" data-title="{esc(title)}">
                  <span class="lbl-off">＋ 采纳</span>
                  <span class="lbl-on">✓ 已选</span>
                </label>
              </div>

              <div class="meter-strip">
                <span class="meter-item">影响 <b>{esc(LEVEL_ZH.get(imp, imp))}</b> <span class="seg-group">{seg_meter(LEVEL_SCORE.get(imp, 2), "#2563EB")}</span></span>
                <span class="meter-item">证据 <b>{esc(EVIDENCE_ZH.get(ev, ev))}</b> <span class="seg-group">{seg_meter(LEVEL_SCORE.get(ev, 2), "#0D9488")}</span></span>
                <span class="meter-item">成本 <b>{esc(LEVEL_ZH.get(cost, cost))}</b> <span class="seg-group">{seg_meter(COST_EASE.get(cost, 2), "#059669")}</span></span>
              </div>

              <p class="rec-oneliner">{esc(one_liner)}</p>

              {build_rec_visual_html(rec)}

              {f'<div class="quick-action"><span class="qa-tag">拟改动</span><ul>{short_changes}</ul></div>' if short_changes else ''}

              <details class="detail-drawer">
                <summary>
                  <span>展开完整 7 要素证据（数据 / 机制 / 原因 / 验证 / 风险 / 缺口）</span>
                  <span class="chev">▾</span>
                </summary>
                <div class="detail-body">
                  <div class="detail-grid">
                    <div class="d-item"><h4>01 数据事实</h4><p>{esc(df_summary)}</p></div>
                    <div class="d-item"><h4>02 机制依据</h4><p>{esc(mb_summary)}</p>{refs_html}</div>
                    <div class="d-item"><h4>03 可能原因</h4>{causes_html}</div>
                    <div class="d-item"><h4>04 完整改动</h4><ol class="num-ol">{full_changes}</ol></div>
                    <div class="d-item"><h4>05 验证办法</h4>{vp_html}</div>
                    <div class="d-item"><h4>06 成本与风险</h4>{cr_html}</div>
                    <div class="d-item d-span"><h4>07 未确认部分</h4>{gaps_html}</div>
                  </div>
                  {render_experiment_draft(exp_draft)}
                </div>
              </details>
            </article>
            """
        )

    grid_cls = "rec-grid-3" if len(recs) == 3 else ("rec-grid-2" if len(recs) == 2 else "rec-grid-1")
    return f"""
    <section class="section" id="sec-recs">
      <div class="sec-head">
        <div>
          <h2>优化建议决策卡（共 {len(recs)} 项）</h2>
          <p class="sec-desc">先看图示与核心改动，需要核对代码和全部 7 要素时再点开详情抽屉</p>
        </div>
        <button type="button" class="btn btn-sm" id="btnToggleAllDetails">展开全部文字详情</button>
      </div>
      <div class="rec-grid {grid_cls}">
        {"".join(cards)}
      </div>
    </section>
    """


def render_meta_and_caveats_bar(meta: dict[str, Any], caveats: list[dict[str, Any]], sources: dict[str, Any]) -> str:
    scope_pairs = [
        ("分析窗口", meta.get("analysis_window")),
        ("平台", meta.get("platform")),
        ("版本", meta.get("version_scope")),
        ("人群", meta.get("cohort")),
        ("样本量", meta.get("sample_size")),
        ("留存观察期", meta.get("retention_window")),
        ("Milestone", meta.get("milestone_health")),
    ]
    scope_items = "".join(
        f'<div class="sc-item"><span>{esc(k)}</span><strong>{esc(v)}</strong></div>'
        for k, v in scope_pairs
        if v
    )
    cav_items = "".join(
        f'<div class="cav-line {CAVEAT_META.get(str(c.get("severity") or "info").lower(), CAVEAT_META["info"])[1]}"><b>{esc(CAVEAT_META.get(str(c.get("severity") or "info").lower(), CAVEAT_META["info"])[0])}</b><strong>{esc(c.get("title") or "")}：</strong><span>{esc(c.get("detail") or "")}</span></div>'
        for c in caveats
    )
    docs = (sources or {}).get("docs_and_reports") or []
    codes = (sources or {}).get("code_files") or []
    src_html = ""
    if docs or codes:
        d_chips = "".join(f'<span class="code-ref">{esc(d.get("name") or "")}</span>' for d in docs if isinstance(d, dict))
        c_chips = "".join(f'<span class="code-ref">{esc(c.get("path") or "")}</span>' for c in codes if isinstance(c, dict))
        src_html = f"""
        <div class="src-compact">
          {f'<div><span class="sc-lbl">已读文档/报表</span><div class="chip-wrap">{d_chips}</div></div>' if d_chips else ''}
          {f'<div><span class="sc-lbl">已核对源码</span><div class="chip-wrap">{c_chips}</div></div>' if c_chips else ''}
        </div>
        """

    quick_chips = [
        meta.get("version_scope"),
        meta.get("analysis_window"),
        meta.get("sample_size"),
        meta.get("platform"),
    ]
    chips_html = "".join(f'<span class="pill-soft">{esc(x)}</span>' for x in quick_chips if x)
    cav_badge = f'<span class="cav-count-pill">⚠ {len(caveats)} 条口径/异常提示</span>' if caveats else ""

    return f"""
    <details class="scope-bar">
      <summary>
        <div class="scope-summary-left">
          <span class="scope-ok-tag">✓ 数据口径已核查</span>
          {chips_html}
          {cav_badge}
        </div>
        <span class="scope-expand-hint">查看口径与核查来源 ▾</span>
      </summary>
      <div class="scope-panel">
        <div class="sc-grid">{scope_items}</div>
        {f'<div class="cav-box">{cav_items}</div>' if cav_items else ''}
        {src_html}
      </div>
    </details>
    """


def render_html(data: dict[str, Any]) -> str:
    meta = data.get("meta") or {}
    executive = data.get("executive") or {}
    caveats = data.get("data_caveats") or []
    metrics = data.get("overview_metrics") or []
    funnels = data.get("funnels") or []
    charts = data.get("charts") or []
    raw_recs = data.get("recommendations") or []
    truncated = len(raw_recs) > 3
    recs = raw_recs[:3]
    sources = data.get("checked_sources") or {}

    game_name = str(meta.get("game_name") or "未命名游戏")
    game_id = str(meta.get("game_id") or "-")
    generated_at = str(meta.get("generated_at") or datetime.now().strftime("%Y-%m-%d %H:%M"))
    storage_key = f"game_diagnosis_v3::{game_name}::{game_id}::{generated_at}"
    headline = str(executive.get("headline") or f"{game_name} 游戏诊断可视化看板")

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(game_name)} · 游戏诊断可视化看板</title>
<style>
  :root {{
    --bg: #F3F5F8;
    --surface: #FFFFFF;
    --subtle: #F8FAFC;
    --hover: #F1F5F9;
    --border: #E5E9F0;
    --border-strong: #CBD5E1;
    --ink: #0F172A;
    --body: #334155;
    --muted: #64748B;
    --blue: #2563EB;
    --blue-bg: #EFF6FF;
    --ok: #059669;
    --ok-bg: #ECFDF5;
    --warn: #B45309;
    --warn-bg: #FFFBEB;
    --bad: #DC2626;
    --bad-bg: #FEF2F2;
    --purple: #6D28D9;
    --purple-bg: #F5F3FF;
    --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 18px rgba(15, 23, 42, 0.035);
    --font: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", -apple-system, sans-serif;
    --mono: "JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, monospace;
  }}
  * {{ box-sizing: border-box; }}
  html {{ scroll-behavior: smooth; }}
  body {{
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--font);
    font-size: 13.5px;
    line-height: 1.55;
    padding-bottom: 92px;
    -webkit-font-smoothing: antialiased;
  }}

  /* Topbar */
  .topbar {{
    position: sticky;
    top: 0;
    z-index: 40;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }}
  .topbar-inner {{
    max-width: 1240px;
    margin: 0 auto;
    padding: 10px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }}
  .brand {{ display: flex; align-items: center; gap: 10px; min-width: 0; }}
  .brand-mark {{
    width: 28px; height: 28px; border-radius: 8px;
    background: linear-gradient(135deg, #2563EB, #0D9488);
    color: #fff; font-weight: 800; font-size: 12.5px;
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  }}
  .brand-name {{ font-weight: 700; font-size: 15px; white-space: nowrap; }}
  .ro-pill {{
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 9px; border-radius: 999px;
    background: var(--ok-bg); color: var(--ok); font-size: 11.5px; font-weight: 600;
  }}
  .ro-pill::before {{ content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--ok); }}
  .nav-links {{ display: flex; gap: 18px; font-size: 13px; }}
  .nav-links a {{ color: var(--muted); text-decoration: none; font-weight: 500; }}
  .nav-links a:hover {{ color: var(--ink); }}
  .top-right {{ display: flex; gap: 8px; align-items: center; }}

  .btn {{
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 33px; padding: 0 13px; border-radius: 8px;
    font-size: 12.5px; font-weight: 600; font-family: var(--font);
    cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--body);
    transition: all 0.15s;
  }}
  .btn:hover {{ background: var(--subtle); border-color: var(--border-strong); color: var(--ink); }}
  .btn-sm {{ height: 30px; padding: 0 11px; font-size: 12px; }}
  .btn-primary {{ background: var(--blue); border-color: var(--blue); color: #fff; }}
  .btn-primary:hover {{ background: #1D4ED8; border-color: #1D4ED8; color: #fff; }}

  .page {{ max-width: 1240px; margin: 0 auto; padding: 18px 24px 28px; }}
  .section {{ margin-bottom: 18px; scroll-margin-top: 66px; }}

  /* Compact Headline Banner */
  .headline-bar {{
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;
    margin-bottom: 12px;
  }}
  .headline-bar h1 {{
    margin: 0; font-size: 21px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink);
  }}
  .headline-meta {{ font-size: 12px; color: var(--muted); display: flex; gap: 10px; align-items: center; }}

  /* Collapsible Scope & Caveat Strip */
  .scope-bar {{
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    margin-bottom: 16px; box-shadow: var(--shadow); overflow: hidden;
  }}
  .scope-bar summary {{
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;
    padding: 10px 16px; cursor: pointer; list-style: none;
  }}
  .scope-bar summary::-webkit-details-marker {{ display: none; }}
  .scope-summary-left {{ display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }}
  .scope-ok-tag {{ font-size: 12px; font-weight: 700; color: var(--ok); background: var(--ok-bg); padding: 2px 9px; border-radius: 6px; }}
  .cav-count-pill {{ font-size: 12px; font-weight: 600; color: var(--warn); background: var(--warn-bg); padding: 2px 9px; border-radius: 6px; border: 1px solid #FDE68A; }}
  .scope-expand-hint {{ font-size: 12px; color: var(--muted); font-weight: 600; }}
  .scope-panel {{ padding: 14px 16px 16px; border-top: 1px solid var(--border); background: var(--subtle); }}
  .sc-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 10px 16px; }}
  .sc-item {{ display: flex; flex-direction: column; }}
  .sc-item span {{ font-size: 11px; color: var(--muted); }}
  .sc-item strong {{ font-size: 12.5px; color: var(--ink); }}
  .cav-box {{ display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }}
  .cav-line {{ padding: 7px 11px; border-radius: 8px; font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }}
  .cav-info {{ background: var(--blue-bg); color: var(--body); }}
  .cav-warn {{ background: var(--warn-bg); color: var(--body); }}
  .cav-anom {{ background: var(--bad-bg); color: var(--body); }}
  .cav-line b {{ font-size: 11px; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,0.85); }}
  .cav-anom b {{ color: var(--bad); }} .cav-warn b {{ color: var(--warn); }} .cav-info b {{ color: var(--blue); }}
  .src-compact {{ display: flex; flex-wrap: wrap; gap: 12px 24px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); }}
  .sc-lbl {{ display: block; font-size: 11px; color: var(--muted); font-weight: 600; margin-bottom: 4px; }}

  /* KPI Strip with Mini Charts */
  .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }}
  .kpi-card {{
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px 18px; box-shadow: var(--shadow);
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }}
  .kpi-main {{ min-width: 0; flex: 1; }}
  .kpi-label-row {{ display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }}
  .kpi-label {{ font-size: 12.5px; font-weight: 600; color: var(--muted); }}
  .kpi-status {{ display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; }}
  .kpi-status i {{ width: 6px; height: 6px; border-radius: 50%; display: inline-block; }}
  .ms-good {{ color: var(--ok); }} .ms-good i {{ background: var(--ok); }}
  .ms-warn, .ms-anom {{ color: var(--warn); }} .ms-warn i, .ms-anom i {{ background: #D97706; }}
  .ms-bad {{ color: var(--bad); }} .ms-bad i {{ background: var(--bad); }}
  .ms-neutral {{ color: var(--blue); }} .ms-neutral i {{ background: var(--blue); }}
  .kpi-value {{ font-size: 28px; font-weight: 800; letter-spacing: -0.025em; font-variant-numeric: tabular-nums; line-height: 1.15; }}
  .kpi-foot {{ display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; font-size: 11.5px; }}
  .kpi-delta {{ font-weight: 700; }}
  .kpi-cal {{ color: var(--muted); background: var(--subtle); border: 1px solid var(--border); padding: 1px 6px; border-radius: 5px; }}
  .kpi-note {{ color: var(--muted); }}
  .kpi-viz {{ flex-shrink: 0; display: flex; align-items: center; }}

  /* Cards & Visual Analytics Hub */
  .card {{
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 20px 22px; box-shadow: var(--shadow);
  }}
  .card-head {{ display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }}
  .card-head h3 {{ margin: 0; font-size: 16px; font-weight: 700; color: var(--ink); }}
  .card-sub {{ margin: 2px 0 0; font-size: 12px; color: var(--muted); }}
  .sec-head {{ display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px; margin-bottom: 12px; }}
  .sec-head h2 {{ margin: 0; font-size: 17px; font-weight: 800; }}
  .sec-desc {{ margin: 2px 0 0; font-size: 12.5px; color: var(--muted); }}

  .viz-hero-grid {{ display: grid; grid-template-columns: 1.32fr 1fr; gap: 16px; margin-bottom: 16px; }}
  .viz-sub-grid {{ display: grid; gap: 16px; }}
  .viz-sub-grid.grid-2 {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .viz-sub-grid.grid-1 {{ grid-template-columns: 1fr; }}
  .chart-svg {{ width: 100%; height: auto; display: block; }}
  .chart-subbar {{ display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }}
  .chart-takeaway {{ font-size: 12.5px; font-weight: 600; color: var(--body); }}
  .mini-legend {{ display: flex; flex-wrap: wrap; gap: 14px; font-size: 11.5px; color: var(--muted); margin-bottom: 8px; }}
  .ldot {{ display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }}

  .seg-control {{ display: inline-flex; padding: 3px; border-radius: 9px; background: var(--hover); border: 1px solid var(--border); gap: 2px; }}
  .seg-btn {{ border: none; background: transparent; color: var(--muted); font-family: var(--font); font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 6px; cursor: pointer; }}
  .seg-btn.active {{ background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(15,23,42,0.08); }}
  .funnel-panel {{ display: none; }}
  .funnel-panel.active {{ display: block; }}
  .flow-panel {{ display: none; }}
  .flow-panel.active {{ display: block; }}

  .anom-strip {{
    margin-top: 10px; padding: 9px 12px; border-radius: 9px;
    background: var(--warn-bg); border: 1px dashed #F59E0B; font-size: 12px; color: var(--warn);
  }}
  .anom-title {{ font-weight: 700; display: block; margin-bottom: 4px; }}
  .anom-list {{ display: flex; flex-wrap: wrap; gap: 8px; }}
  .anom-chip {{ background: #fff; border: 1px solid #FDE68A; border-radius: 6px; padding: 3px 8px; display: inline-flex; gap: 6px; color: var(--body); }}

  /* Donut */
  .donut-layout {{ display: flex; align-items: center; gap: 22px; padding: 6px 4px; }}
  .donut-svg {{ flex-shrink: 0; }}
  .donut-legend {{ flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }}
  .donut-row-top {{ display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 4px; }}
  .donut-bar-track {{ height: 6px; border-radius: 999px; background: #EEF2F6; overflow: hidden; }}
  .donut-bar-fill {{ height: 100%; border-radius: 999px; }}

  /* Priority Visual */
  .prio-visual-grid {{ display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 20px; align-items: center; }}
  .matrix-wrap {{ background: var(--subtle); border: 1px solid var(--border); border-radius: 12px; padding: 10px; }}
  .pbar-list {{ display: flex; flex-direction: column; gap: 12px; }}
  .pbar-item {{
    padding: 13px 16px; border-radius: 12px; background: var(--subtle); border: 1px solid var(--border);
    cursor: pointer; transition: border-color 0.15s, background 0.15s;
  }}
  .pbar-item:hover {{ border-color: var(--blue); background: #FFFFFF; }}
  .pbar-head {{ display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }}
  .pbar-title-wrap {{ display: flex; align-items: center; gap: 8px; font-size: 14px; }}
  .pbar-metrics {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }}
  .pbar-m {{ display: flex; align-items: center; gap: 7px; font-size: 11.5px; }}
  .pm-k {{ color: var(--muted); white-space: nowrap; }}
  .pm-track {{ flex: 1; height: 7px; border-radius: 999px; background: #E2E8F0; overflow: hidden; }}
  .pm-fill {{ height: 100%; border-radius: 999px; }}
  .pm-v {{ font-weight: 700; color: var(--ink); white-space: nowrap; }}

  /* Recommendation Decision Cards */
  .rec-grid {{ display: grid; gap: 16px; align-items: start; }}
  .rec-grid-1 {{ grid-template-columns: 1fr; }}
  .rec-grid-2 {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .rec-grid-3 {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
  .rec-card {{
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 18px 20px; box-shadow: var(--shadow); transition: border-color 0.15s, box-shadow 0.15s;
    scroll-margin-top: 68px;
  }}
  .rec-card.is-picked {{ border-color: var(--ok); box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.16), var(--shadow); }}
  .rec-top {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }}
  .rec-tags {{ display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }}
  .rec-top h3 {{ margin: 0; font-size: 16.5px; font-weight: 800; line-height: 1.35; }}

  .rank-pill {{ padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 800; }}
  .rank-1 {{ background: var(--ok-bg); color: var(--ok); }}
  .rank-2 {{ background: var(--blue-bg); color: var(--blue); }}
  .rank-3 {{ background: var(--purple-bg); color: var(--purple); }}
  .pill-soft {{ padding: 2px 7px; border-radius: 6px; font-size: 11px; background: var(--subtle); border: 1px solid var(--border); color: var(--muted); }}
  .pill-blue {{ padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 600; background: var(--blue-bg); color: var(--blue); }}
  .mono-id {{ font-family: var(--mono); font-size: 11.5px; color: var(--muted); font-weight: 600; }}

  .pick-btn {{
    display: inline-flex; align-items: center; padding: 5px 11px; border-radius: 8px;
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--body);
    font-size: 12px; font-weight: 700; cursor: pointer; user-select: none; white-space: nowrap;
  }}
  .pick-btn:hover {{ border-color: var(--ok); color: var(--ok); background: var(--ok-bg); }}
  .pick-btn input {{ display: none; }}
  .pick-btn .lbl-on {{ display: none; }}
  .rec-card.is-picked .pick-btn {{ background: var(--ok); border-color: var(--ok); color: #fff; }}
  .rec-card.is-picked .pick-btn .lbl-off {{ display: none; }}
  .rec-card.is-picked .pick-btn .lbl-on {{ display: inline; }}

  .meter-strip {{
    display: flex; flex-wrap: wrap; gap: 10px 14px;
    margin: 10px 0; padding: 7px 10px; border-radius: 8px; background: var(--subtle);
    font-size: 11.5px; color: var(--muted);
  }}
  .meter-item {{ display: inline-flex; align-items: center; gap: 5px; }}
  .meter-item b {{ color: var(--ink); }}
  .seg-group {{ display: inline-flex; gap: 2px; }}
  .seg-dot {{ width: 9px; height: 5px; border-radius: 2px; display: inline-block; }}

  .rec-oneliner {{ margin: 0 0 12px; font-size: 13px; color: var(--body); }}

  /* Per-rec visual chart box */
  .rec-visual-box {{
    background: var(--subtle); border: 1px solid var(--border); border-radius: 10px;
    padding: 11px 13px; margin-bottom: 12px;
  }}
  .rv-head {{ display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }}
  .rv-title {{ font-size: 11.5px; font-weight: 700; color: var(--muted); margin-bottom: 7px; }}
  .rv-head .rv-title {{ margin-bottom: 0; }}
  .gap-badge {{ font-size: 11px; font-weight: 700; color: var(--bad); background: var(--bad-bg); padding: 1px 7px; border-radius: 999px; }}
  .ba-row {{ margin-bottom: 9px; }}
  .ba-row:last-child {{ margin-bottom: 0; }}
  .ba-label {{ font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }}
  .ba-bars {{ display: flex; flex-direction: column; gap: 4px; }}
  .ba-line, .cmp-bar-row {{ display: grid; grid-template-columns: 36px 1fr 68px; gap: 8px; align-items: center; }}
  .cmp-bar-row {{ grid-template-columns: 92px 1fr 62px; margin-bottom: 6px; }}
  .cmp-bar-row:last-child {{ margin-bottom: 0; }}
  .cmp-lbl {{ font-size: 12px; color: var(--body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .cmp-val {{ text-align: right; font-size: 12.5px; font-variant-numeric: tabular-nums; }}
  .ba-tag {{ font-size: 10.5px; font-weight: 700; text-align: center; padding: 1px 4px; border-radius: 4px; }}
  .tag-cur {{ background: #E2E8F0; color: #475569; }}
  .tag-new {{ background: #D1FAE5; color: #059669; }}
  .ba-track {{ height: 9px; border-radius: 999px; background: #E8EDF4; overflow: hidden; }}
  .ba-fill {{ height: 100%; border-radius: 999px; }}
  .fill-cur {{ background: #94A3B8; }}
  .fill-new {{ background: #059669; }}
  .ba-num {{ text-align: right; font-size: 11.5px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }}
  .num-new {{ color: var(--ok); font-weight: 700; }}

  .stat-tiles {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px; margin-bottom: 12px; }}
  .stat-tile {{ background: var(--subtle); border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; }}
  .stat-tile span {{ display: block; font-size: 11px; color: var(--muted); }}
  .stat-tile strong {{ font-size: 16px; color: var(--ink); font-variant-numeric: tabular-nums; }}

  .quick-action {{
    background: #F4FBF8; border: 1px solid #D1FAE5; border-radius: 9px;
    padding: 9px 12px; margin-bottom: 10px; font-size: 12.5px; color: var(--ink);
  }}
  .qa-tag {{ display: inline-block; font-size: 10.5px; font-weight: 700; color: var(--ok); background: #D1FAE5; padding: 1px 6px; border-radius: 4px; margin-bottom: 4px; }}
  .quick-action ul {{ margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }}

  /* Expandable 7-Element Detail Drawer */
  .detail-drawer {{ border-top: 1px solid var(--border); padding-top: 8px; }}
  .detail-drawer summary {{
    display: flex; justify-content: space-between; align-items: center;
    cursor: pointer; list-style: none; font-size: 12px; font-weight: 600; color: var(--blue); padding: 4px 0;
  }}
  .detail-drawer summary::-webkit-details-marker {{ display: none; }}
  .detail-body {{ padding-top: 10px; }}
  .detail-grid {{ display: grid; grid-template-columns: 1fr; gap: 10px; }}
  .d-item {{ padding: 9px 11px; border-radius: 8px; background: var(--subtle); border: 1px solid var(--border); font-size: 12.5px; color: var(--body); }}
  .d-item h4 {{ margin: 0 0 4px; font-size: 12px; font-weight: 700; color: var(--ink); }}
  .d-item p {{ margin: 0; }}
  .chip-wrap {{ display: flex; flex-wrap: wrap; gap: 5px; }}
  .code-ref {{ font-family: var(--mono); font-size: 11px; padding: 2px 6px; border-radius: 5px; background: #fff; border: 1px solid var(--border); color: var(--body); }}
  .clean-ul {{ list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }}
  .ctag {{ font-size: 10.5px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-right: 6px; }}
  .cause-primary {{ background: var(--bad-bg); color: var(--bad); }}
  .cause-secondary {{ background: var(--warn-bg); color: var(--warn); }}
  .cause-ruled-out {{ background: var(--hover); color: var(--muted); text-decoration: line-through; }}
  .num-ol, .dot-ul {{ margin: 0; padding-left: 17px; display: flex; flex-direction: column; gap: 4px; }}
  .m-pill {{ font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 5px; }}
  .m-ok {{ background: var(--ok-bg); color: var(--ok); }}
  .m-warn {{ background: var(--warn-bg); color: var(--warn); }}

  .exp-drawer {{ margin-top: 10px; border: 1px solid #FDE68A; border-radius: 9px; background: var(--warn-bg); overflow: hidden; }}
  .exp-drawer summary {{ padding: 8px 11px; font-size: 11.5px; font-weight: 700; color: var(--warn); display: flex; justify-content: space-between; cursor: pointer; list-style: none; }}
  .exp-body {{ padding: 10px 11px; background: #fff; border-top: 1px solid #FDE68A; }}
  .exp-warn {{ margin: 0 0 8px; font-size: 11.5px; color: var(--warn); }}
  .exp-grid {{ display: grid; grid-template-columns: 1fr; gap: 6px; }}
  .exp-cell {{ padding: 6px 8px; border-radius: 6px; background: var(--subtle); font-size: 11.5px; }}
  .exp-k {{ font-weight: 700; color: var(--muted); }}

  /* Floating Bottom Decision Dock */
  .dock {{
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(12px);
    border-top: 1px solid var(--border); box-shadow: 0 -6px 24px rgba(15, 23, 42, 0.06);
  }}
  .dock-inner {{
    max-width: 1240px; margin: 0 auto; padding: 10px 24px;
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  }}
  .dock-picked {{ font-size: 13px; color: var(--body); font-weight: 600; min-width: 180px; }}
  .dock-input {{
    flex: 1; min-width: 220px; height: 34px; padding: 0 12px;
    border-radius: 8px; border: 1px solid var(--border); background: var(--subtle);
    font-family: var(--font); font-size: 12.5px; color: var(--ink);
  }}
  .dock-input:focus {{ outline: none; border-color: var(--blue); background: #fff; }}
  .dock-note {{ font-size: 11px; color: var(--muted); }}

  /* Hover Tooltip & Toast */
  .svg-tip {{
    position: fixed; pointer-events: none; z-index: 999;
    background: rgba(15, 23, 42, 0.92); color: #fff; font-size: 12px; font-weight: 500;
    padding: 6px 10px; border-radius: 7px; max-width: 300px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.22); opacity: 0; transition: opacity 0.12s;
  }}
  .svg-tip.show {{ opacity: 1; }}
  .toast {{
    position: fixed; right: 24px; bottom: 74px; z-index: 999;
    background: #0F172A; color: #fff; font-size: 12.5px; font-weight: 600;
    padding: 9px 15px; border-radius: 9px; opacity: 0; transform: translateY(6px);
    pointer-events: none; transition: all 0.2s;
  }}
  .toast.show {{ opacity: 1; transform: translateY(0); }}
  .empty-text, .muted {{ color: var(--muted); font-size: 12.5px; }}

  @media (max-width: 1024px) {{
    .viz-hero-grid, .viz-sub-grid.grid-2, .prio-visual-grid, .rec-grid-3 {{ grid-template-columns: 1fr; }}
    .rec-grid-2 {{ grid-template-columns: 1fr; }}
    .pbar-metrics {{ grid-template-columns: 1fr; }}
  }}
  @media (max-width: 720px) {{
    .nav-links {{ display: none; }}
    .donut-layout {{ flex-direction: column; }}
  }}
  @media print {{
    body {{ background: #fff; padding-bottom: 0; }}
    .topbar, .dock, .pick-btn, #btnToggleAllDetails {{ display: none !important; }}
    .card, .rec-card, .kpi-card {{ box-shadow: none; break-inside: avoid; }}
  }}
</style>
</head>
<body>
<nav class="topbar">
  <div class="topbar-inner">
    <div class="brand">
      <span class="brand-mark">GP</span>
      <span class="brand-name">{esc(game_name)}</span>
      <span class="ro-pill">只读诊断</span>
    </div>
    <div class="nav-links">
      <a href="#sec-kpi">核心指标</a>
      <a href="#sec-charts">数据图表</a>
      <a href="#sec-flow">决策流程图</a>
      <a href="#sec-priority">优先级</a>
      <a href="#sec-recs">优化方案</a>
    </div>
    <div class="top-right">
      <button type="button" class="btn" id="btnPrint">导出 PDF</button>
      <button type="button" class="btn btn-primary" id="btnCopyTop">复制决策回复</button>
    </div>
  </div>
</nav>

<main class="page">
  <div class="headline-bar">
    <h1>{esc(headline)}</h1>
    <div class="headline-meta">
      <span class="mono-id">gameId: {esc(game_id)}</span>
      <span>·</span>
      <span>{esc(generated_at)}</span>
    </div>
  </div>

  {render_meta_and_caveats_bar(meta, caveats, sources)}
  {render_kpi_strip(metrics)}
  {render_visual_analytics_hub(funnels, charts)}
  {render_flowcharts_section(data, recs)}
  {render_priority_section(recs, truncated)}
  {render_recommendations_section(recs)}
</main>

<div class="dock">
  <div class="dock-inner">
    <div class="dock-picked" id="dockPicked">尚未勾选方案（点击卡片「＋ 采纳」）</div>
    <input type="text" class="dock-input" id="customNote" placeholder="可选补充备注或约束（如：优先只改配置不发版）...">
    <button type="button" class="btn btn-primary" id="btnCopyDock">复制对齐回复</button>
    <span class="dock-note">只读分析 · 实验发布前须单独确认 9 要素授权</span>
  </div>
</div>

<div class="svg-tip" id="svgTip"></div>
<div class="toast" id="toast">已复制到剪贴板</div>

<script>
(function() {{
  const STORAGE_KEY = {json.dumps(storage_key, ensure_ascii=False)};
  const GAME_NAME = {json.dumps(game_name, ensure_ascii=False)};
  const checkboxes = Array.from(document.querySelectorAll('.rec-checkbox'));
  const dockPicked = document.getElementById('dockPicked');
  const customNote = document.getElementById('customNote');
  const btnCopyTop = document.getElementById('btnCopyTop');
  const toast = document.getElementById('toast');
  const tipEl = document.getElementById('svgTip');

  function showToast(msg) {{
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }}

  try {{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{{}}');
    if (Array.isArray(saved.picked)) {{
      checkboxes.forEach(cb => {{ if (saved.picked.includes(cb.value)) cb.checked = true; }});
    }}
    if (typeof saved.note === 'string') customNote.value = saved.note;
  }} catch (e) {{}}

  function syncPicked() {{
    const picked = [];
    checkboxes.forEach(cb => {{
      const card = cb.closest('.rec-card');
      if (cb.checked) {{
        picked.push({{ id: cb.value, title: cb.dataset.title || cb.value }});
        if (card) card.classList.add('is-picked');
      }} else if (card) {{
        card.classList.remove('is-picked');
      }}
    }});
    btnCopyTop.textContent = picked.length > 0 ? `复制决策回复 (${{picked.length}})` : '复制决策回复';
    dockPicked.textContent = picked.length > 0
      ? '已选方案：' + picked.map(p => p.id).join('、')
      : '尚未勾选方案（点击卡片「＋ 采纳」）';
    try {{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({{ picked: picked.map(p => p.id), note: customNote.value }}));
    }} catch (e) {{}}
  }}
  checkboxes.forEach(cb => cb.addEventListener('change', syncPicked));
  customNote.addEventListener('input', syncPicked);
  syncPicked();

  // Funnel & Flowchart tab switching
  document.querySelectorAll('[data-funnel-tab]').forEach(btn => {{
    btn.addEventListener('click', () => {{
      const id = btn.getAttribute('data-funnel-tab');
      document.querySelectorAll('[data-funnel-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-funnel-panel]').forEach(p => p.classList.toggle('active', p.getAttribute('data-funnel-panel') === id));
    }});
  }});
  document.querySelectorAll('[data-flow-tab]').forEach(btn => {{
    btn.addEventListener('click', () => {{
      const id = btn.getAttribute('data-flow-tab');
      document.querySelectorAll('[data-flow-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-flow-panel]').forEach(p => p.classList.toggle('active', p.getAttribute('data-flow-panel') === id));
    }});
  }});

  // Click jump handlers
  document.querySelectorAll('[data-jump], [data-target]').forEach(el => {{
    el.addEventListener('click', () => {{
      const id = el.getAttribute('data-jump') || el.getAttribute('data-target');
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({{ behavior: 'smooth', block: 'start' }});
    }});
  }});

  // Toggle all detail drawers
  const btnAll = document.getElementById('btnToggleAllDetails');
  if (btnAll) {{
    let allOpen = false;
    btnAll.addEventListener('click', () => {{
      allOpen = !allOpen;
      document.querySelectorAll('.detail-drawer').forEach(d => {{ d.open = allOpen; }});
      btnAll.textContent = allOpen ? '收起全部文字详情' : '展开全部文字详情';
    }});
  }}

  // SVG hover tooltips
  document.querySelectorAll('[data-tip]').forEach(el => {{
    el.addEventListener('mouseenter', (e) => {{
      tipEl.textContent = el.getAttribute('data-tip') || '';
      tipEl.classList.add('show');
    }});
    el.addEventListener('mousemove', (e) => {{
      const x = Math.min(window.innerWidth - 320, e.clientX + 14);
      const y = Math.max(12, e.clientY - 36);
      tipEl.style.left = x + 'px';
      tipEl.style.top = y + 'px';
    }});
    el.addEventListener('mouseleave', () => tipEl.classList.remove('show'));
  }});

  document.getElementById('btnPrint').addEventListener('click', () => window.print());

  function copyDecision() {{
    const picked = checkboxes.filter(cb => cb.checked).map(cb => `- ${{cb.value}}：${{cb.dataset.title || ''}}`);
    const note = customNote.value.trim();
    const lines = [`我已查看「${{GAME_NAME}}」的 GamePropel 只读诊断看板，下一步决定如下：`];
    if (picked.length > 0) {{
      lines.push('拟推进的优化点：', ...picked);
    }} else {{
      lines.push('暂不执行上述优化点，请先继续补充排查。');
    }}
    if (note) lines.push('补充说明：' + note);
    lines.push('（如涉及实验发布，请先单独列出全部 9 项实验要素等我明确授权。）');
    const text = lines.join('\\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {{
      navigator.clipboard.writeText(text).then(() => showToast('已复制对齐回复，可直接粘贴回对话'));
    }} else {{
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('已复制对齐回复，可直接粘贴回对话');
    }}
  }}
  btnCopyTop.addEventListener('click', copyDecision);
  document.getElementById('btnCopyDock').addEventListener('click', copyDecision);
}})();
</script>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render GamePropel game diagnosis JSON into a chart-first daylight HTML dashboard."
    )
    parser.add_argument("--input", "-i", required=True, help="Path to diagnosis JSON file (UTF-8).")
    parser.add_argument("--output", "-o", required=True, help="Path to output HTML file.")
    parser.add_argument("--open", action="store_true", help="Open generated HTML in the default browser.")
    args = parser.parse_args()

    in_path = Path(args.input).resolve()
    out_path = Path(args.output).resolve()

    if not in_path.exists():
        print(f"[ERROR] Input JSON not found: {in_path}", file=sys.stderr)
        return 1

    try:
        data = json.loads(in_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[ERROR] Failed to parse JSON {in_path}: {exc}", file=sys.stderr)
        return 1

    if not isinstance(data, dict):
        print("[ERROR] Root JSON must be an object.", file=sys.stderr)
        return 1

    secret_hits: list[str] = []
    safe_data = redact_secrets(data, secret_hits)
    if secret_hits:
        print(f"[WARN] Redacted {len(secret_hits)} GamePropel secret token(s) before rendering HTML.", file=sys.stderr)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render_html(safe_data), encoding="utf-8")
    print(f"[OK] Visual diagnosis HTML generated: {out_path}")

    if args.open:
        try:
            webbrowser.open(out_path.as_uri())
        except Exception as exc:
            print(f"[WARN] Could not auto-open browser: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
