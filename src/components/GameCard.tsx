import React from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Flame,
  FolderOpen,
  Gamepad2,
  Heart,
  Pencil,
  Pin,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { getCountdownInfo } from '../aiHelpers';
import { LIFECYCLE_STAGES, STAGE_INDEX_MAP } from '../constants';
import { ProjectCardData } from '../types';
import { formatCompactCount, formatRelativeTime, formatStatsDelta, mediaUrl } from '../utils';

interface GameCardProps {
  project: ProjectCardData;
  refreshing: boolean;
  refreshingStats?: boolean;
  onSelect: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onToggleArchive: (e: React.MouseEvent) => void;
  onRemoveFromHub: (e: React.MouseEvent) => void;
  onRefresh: (e: React.MouseEvent) => void;
  onRefreshStats?: (e: React.MouseEvent) => void;
  onOpenFolder: (e: React.MouseEvent) => void;
}

const PASTEL_MESHES = [
  'linear-gradient(135deg, #EEF2FF 0%, #E0F2FE 100%)',
  'linear-gradient(135deg, #ECFDF5 0%, #E0F2FE 100%)',
  'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)',
  'linear-gradient(135deg, #F5F3FF 0%, #FCE7F3 100%)',
];

function getPastelMesh(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PASTEL_MESHES[Math.abs(h) % PASTEL_MESHES.length];
}

