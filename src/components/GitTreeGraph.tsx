import React, { useMemo, useState } from 'react';
import {
  Bug,
  Check,
  Cloud,
  Copy,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Tag,
  Wrench,
  X,
} from 'lucide-react';
import { GIT_LANE_COLORS } from '../constants';
import {
  CommitDetailData,
  GitGraphCommit,
  GitGraphData,
  ProjectCardData,
} from '../types';
import { formatRelativeTime, formatShortDate } from '../utils';

interface GitTreeGraphProps {
  project: ProjectCardData;
  graph: GitGraphData | null;
  loading: boolean;
  defaultHideSync?: boolean;
  onRefresh: () => void;
}

type CommitKind = 'version' | 'feat' | 'fix' | 'opt' | 'sync' | 'normal';
type FilterMode = 'all' | 'milestone' | 'work';

function classifyCommit(c: GitGraphCommit): CommitKind {
  const s = `${c.fullSubject} ${c.shortTitle}`;
  if (/云端同步|sync at|commit cloud/i.test(s)) return 'sync';
  if (c.detectedVersion) return 'version';
  if (/^(fix|bug)|修复|修正|解决|根治|消除|屏蔽|防穿模/i.test(s)) return 'fix';
  if (/^(feat)|新增|加入|上线|重做|扩建|实装|add /i.test(s)) return 'feat';
  if (/^(perf|refactor|chore|style)|优化|精简|打磨|QA|体检|验收|拆分|调整|升级/i.test(s)) return 'opt';
  return 'normal';
}

function getDateBucketLabel(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '更早';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / 86_400_000);
  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays === 2) return '前天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const KIND_STYLE: Record<
  CommitKind,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  version: {
    label: '版本',
    color: '#047857',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
    icon: <Rocket className="w-3 h-3" />,
  },
  feat: {
    label: '功能',
    color: '#1D4ED8',
    bg: 'rgba(37, 99, 235, 0.1)',
    border: 'rgba(37, 99, 235, 0.24)',
    icon: <Sparkles className="w-3 h-3" />,
  },
  fix: {
    label: '修复',
    color: '#BE123C',
    bg: 'rgba(225, 29, 72, 0.1)',
    border: 'rgba(225, 29, 72, 0.24)',
    icon: <Bug className="w-3 h-3" />,
  },
  opt: {
    label: '优化',
    color: '#6D28D9',
    bg: 'rgba(124, 58, 237, 0.1)',
    border: 'rgba(124, 58, 237, 0.24)',
    icon: <Wrench className="w-3 h-3" />,
  },
  sync: {
    label: '同步',
    color: '#64748B',
    bg: 'rgba(100, 116, 139, 0.1)',
    border: 'rgba(100, 116, 139, 0.2)',
    icon: <Cloud className="w-3 h-3" />,
  },
  normal: {
    label: '提交',
    color: '#475569',
    bg: 'rgba(100, 116, 139, 0.08)',
    border: 'rgba(100, 116, 139, 0.18)',
    icon: <GitCommitHorizontal className="w-3 h-3" />,
  },
};

const ROW_H = 54;
const DATE_H = 30;
const LANE_W = 24;
const PAD_X = 24;

type TimelineRow =
  | { type: 'dirty'; y: number }
  | { type: 'date'; label: string; y: number }
  | { type: 'commit'; commit: GitGraphCommit; kind: CommitKind; y: number; visibleIdx: number };

