import React from 'react';
import { LIFECYCLE_STAGES } from '../constants';
import { LifecycleStageId, ProjectCardData, QuickFilterId } from '../types';

interface OverviewChartsProps {
  projects: ProjectCardData[];
  quickFilter: QuickFilterId;
  stageFilter: LifecycleStageId | null;
  onQuickFilter: (f: QuickFilterId) => void;
  onStageFilter: (s: LifecycleStageId | null) => void;
}

export const OverviewCharts: React.FC<OverviewChartsProps> = ({
  projects,
  quickFilter,
  stageFilter,
  onQuickFilter,
  onStageFilter,
}) => {
  const active = projects.filter((p) => !p.archived);
  const totalActive = active.length || 1;

  const dirtyCount = active.filter((p) => p.git.dirtyCount > 0).length;
  const mismatchCount = active.filter((p) => p.versionMismatch).length;
  const pendingBuildCount = active.filter(
    (p) => p.buildStatus === 'pending_build' || p.buildStatus === 'pending_upload'
  ).length;
  const healthyCount = active.filter(
    (p) =>
      p.git.dirtyCount === 0 &&
      !p.versionMismatch &&
      (p.buildStatus === 'synced' || p.buildStatus === 'none') &&
      p.git.ahead === 0 &&
      p.git.behind === 0
  ).length;

  const stageCounts = LIFECYCLE_STAGES.map((st) => ({
    ...st,
    count: active.filter((p) => p.stage === st.id).length,
  })).filter((st) => st.count > 0);

  const kpis: {
    label: string;
    value: number;
    dotColor: string;
    filter: QuickFilterId;
  }[] = [
    { label: '活跃项目', value: active.length, dotColor: '#2563EB', filter: 'all' },
    { label: '未提交', value: dirtyCount, dotColor: '#E11D48', filter: 'dirty' },
    { label: '版本冲突', value: mismatchCount, dotColor: '#D97706', filter: 'mismatch' },
    { label: '待构建/传', value: pendingBuildCount, dotColor: '#EA580C', filter: 'pending_build' },
  ];

  // Minimalist SVG readiness ring
  const readyPct = Math.round((healthyCount / totalActive) * 100);
  const needsAttention = Math.max(0, active.length - healthyCount);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const readyArc = (healthyCount / totalActive) * circumference;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
      {/* Left Bento Card (8 cols): Clean KPIs + Proportional Stage Bar */}
      <div className="lg:col-span-8 glass-card rounded-2xl p-5 flex flex-col justify-between gap-5">
        {/* 4 Calm Tabular KPI Numbers */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((k) => {
            const isSelected = quickFilter === k.filter && !stageFilter;
            return (
              <button
                key={k.label}
                onClick={() => {
                  onStageFilter(null);
                  onQuickFilter(k.filter);
                }}
                className="text-left px-3 py-2 rounded-xl transition-all cursor-pointer"
                style={{
                  backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
                  border: isSelected
                    ? '1px solid var(--border-strong)'
                    : '1px solid transparent',
                }}
              >
                <div className="flex items-center gap-1.5 text-[11.5px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: k.dotColor }}
                  />
                  <span>{k.label}</span>
                </div>
                <div className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                  {k.value}
                </div>
              </button>
            );
          })}
        </div>

        {/* Sleek Segmented Lifecycle Bar */}
        <div>
          <div className="flex items-center justify-between text-[11.5px] mb-2">
            <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
              阶段分布流
            </span>
            {stageFilter && (
              <button
                onClick={() => onStageFilter(null)}
                className="text-blue-600 hover:underline cursor-pointer font-medium"
              >
                清除阶段筛选
              </button>
            )}
          </div>

          <div className="h-2.5 w-full rounded-full overflow-hidden flex gap-1 p-0.5" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            {stageCounts.map((seg) => {
              const pct = (seg.count / totalActive) * 100;
              const isSelected = stageFilter === seg.id;
              return (
                <button
                  key={seg.id}
                  title={`${seg.label}：${seg.count} 个`}
                  onClick={() => {
                    onQuickFilter('all');
                    onStageFilter(isSelected ? null : seg.id);
                  }}
                  className="h-full rounded-full transition-all duration-300 cursor-pointer hover:opacity-85"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: seg.color,
                    opacity: stageFilter && !isSelected ? 0.3 : 1,
                  }}
                />
              );
            })}
          </div>

          {/* Crisp minimal inline legend */}
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2.5">
            {stageCounts.map((seg) => {
              const isSelected = stageFilter === seg.id;
              return (
                <button
                  key={seg.id}
                  onClick={() => {
                    onQuickFilter('all');
                    onStageFilter(isSelected ? null : seg.id);
                  }}
                  className="flex items-center gap-1.5 text-[11.5px] transition-opacity cursor-pointer"
                  style={{
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: isSelected ? 600 : 400,
                    opacity: stageFilter && !isSelected ? 0.45 : 1,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span>{seg.label}</span>
                  <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {seg.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Bento Card (4 cols): Calm Readiness Ring */}
      <div className="lg:col-span-4 glass-card rounded-2xl p-5 flex items-center gap-5">
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="var(--bg-elevated)"
              strokeWidth="10"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="#059669"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${readyArc} ${circumference}`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold tabular-nums leading-none">{readyPct}%</span>
            <span className="text-[10.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
              就绪率
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-2.5 min-w-0">
          <div className="text-xs font-semibold">发布健康度</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>状态干净</span>
              </span>
              <span className="font-mono font-semibold tabular-nums">{healthyCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>需处理项</span>
              </span>
              <span className="font-mono font-semibold tabular-nums">{needsAttention}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