export const GameCard: React.FC<GameCardProps> = ({
  project,
  refreshing,
  refreshingStats,
  onSelect,
  onEdit,
  onTogglePin,
  onToggleArchive,
  onRemoveFromHub,
  onRefresh,
  onRefreshStats,
  onOpenFolder,
}) => {
  const coverSrc = mediaUrl(project.coverPath);
  const stageIdx = STAGE_INDEX_MAP[project.stage];
  const stageDef = LIFECYCLE_STAGES[stageIdx];
  const countdown = getCountdownInfo(project.targetDate);
  const hasAppId = Boolean(project.taptap.appId && /^\d+$/.test(String(project.taptap.appId).trim()));
  const stats = project.taptapStats;
  const heatDelta = stats ? formatStatsDelta(stats.heat, stats.prevHeat) : null;
  const fansDelta = stats ? formatStatsDelta(stats.fans, stats.prevFans) : null;

  const isAllGood =
    project.git.isGit &&
    project.git.dirtyCount === 0 &&
    !project.versionMismatch &&
    project.buildStatus === 'synced' &&
    project.git.ahead === 0 &&
    project.git.behind === 0;

  const topBadge =
    project.stage === 'official'
      ? { label: '正式版', bg: 'rgba(255,255,255,0.92)', color: '#047857' }
      : project.stage === 'public_test'
        ? { label: '公测', bg: 'rgba(255,255,255,0.92)', color: '#C2410C' }
        : project.engine === 'web-h5'
          ? { label: 'H5', bg: 'rgba(255,255,255,0.9)', color: '#475569' }
          : { label: 'Maker', bg: 'rgba(255,255,255,0.9)', color: '#1D4ED8' };

  return (
    <div
      onClick={onSelect}
      className="group glass-card-interactive rounded-2xl cursor-pointer flex flex-col"
    >
      {/* Inset Rounded Cover Frame (Apple / Dribbble Gallery Feel) */}
      <div className="p-2.5 pb-0">
        <div
          className="relative h-[126px] rounded-xl overflow-hidden border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {coverSrc ? (
            <img
              src={coverSrc}
              alt={project.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center relative"
              style={{ background: getPastelMesh(project.name) }}
            >
              <div
                className="absolute inset-0 opacity-35"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 2px 2px, rgba(15,23,42,0.16) 1px, transparent 0)',
                  backgroundSize: '18px 18px',
                }}
              />
              <div className="w-10 h-10 rounded-xl bg-white/85 shadow-sm flex items-center justify-center relative">
                <Gamepad2 className="w-5 h-5 text-slate-500" />
              </div>
            </div>
          )}

          {/* Subtle single floating pill top-left */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <span
              className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold shadow-xs backdrop-blur-md"
              style={{ backgroundColor: topBadge.bg, color: topBadge.color }}
            >
              {topBadge.label}
            </span>
            {(project.sprintFocus || countdown) && !project.archived && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10.5px] font-semibold shadow-xs backdrop-blur-md bg-orange-500/92 text-white">
                <Flame className="w-3 h-3" />
                <span>{countdown ? countdown.label : '冲刺'}</span>
              </span>
            )}
            {project.archived && project.archiveReason && (
              <span className="px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-white/90 text-slate-600 shadow-xs">
                {project.archiveReason}
              </span>
            )}
          </div>

          {/* Hover quick actions top-right */}
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <button
              onClick={onEdit}
              title="编辑名称与封面图"
              className="w-7 h-7 rounded-lg bg-white/92 text-slate-700 hover:bg-blue-600 hover:text-white shadow-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onOpenFolder}
              title="打开文件夹"
              className="w-7 h-7 rounded-lg bg-white/92 text-slate-700 hover:bg-blue-600 hover:text-white shadow-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRefresh}
              title="刷新"
              className="w-7 h-7 rounded-lg bg-white/92 text-slate-700 hover:bg-blue-600 hover:text-white shadow-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {project.archived ? (
              <>
                <button
                  onClick={onToggleArchive}
                  title="移出归档"
                  className="w-7 h-7 rounded-lg bg-white/92 text-emerald-700 hover:bg-emerald-600 hover:text-white shadow-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onRemoveFromHub}
                  title="仅从软件中移除（不删除硬盘文件）"
                  className="w-7 h-7 rounded-lg bg-white/92 text-rose-600 hover:bg-rose-600 hover:text-white shadow-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                onClick={onTogglePin}
                title={project.pinned ? '取消置顶' : '置顶'}
                className={`w-7 h-7 rounded-lg shadow-xs flex items-center justify-center transition-all cursor-pointer ${
                  project.pinned
                    ? 'bg-amber-500 text-white opacity-100'
                    : 'bg-white/92 text-slate-700 hover:bg-amber-500 hover:text-white opacity-0 group-hover:opacity-100'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Airy, High-Craft White Card Body */}
      <div className="px-3.5 pt-3 pb-3.5 flex flex-col gap-2.5 flex-1 justify-between">
        {/* Title + Relative Time */}
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className="font-semibold text-[14px] tracking-tight truncate"
            title={project.name}
          >
            {project.name}
          </h3>
          <span
            className="text-[11px] tabular-nums shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {formatRelativeTime(project.lastModified)}
          </span>
        </div>

        {/* Version Pill + Stage Chip */}
        <div className="flex items-center justify-between gap-2">
          {project.versionMismatch ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border"
              style={{
                backgroundColor: 'var(--pill-warn-bg)',
                color: 'var(--pill-warn-text)',
                borderColor: 'var(--pill-warn-border)',
              }}
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>
                脚本 {project.taptap.luaGameVersion} ≠ 提交 {project.git.detectedGitVersion}
              </span>
            </span>
          ) : project.displayVersion ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border shrink-0"
                style={{
                  backgroundColor: 'var(--pill-neutral-bg)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--pill-neutral-border)',
                }}
              >
                {project.displayVersion}
              </span>
              {project.taptap.configVersion &&
                `v${project.taptap.configVersion}` !== project.displayVersion &&
                project.taptap.configVersion !== project.displayVersion && (
                  <span
                    className="text-[10.5px] font-mono truncate"
                    style={{ color: 'var(--text-muted)' }}
                    title="TapTap Maker 工程号 (project.json)"
                  >
                    包 {project.taptap.configVersion}
                  </span>
                )}
            </div>
          ) : (
            <span
              className="text-[11px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {project.git.isGit ? `${project.git.totalCommits} 次提交` : '本地项目'}
            </span>
          )}

          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0"
            style={{
              backgroundColor: stageDef.bgSoft,
              color: stageDef.textColor,
              borderColor: stageDef.borderSoft,
            }}
          >
            {stageDef.label}
          </span>
        </div>

        {/* Clean Single-Hue 7-Segment Pipeline Track */}
        <div className="flex items-center gap-1 pt-0.5">
          {LIFECYCLE_STAGES.map((st, idx) => {
            const filled = idx <= stageIdx;
            return (
              <div
                key={st.id}
                title={st.label}
                className="h-1 flex-1 rounded-full transition-all"
                style={{
                  backgroundColor: filled ? stageDef.color : 'var(--bg-elevated)',
                  opacity: idx < stageIdx ? 0.45 : 1,
                }}
              />
            );
          })}
        </div>

        {/* TapTap Heat & Followers Strip (only for projects with a TapTap AppID) */}
        {hasAppId && (
          <div
            className="rounded-xl px-2.5 py-1.5 border flex items-center justify-between gap-2 text-[11px]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
            title={
              stats
                ? `TapTap 精确数据 · 热度 ${stats.heat.toLocaleString('zh-CN')} / 关注 ${stats.fans.toLocaleString('zh-CN')}${
                    stats.reserve ? ` / 预约 ${stats.reserve.toLocaleString('zh-CN')}` : ''
                  }${stats.score ? ` / 评分 ${stats.score}` : ''} · 更新于 ${formatRelativeTime(stats.fetchedAt)}`
                : '尚未抓取 TapTap 热度与关注，点击右侧按钮立即抓取'
            }
          >
            {stats ? (
              <div className="flex items-center gap-2.5 min-w-0 truncate tabular-nums">
                <span className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400">
                  <Flame className="w-3 h-3 shrink-0" />
                  <span>{formatCompactCount(stats.heat)}</span>
                  {heatDelta && (
                    <span
                      className={`text-[10px] font-mono ${
                        heatDelta.startsWith('+') ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                    >
                      {heatDelta}
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                  <Heart className="w-3 h-3 shrink-0" />
                  <span>{formatCompactCount(stats.fans)}</span>
                  {fansDelta && (
                    <span
                      className={`text-[10px] font-mono ${
                        fansDelta.startsWith('+') ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                    >
                      {fansDelta}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                {refreshingStats ? '正在抓取热度与关注…' : 'TapTap 热度/关注待同步'}
              </span>
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              {stats && stats.history && stats.history.length >= 2 && (() => {
                const pts = stats.history.slice(-10);
                const vals = pts.map((pt) => pt.heat || 0);
                const minV = Math.min(...vals);
                const maxV = Math.max(...vals);
                const span = Math.max(1, maxV - minV);
                const w = 40;
                const h = 14;
                const poly = vals
                  .map((v, idx) => {
                    const x = (idx / (vals.length - 1)) * w;
                    const y = maxV === minV ? h / 2 : h - 2 - ((v - minV) / span) * (h - 4);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ');
                const rising = vals[vals.length - 1] >= vals[0];
                return (
                  <svg
                    width={w}
                    height={h}
                    viewBox={`0 0 ${w} ${h}`}
                    className="overflow-visible shrink-0"
                    aria-label="近几日热度走势"
                  >
                    <polyline
                      fill="none"
                      stroke={rising ? '#EA580C' : '#94A3B8'}
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={poly}
                    />
                  </svg>
                );
              })()}
              {onRefreshStats && (
                <button
                  onClick={onRefreshStats}
                  disabled={refreshingStats}
                  title="立即刷新该游戏的 TapTap 实时热度与关注"
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 cursor-pointer hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-60"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <RefreshCw className={`w-3 h-3 ${refreshingStats ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Minimal Quiet Footer Strip (No heavy nested dark pills!) */}
        <div
          className="pt-2.5 border-t flex items-center justify-between text-[11.5px]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {isAllGood ? (
            <span
              className="inline-flex items-center gap-1.5 font-medium"
              style={{ color: 'var(--pill-ok-text)' }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>已同步 · 已上传</span>
            </span>
          ) : (
            <div className="flex items-center gap-3 min-w-0 truncate">
              {/* Working tree status */}
              {!project.git.isGit ? (
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <span>未建 Git</span>
                </span>
              ) : project.git.dirtyCount > 0 ? (
                <span
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: 'var(--pill-err-text)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>{project.git.dirtyCount} 未提交</span>
                </span>
              ) : (
                <span
                  className="flex items-center gap-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>工作区干净</span>
                </span>
              )}

              {/* Build / Upload status */}
              {project.buildStatus === 'synced' && (
                <span
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: 'var(--pill-ok-text)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>已上传</span>
                </span>
              )}
              {project.buildStatus === 'pending_build' && (
                <span
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: 'var(--pill-warn-text)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>待构建</span>
                </span>
              )}
              {project.buildStatus === 'pending_upload' && (
                <span
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: '#C2410C' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  <span>待上传</span>
                </span>
              )}
            </div>
          )}

          {project.git.isGit && (
            <span
              className="text-[11px] font-mono tabular-nums shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              {project.git.totalCommits} 提交
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
