import React from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  BookOpen,
  Gamepad2,
  GitCommitVertical,
  LayoutGrid,
  Lightbulb,
  Package,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { LIFECYCLE_STAGES } from '../constants';
import { LifecycleStageId, ProjectCardData, QuickFilterId } from '../types';
import { mediaUrl } from '../utils';

interface SidebarProps {
  projects: ProjectCardData[];
  globalNoteCount: number;
  roots: string[];
  selectedProjectId: string | null;
  quickFilter: QuickFilterId;
  stageFilter: LifecycleStageId | null;
  onSelectHomeFilter: (f: QuickFilterId) => void;
  onSelectStage: (s: LifecycleStageId | null) => void;
  onSelectProject: (id: string) => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  globalNoteCount,
  roots,
  selectedProjectId,
  quickFilter,
  stageFilter,
  onSelectHomeFilter,
  onSelectStage,
  onSelectProject,
  onOpenSettings,
}) => {
  const active = projects.filter((p) => !p.archived);
  const archivedCount = projects.length - active.length;
  const dirtyCount = active.filter((p) => p.git.dirtyCount > 0).length;
  const mismatchCount = active.filter((p) => p.versionMismatch).length;
  const pendingBuildCount = active.filter(
    (p) => p.buildStatus === 'pending_build' || p.buildStatus === 'pending_upload'
  ).length;
  const recentFive = active.slice(0, 5);

  const totalBoardCount =
    globalNoteCount +
    active.reduce((sum, p) => sum + p.todos.filter((t) => !t.done).length, 0);

  const navItems: {
    id: QuickFilterId;
    label: string;
    count: number;
    icon: React.ReactNode;
    accent?: 'warn' | 'err';
  }[] = [
    {
      id: 'all',
      label: '全部项目',
      count: active.length,
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      id: 'pulse',
      label: '工作室脉搏',
      count: active.reduce((s, p) => s + (p.git.isGit ? 1 : 0), 0),
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: 'sop',
      label: 'SOP 中心',
      count: active.filter((p) => p.sop.hasSop).length,
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'board',
      label: '灵感与待办',
      count: totalBoardCount,
      icon: <Lightbulb className="w-4 h-4" />,
    },
    {
      id: 'dirty',
      label: '未提交改动',
      count: dirtyCount,
      icon: <GitCommitVertical className="w-4 h-4" />,
      accent: dirtyCount > 0 ? 'err' : undefined,
    },
    {
      id: 'mismatch',
      label: '版本不一致',
      count: mismatchCount,
      icon: <AlertTriangle className="w-4 h-4" />,
      accent: mismatchCount > 0 ? 'warn' : undefined,
    },
    {
      id: 'pending_build',
      label: '待构建 / 上传',
      count: pendingBuildCount,
      icon: <Package className="w-4 h-4" />,
      accent: pendingBuildCount > 0 ? 'warn' : undefined,
    },
    {
      id: 'archived',
      label: '已归档',
      count: archivedCount,
      icon: <Archive className="w-4 h-4" />,
    },
  ];

  const primaryRootLabel = roots[0] || '点击设置选择游戏目录';

  return (
    <aside
      className="glass-sidebar w-[238px] shrink-0 h-full flex flex-col border-r select-none"
      style={{
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Top Workspace Brand Header (Draggable) */}
      <div className="titlebar-drag h-13 px-4 flex items-center justify-between shrink-0">
        <button
          onClick={() => onSelectHomeFilter('all')}
          className="titlebar-nodrag flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/25">
            <Gamepad2 className="w-4 h-4" />
          </div>
          <div className="text-left leading-tight">
            <div className="text-[13.5px] font-bold tracking-tight">GameHub</div>
            <div
              className="text-[10.5px] font-mono truncate max-w-[138px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {primaryRootLabel}
            </div>
          </div>
        </button>
      </div>

      {/* Scrollable Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {/* Group 1: Console Views */}
        <div>
          <div
            className="px-2.5 mb-1.5 text-[11px] font-medium tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            控制台视图
          </div>
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const isSelected = !selectedProjectId && !stageFilter && quickFilter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectHomeFilter(item.id)}
                  className="w-full h-9 px-2.5 rounded-xl flex items-center justify-between text-[13px] transition-all cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-active-nav)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: isSelected ? 600 : 500,
                    boxShadow: isSelected ? 'var(--card-shadow)' : 'none',
                    border: isSelected
                      ? '1px solid var(--border-subtle)'
                      : '1px solid transparent',
                  }}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <span
                      style={{
                        color: isSelected
                          ? 'var(--accent-primary)'
                          : 'var(--text-muted)',
                      }}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>

                  <span
                    className="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md font-semibold"
                    style={{
                      backgroundColor:
                        item.accent === 'err'
                          ? 'var(--pill-err-bg)'
                          : item.accent === 'warn'
                            ? 'var(--pill-warn-bg)'
                            : isSelected
                              ? 'var(--accent-soft)'
                              : 'transparent',
                      color:
                        item.accent === 'err'
                          ? 'var(--pill-err-text)'
                          : item.accent === 'warn'
                            ? 'var(--pill-warn-text)'
                            : isSelected
                              ? 'var(--accent-primary)'
                              : 'var(--text-muted)',
                    }}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Group 2: Lifecycle Stages */}
        <div>
          <div
            className="px-2.5 mb-1.5 text-[11px] font-medium tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            按开发阶段
          </div>
          <div className="space-y-0.5">
            {LIFECYCLE_STAGES.map((st) => {
              const cnt = active.filter((p) => p.stage === st.id).length;
              const isSelected = !selectedProjectId && stageFilter === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => onSelectStage(isSelected ? null : st.id)}
                  className="w-full h-8 px-2.5 rounded-lg flex items-center justify-between text-[12.5px] transition-all cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-active-nav)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: isSelected ? 600 : 400,
                    opacity: cnt === 0 && !isSelected ? 0.5 : 1,
                    boxShadow: isSelected ? 'var(--card-shadow)' : 'none',
                    border: isSelected
                      ? '1px solid var(--border-subtle)'
                      : '1px solid transparent',
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: st.color }}
                    />
                    <span>{st.label}</span>
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 3: Quick Jump to Recent Games */}
        {recentFive.length > 0 && (
          <div>
            <div
              className="px-2.5 mb-1.5 text-[11px] font-medium tracking-wide flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <Sparkles className="w-3 h-3" />
              <span>最近活跃直达</span>
            </div>
            <div className="space-y-0.5">
              {recentFive.map((p) => {
                const isCurrent = selectedProjectId === p.id;
                const thumb = mediaUrl(p.coverPath);
                const dotColor = p.versionMismatch
                  ? '#D97706'
                  : p.git.dirtyCount > 0
                    ? '#E11D48'
                    : '#059669';
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className="w-full h-8 px-2 rounded-lg flex items-center gap-2 text-[12px] transition-all cursor-pointer"
                    style={{
                      backgroundColor: isCurrent ? 'var(--bg-active-nav)' : 'transparent',
                      color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isCurrent ? 600 : 400,
                      boxShadow: isCurrent ? 'var(--card-shadow)' : 'none',
                      border: isCurrent
                        ? '1px solid var(--border-subtle)'
                        : '1px solid transparent',
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-md overflow-hidden shrink-0 flex items-center justify-center border"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Gamepad2 className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                    <span className="truncate flex-1 text-left">{p.name}</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Quick SOP Portal + Settings */}
      <div
        className="p-3 border-t space-y-2 shrink-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="grid grid-cols-5 gap-1.5">
          <button
            onClick={onOpenSettings}
            className="col-span-3 h-9 px-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-all cursor-pointer"
            style={{
              backgroundColor:
                !selectedProjectId && quickFilter === 'settings'
                  ? 'var(--bg-active-nav)'
                  : 'var(--bg-surface)',
              color:
                !selectedProjectId && quickFilter === 'settings'
                  ? 'var(--accent-primary)'
                  : 'var(--text-secondary)',
              border:
                !selectedProjectId && quickFilter === 'settings'
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border-subtle)',
              boxShadow:
                !selectedProjectId && quickFilter === 'settings' ? 'var(--card-shadow)' : 'none',
            }}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>设置</span>
          </button>

          <button
            onClick={() => onSelectHomeFilter('sop')}
            title="打开内置小游戏开发 SOP 中心"
            className="col-span-2 h-9 px-2 rounded-xl flex items-center justify-center gap-1 text-xs font-medium transition-all cursor-pointer hover:border-blue-400 hover:text-blue-600"
            style={{
              backgroundColor:
                !selectedProjectId && quickFilter === 'sop'
                  ? 'var(--bg-active-nav)'
                  : 'var(--bg-surface)',
              color:
                !selectedProjectId && quickFilter === 'sop'
                  ? 'var(--accent-primary)'
                  : 'var(--text-secondary)',
              border:
                !selectedProjectId && quickFilter === 'sop'
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border-subtle)',
            }}
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            <span>SOP</span>
          </button>
        </div>

        <div
          className="px-2 flex items-center gap-1.5 text-[10.5px]"
          style={{ color: 'var(--text-muted)' }}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>纯本地只读 · Ctrl+K 速搜</span>
        </div>
      </div>
    </aside>
  );
};