export const GitTreeGraph: React.FC<GitTreeGraphProps> = ({
  project,
  graph,
  loading,
  defaultHideSync = false,
  onRefresh,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>(defaultHideSync ? 'work' : 'all');
  const [kindFilter, setKindFilter] = useState<CommitKind | null>(null);
  const [commitQuery, setCommitQuery] = useState('');
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<CommitDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDirtyDrawer, setShowDirtyDrawer] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const hasDirty = project.git.isGit && project.git.dirtyCount > 0;

  // Mini 7-day cadence sparkline from loaded commits
  const cadenceBars = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    if (!graph?.commits.length) return counts;
    const now = Date.now();
    for (const c of graph.commits) {
      const t = new Date(c.date).getTime();
      if (Number.isNaN(t)) continue;
      const daysAgo = Math.floor((now - t) / 86_400_000);
      if (daysAgo >= 0 && daysAgo < 7) {
        counts[6 - daysAgo] += 1;
      }
    }
    return counts;
  }, [graph]);
  const maxCadence = Math.max(1, ...cadenceBars);

  const kindCounts = useMemo(() => {
    const counts: Record<CommitKind, number> = {
      version: 0,
      feat: 0,
      fix: 0,
      opt: 0,
      sync: 0,
      normal: 0,
    };
    if (!graph?.commits) return counts;
    for (const c of graph.commits) {
      counts[classifyCommit(c)] += 1;
    }
    return counts;
  }, [graph]);

  const visibleCommits = useMemo(() => {
    if (!graph || !graph.isGit) return [];
    const q = commitQuery.trim().toLowerCase();
    return graph.commits.filter((c) => {
      const kind = classifyCommit(c);
      if (kindFilter && kind !== kindFilter) return false;
      if (filterMode === 'milestone' && !c.isMilestone) return false;
      if (filterMode === 'work' && kind === 'sync') return false;
      if (q) {
        const hay = `${c.fullSubject} ${c.shortHash} ${c.detectedVersion || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [graph, filterMode, kindFilter, commitQuery]);

  // Build rows with crisp Date Chapter dividers + Y coordinates for continuous SVG rails
  const { rows, totalHeight, commitYMap, headPos } = useMemo(() => {
    const out: TimelineRow[] = [];
    const yMap = new Map<string, { y: number; lane: number; color: string }>();
    let cursorY = 6;

    if (hasDirty) {
      out.push({ type: 'dirty', y: cursorY });
      cursorY += ROW_H;
    }

    let lastDateLabel = '';
    visibleCommits.forEach((c, idx) => {
      const label = getDateBucketLabel(c.date);
      if (label !== lastDateLabel) {
        out.push({ type: 'date', label, y: cursorY });
        cursorY += DATE_H;
        lastDateLabel = label;
      }
      const kind = classifyCommit(c);
      const lane = filterMode !== 'all' || Boolean(kindFilter) || commitQuery.trim() ? 0 : Math.min(c.lane, 5);
      const nodeColor =
        kind === 'version'
          ? '#059669'
          : kind === 'fix'
            ? '#E11D48'
            : kind === 'opt'
              ? '#7C3AED'
              : kind === 'sync'
                ? '#94A3B8'
                : GIT_LANE_COLORS[c.colorIndex % GIT_LANE_COLORS.length];

      out.push({ type: 'commit', commit: c, kind, y: cursorY, visibleIdx: idx });
      yMap.set(c.hash, { y: cursorY + ROW_H / 2, lane, color: nodeColor });
      cursorY += ROW_H;
    });

    const firstCommit = visibleCommits.find((c) => c.isHead) || visibleCommits[0];
    const headEntry = firstCommit ? yMap.get(firstCommit.hash) : undefined;

    return {
      rows: out,
      totalHeight: Math.max(120, cursorY + 10),
      commitYMap: yMap,
      headPos: headEntry || { y: ROW_H * 1.5, lane: 0, color: '#2563EB' },
    };
  }, [visibleCommits, hasDirty, filterMode, kindFilter, commitQuery]);

  const isLinearFiltered = filterMode !== 'all' || Boolean(kindFilter) || Boolean(commitQuery.trim());
  const effectiveMaxLane = isLinearFiltered ? 0 : Math.min(graph?.maxLane ?? 0, 5);
  const svgWidth = PAD_X * 2 + (effectiveMaxLane + 1) * LANE_W + 14;

  const handleInspectCommit = async (commit: GitGraphCommit) => {
    setShowDirtyDrawer(false);
    if (selectedCommitHash === commit.hash) {
      setSelectedCommitHash(null);
      setCommitDetail(null);
      return;
    }
    setSelectedCommitHash(commit.hash);
    setDetailLoading(true);
    try {
      const detail = await window.gameHub.getCommitDetail(project.path, commit.hash);
      setCommitDetail(detail);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCopyHash = (e: React.MouseEvent, shortHash: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(shortHash);
    setCopiedHash(shortHash);
    setTimeout(() => setCopiedHash((prev) => (prev === shortHash ? null : prev)), 1200);
  };

  if (!project.git.isGit) {
    return (
      <div className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[380px]">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 border"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <GitBranch className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
        </div>
        <div className="text-sm font-semibold mb-1">此项目未初始化 Git</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          仍可使用上方流程图、右侧随手记与待办事宜追踪进度
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-[22px] flex flex-col overflow-hidden relative min-h-[520px]">
      {/* Rich Visual Header */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-2 flex-wrap shrink-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
            <GitBranch className="w-3.5 h-3.5" />
          </div>
          <span className="text-[13.5px] font-semibold">Git 演进树</span>
          <span
            className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border"
            style={{
              backgroundColor: 'var(--pill-info-bg)',
              color: 'var(--pill-info-text)',
              borderColor: 'var(--pill-info-border)',
            }}
          >
            {project.git.branch}
          </span>

          {/* 7-Day Mini Cadence Sparkline */}
          <div
            title="近 7 天提交活跃节奏"
            className="hidden sm:flex items-end gap-[2.5px] h-5 px-2 py-0.5 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {cadenceBars.map((cnt, idx) => (
              <div
                key={idx}
                className="w-1 rounded-full transition-all"
                style={{
                  height: `${cnt === 0 ? 22 : Math.max(32, Math.round((cnt / maxCadence) * 100))}%`,
                  backgroundColor: cnt > 0 ? '#3B82F6' : 'var(--border-strong)',
                  opacity: cnt > 0 ? 0.55 + (idx / 12) : 0.45,
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mini Commit Search */}
          <div className="relative w-32">
            <Search
              className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={commitQuery}
              onChange={(e) => setCommitQuery(e.target.value)}
              placeholder="搜提交..."
              className="w-full h-7 pl-6 pr-2 rounded-lg text-[11px] outline-none"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            />
          </div>

          {/* 3-Way Apple Segmented Filter */}
          <div
            className="flex items-center p-0.5 rounded-lg text-[11px] border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {(
              [
                { id: 'all', label: '全部' },
                { id: 'work', label: '过滤同步' },
                { id: 'milestone', label: '里程碑' },
              ] as { id: FilterMode; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id)}
                className="px-2 py-0.5 rounded-md transition-all cursor-pointer font-medium"
                style={{
                  backgroundColor: filterMode === tab.id ? 'var(--bg-surface-strong)' : 'transparent',
                  color:
                    filterMode === tab.id
                      ? tab.id === 'milestone'
                        ? '#047857'
                        : 'var(--text-primary)'
                      : 'var(--text-muted)',
                  boxShadow: filterMode === tab.id ? 'var(--card-shadow)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            title="刷新 Git 树"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-slate-500/10"
            style={{ color: 'var(--text-secondary)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Semantic Type Breakdown & 1-Click Filter Bar */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between gap-2 flex-wrap shrink-0"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'var(--bg-elevated)',
        }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['version', 'feat', 'fix', 'opt'] as CommitKind[]).map((k) => {
            const ks = KIND_STYLE[k];
            const cnt = kindCounts[k];
            const active = kindFilter === k;
            return (
              <button
                key={k}
                onClick={() => setKindFilter(active ? null : k)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer"
                style={{
                  backgroundColor: active ? ks.bg : 'var(--bg-surface-strong)',
                  borderColor: active ? ks.border : 'var(--border-subtle)',
                  color: active ? ks.color : 'var(--text-secondary)',
                  opacity: cnt === 0 && !active ? 0.45 : 1,
                }}
              >
                <span style={{ color: ks.color }}>{ks.icon}</span>
                <span>{ks.label}</span>
                <span className="font-mono font-semibold tabular-nums">{cnt}</span>
              </button>
            );
          })}
        </div>
        {kindFilter && (
          <button
            onClick={() => setKindFilter(null)}
            className="text-[11px] text-blue-600 hover:underline cursor-pointer font-medium"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Scrollable Elevated Timeline Canvas */}
      <div className="relative flex-1 overflow-y-auto max-h-[600px]">
        {loading && !graph ? (
          <div className="py-16 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            正在绘制 Git 演进树...
          </div>
        ) : visibleCommits.length === 0 && !hasDirty ? (
          <div className="py-16 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            当前筛选下没有匹配的提交记录
          </div>
        ) : (
          <div className="relative" style={{ height: totalHeight }}>
            {/* Left Glowing Gradient SVG Tree */}
            <svg
              width={svgWidth}
              height={totalHeight}
              className="absolute left-0 top-0 pointer-events-none"
            >
              <defs>
                <linearGradient
                  id="gitMainGrad"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={Math.max(200, totalHeight)}
                >
                  <stop offset="0%" stopColor="#2563EB" />
                  <stop offset="48%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>

              {/* Dashed animated rose stream from Dirty node down to HEAD */}
              {hasDirty && (
                <>
                  <line
                    x1={PAD_X + headPos.lane * LANE_W}
                    y1={6 + ROW_H / 2}
                    x2={PAD_X + headPos.lane * LANE_W}
                    y2={headPos.y}
                    stroke="#F43F5E"
                    strokeWidth="7"
                    strokeOpacity="0.16"
                  />
                  <line
                    x1={PAD_X + headPos.lane * LANE_W}
                    y1={6 + ROW_H / 2}
                    x2={PAD_X + headPos.lane * LANE_W}
                    y2={headPos.y}
                    stroke="#E11D48"
                    strokeWidth="2.8"
                    strokeDasharray="5 4"
                    className="animate-dash-flow"
                  />
                  <line
                    x1={PAD_X + headPos.lane * LANE_W + 6}
                    y1={6 + ROW_H / 2}
                    x2={svgWidth - 2}
                    y2={6 + ROW_H / 2}
                    stroke="#E11D48"
                    strokeWidth="1.6"
                    strokeDasharray="3 3"
                    strokeOpacity="0.65"
                  />
                  <circle
                    cx={PAD_X + headPos.lane * LANE_W}
                    cy={6 + ROW_H / 2}
                    r="10"
                    fill="rgba(225, 29, 72, 0.16)"
                  />
                  <circle
                    cx={PAD_X + headPos.lane * LANE_W}
                    cy={6 + ROW_H / 2}
                    r="5.5"
                    fill="#ffffff"
                    stroke="#E11D48"
                    strokeWidth="2.6"
                  />
                </>
              )}

              {/* Smooth Glowing Trunk & Branch Curves */}
              {isLinearFiltered
                ? visibleCommits.map((c, idx) => {
                    if (idx >= visibleCommits.length - 1) return null;
                    const p1 = commitYMap.get(c.hash);
                    const p2 = commitYMap.get(visibleCommits[idx + 1].hash);
                    if (!p1 || !p2) return null;
                    const x = PAD_X;
                    return (
                      <g key={`lin-${c.hash}`}>
                        <line x1={x} y1={p1.y} x2={x} y2={p2.y} stroke="url(#gitMainGrad)" strokeWidth="8" strokeOpacity="0.14" strokeLinecap="round" />
                        <line x1={x} y1={p1.y} x2={x} y2={p2.y} stroke="url(#gitMainGrad)" strokeWidth="3" strokeLinecap="round" />
                      </g>
                    );
                  })
                : visibleCommits.map((c) => {
                    const from = commitYMap.get(c.hash);
                    if (!from) return null;
                    return c.edges.map((edge, eIdx) => {
                      const parentHash = c.parents[eIdx];
                      const to = parentHash ? commitYMap.get(parentHash) : undefined;
                      if (!to) return null;
                      const x1 = PAD_X + from.lane * LANE_W;
                      const x2 = PAD_X + to.lane * LANE_W;
                      const strokeCol =
                        from.lane === 0 && to.lane === 0
                          ? 'url(#gitMainGrad)'
                          : GIT_LANE_COLORS[edge.colorIndex % GIT_LANE_COLORS.length];

                      if (x1 === x2) {
                        return (
                          <g key={`${c.hash}-${eIdx}`}>
                            <line x1={x1} y1={from.y} x2={x2} y2={to.y} stroke={strokeCol} strokeWidth="8" strokeOpacity="0.14" strokeLinecap="round" />
                            <line x1={x1} y1={from.y} x2={x2} y2={to.y} stroke={strokeCol} strokeWidth="3" strokeLinecap="round" />
                          </g>
                        );
                      }
                      const midY = from.y + Math.min(ROW_H * 0.9, (to.y - from.y) * 0.45);
                      const d = `M ${x1} ${from.y} C ${x1} ${midY}, ${x2} ${from.y + 10}, ${x2} ${to.y}`;
                      return (
                        <g key={`${c.hash}-${eIdx}`}>
                          <path d={d} fill="none" stroke={strokeCol} strokeWidth="8" strokeOpacity="0.14" strokeLinecap="round" />
                          <path d={d} fill="none" stroke={strokeCol} strokeWidth="2.8" strokeLinecap="round" />
                        </g>
                      );
                    });
                  })}

              {/* Date Anchor Tiny Diamonds on Trunk */}
              {rows.map((row, rIdx) => {
                if (row.type !== 'date') return null;
                const x = PAD_X;
                const cy = row.y + DATE_H / 2;
                return (
                  <g key={`date-dot-${rIdx}`}>
                    <line
                      x1={x + 5}
                      y1={cy}
                      x2={svgWidth - 4}
                      y2={cy}
                      stroke="rgba(100, 116, 139, 0.22)"
                      strokeWidth="1.2"
                      strokeDasharray="2 3"
                    />
                    <rect
                      x={x - 3.2}
                      y={cy - 3.2}
                      width="6.4"
                      height="6.4"
                      rx="1.2"
                      transform={`rotate(45 ${x} ${cy})`}
                      fill="#ffffff"
                      stroke="#6366F1"
                      strokeWidth="1.6"
                    />
                  </g>
                );
              })}

              {/* Rich Luminous Commit Nodes + Horizontal Branch Stems into Cards */}
              {visibleCommits.map((c) => {
                const pos = commitYMap.get(c.hash);
                if (!pos) return null;
                const cx = PAD_X + pos.lane * LANE_W;
                const cy = pos.y;
                const isSelected = selectedCommitHash === c.hash;
                const kind = classifyCommit(c);
                const isBig = c.isHead || kind === 'version' || isSelected;
                const rCore = c.isHead ? 6.4 : kind === 'version' ? 6 : kind === 'sync' ? 4 : 5;

                return (
                  <g key={`node-${c.hash}`}>
                    {/* Horizontal branch stem linking node to its card */}
                    <line
                      x1={cx + rCore + 2}
                      y1={cy}
                      x2={svgWidth - 2}
                      y2={cy}
                      stroke={pos.color}
                      strokeWidth={isBig ? 1.8 : 1.3}
                      strokeOpacity={kind === 'sync' ? 0.25 : isBig ? 0.55 : 0.35}
                      strokeLinecap="round"
                    />
                    {isBig && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={c.isHead ? 11.5 : 10.5}
                        fill={pos.color}
                        fillOpacity={isSelected ? 0.26 : 0.16}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rCore}
                      fill={c.isMerge || kind === 'sync' ? '#ffffff' : pos.color}
                      stroke={c.isMerge || kind === 'sync' ? pos.color : '#ffffff'}
                      strokeWidth={c.isMerge ? 2.6 : 2}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Right Interactive Timeline Rows */}
            <div style={{ paddingLeft: svgWidth }} className="pr-3.5">
              {rows.map((row, idx) => {
                if (row.type === 'dirty') {
                  return (
                    <div
                      key="row-dirty"
                      style={{ top: row.y, height: ROW_H }}
                      className="absolute left-0 right-3.5 flex items-center"
                    >
                      <button
                        onClick={() => {
                          setSelectedCommitHash(null);
                          setShowDirtyDrawer(!showDirtyDrawer);
                        }}
                        style={{
                          marginLeft: svgWidth,
                          backgroundColor: 'var(--pill-err-bg)',
                          borderColor: 'var(--pill-err-border)',
                        }}
                        className="w-full h-[42px] px-3.5 rounded-xl border border-dashed flex items-center justify-between gap-2 text-left transition-all hover:opacity-92 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                          <span
                            className="text-xs font-semibold"
                            style={{ color: 'var(--pill-err-text)' }}
                          >
                            未提交工作区
                          </span>
                          <span
                            className="text-xs truncate"
                            style={{ color: 'var(--pill-err-text)', opacity: 0.85 }}
                          >
                            · {project.git.dirtyCount} 个文件待提交
                          </span>
                        </div>
                        <span
                          className="text-[11px] font-semibold shrink-0"
                          style={{ color: 'var(--pill-err-text)' }}
                        >
                          查看文件 →
                        </span>
                      </button>
                    </div>
                  );
                }

                if (row.type === 'date') {
                  return (
                    <div
                      key={`date-${row.label}-${idx}`}
                      style={{ top: row.y, height: DATE_H, left: svgWidth }}
                      className="absolute right-3.5 flex items-center gap-2.5"
                    >
                      <span
                        className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold border"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          color: 'var(--text-muted)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        {row.label}
                      </span>
                      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
                    </div>
                  );
                }

                const { commit: c, kind } = row;
                const ks = KIND_STYLE[kind];
                const isSelected = selectedCommitHash === c.hash;
                const isVersionCard = kind === 'version' || c.isHead;

                return (
                  <div
                    key={c.hash}
                    style={{ top: row.y, height: ROW_H, left: svgWidth }}
                    className="absolute right-3.5 flex items-center"
                  >
                    <button
                      onClick={() => handleInspectCommit(c)}
                      className="w-full h-[44px] px-3 rounded-xl flex items-center justify-between gap-2.5 text-left transition-all cursor-pointer border"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--accent-soft)'
                          : isVersionCard
                            ? 'var(--bg-surface-strong)'
                            : 'transparent',
                        borderColor: isSelected
                          ? 'var(--accent-primary)'
                          : kind === 'version'
                            ? 'var(--pill-ok-border)'
                            : isVersionCard
                              ? 'var(--border-subtle)'
                              : 'transparent',
                        boxShadow: isVersionCard && !isSelected ? 'var(--card-shadow)' : 'none',
                        opacity: kind === 'sync' && !isSelected ? 0.68 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-surface-strong)';
                          e.currentTarget.style.borderColor = 'var(--border-subtle)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = isVersionCard
                            ? 'var(--bg-surface-strong)'
                            : 'transparent';
                          e.currentTarget.style.borderColor =
                            kind === 'version'
                              ? 'var(--pill-ok-border)'
                              : isVersionCard
                                ? 'var(--border-subtle)'
                                : 'transparent';
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Semantic Kind Pill */}
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border shrink-0"
                          style={{
                            backgroundColor: ks.bg,
                            color: ks.color,
                            borderColor: ks.border,
                          }}
                        >
                          {ks.icon}
                          <span>{c.detectedVersion ? c.detectedVersion : ks.label}</span>
                        </span>

                        {/* Branch Refs */}
                        {c.refs.slice(0, 2).map((ref) => (
                          <span
                            key={`${ref.kind}-${ref.name}`}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold shrink-0 flex items-center gap-0.5 border"
                            style={{
                              backgroundColor:
                                ref.kind === 'head'
                                  ? 'var(--pill-info-bg)'
                                  : ref.kind === 'tag'
                                    ? 'var(--pill-warn-bg)'
                                    : 'var(--pill-neutral-bg)',
                              color:
                                ref.kind === 'head'
                                  ? 'var(--pill-info-text)'
                                  : ref.kind === 'tag'
                                    ? 'var(--pill-warn-text)'
                                    : 'var(--pill-neutral-text)',
                              borderColor:
                                ref.kind === 'head'
                                  ? 'var(--pill-info-border)'
                                  : ref.kind === 'tag'
                                    ? 'var(--pill-warn-border)'
                                    : 'var(--pill-neutral-border)',
                            }}
                          >
                            {ref.kind === 'tag' && <Tag className="w-2.5 h-2.5" />}
                            {ref.name}
                          </span>
                        ))}

                        {c.isMerge && (
                          <GitMerge className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                        )}

                        <span
                          className={`text-[12.5px] truncate ${isVersionCard ? 'font-semibold' : 'font-normal'}`}
                          style={{ color: 'var(--text-primary)' }}
                          title={c.fullSubject}
                        >
                          {c.shortTitle}
                        </span>
                      </div>

                      {/* Right Hash Copy + Time */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          onClick={(e) => handleCopyHash(e, c.shortHash)}
                          title="点击复制提交编号"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-mono transition-colors hover:bg-blue-500/10"
                          style={{ color: copiedHash === c.shortHash ? '#059669' : 'var(--text-muted)' }}
                        >
                          {copiedHash === c.shortHash ? (
                            <Check className="w-2.5 h-2.5" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 opacity-45" />
                          )}
                          {c.shortHash}
                        </span>
                        <span
                          className="text-[11px] w-12 text-right tabular-nums"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {formatRelativeTime(c.date)}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Frosted Apple Glass Slide-Over Drawer: Working Tree */}
        {showDirtyDrawer && hasDirty && (
          <div
            className="glass-drawer absolute inset-y-0 right-0 w-80 max-w-full border-l p-4 flex flex-col z-20"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold" style={{ color: 'var(--pill-err-text)' }}>
                未提交改动 ({project.git.dirtyCount})
              </span>
              <button
                onClick={() => setShowDirtyDrawer(false)}
                className="p-1 rounded-lg hover:bg-slate-500/10 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {project.git.dirtyFiles.map((f, idx) => {
                const badgeColor =
                  f.status === 'M'
                    ? '#D97706'
                    : f.status === 'D'
                      ? '#E11D48'
                      : f.status === 'A'
                        ? '#059669'
                        : '#2563EB';
                return (
                  <div
                    key={`${f.path}-${idx}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11px] border"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded font-mono font-bold text-[10px] flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${badgeColor}18`, color: badgeColor }}
                    >
                      {f.status}
                    </span>
                    <span className="font-mono truncate" title={f.path}>
                      {f.path}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Frosted Apple Glass Slide-Over Drawer: Commit File Stats */}
        {selectedCommitHash && (
          <div
            className="glass-drawer absolute inset-y-0 right-0 w-88 max-w-full border-l p-4 flex flex-col z-20"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <GitCommitHorizontal className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-mono font-semibold">
                  {selectedCommitHash.slice(0, 7)}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedCommitHash(null);
                  setCommitDetail(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-500/10 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {detailLoading || !commitDetail ? (
              <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                读取改动摘要...
              </div>
            ) : (
              <>
                <div className="text-xs font-semibold leading-relaxed mb-2">
                  {commitDetail.subject}
                </div>
                <div
                  className="flex items-center justify-between text-[11px] pb-3 mb-3 border-b"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  <span>
                    {commitDetail.author} · {formatShortDate(commitDetail.date)}
                  </span>
                  <span className="font-mono font-semibold">
                    <span className="text-emerald-600">+{commitDetail.totalAdded}</span>{' '}
                    <span className="text-rose-600">-{commitDetail.totalDeleted}</span>
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5">
                  {commitDetail.files.map((f, idx) => {
                    const total = f.added + f.deleted || 1;
                    const addPct = Math.round((f.added / total) * 100);
                    return (
                      <div
                        key={`${f.path}-${idx}`}
                        className="p-2.5 rounded-xl border"
                        style={{
                          backgroundColor: 'var(--bg-surface-strong)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="flex items-center gap-1.5 min-w-0 text-[11px] font-mono">
                            <FileCode2
                              className="w-3 h-3 shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                            />
                            <span className="truncate" title={f.path}>
                              {f.path.split('/').pop()}
                            </span>
                          </span>
                          <span className="text-[10.5px] font-mono shrink-0 font-semibold">
                            {f.binary ? (
                              <span style={{ color: 'var(--text-muted)' }}>BIN</span>
                            ) : (
                              <>
                                <span className="text-emerald-600">+{f.added}</span>{' '}
                                <span className="text-rose-600">-{f.deleted}</span>
                              </>
                            )}
                          </span>
                        </div>
                        {!f.binary && (
                          <div className="h-1 rounded-full overflow-hidden flex bg-slate-200/70">
                            <div className="bg-emerald-500 h-full" style={{ width: `${addPct}%` }} />
                            <div className="bg-rose-500 h-full flex-1" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
