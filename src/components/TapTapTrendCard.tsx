import React, { useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Flame,
  Heart,
  RefreshCw,
  Star,
  TrendingUp,
} from 'lucide-react';
import { ProjectCardData, TapTapStatsHistoryPoint } from '../types';
import {
  formatCompactCount,
  formatRelativeTime,
  formatStatsDelta,
  getLocalDateKey,
} from '../utils';

interface TapTapTrendCardProps {
  project: ProjectCardData;
  refreshing?: boolean;
  error?: string | null;
  onRefresh?: () => Promise<void>;
}

type MetricMode = 'heat' | 'fans' | 'both' | 'delta';
type RangeDays = 7 | 14 | 30 | 60;

interface EnrichedPoint extends TapTapStatsHistoryPoint {
  heatDelta: number | null;
  fansDelta: number | null;
}

const CHART_W = 760;
const CHART_H = 196;
const PAD = { top: 18, right: 18, bottom: 26, left: 54 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;

function buildSmoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  if (coords.length === 2) {
    return `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y}`;
  }
  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    // Clamp control point Y to avoid overshoot below baseline or above top
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const clampedCp1y = Math.max(minY, Math.min(maxY, cp1y));
    const clampedCp2y = Math.max(minY, Math.min(maxY, cp2y));

    d += ` C ${cp1x.toFixed(1)} ${clampedCp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${clampedCp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function buildAreaPath(coords: { x: number; y: number }[], baselineY: number): string {
  if (coords.length < 2) return '';
  const line = buildSmoothPath(coords);
  const last = coords[coords.length - 1];
  const first = coords[0];
  return `${line} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

function computeNiceBounds(values: number[]): { min: number; max: number } {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return { min: 0, max: 10 };
  const rawMin = Math.min(...valid);
  const rawMax = Math.max(...valid);
  if (rawMin === rawMax) {
    const pad = Math.max(5, Math.round(Math.abs(rawMax) * 0.08));
    return { min: Math.max(0, rawMin - pad), max: rawMax + pad };
  }
  const span = rawMax - rawMin;
  const pad = Math.max(1, span * 0.14);
  return {
    min: Math.max(0, Math.floor(rawMin - pad)),
    max: Math.ceil(rawMax + pad),
  };
}

function shortDateLabel(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;
  return dateKey;
}

function formatSignedNumber(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '--';
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '-'}${Math.abs(n).toLocaleString('zh-CN')}`;
}

export const TapTapTrendCard: React.FC<TapTapTrendCardProps> = ({
  project,
  refreshing,
  error,
  onRefresh,
}) => {
  const uid = useId().replace(/:/g, '');
  const [metric, setMetric] = useState<MetricMode>('heat');
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hasAppId = Boolean(
    project.taptap.appId && /^\d+$/.test(String(project.taptap.appId).trim())
  );
  const stats = project.taptapStats;

  const enrichedAll: EnrichedPoint[] = useMemo(() => {
    const hist = stats?.history || [];
    return hist.map((pt, idx) => {
      const prev = idx > 0 ? hist[idx - 1] : null;
      return {
        ...pt,
        heatDelta: prev ? pt.heat - prev.heat : null,
        fansDelta: prev ? pt.fans - prev.fans : null,
      };
    });
  }, [stats]);

  const series: EnrichedPoint[] = useMemo(() => {
    if (enrichedAll.length === 0) return [];
    if (rangeDays >= 60) return enrichedAll;
    return enrichedAll.slice(-rangeDays);
  }, [enrichedAll, rangeDays]);

  const deltaSeries = useMemo(
    () => series.filter((pt) => pt.heatDelta !== null || pt.fansDelta !== null),
    [series]
  );

  if (!hasAppId) return null;

  const todayKey = getLocalDateKey();
  const isTodaySynced = stats?.lastDateKey === todayKey;

  const heatDayDelta = stats ? formatStatsDelta(stats.heat, stats.prevHeat) : null;
  const fansDayDelta = stats ? formatStatsDelta(stats.fans, stats.prevFans) : null;

  const rangeFirst = series[0];
  const rangeLast = series[series.length - 1];
  const rangeHeatGain =
    rangeFirst && rangeLast && series.length >= 2 ? rangeLast.heat - rangeFirst.heat : null;
  const rangeFansGain =
    rangeFirst && rangeLast && series.length >= 2 ? rangeLast.fans - rangeFirst.fans : null;
  const rangePeakHeat =
    series.length > 0 ? Math.max(...series.map((p) => p.heat || 0)) : stats?.heat || 0;
  const rangePeakFans =
    series.length > 0 ? Math.max(...series.map((p) => p.fans || 0)) : stats?.fans || 0;

  // Coordinates computation for line/area modes
  const n = series.length;
  const xAt = (idx: number, total: number) => {
    if (total <= 1) return PAD.left + PLOT_W / 2;
    return PAD.left + (idx / (total - 1)) * PLOT_W;
  };

  const singleValues =
    metric === 'fans' ? series.map((p) => p.fans) : series.map((p) => p.heat);
  const singleBounds = computeNiceBounds(singleValues);
  const ySingle = (v: number) => {
    const ratio = (v - singleBounds.min) / Math.max(1, singleBounds.max - singleBounds.min);
    return PAD.top + PLOT_H * (1 - ratio);
  };

  const heatBounds = computeNiceBounds(series.map((p) => p.heat));
  const fansBounds = computeNiceBounds(series.map((p) => p.fans));
  const yHeatNorm = (v: number) => {
    const ratio = (v - heatBounds.min) / Math.max(1, heatBounds.max - heatBounds.min);
    return PAD.top + PLOT_H * (1 - (0.08 + ratio * 0.84));
  };
  const yFansNorm = (v: number) => {
    const ratio = (v - fansBounds.min) / Math.max(1, fansBounds.max - fansBounds.min);
    return PAD.top + PLOT_H * (1 - (0.08 + ratio * 0.84));
  };

  const singleCoords = series.map((pt, i) => ({
    x: xAt(i, n),
    y: ySingle(metric === 'fans' ? pt.fans : pt.heat),
  }));
  const heatCoords = series.map((pt, i) => ({ x: xAt(i, n), y: yHeatNorm(pt.heat) }));
  const fansCoords = series.map((pt, i) => ({ x: xAt(i, n), y: yFansNorm(pt.fans) }));

  // X-axis tick indices (max 6 labels, always include first & last)
  const xTickIndices = (total: number): number[] => {
    if (total <= 0) return [];
    if (total <= 6) return Array.from({ length: total }, (_, i) => i);
    const step = Math.ceil((total - 1) / 5);
    const out: number[] = [];
    for (let i = 0; i < total; i += step) out.push(i);
    if (out[out.length - 1] !== total - 1) out.push(total - 1);
    return out;
  };

  const activePoint: EnrichedPoint | null =
    metric === 'delta'
      ? hoverIdx !== null && deltaSeries[hoverIdx]
        ? deltaSeries[hoverIdx]
        : deltaSeries[deltaSeries.length - 1] || null
      : hoverIdx !== null && series[hoverIdx]
      ? series[hoverIdx]
      : series[series.length - 1] || null;

  const activeIsHovered = hoverIdx !== null;

  // Delta bar chart scaling
  const deltaMaxAbs = Math.max(
    1,
    ...deltaSeries.map((pt) => Math.max(Math.abs(pt.heatDelta || 0), Math.abs(pt.fansDelta || 0)))
  );
  const hasNegativeDelta = deltaSeries.some(
    (pt) => (pt.heatDelta || 0) < 0 || (pt.fansDelta || 0) < 0
  );
  const deltaZeroY = hasNegativeDelta ? PAD.top + PLOT_H * 0.62 : PAD.top + PLOT_H;

  const accentStroke = metric === 'fans' ? '#E11D48' : '#EA580C';
  const accentGradId = `taptap-area-${metric}-${uid}`;
  const heatGradId = `taptap-heat-${uid}`;
  const fansGradId = `taptap-fans-${uid}`;

  return (
    <section
      id="taptap-stats-trend"
      className="glass-card rounded-[22px] p-4 sm:p-5 space-y-3.5"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-500/18 to-rose-500/18 text-orange-600 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[13.5px] font-bold tracking-tight">TapTap 热度与关注趋势</h2>
              {stats && (
                <span
                  className="text-[10.5px] font-medium px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: isTodaySynced ? 'var(--pill-ok-bg)' : 'var(--bg-elevated)',
                    borderColor: isTodaySynced ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                    color: isTodaySynced ? 'var(--pill-ok-text)' : 'var(--text-muted)',
                  }}
                >
                  {isTodaySynced ? '今日已同步' : `缓存 ${stats.lastDateKey}`} · 累计 {enrichedAll.length} 天
                </span>
              )}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {stats
                ? `最近抓取于 ${formatRelativeTime(stats.fetchedAt)} · 每天首次打开自动记录 1 次（最多保留 60 天曲线）`
                : '每日首次打开自动记录 1 次热度与关注，也可随时手动刷新'}
            </div>
          </div>
        </div>

        {/* Right Controls: Metric Switcher + Range Switcher + Instant Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="inline-flex p-0.5 rounded-xl border text-[11px]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {(
              [
                { id: 'heat', label: '热度', icon: <Flame className="w-3 h-3 text-orange-500" /> },
                { id: 'fans', label: '关注', icon: <Heart className="w-3 h-3 text-rose-500" /> },
                { id: 'both', label: '双线对比', icon: <TrendingUp className="w-3 h-3 text-blue-500" /> },
                { id: 'delta', label: '每日净增', icon: <BarChart3 className="w-3 h-3 text-emerald-500" /> },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setMetric(opt.id);
                  setHoverIdx(null);
                }}
                className="h-6 px-2 rounded-lg font-medium inline-flex items-center gap-1 cursor-pointer transition-all"
                style={{
                  backgroundColor: metric === opt.id ? 'var(--bg-surface-strong)' : 'transparent',
                  color: metric === opt.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: metric === opt.id ? 'var(--card-shadow)' : 'none',
                }}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          <div
            className="inline-flex p-0.5 rounded-xl border text-[11px]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {(
              [
                { days: 7, label: '7天' },
                { days: 14, label: '14天' },
                { days: 30, label: '30天' },
                { days: 60, label: '全部' },
              ] as const
            ).map((r) => (
              <button
                key={r.days}
                onClick={() => {
                  setRangeDays(r.days);
                  setHoverIdx(null);
                }}
                className="h-6 px-2 rounded-lg font-mono font-medium cursor-pointer transition-all"
                style={{
                  backgroundColor: rangeDays === r.days ? 'var(--bg-surface-strong)' : 'transparent',
                  color: rangeDays === r.days ? 'var(--accent-primary)' : 'var(--text-muted)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {onRefresh && (
            <button
              disabled={refreshing}
              onClick={onRefresh}
              title="立即抓取当前实时热度与关注并刷新今日趋势点"
              className="h-7 px-2.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer hover:border-orange-400 hover:text-orange-600 transition-colors disabled:opacity-60"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <RefreshCw
                className={`w-3 h-3 ${refreshing ? 'animate-spin text-orange-500' : ''}`}
              />
              <span>{refreshing ? '抓取中…' : '立即刷新'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="px-3 py-2 rounded-xl border text-xs flex items-center gap-2"
          style={{
            backgroundColor: 'var(--pill-err-bg)',
            borderColor: 'var(--pill-err-border)',
            color: 'var(--pill-err-text)',
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State: never fetched yet */}
      {!stats ? (
        <div
          className="rounded-2xl border border-dashed py-8 px-4 flex flex-col items-center justify-center text-center gap-2.5"
          style={{
            borderColor: 'var(--border-strong)',
            backgroundColor: 'var(--bg-surface-strong)',
          }}
        >
          <div className="w-10 h-10 rounded-2xl bg-orange-500/12 text-orange-500 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold">尚未采集该游戏的 TapTap 热度与关注趋势</div>
          <div className="text-[11px] max-w-md" style={{ color: 'var(--text-muted)' }}>
            点击下方按钮立即记录首日基准点；之后每天首次打开 GameHub 会自动静默记录 1 次，自动绘制专属增长曲线。
          </div>
          {onRefresh && (
            <button
              disabled={refreshing}
              onClick={onRefresh}
              className="mt-1 h-8 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-92 disabled:opacity-60 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? '正在抓取实时数据…' : '立即抓取今日热度与关注'}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 4 Compact Apple Bento Summary Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div
              className="rounded-2xl border px-3.5 py-2.5"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="inline-flex items-center gap-1">
                  <Flame className="w-3 h-3 text-orange-500" />
                  当前热度
                </span>
                {heatDayDelta && (
                  <span
                    className={`font-mono font-semibold text-[10.5px] ${
                      heatDayDelta.startsWith('+') ? 'text-emerald-600' : 'text-rose-500'
                    }`}
                  >
                    较昨日 {heatDayDelta}
                  </span>
                )}
              </div>
              <div className="text-lg font-bold tracking-tight tabular-nums mt-0.5 text-orange-600 dark:text-orange-400">
                {stats.heat.toLocaleString('zh-CN')}
              </div>
            </div>

            <div
              className="rounded-2xl border px-3.5 py-2.5"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="inline-flex items-center gap-1">
                  <Heart className="w-3 h-3 text-rose-500" />
                  当前关注
                </span>
                {fansDayDelta && (
                  <span
                    className={`font-mono font-semibold text-[10.5px] ${
                      fansDayDelta.startsWith('+') ? 'text-emerald-600' : 'text-rose-500'
                    }`}
                  >
                    较昨日 {fansDayDelta}
                  </span>
                )}
              </div>
              <div className="text-lg font-bold tracking-tight tabular-nums mt-0.5 text-rose-600 dark:text-rose-400">
                {stats.fans.toLocaleString('zh-CN')}
              </div>
            </div>

            <div
              className="rounded-2xl border px-3.5 py-2.5"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                区间累计增长（{series.length} 天）
              </div>
              {series.length >= 2 ? (
                <div className="flex items-baseline gap-2.5 mt-1 text-xs font-mono font-bold tabular-nums flex-wrap">
                  <span className={(rangeHeatGain ?? 0) >= 0 ? 'text-orange-600 dark:text-orange-400' : 'text-rose-500'}>
                    热 {formatSignedNumber(rangeHeatGain)}
                  </span>
                  <span className={(rangeFansGain ?? 0) >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}>
                    关 {formatSignedNumber(rangeFansGain)}
                  </span>
                </div>
              ) : (
                <div className="text-xs font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
                  首日基线已建立
                </div>
              )}
            </div>

            <div
              className="rounded-2xl border px-3.5 py-2.5"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span>区间峰值 / 评分</span>
                {stats.score && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600">
                    <Star className="w-3 h-3 fill-current" />
                    {stats.score}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-1 text-xs font-mono font-semibold tabular-nums flex-wrap">
                <span title={`峰值热度 ${rangePeakHeat.toLocaleString('zh-CN')}`}>
                  峰热 {formatCompactCount(rangePeakHeat)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span title={`峰值关注 ${rangePeakFans.toLocaleString('zh-CN')}`}>
                  峰关 {formatCompactCount(rangePeakFans)}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Chart Canvas */}
          <div
            className="rounded-2xl border p-3 sm:p-3.5 space-y-2"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {/* Live Readout Strip (updates immediately on hover) */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-[11.5px] min-h-[22px]">
              {activePoint ? (
                <div className="flex items-center gap-3 flex-wrap tabular-nums">
                  <span
                    className="font-mono font-semibold px-2 py-0.5 rounded-md border text-[11px]"
                    style={{
                      backgroundColor: activeIsHovered ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      borderColor: activeIsHovered ? 'var(--accent-primary)' : 'var(--border-subtle)',
                      color: activeIsHovered ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {activePoint.dateKey}
                    {activePoint.dateKey === todayKey ? '（今日）' : ''}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    热度 {activePoint.heat.toLocaleString('zh-CN')}
                    {activePoint.heatDelta !== null && (
                      <span
                        className={`text-[10.5px] font-mono ${
                          activePoint.heatDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'
                        }`}
                      >
                        ({formatSignedNumber(activePoint.heatDelta)})
                      </span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    关注 {activePoint.fans.toLocaleString('zh-CN')}
                    {activePoint.fansDelta !== null && (
                      <span
                        className={`text-[10.5px] font-mono ${
                          activePoint.fansDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'
                        }`}
                      >
                        ({formatSignedNumber(activePoint.fansDelta)})
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  移动鼠标到图表上查看每日详情
                </span>
              )}

              {metric === 'both' && (
                <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                  双曲线按各自波动区间归一化，便于对比走势同步度
                </span>
              )}
            </div>

            {/* Chart Area */}
            {metric === 'delta' && deltaSeries.length === 0 ? (
              <div
                className="h-[170px] flex flex-col items-center justify-center text-center gap-1.5 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <BarChart3 className="w-5 h-5 opacity-60" />
                <span>需要至少 2 天记录才能计算「每日净增」柱状图</span>
                <span className="text-[11px]">明天打开软件自动采样后，即可对比每日新增热度与关注</span>
              </div>
            ) : (
              <div className="w-full overflow-hidden">
                <svg
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  className="w-full h-[196px] select-none overflow-visible"
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  <defs>
                    <linearGradient id={accentGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accentStroke} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={accentStroke} stopOpacity="0.01" />
                    </linearGradient>
                    <linearGradient id={heatGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#EA580C" stopOpacity="0.20" />
                      <stop offset="100%" stopColor="#EA580C" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id={fansGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E11D48" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="#E11D48" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines + Y Labels */}
                  {metric !== 'delta' ? (
                    [0, 0.5, 1].map((frac) => {
                      const y = PAD.top + PLOT_H * (1 - frac);
                      const labelVal =
                        metric === 'both'
                          ? null
                          : Math.round(
                              singleBounds.min + frac * (singleBounds.max - singleBounds.min)
                            );
                      return (
                        <g key={frac}>
                          <line
                            x1={PAD.left}
                            x2={CHART_W - PAD.right}
                            y1={y}
                            y2={y}
                            stroke="var(--border-subtle)"
                            strokeDasharray={frac === 0 ? undefined : '3 4'}
                            strokeWidth="1"
                          />
                          {labelVal !== null && (
                            <text
                              x={PAD.left - 8}
                              y={y + 3.5}
                              textAnchor="end"
                              fontSize="10"
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                              fill="var(--text-muted)"
                            >
                              {formatCompactCount(labelVal)}
                            </text>
                          )}
                        </g>
                      );
                    })
                  ) : (
                    <>
                      <line
                        x1={PAD.left}
                        x2={CHART_W - PAD.right}
                        y1={PAD.top}
                        y2={PAD.top}
                        stroke="var(--border-subtle)"
                        strokeDasharray="3 4"
                      />
                      <line
                        x1={PAD.left}
                        x2={CHART_W - PAD.right}
                        y1={deltaZeroY}
                        y2={deltaZeroY}
                        stroke="var(--border-strong)"
                        strokeWidth="1"
                      />
                      <text
                        x={PAD.left - 8}
                        y={PAD.top + 3.5}
                        textAnchor="end"
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fill="var(--text-muted)"
                      >
                        +{formatCompactCount(deltaMaxAbs)}
                      </text>
                      <text
                        x={PAD.left - 8}
                        y={deltaZeroY + 3.5}
                        textAnchor="end"
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fill="var(--text-muted)"
                      >
                        0
                      </text>
                    </>
                  )}

                  {/* Mode: Single Curve (heat or fans) */}
                  {(metric === 'heat' || metric === 'fans') && (
                    <>
                      {n === 1 ? (
                        <>
                          <line
                            x1={PAD.left}
                            x2={CHART_W - PAD.right}
                            y1={singleCoords[0].y}
                            y2={singleCoords[0].y}
                            stroke={accentStroke}
                            strokeOpacity="0.35"
                            strokeDasharray="5 5"
                            strokeWidth="1.5"
                          />
                          <circle
                            cx={singleCoords[0].x}
                            cy={singleCoords[0].y}
                            r="11"
                            fill={accentStroke}
                            fillOpacity="0.16"
                          />
                          <circle
                            cx={singleCoords[0].x}
                            cy={singleCoords[0].y}
                            r="5"
                            fill="#ffffff"
                            stroke={accentStroke}
                            strokeWidth="2.5"
                          />
                          <text
                            x={singleCoords[0].x}
                            y={singleCoords[0].y - 16}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill={accentStroke}
                          >
                            今日基线 {(metric === 'fans' ? series[0].fans : series[0].heat).toLocaleString('zh-CN')}
                          </text>
                        </>
                      ) : (
                        <>
                          <path
                            d={buildAreaPath(singleCoords, PAD.top + PLOT_H)}
                            fill={`url(#${accentGradId})`}
                          />
                          <path
                            d={buildSmoothPath(singleCoords)}
                            fill="none"
                            stroke={accentStroke}
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {singleCoords.map((pt, i) => {
                            const isHot = hoverIdx === i || (hoverIdx === null && i === n - 1);
                            return (
                              <circle
                                key={series[i].dateKey}
                                cx={pt.x}
                                cy={pt.y}
                                r={isHot ? 4.5 : n <= 16 ? 2.8 : 0}
                                fill="#ffffff"
                                stroke={accentStroke}
                                strokeWidth={isHot ? 2.5 : 1.8}
                              />
                            );
                          })}
                        </>
                      )}
                    </>
                  )}

                  {/* Mode: Dual Comparison (Heat + Fans) */}
                  {metric === 'both' && (
                    <>
                      {n === 1 ? (
                        <>
                          <circle cx={heatCoords[0].x - 16} cy={PAD.top + PLOT_H * 0.45} r="5" fill="#EA580C" />
                          <circle cx={fansCoords[0].x + 16} cy={PAD.top + PLOT_H * 0.55} r="5" fill="#E11D48" />
                          <text
                            x={CHART_W / 2}
                            y={PAD.top + PLOT_H * 0.45 - 16}
                            textAnchor="middle"
                            fontSize="11"
                            fill="var(--text-secondary)"
                          >
                            首日双指标基线已记录，累计 2 天后自动绘制双曲线对比
                          </text>
                        </>
                      ) : (
                        <>
                          <path d={buildAreaPath(heatCoords, PAD.top + PLOT_H)} fill={`url(#${heatGradId})`} />
                          <path d={buildAreaPath(fansCoords, PAD.top + PLOT_H)} fill={`url(#${fansGradId})`} />
                          <path
                            d={buildSmoothPath(heatCoords)}
                            fill="none"
                            stroke="#EA580C"
                            strokeWidth="2.3"
                            strokeLinecap="round"
                          />
                          <path
                            d={buildSmoothPath(fansCoords)}
                            fill="none"
                            stroke="#E11D48"
                            strokeWidth="2.2"
                            strokeDasharray="5 3"
                            strokeLinecap="round"
                          />
                          {hoverIdx !== null && heatCoords[hoverIdx] && fansCoords[hoverIdx] && (
                            <>
                              <circle
                                cx={heatCoords[hoverIdx].x}
                                cy={heatCoords[hoverIdx].y}
                                r="4.5"
                                fill="#ffffff"
                                stroke="#EA580C"
                                strokeWidth="2.5"
                              />
                              <circle
                                cx={fansCoords[hoverIdx].x}
                                cy={fansCoords[hoverIdx].y}
                                r="4.5"
                                fill="#ffffff"
                                stroke="#E11D48"
                                strokeWidth="2.5"
                              />
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {/* Mode: Daily Net Delta Grouped Bars */}
                  {metric === 'delta' && deltaSeries.length > 0 && (() => {
                    const count = deltaSeries.length;
                    const slotW = PLOT_W / Math.max(1, count);
                    const barW = Math.max(4, Math.min(14, slotW * 0.32));
                    const upAvail = deltaZeroY - PAD.top;
                    const downAvail = PAD.top + PLOT_H - deltaZeroY;

                    return deltaSeries.map((pt, idx) => {
                      const cx = PAD.left + slotW * (idx + 0.5);
                      const hVal = pt.heatDelta || 0;
                      const fVal = pt.fansDelta || 0;
                      const hH = Math.max(
                        hVal === 0 ? 2 : 4,
                        (Math.abs(hVal) / deltaMaxAbs) * (hVal >= 0 ? upAvail : downAvail)
                      );
                      const fH = Math.max(
                        fVal === 0 ? 2 : 4,
                        (Math.abs(fVal) / deltaMaxAbs) * (fVal >= 0 ? upAvail : downAvail)
                      );
                      const isHot = hoverIdx === idx;
                      return (
                        <g key={pt.dateKey}>
                          {isHot && (
                            <rect
                              x={cx - slotW * 0.45}
                              y={PAD.top}
                              width={slotW * 0.9}
                              height={PLOT_H}
                              rx="6"
                              fill="var(--accent-soft)"
                              fillOpacity="0.45"
                            />
                          )}
                          <rect
                            x={cx - barW - 1.5}
                            y={hVal >= 0 ? deltaZeroY - hH : deltaZeroY}
                            width={barW}
                            height={hH}
                            rx="3"
                            fill="#EA580C"
                            fillOpacity={isHot ? 1 : 0.84}
                          />
                          <rect
                            x={cx + 1.5}
                            y={fVal >= 0 ? deltaZeroY - fH : deltaZeroY}
                            width={barW}
                            height={fH}
                            rx="3"
                            fill="#E11D48"
                            fillOpacity={isHot ? 1 : 0.84}
                          />
                        </g>
                      );
                    });
                  })()}

                  {/* Vertical Hover Crosshair (line modes) */}
                  {metric !== 'delta' && hoverIdx !== null && singleCoords[hoverIdx] && (
                    <line
                      x1={singleCoords[hoverIdx].x}
                      x2={singleCoords[hoverIdx].x}
                      y1={PAD.top}
                      y2={PAD.top + PLOT_H}
                      stroke="var(--border-strong)"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                  )}

                  {/* X-Axis Date Labels */}
                  {(metric === 'delta' ? xTickIndices(deltaSeries.length) : xTickIndices(n)).map(
                    (idx) => {
                      const list = metric === 'delta' ? deltaSeries : series;
                      const pt = list[idx];
                      if (!pt) return null;
                      const x =
                        metric === 'delta'
                          ? PAD.left + (PLOT_W / Math.max(1, list.length)) * (idx + 0.5)
                          : xAt(idx, list.length);
                      return (
                        <text
                          key={`${pt.dateKey}-${idx}`}
                          x={x}
                          y={CHART_H - 6}
                          textAnchor="middle"
                          fontSize="10"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          fill={pt.dateKey === todayKey ? 'var(--accent-primary)' : 'var(--text-muted)'}
                          fontWeight={pt.dateKey === todayKey ? '700' : '400'}
                        >
                          {pt.dateKey === todayKey ? '今天' : shortDateLabel(pt.dateKey)}
                        </text>
                      );
                    }
                  )}

                  {/* Invisible Hit Columns for Smooth Hover Selection */}
                  {(metric === 'delta' ? deltaSeries : series).map((pt, idx, arr) => {
                    const colW = PLOT_W / Math.max(1, arr.length);
                    const x =
                      metric === 'delta'
                        ? PAD.left + colW * idx
                        : arr.length === 1
                        ? PAD.left
                        : Math.max(PAD.left, xAt(idx, arr.length) - colW / 2);
                    const w = arr.length === 1 ? PLOT_W : colW;
                    return (
                      <rect
                        key={`hit-${pt.dateKey}`}
                        x={x}
                        y={PAD.top}
                        width={w}
                        height={PLOT_H}
                        fill="transparent"
                        className="cursor-crosshair"
                        onMouseEnter={() => setHoverIdx(idx)}
                      />
                    );
                  })}
                </svg>
              </div>
            )}

            {n === 1 && metric !== 'delta' && (
              <div
                className="text-[11px] flex items-center justify-between gap-2 flex-wrap pt-1 border-t"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                <span>
                  已记录第 1 天基准数据；从明天起每天首次打开软件自动采样，将自动连接成连续走势曲线。
                </span>
                <span>最多保留 60 天历史</span>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
