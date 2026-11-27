import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bot,
  CalendarClock,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Flame,
  FolderOpen,
  Gamepad2,
  Heart,
  ImagePlus,
  Megaphone,
  Monitor,
  Pencil,
  Pin,
  Radar,
  RefreshCw,
  Smartphone,
  Star,
  Terminal,
  Trash2,
} from 'lucide-react';
import { buildAiHandoffContext, getCountdownInfo } from '../aiHelpers';
import { LIFECYCLE_STAGES, STAGE_INDEX_MAP } from '../constants';
import {
  AppSettings,
  GitGraphData,
  LifecycleStageId,
  ProjectCardData,
  ProjectExternalLink,
  ProjectTelemetry,
  QuickNoteItem,
  StageTodoItem,
} from '../types';
import { formatCompactCount, formatRelativeTime, formatStatsDelta, getLocalDateKey, mediaUrl } from '../utils';
import { BuildUploadCard } from './BuildUploadCard';
import { GitTreeGraph } from './GitTreeGraph';
import { LifecycleFlowchart } from './LifecycleFlowchart';
import { PlayerFeedbackCard } from './PlayerFeedbackCard';
import { ProjectTelemetryStrip } from './ProjectTelemetryStrip';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { StudioPadCard } from './StudioPadCard';
import { TapTapTrendCard } from './TapTapTrendCard';

interface ProjectDetailProps {
  project: ProjectCardData;
  settings: AppSettings;
  refreshingStats?: boolean;
  statsError?: string | null;
  onRefreshStats?: () => Promise<void>;
  onEdit: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onOpenSettings: () => void;
  onRemoveFromHub: () => Promise<void>;
  onRefreshProject: () => Promise<void>;
  onUpdateMeta: (patch: {
    stage?: LifecycleStageId;
    pinned?: boolean;
    archived?: boolean;
    sprintFocus?: boolean;
    targetDate?: string;
    targetGoal?: string;
    displayName?: string;
    customCover?: string;
    customLinks?: ProjectExternalLink[];
  }) => Promise<void>;
  onUpdateTodos: (todos: StageTodoItem[]) => Promise<void>;
  onUpdateNotes: (notes: QuickNoteItem[]) => Promise<void>;
  onAddBuildLog: (entry: {
    type: 'build' | 'upload';
    version: string;
    commitHash?: string;
    commitShort?: string;
    platform?: string;
    note?: string;
  }) => Promise<void>;
  onDeleteBuildLog: (id: string) => Promise<void>;
}

