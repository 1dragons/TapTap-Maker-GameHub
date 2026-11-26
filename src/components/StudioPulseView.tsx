import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Bug,
  CalendarClock,
  Flame,
  Gamepad2,
  GitCommitHorizontal,
  RefreshCw,
  Rocket,
  Sparkles,
  Trophy,
  Wrench,
} from 'lucide-react';
import { HeatmapCell, ProjectCardData, StudioActivityItem, StudioPulseData } from '../types';
import { formatRelativeTime, mediaUrl } from '../utils';
import { getCountdownInfo } from '../aiHelpers';

interface StudioPulseViewProps {
  projects: ProjectCardData[];
  onSelectProject: (id: string) => void;
}

function getHeatColor(count: number): string {
  if (count <= 0) return 'var(--bg-elevated)';
  if (count <= 2) return '#A7F3D0';
  if (count <= 5) return '#34D399';
  if (count <= 10) return '#10B981';
  return '#047857';
}

const KIND_BADGE: Record<
  StudioActivityItem['kind'],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  version: {
    label: '版本',
    color: '#047857',
    bg: 'rgba(16, 185, 129, 0.14)',
    icon: <Rocket className="w-3 h-3" />,
  },
  feat: {
    label: '功能',
    color: '#1D4ED8',
    bg: 'rgba(37, 99, 235, 0.12)',
    icon: <Sparkles className="w-3 h-3" />,
  },
  fix: {
    label: '修复',
    color: '#BE123C',
    bg: 'rgba(225, 29, 72, 0.12)',
    icon: <Bug className="w-3 h-3" />,
  },
  opt: {
    label: '优化',
    color: '#6D28D9',
    bg: 'rgba(124, 58, 237, 0.12)',
    icon: <Wrench className="w-3 h-3" />,
  },
  normal: {
    label: '提交',
    color: '#475569',
    bg: 'rgba(100, 116, 139, 0.12)',
    icon: <GitCommitHorizontal className="w-3 h-3" />,
  },
};

