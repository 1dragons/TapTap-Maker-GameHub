import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Flame, FolderPlus, Gamepad2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { getCountdownInfo } from './aiHelpers';
import { CommandPalette } from './components/CommandPalette';
import { EditProjectModal } from './components/EditProjectModal';
import { GameCard } from './components/GameCard';
import { GameTable } from './components/GameTable';
import { GlobalBoardView } from './components/GlobalBoardView';
import { OverviewCharts } from './components/OverviewCharts';
import { ProjectDetail } from './components/ProjectDetail';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { SopCenterView } from './components/SopCenterView';
import { StudioPulseView } from './components/StudioPulseView';
import { TitleBar } from './components/TitleBar';
import { LIFECYCLE_STAGES, STAGE_INDEX_MAP } from './constants';
import {
  AppSettings,
  HubPersistedState,
  LifecycleStageId,
  ProjectCardData,
  ProjectExternalLink,
  QuickFilterId,
  QuickNoteItem,
  StageTodoItem,
} from './types';
import { mediaUrl } from './utils';

const DEFAULT_SETTINGS: AppSettings = {
  backdrop: 'aurora',
  glassIntensity: 'balanced',
  defaultViewMode: 'grid',
  preferredEditor: 'auto',
  gitCommitLimit: 100,
  gitHideSyncByDefault: false,
  autoArchiveCopies: true,
  sopPath: '',
  ai: { baseUrl: '', apiKey: '', model: '', reasoningEffort: 'low' },
};