const CATEGORY_MAP: Record<string, string> = {
  simulation: '模拟经营',
  casual: '休闲益智',
  action: '动作冒险',
  strategy: '策略塔防',
  rpg: '角色扮演',
  puzzle: '解谜闯关',
};

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  settings,
  refreshingStats,
  statsError,
  onRefreshStats,
  onEdit,
  onUpdateSettings,
  onOpenSettings,
  onRemoveFromHub,
  onRefreshProject,
  onUpdateMeta,
  onUpdateTodos,
  onUpdateNotes,
  onAddBuildLog,
  onDeleteBuildLog,
}) => {
  const [graph, setGraph] = useState<GitGraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [telemetry, setTelemetry] = useState<ProjectTelemetry | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedAi, setCopiedAi] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);

  const loadGraph = async () => {
    if (!project.git.isGit) {
      setGraph({ isGit: false, maxLane: 0, branches: [], commits: [] });
      return;
    }
    setGraphLoading(true);
    try {
      const data = await window.gameHub.getGitGraph(project.path, settings.gitCommitLimit || 100);
      setGraph(data);
    } finally {
      setGraphLoading(false);
    }
  };

  const loadTelemetry = async () => {
    setTelemetryLoading(true);
    try {
      const data = await window.gameHub.getProjectTelemetry(project.path);
      setTelemetry(data);
    } finally {
      setTelemetryLoading(false);
    }
  };

  useEffect(() => {
    loadGraph();
    loadTelemetry();
  }, [project.path]);

  const handleRefreshAll = async () => {
    await Promise.all([onRefreshProject(), loadGraph(), loadTelemetry()]);
  };

  const handlePickCover = async () => {
    const img = await window.gameHub.pickImage();
    if (img) {
      await onUpdateMeta({ customCover: img });
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard?.writeText(project.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1200);
  };

  const handleCopyAiContext = () => {
    const txt = buildAiHandoffContext(project, graph);
    navigator.clipboard?.writeText(txt);
    setCopiedAi(true);
    setTimeout(() => setCopiedAi(false), 2000);
  };

  const coverSrc = mediaUrl(project.coverPath);
  const stageDef = LIFECYCLE_STAGES[STAGE_INDEX_MAP[project.stage]];
  const categoryLabel = project.taptap.category
    ? CATEGORY_MAP[project.taptap.category] || project.taptap.category
    : null;
  const countdown = getCountdownInfo(project.targetDate);

  // Automatic TapTap Portal links + User's custom links
  const portalLinks: { label: string; url: string; highlight?: boolean }[] = [];
  if (project.taptap.appId) {
    portalLinks.push({
      label: 'TapTap 商店页',
      url: `https://www.taptap.cn/app/${project.taptap.appId}`,
      highlight: true,
    });
  }
  if (project.engine === 'taptap-maker') {
    portalLinks.push({
      label: 'TapTap 开发者中心',
      url: 'https://developer.taptap.cn/',
    });
  }
  for (const lnk of project.customLinks || []) {
    portalLinks.push({ label: lnk.label, url: lnk.url });
  }

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-5 space-y-4">
      {/* Immersive Apple Frosted Game-Art Hero Banner */}
      <div className="glass-card rounded-[24px] relative overflow-hidden">
        {coverSrc && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <img
              src={coverSrc}
              alt=""
              className="absolute right-0 top-1/2 -translate-y-1/2 w-[58%] h-[175%] object-cover opacity-30 blur-2xl scale-110"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, var(--bg-surface-strong) 0%, var(--bg-surface-strong) 42%, transparent 100%)',
              }}
            />
          </div>
        )}

        <div className="relative z-10 p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-5 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={handlePickCover}
                title="点击更换自定义封面图"
                className="relative w-[88px] h-[64px] rounded-2xl overflow-hidden shrink-0 group cursor-pointer border-2 border-white/85 shadow-md"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                {coverSrc ? (
                  <img src={coverSrc} alt={project.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                    <Gamepad2 className="w-6 h-6 text-slate-500" />
                  </div>
                )}
                <div className="absolute inset-0 bg-slate-900/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <ImagePlus className="w-5 h-5 text-white" />
                </div>
              </button>

              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[19px] font-bold tracking-tight truncate">{project.name}</h1>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                    style={{
                      backgroundColor: stageDef.bgSoft,
                      color: stageDef.textColor,
                      borderColor: stageDef.borderSoft,
                    }}
                  >
                    {stageDef.label}
                  </span>
                  {project.displayVersion && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        color: 'var(--text-primary)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {project.displayVersion}
                    </span>
                  )}
                  {(project.sprintFocus || countdown) && (
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                      style={{
                        backgroundColor:
                          countdown?.tone === 'err' ? 'var(--pill-err-bg)' : 'var(--pill-warn-bg)',
                        color:
                          countdown?.tone === 'err' ? 'var(--pill-err-text)' : 'var(--pill-warn-text)',
                        borderColor:
                          countdown?.tone === 'err'
                            ? 'var(--pill-err-border)'
                            : 'var(--pill-warn-border)',
                      }}
                    >
                      {project.sprintFocus ? (
                        <Flame className="w-3 h-3" />
                      ) : (
                        <CalendarClock className="w-3 h-3" />
                      )}
                      <span>
                        {project.targetGoal || '本周冲刺'}
                        {countdown ? ` · ${countdown.label}` : ''}
                      </span>
                    </span>
                  )}
                </div>

                {/* Rich Compact Meta Badges */}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  {project.taptap.appId && (
                    <span
                      className="font-mono px-2 py-0.5 rounded-md border font-medium"
                      style={{
                        backgroundColor: 'var(--pill-info-bg)',
                        color: 'var(--pill-info-text)',
                        borderColor: 'var(--pill-info-border)',
                      }}
                    >
                      AppID {project.taptap.appId}
                    </span>
                  )}
                  {categoryLabel && (
                    <span
                      className="px-2 py-0.5 rounded-md border"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        color: 'var(--text-secondary)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {categoryLabel}
                    </span>
                  )}
                  {project.taptap.orientation && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        color: 'var(--text-secondary)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {project.taptap.orientation === 'portrait' ? (
                        <Smartphone className="w-3 h-3" />
                      ) : (
                        <Monitor className="w-3 h-3" />
                      )}
                      {project.taptap.orientation === 'portrait' ? '竖屏' : '横屏'}
                    </span>
                  )}
                  {telemetry && telemetry.adEnabled && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium"
                      style={{
                        backgroundColor: 'var(--pill-ok-bg)',
                        color: 'var(--pill-ok-text)',
                        borderColor: 'var(--pill-ok-border)',
                      }}
                    >
                      <Megaphone className="w-3 h-3" />
                      广告位 {telemetry.adSpaceCount}
                    </span>
                  )}
                  <button
                    onClick={handleCopyPath}
                    title="点击复制项目路径"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono hover:text-blue-600 transition-colors cursor-pointer"
                    style={{ color: copiedPath ? '#059669' : 'var(--text-muted)' }}
                  >
                    <span className="truncate max-w-[220px]">{project.path}</span>
                    {copiedPath ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Action Pills incl. AI Handoff Context Copy! */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleCopyAiContext}
                title="一键打包项目路径、阶段、最近提交、待办和随手记，粘贴给 AI 秒续接"
                className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer hover:opacity-92 shadow-xs"
                style={{
                  backgroundColor: copiedAi ? '#059669' : '#2563EB',
                  color: '#ffffff',
                }}
              >
                {copiedAi ? <Check className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                <span>{copiedAi ? '已复制 AI 上下文!' : '复制 AI 上下文'}</span>
              </button>

              <button
                onClick={onEdit}
                className="h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <Pencil className="w-3.5 h-3.5 text-violet-600" />
                <span>编辑</span>
              </button>

              <button
                onClick={() => window.gameHub.openEditor(project.path)}
                title="用编辑器打开"
                className="h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <Code2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>编辑器</span>
              </button>

              <button
                onClick={() => window.gameHub.openFolder(project.path)}
                className="h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                <span>文件夹</span>
              </button>

              <button
                onClick={() => window.gameHub.openTerminal(project.path)}
                className="h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-600" />
                <span>终端</span>
              </button>

              <button
                onClick={() => onUpdateMeta({ pinned: !project.pinned })}
                title={project.pinned ? '取消置顶' : '置顶'}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border shadow-xs"
                style={{
                  backgroundColor: project.pinned ? 'var(--pill-warn-bg)' : 'var(--bg-surface-strong)',
                  color: project.pinned ? 'var(--pill-warn-text)' : 'var(--text-secondary)',
                  borderColor: project.pinned ? 'var(--pill-warn-border)' : 'var(--border-subtle)',
                }}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onUpdateMeta({ archived: !project.archived })}
                title={project.archived ? '移出归档' : '归档此项目'}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {project.archived ? (
                  <ArchiveRestore className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
              </button>

              {project.archived && (
                <button
                  onClick={onRemoveFromHub}
                  title="仅从软件中移除（不删除硬盘文件）"
                  className="h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1 transition-all cursor-pointer border shadow-xs hover:bg-rose-600 hover:text-white"
                  style={{
                    backgroundColor: 'var(--pill-err-bg)',
                    color: 'var(--pill-err-text)',
                    borderColor: 'var(--pill-err-border)',
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>移除</span>
                </button>
              )}

              <button
                onClick={handleRefreshAll}
                title="刷新当前项目"
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${graphLoading || telemetryLoading ? 'animate-spin text-blue-600' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Slim TapTap Portal & Custom Bookmarks Ribbon */}
          {portalLinks.length > 0 && (
            <div
              className="pt-2.5 border-t flex items-center justify-between gap-2 flex-wrap"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium mr-1" style={{ color: 'var(--text-muted)' }}>
                  快捷传送门
                </span>
                {portalLinks.map((lnk) => (
                  <button
                    key={`${lnk.label}-${lnk.url}`}
                    onClick={() => window.gameHub.openExternal(lnk.url)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer hover:border-blue-400 hover:text-blue-600"
                    style={{
                      backgroundColor: lnk.highlight
                        ? 'var(--pill-info-bg)'
                        : 'var(--bg-surface-strong)',
                      borderColor: lnk.highlight
                        ? 'var(--pill-info-border)'
                        : 'var(--border-subtle)',
                      color: lnk.highlight ? 'var(--pill-info-text)' : 'var(--text-secondary)',
                    }}
                  >
                    <span>{lnk.label}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                  </button>
                ))}
                {project.taptap.appId && (
                  <button
                    onClick={() => {
                      document
                        .getElementById('player-feedback-radar')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer hover:opacity-90"
                    style={{
                      backgroundColor: 'var(--pill-ok-bg)',
                      borderColor: 'var(--pill-ok-border)',
                      color: 'var(--pill-ok-text)',
                    }}
                  >
                    <Radar className="w-3 h-3" />
                    <span>玩家评价 & 论坛雷达</span>
                  </button>
                )}
                <button
                  onClick={onEdit}
                  className="px-2 py-1 rounded-lg text-[11px] border border-dashed cursor-pointer hover:border-blue-400 hover:text-blue-600"
                  style={{
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-muted)',
                  }}
                >
                  + 自定义外链 / 冲刺日
                </button>
              </div>
            </div>
          )}

          {/* TapTap Live Heat & Followers Strip (Daily Auto + On-Demand Instant Refresh) */}
          {project.taptap.appId && /^\d+$/.test(String(project.taptap.appId).trim()) && (() => {
            const stats = project.taptapStats;
            const todayKey = getLocalDateKey();
            const isToday = stats?.lastDateKey === todayKey;
            const heatDelta = stats ? formatStatsDelta(stats.heat, stats.prevHeat) : null;
            const fansDelta = stats ? formatStatsDelta(stats.fans, stats.prevFans) : null;

            return (
              <div
                className="pt-2.5 border-t flex items-center justify-between gap-3 flex-wrap"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    TapTap 热度与关注
                  </span>

                  {stats ? (
                    <>
                      <div
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface-strong)',
                          borderColor: 'var(--border-subtle)',
                        }}
                        title={`精确热度：${stats.heat.toLocaleString('zh-CN')}${
                          stats.prevHeat !== undefined
                            ? `（前一日 ${stats.prevHeat.toLocaleString('zh-CN')}）`
                            : ''
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          热度
                        </span>
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          {stats.heat.toLocaleString('zh-CN')}
                        </span>
                        {heatDelta && (
                          <span
                            className={`text-[10.5px] font-mono font-semibold px-1.5 py-0.2 rounded-md ${
                              heatDelta.startsWith('+')
                                ? 'bg-emerald-500/12 text-emerald-600'
                                : 'bg-rose-500/12 text-rose-500'
                            }`}
                          >
                            {heatDelta}
                          </span>
                        )}
                      </div>

                      <div
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs tabular-nums"
                        style={{
                          backgroundColor: 'var(--bg-surface-strong)',
                          borderColor: 'var(--border-subtle)',
                        }}
                        title={`精确关注：${stats.fans.toLocaleString('zh-CN')}${
                          stats.prevFans !== undefined
                            ? `（前一日 ${stats.prevFans.toLocaleString('zh-CN')}）`
                            : ''
                        }`}
                      >
                        <Heart className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          关注
                        </span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {stats.fans.toLocaleString('zh-CN')}
                        </span>
                        {fansDelta && (
                          <span
                            className={`text-[10.5px] font-mono font-semibold px-1.5 py-0.2 rounded-md ${
                              fansDelta.startsWith('+')
                                ? 'bg-emerald-500/12 text-emerald-600'
                                : 'bg-rose-500/12 text-rose-500'
                            }`}
                          >
                            {fansDelta}
                          </span>
                        )}
                      </div>

                      {stats.reserve && stats.reserve > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-xl border text-[11px] tabular-nums"
                          style={{
                            backgroundColor: 'var(--bg-surface-strong)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                          title={`预约人数：${stats.reserve.toLocaleString('zh-CN')}`}
                        >
                          预约 <strong className="font-mono">{formatCompactCount(stats.reserve)}</strong>
                        </span>
                      )}

                      {stats.score && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-xl border text-[11px] font-semibold tabular-nums"
                          style={{
                            backgroundColor: 'var(--pill-warn-bg)',
                            borderColor: 'var(--pill-warn-border)',
                            color: 'var(--pill-warn-text)',
                          }}
                        >
                          <Star className="w-3 h-3 fill-current" />
                          <span>{stats.score}</span>
                        </span>
                      )}

                      <button
                        onClick={() => {
                          document
                            .getElementById('taptap-stats-trend')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-xl border text-[11px] font-medium cursor-pointer hover:border-orange-400 hover:text-orange-600 transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-surface-strong)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span>查看趋势图 ↓</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                      {refreshingStats
                        ? '正在拉取实时热度与关注…'
                        : '尚未抓取，每日首次打开自动抓取 1 次，或点击右侧立即抓取'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {statsError && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--pill-err-bg)',
                        borderColor: 'var(--pill-err-border)',
                        color: 'var(--pill-err-text)',
                      }}
                    >
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{statsError}</span>
                    </span>
                  )}
                  {stats && (
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {isToday ? '今日已同步' : `上次同步 ${stats.lastDateKey}`} ·{' '}
                      {formatRelativeTime(stats.fetchedAt)}
                    </span>
                  )}
                  {onRefreshStats && (
                    <button
                      onClick={onRefreshStats}
                      disabled={refreshingStats}
                      title="立即向 TapTap 拉取当前实时热度与关注"
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer hover:border-orange-400 hover:text-orange-600 transition-colors disabled:opacity-60"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${refreshingStats ? 'animate-spin text-orange-500' : ''}`}
                      />
                      <span>{refreshingStats ? '抓取中…' : '立即刷新'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Module 0.5: Dedicated TapTap Heat & Followers Trend Chart (per-game) */}
      <TapTapTrendCard
        project={project}
        refreshing={refreshingStats}
        error={statsError}
        onRefresh={onRefreshStats}
      />

      {/* Module 1: macOS Asset Storage Bar + 14-Day Commit Cadence Bento */}
      <ProjectTelemetryStrip telemetry={telemetry} loading={telemetryLoading} />

      {/* Module 2: Apple-Medallion Lifecycle Flowchart */}
      <LifecycleFlowchart
        project={project}
        onChangeStage={(stage) => onUpdateMeta({ stage })}
        onUpdateTodos={onUpdateTodos}
      />

      {/* Module 3: Visual Git Tree (7 cols) + Studio Pad & Build Radar (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7">
          <GitTreeGraph
            key={`${project.id}-${settings.gitHideSyncByDefault}`}
            project={project}
            graph={graph}
            loading={graphLoading}
            defaultHideSync={settings.gitHideSyncByDefault}
            onRefresh={handleRefreshAll}
          />
        </div>
        <div className="lg:col-span-5 space-y-4">
          <StudioPadCard
            project={project}
            onUpdateNotes={onUpdateNotes}
            onUpdateTodos={onUpdateTodos}
          />
          <BuildUploadCard
            project={project}
            onGenerateReleaseNotes={() => setShowReleaseModal(true)}
            onAddLog={onAddBuildLog}
            onDeleteLog={onDeleteBuildLog}
          />
        </div>
      </div>

      {/* Module 4: TapTap Live Player Reviews & Forum Issue Radar */}
      <PlayerFeedbackCard
        project={project}
        graph={graph}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        onUpdateTodos={onUpdateTodos}
        onOpenSettings={onOpenSettings}
      />

      {showReleaseModal && (
        <ReleaseNotesModal
          project={project}
          graph={graph}
          onClose={() => setShowReleaseModal(false)}
        />
      )}
    </div>
  );
};