export const StudioPulseView: React.FC<StudioPulseViewProps> = ({
  projects,
  onSelectProject,
}) => {
  const [pulse, setPulse] = useState<StudioPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const loadPulse = async () => {
    setLoading(true);
    try {
      const data = await window.gameHub.getStudioPulse();
      setPulse(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPulse();
  }, []);

  const activeProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const officialCount = useMemo(
    () => activeProjects.filter((p) => p.stage === 'official').length,
    [activeProjects]
  );
  const publicTestCount = useMemo(
    () => activeProjects.filter((p) => p.stage === 'public_test').length,
    [activeProjects]
  );

  const sprintProjects = useMemo(() => {
    return activeProjects
      .filter((p) => p.sprintFocus || p.targetDate)
      .sort((a, b) => {
        if (a.sprintFocus !== b.sprintFocus) return a.sprintFocus ? -1 : 1;
        return (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
      });
  }, [activeProjects]);

  // Split 140 days into 20 columns of 7 days
  const weeks = useMemo(() => {
    if (!pulse) return [];
    const cols: HeatmapCell[][] = [];
    for (let w = 0; w < 20; w++) {
      cols.push(pulse.heatmap.slice(w * 7, w * 7 + 7));
    }
    return cols;
  }, [pulse]);

  const maxGameCommits = Math.max(1, ...(pulse?.topGames.map((g) => g.commits) || [1]));

  return (
    <div className="max-w-[1320px] mx-auto px-7 py-6 space-y-5">
      {/* Row 1: 4 Glossy Studio Achievement Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-[22px] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              近 20 周总产出
            </div>
            <div className="text-2xl font-bold tabular-nums tracking-tight leading-tight">
              {pulse ? pulse.totalCommits140d : '--'}
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                次提交
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[22px] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-white flex items-center justify-center shadow-sm shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              当前连续开发
            </div>
            <div className="text-2xl font-bold tabular-nums tracking-tight leading-tight">
              {pulse ? pulse.currentStreak : '--'}
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                天 · 最长 {pulse?.longestStreak ?? 0} 天
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[22px] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              工作室上线战绩
            </div>
            <div className="text-2xl font-bold tabular-nums tracking-tight leading-tight">
              {officialCount}
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                款正式 · {publicTestCount} 公测
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[22px] p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              单日峰值纪录
            </div>
            <div className="text-2xl font-bold tabular-nums tracking-tight leading-tight">
              {pulse ? pulse.bestDayCount : '--'}
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                次 ({pulse?.bestDayLabel || '--'})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: 20-Week Cross-Game Contribution Heatmap */}
      <div className="glass-card rounded-[22px] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[14px] font-semibold">全工作室开发热力图</span>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full border"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {hoveredCell ? (
                <span>
                  <strong>{hoveredCell.label}</strong> · {hoveredCell.count} 次提交
                  {hoveredCell.games.length > 0 &&
                    ` · ${hoveredCell.games
                      .slice(0, 3)
                      .map((g) => `${g.name}(${g.count})`)
                      .join('、')}`}
                </span>
              ) : (
                <span>
                  近 140 天活跃 <strong>{pulse?.activeDays140d ?? 0}</strong> 天 · 悬停格子看当天项目分布
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
              <span>少</span>
              {[0, 2, 4, 8, 14].map((v) => (
                <span
                  key={v}
                  className="w-3 h-3 rounded-[4px] border border-white/60"
                  style={{ backgroundColor: getHeatColor(v) }}
                />
              ))}
              <span>多</span>
            </div>
            <button
              onClick={loadPulse}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-500/10 cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Refined Jewel-Proportion 20-Week Glass Tile Grid */}
        {loading && !pulse ? (
          <div className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
        ) : (
          <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
            <div
              className="grid grid-rows-7 gap-1.5 text-[10px] font-mono shrink-0 select-none"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="h-5 flex items-center">一</span>
              <span className="h-5" />
              <span className="h-5 flex items-center">三</span>
              <span className="h-5" />
              <span className="h-5 flex items-center">五</span>
              <span className="h-5" />
              <span className="h-5 flex items-center">日</span>
            </div>

            <div className="flex-1 flex justify-between gap-1.5 min-w-[540px]">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-rows-7 gap-1.5 flex-1">
                  {week.map((cell) => (
                    <div
                      key={cell.dateKey}
                      onMouseEnter={() => setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell(null)}
                      className="h-5 w-full max-w-[26px] mx-auto rounded-[5px] transition-all duration-150 hover:scale-125 cursor-pointer border"
                      style={{
                        backgroundColor: getHeatColor(cell.count),
                        borderColor:
                          hoveredCell?.dateKey === cell.dateKey
                            ? '#2563EB'
                            : cell.count > 0
                              ? 'rgba(255,255,255,0.55)'
                              : 'var(--border-subtle)',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Cross-Game Activity Feed (7 cols) + Game Share & Sprint Schedule (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Global Cross-Game Live Activity Timeline */}
        <div className="lg:col-span-7 glass-card rounded-[22px] p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold">全工作室跨游戏动态流</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              自动过滤零碎同步 · 点击直达项目
            </span>
          </div>

          {!pulse || pulse.recentActivity.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              {loading ? '正在聚合各游戏提交动态...' : '近期暂无开发动态'}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[430px] overflow-y-auto pr-1">
              {pulse.recentActivity.map((act) => {
                const kb = KIND_BADGE[act.kind];
                const thumb = mediaUrl(act.coverPath);
                return (
                  <button
                    key={act.id}
                    onClick={() => onSelectProject(act.projectId)}
                    className="w-full px-3 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer hover:translate-x-0.5"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg overflow-hidden shrink-0 border flex items-center justify-center"
                        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Gamepad2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold truncate max-w-[140px]">
                            {act.projectName}
                          </span>
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0"
                            style={{ backgroundColor: kb.bg, color: kb.color }}
                          >
                            {kb.icon}
                            <span>{act.version || kb.label}</span>
                          </span>
                        </div>
                        <div
                          className="text-[11.5px] truncate mt-0.5"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {act.title}
                        </div>
                      </div>
                    </div>

                    <span
                      className="text-[11px] tabular-nums shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {formatRelativeTime(act.date)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 cols: Game Energy Share + Sprint Schedule */}
        <div className="lg:col-span-5 space-y-5">
          {/* Active Game Energy Distribution */}
          <div className="glass-card rounded-[22px] p-5 space-y-3.5">
            <span className="text-[14px] font-semibold block">近期精力分布（按提交量）</span>
            <div className="space-y-3">
              {(pulse?.topGames || []).map((g, idx) => {
                const pct = Math.max(8, Math.round((g.commits / maxGameCommits) * 100));
                const barColors = ['#2563EB', '#10B981', '#7C3AED', '#EA580C', '#0891B2', '#E11D48'];
                const color = barColors[idx % barColors.length];
                return (
                  <button
                    key={g.id}
                    onClick={() => onSelectProject(g.id)}
                    className="w-full text-left group cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium truncate group-hover:text-blue-600 transition-colors">
                        {g.name}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-[11px]" style={{ color }}>
                        {g.commits} 次
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-elevated)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sprint / Release Schedule */}
          <div className="glass-card rounded-[22px] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-orange-500" />
              <span className="text-[14px] font-semibold">冲刺与发版日程</span>
            </div>
            {sprintProjects.length === 0 ? (
              <div className="py-5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                暂未设定发版倒计时，可在任意游戏点「编辑」设置目标发版日
              </div>
            ) : (
              <div className="space-y-2">
                {sprintProjects.map((p) => {
                  const cd = getCountdownInfo(p.targetDate);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectProject(p.id)}
                      className="w-full p-3 rounded-xl border flex items-center justify-between gap-2 text-left cursor-pointer hover:border-blue-400 transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                          {p.sprintFocus && <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                          <span>{p.name}</span>
                        </div>
                        <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {p.targetGoal || '冲刺发版目标'} {p.targetDate ? `· ${p.targetDate}` : ''}
                        </div>
                      </div>
                      {cd && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0"
                          style={{
                            backgroundColor:
                              cd.tone === 'err'
                                ? 'var(--pill-err-bg)'
                                : cd.tone === 'warn'
                                  ? 'var(--pill-warn-bg)'
                                  : 'var(--pill-info-bg)',
                            color:
                              cd.tone === 'err'
                                ? 'var(--pill-err-text)'
                                : cd.tone === 'warn'
                                  ? 'var(--pill-warn-text)'
                                  : 'var(--pill-info-text)',
                            borderColor:
                              cd.tone === 'err'
                                ? 'var(--pill-err-border)'
                                : cd.tone === 'warn'
                                  ? 'var(--pill-warn-border)'
                                  : 'var(--pill-info-border)',
                          }}
                        >
                          {cd.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