export default function App() {
  const [hubState, setHubState] = useState<HubPersistedState>({
    roots: [],
    theme: 'light',
    settings: { ...DEFAULT_SETTINGS },
    globalNotes: [],
    projects: {},
  });
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [scanning, setScanning] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterId>('all');
  const [stageFilter, setStageFilter] = useState<LifecycleStageId | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [editingProject, setEditingProject] = useState<ProjectCardData | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [confirmClearArchived, setConfirmClearArchived] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const applyVisualAttributes = (theme: 'dark' | 'light', settings: AppSettings) => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
    }
    html.dataset.backdrop = settings.backdrop || 'aurora';
    html.dataset.glass = settings.glassIntensity || 'balanced';
  };

  const scanAll = async () => {
    setScanning(true);
    try {
      const list = await window.gameHub.scanAll();
      setProjects(list);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const [st, isMax] = await Promise.all([
        window.gameHub.getState(),
        window.gameHub.winIsMaximized(),
      ]);
      const normalizedSettings = { ...DEFAULT_SETTINGS, ...(st.settings || {}) };
      const fullState: HubPersistedState = { ...st, settings: normalizedSettings };
      setHubState(fullState);
      setViewMode(normalizedSettings.defaultViewMode || 'grid');
      setMaximized(isMax);
      applyVisualAttributes(fullState.theme, normalizedSettings);
      await scanAll();
    })();
    cleanup = window.gameHub.onWindowState((isMax) => setMaximized(isMax));
    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (showPalette) setShowPalette(false);
        else if (editingProject) setEditingProject(null);
        else if (selectedId) setSelectedId(null);
        else if (quickFilter === 'settings' || quickFilter === 'pulse' || quickFilter === 'sop') setQuickFilter('all');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPalette, editingProject, selectedId, quickFilter]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId]
  );

  const refreshSingle = async (project: ProjectCardData) => {
    setRefreshingId(project.id);
    try {
      const updated = await window.gameHub.refreshProject(project.path, project.groupName);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } finally {
      setRefreshingId(null);
    }
  };

  const handleSetTheme = async (next: 'dark' | 'light') => {
    applyVisualAttributes(next, hubState.settings);
    const updated = await window.gameHub.setTheme(next);
    setHubState({ ...updated, settings: { ...DEFAULT_SETTINGS, ...(updated.settings || {}) } });
  };

  const handleToggleTheme = async () => {
    await handleSetTheme(hubState.theme === 'light' ? 'dark' : 'light');
  };

  const handleUpdateSettings = async (patch: Partial<AppSettings>) => {
    const merged = { ...hubState.settings, ...patch };
    applyVisualAttributes(hubState.theme, merged);
    if (patch.defaultViewMode) setViewMode(patch.defaultViewMode);
    const updated = await window.gameHub.updateSettings(patch);
    setHubState({ ...updated, settings: { ...DEFAULT_SETTINGS, ...(updated.settings || {}) } });
  };

  const handleStateReplaced = async (restored: HubPersistedState) => {
    const normalizedSettings = { ...DEFAULT_SETTINGS, ...(restored.settings || {}) };
    setHubState({ ...restored, settings: normalizedSettings });
    setViewMode(normalizedSettings.defaultViewMode || 'grid');
    applyVisualAttributes(restored.theme, normalizedSettings);
    await scanAll();
  };

  const handleAddRoot = async () => {
    const folder = await window.gameHub.pickFolder();
    if (!folder) return;
    const updated = await window.gameHub.addRoot(folder);
    setHubState({ ...updated, settings: { ...DEFAULT_SETTINGS, ...(updated.settings || {}) } });
    await scanAll();
  };

  const handleRemoveRoot = async (rootPath: string) => {
    const updated = await window.gameHub.removeRoot(rootPath);
    setHubState({ ...updated, settings: { ...DEFAULT_SETTINGS, ...(updated.settings || {}) } });
    await scanAll();
  };

  const handleUpdateProjectMeta = async (
    project: ProjectCardData,
    patch: {
      stage?: LifecycleStageId;
      pinned?: boolean;
      archived?: boolean;
      sprintFocus?: boolean;
      targetDate?: string;
      targetGoal?: string;
      displayName?: string;
      customCover?: string;
      customLinks?: ProjectExternalLink[];
    }
  ) => {
    await window.gameHub.updateProjectMeta(project.path, patch);
    await refreshSingle(project);
  };

  const handleUpdateTodos = async (project: ProjectCardData, todos: StageTodoItem[]) => {
    await window.gameHub.setProjectTodos(project.path, todos);
    await refreshSingle(project);
  };

  const handleUpdateNotes = async (project: ProjectCardData, notes: QuickNoteItem[]) => {
    await window.gameHub.setProjectNotes(project.path, notes);
    await refreshSingle(project);
  };

  const handleUpdateGlobalNotes = async (notes: QuickNoteItem[]) => {
    const updated = await window.gameHub.setGlobalNotes(notes);
    setHubState({ ...updated, settings: { ...DEFAULT_SETTINGS, ...(updated.settings || {}) } });
  };

  const handleAddBuildLog = async (
    project: ProjectCardData,
    entry: {
      type: 'build' | 'upload';
      version: string;
      commitHash?: string;
      commitShort?: string;
      platform?: string;
      note?: string;
    }
  ) => {
    await window.gameHub.addBuildLog(project.path, entry);
    await refreshSingle(project);
  };

  const handleDeleteBuildLog = async (project: ProjectCardData, logId: string) => {
    await window.gameHub.deleteBuildLog(project.path, logId);
    await refreshSingle(project);
  };

  const handleRemoveProjectsFromHub = async (projectPaths: string[]) => {
    if (projectPaths.length === 0) return;
    const updated = await window.gameHub.removeProjectsFromHub(projectPaths);
    setHubState({ ...updated, settings: { ...DEFAULT_SETTINGS, ...(updated.settings || {}) } });
    const removedSet = new Set(projectPaths.map((p) => p.toLowerCase()));
    setProjects((prev) => prev.filter((p) => !removedSet.has(p.path.toLowerCase())));
    if (selectedId && removedSet.has(selectedId.toLowerCase())) {
      setSelectedId(null);
    }
    setConfirmClearArchived(false);
  };

  const handleRestoreRemoved = async (projectPaths?: string[]) => {
    const updated = await window.gameHub.restoreRemovedProjects(projectPaths);
    setHubState({ ...updated, settings: { ...DEFAULT_SETTINGS, ...(updated.settings || {}) } });
    await scanAll();
  };

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (quickFilter === 'archived') {
        if (!p.archived) return false;
      } else {
        if (p.archived) return false;
        if (quickFilter === 'dirty' && p.git.dirtyCount === 0) return false;
        if (quickFilter === 'mismatch' && !p.versionMismatch) return false;
        if (
          quickFilter === 'pending_build' &&
          p.buildStatus !== 'pending_build' &&
          p.buildStatus !== 'pending_upload'
        ) {
          return false;
        }
        if (quickFilter === 'sync' && p.git.ahead === 0 && p.git.behind === 0) return false;
      }

      if (stageFilter && p.stage !== stageFilter) return false;

      if (q) {
        const hay = `${p.name} ${p.folderName} ${p.taptap.publishTitle || ''} ${p.displayVersion} ${p.git.detectedGitVersion || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projects, quickFilter, stageFilter, searchQuery]);

  const pageTitle = useMemo(() => {
    if (stageFilter) {
      return `阶段 · ${LIFECYCLE_STAGES[STAGE_INDEX_MAP[stageFilter]].label}`;
    }
    const labels: Record<QuickFilterId, string> = {
      all: '项目总览',
      pulse: '工作室脉搏 · 全景热力图',
      sop: '小游戏开发 SOP 中心',
      board: '灵感随手记 & 待办总览',
      settings: '系统设置',
      dirty: '未提交改动',
      mismatch: '版本号不一致',
      pending_build: '待构建 / 上传',
      sync: '待远程同步',
      archived: '已归档项目',
    };
    return labels[quickFilter];
  }, [quickFilter, stageFilter]);

  const isSpecialTopPage =
    quickFilter === 'settings' ||
    quickFilter === 'board' ||
    quickFilter === 'pulse' ||
    quickFilter === 'sop';

  const sprintFocusProjects = useMemo(
    () =>
      projects
        .filter((p) => !p.archived && (p.sprintFocus || Boolean(p.targetDate)))
        .sort((a, b) => {
          if (a.sprintFocus !== b.sprintFocus) return a.sprintFocus ? -1 : 1;
          return (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
        }),
    [projects]
  );

  return (
    <div className="apple-glass-backdrop h-screen w-screen flex overflow-hidden">
      {/* Left Fixed Frosted Console Sidebar */}
      <Sidebar
        projects={projects}
        globalNoteCount={hubState.globalNotes?.length || 0}
        roots={hubState.roots}
        selectedProjectId={selectedId}
        quickFilter={quickFilter}
        stageFilter={stageFilter}
        onSelectHomeFilter={(f) => {
          setSelectedId(null);
          setStageFilter(null);
          setQuickFilter(f);
        }}
        onSelectStage={(s) => {
          setSelectedId(null);
          setQuickFilter('all');
          setStageFilter(s);
        }}
        onSelectProject={(id) => setSelectedId(id)}
        onOpenSettings={() => {
          setSelectedId(null);
          setStageFilter(null);
          setQuickFilter('settings');
        }}
      />

      {/* Right Main Console Stage */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TitleBar
          theme={hubState.theme}
          maximized={maximized}
          scanning={scanning}
          pageTitle={pageTitle}
          selectedName={selectedProject?.name || (isSpecialTopPage ? pageTitle : undefined)}
          searchQuery={searchQuery}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSearchChange={setSearchQuery}
          onBack={selectedProject ? () => setSelectedId(null) : isSpecialTopPage ? () => setQuickFilter('all') : undefined}
          onOpenPalette={() => setShowPalette(true)}
          onRefreshAll={scanAll}
          onToggleTheme={handleToggleTheme}
        />

        <main className="flex-1 overflow-y-auto">
          {selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              settings={hubState.settings}
              onEdit={() => setEditingProject(selectedProject)}
              onUpdateSettings={handleUpdateSettings}
              onOpenSettings={() => {
                setSelectedId(null);
                setStageFilter(null);
                setQuickFilter('settings');
              }}
              onRemoveFromHub={() => handleRemoveProjectsFromHub([selectedProject.path])}
              onRefreshProject={() => refreshSingle(selectedProject)}
              onUpdateMeta={(patch) => handleUpdateProjectMeta(selectedProject, patch)}
              onUpdateTodos={(todos) => handleUpdateTodos(selectedProject, todos)}
              onUpdateNotes={(notes) => handleUpdateNotes(selectedProject, notes)}
              onAddBuildLog={(entry) => handleAddBuildLog(selectedProject, entry)}
              onDeleteBuildLog={(id) => handleDeleteBuildLog(selectedProject, id)}
            />
          ) : quickFilter === 'settings' ? (
            <SettingsView
              hubState={hubState}
              scanning={scanning}
              onSetTheme={handleSetTheme}
              onUpdateSettings={handleUpdateSettings}
              onAddRoot={handleAddRoot}
              onRemoveRoot={handleRemoveRoot}
              onRescanAll={scanAll}
              onRestoreRemoved={handleRestoreRemoved}
              onStateReplaced={handleStateReplaced}
            />
          ) : quickFilter === 'pulse' ? (
            <StudioPulseView
              projects={projects}
              onSelectProject={(id) => setSelectedId(id)}
            />
          ) : quickFilter === 'sop' ? (
            <SopCenterView
              projects={projects}
              theme={hubState.theme}
              onSelectProject={(id) => setSelectedId(id)}
              onRefreshProjects={scanAll}
            />
          ) : quickFilter === 'board' ? (
            <GlobalBoardView
              globalNotes={hubState.globalNotes || []}
              projects={projects}
              onUpdateGlobalNotes={handleUpdateGlobalNotes}
              onUpdateProjectTodos={handleUpdateTodos}
              onSelectProject={(id) => setSelectedId(id)}
            />
          ) : (
            <div className="max-w-[1320px] mx-auto px-7 py-6">
              {/* Slim Sprint Focus & Release Countdown Strip (Only shows when set!) */}
              {quickFilter === 'all' && !stageFilter && sprintFocusProjects.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-3">
                  {sprintFocusProjects.slice(0, 2).map((sp) => {
                    const cd = getCountdownInfo(sp.targetDate);
                    const thumb = mediaUrl(sp.coverPath);
                    return (
                      <button
                        key={sp.id}
                        onClick={() => setSelectedId(sp.id)}
                        className="flex-1 min-w-[300px] glass-card-interactive rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-8 rounded-xl overflow-hidden shrink-0 border border-white/80 shadow-xs flex items-center justify-center bg-blue-50">
                            {thumb ? (
                              <img src={thumb} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Gamepad2 className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-orange-500/15 text-orange-700">
                                <Flame className="w-3 h-3" />
                                冲刺焦点
                              </span>
                              <span className="text-xs font-bold truncate">{sp.name}</span>
                            </div>
                            <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              {sp.targetGoal || '当前主力推进中'}
                              {sp.targetDate ? ` · 目标 ${sp.targetDate}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {cd && (
                            <span
                              className="px-2.5 py-1 rounded-full text-xs font-bold border"
                              style={{
                                backgroundColor:
                                  cd.tone === 'err' ? 'var(--pill-err-bg)' : 'var(--pill-warn-bg)',
                                color:
                                  cd.tone === 'err' ? 'var(--pill-err-text)' : 'var(--pill-warn-text)',
                                borderColor:
                                  cd.tone === 'err'
                                    ? 'var(--pill-err-border)'
                                    : 'var(--pill-warn-border)',
                              }}
                            >
                              {cd.label}
                            </span>
                          )}
                          <ArrowRight className="w-4 h-4 text-blue-600" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Calm Bento Overview Strip */}
              <OverviewCharts
                projects={projects}
                quickFilter={quickFilter}
                stageFilter={stageFilter}
                onQuickFilter={setQuickFilter}
                onStageFilter={setStageFilter}
              />

              {/* Archived View Safe Clear Banner */}
              {quickFilter === 'archived' && filteredProjects.length > 0 && (
                <div className="glass-card rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      点击卡片右上角垃圾桶可从软件中移除（<strong>不会删除硬盘里的任何文件</strong>，以后可在系统设置里恢复）
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmClearArchived ? (
                      <>
                        <button
                          onClick={() => setConfirmClearArchived(false)}
                          className="h-7 px-2.5 rounded-lg text-xs border cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface-strong)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          取消
                        </button>
                        <button
                          onClick={() =>
                            handleRemoveProjectsFromHub(filteredProjects.map((p) => p.path))
                          }
                          className="h-7 px-3 rounded-lg text-xs font-semibold bg-rose-600 text-white flex items-center gap-1 cursor-pointer hover:opacity-90"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>确认清空全部 ({filteredProjects.length})</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmClearArchived(true)}
                        className="h-7 px-3 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer hover:bg-rose-600 hover:text-white transition-colors"
                        style={{
                          backgroundColor: 'var(--pill-err-bg)',
                          borderColor: 'var(--pill-err-border)',
                          color: 'var(--pill-err-text)',
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>一键清空已归档 ({filteredProjects.length})</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Projects Grid or Stripe-Style Table */}
              {scanning && projects.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="glass-card h-64 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : hubState.roots.length === 0 ? (
                <div className="glass-card rounded-[24px] py-16 px-6 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
                    <Gamepad2 className="w-7 h-7" />
                  </div>
                  <div className="text-base font-bold">欢迎使用 GameHub 游戏总控台</div>
                  <div className="text-xs max-w-md leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    请选择你电脑上存放游戏项目的根目录，软件会自动扫描全部 Git 仓库、版本进度与封面图（全程只读，绝不改动源码）。
                  </div>
                  <button
                    onClick={handleAddRoot}
                    className="mt-2 h-10 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer hover:opacity-92 shadow-sm shadow-blue-600/25"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>选择我的游戏项目根目录</span>
                  </button>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="glass-card rounded-2xl py-16 flex flex-col items-center justify-center text-center">
                  <Sparkles className="w-8 h-8 text-blue-500 mb-2.5 opacity-80" />
                  <div className="text-sm font-semibold mb-1">当前筛选下没有匹配的游戏</div>
                  <button
                    onClick={() => {
                      setQuickFilter('all');
                      setStageFilter(null);
                      setSearchQuery('');
                    }}
                    className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white cursor-pointer hover:opacity-90"
                  >
                    查看全部活跃项目
                  </button>
                </div>
              ) : viewMode === 'table' ? (
                <GameTable
                  projects={filteredProjects}
                  refreshingId={refreshingId}
                  onSelect={(id) => setSelectedId(id)}
                  onEdit={(p) => setEditingProject(p)}
                  onToggleArchive={(p) => handleUpdateProjectMeta(p, { archived: !p.archived })}
                  onRemoveFromHub={(p) => handleRemoveProjectsFromHub([p.path])}
                  onRefresh={(p) => refreshSingle(p)}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProjects.map((project) => (
                    <GameCard
                      key={project.id}
                      project={project}
                      refreshing={refreshingId === project.id}
                      onSelect={() => setSelectedId(project.id)}
                      onEdit={(e) => {
                        e.stopPropagation();
                        setEditingProject(project);
                      }}
                      onTogglePin={(e) => {
                        e.stopPropagation();
                        handleUpdateProjectMeta(project, { pinned: !project.pinned });
                      }}
                      onToggleArchive={(e) => {
                        e.stopPropagation();
                        handleUpdateProjectMeta(project, { archived: !project.archived });
                      }}
                      onRemoveFromHub={(e) => {
                        e.stopPropagation();
                        handleRemoveProjectsFromHub([project.path]);
                      }}
                      onRefresh={(e) => {
                        e.stopPropagation();
                        refreshSingle(project);
                      }}
                      onOpenFolder={(e) => {
                        e.stopPropagation();
                        window.gameHub.openFolder(project.path);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onSave={(patch) => handleUpdateProjectMeta(editingProject, patch)}
          onClose={() => setEditingProject(null)}
        />
      )}

      {showPalette && (
        <CommandPalette
          projects={projects}
          theme={hubState.theme}
          onClose={() => setShowPalette(false)}
          onSelectProject={(id) => setSelectedId(id)}
          onNavigateView={(v) => {
            setSelectedId(null);
            setStageFilter(null);
            setQuickFilter(v);
          }}
          onQuickAddGlobalNote={async (text) => {
            const next: QuickNoteItem[] = [
              {
                id: `gn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                text,
                tag: 'idea',
                createdAt: new Date().toISOString(),
              },
              ...(hubState.globalNotes || []),
            ];
            await handleUpdateGlobalNotes(next);
          }}
          onToggleTheme={handleToggleTheme}
          onRefreshAll={scanAll}
        />
      )}
    </div>
  );
}
