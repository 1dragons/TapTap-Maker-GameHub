import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  FolderPlus,
  Gamepad2,
  Heart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
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
import { UpdateModal } from './components/UpdateModal';
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
  TapTapStatsBatchProgress,
  UpdateCheckResult,
} from './types';
import { formatCompactCount, getLocalDateKey, mediaUrl } from './utils';

const DEFAULT_SETTINGS: AppSettings = {
  backdrop: 'aurora',
  glassIntensity: 'balanced',
  defaultViewMode: 'grid',
  preferredEditor: 'auto',
  gitCommitLimit: 100,
  gitHideSyncByDefault: false,
  autoArchiveCopies: true,
  autoCheckUpdate: true,
  autoFetchTapTapStatsDaily: true,
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
  const [appVersion, setAppVersion] = useState('1.3.0');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'heat' | 'fans'>('recent');
  const [syncingAllStats, setSyncingAllStats] = useState(false);
  const [statsBatchProgress, setStatsBatchProgress] = useState<TapTapStatsBatchProgress | null>(null);
  const [statsNotice, setStatsNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [refreshingStatsId, setRefreshingStatsId] = useState<string | null>(null);
  const [statsErrorById, setStatsErrorById] = useState<Record<string, string>>({});

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

  const handleCheckUpdate = async (openModal = true) => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const res = await window.gameHub.checkForUpdates();
      setUpdateInfo(res);
      if (openModal) {
        setShowUpdateModal(true);
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSyncAllTapTapStats = async (force = true) => {
    if (syncingAllStats) return;
    setSyncingAllStats(true);
    setStatsNotice(null);
    setStatsBatchProgress(null);
    try {
      const res = await window.gameHub.syncAllTapTapStats({ force });
      if (res.rateLimited) {
        setStatsNotice({
          tone: 'warn',
          text: res.error || 'TapTap 触发临时频率保护，已自动暂停剩余抓取以保护 IP',
        });
      } else if (force) {
        if (res.totalTargets === 0) {
          setStatsNotice({ tone: 'warn', text: '当前没有配置有效 TapTap AppID 的活跃项目' });
        } else {
          setStatsNotice({
            tone: res.failed > 0 && res.updated === 0 ? 'warn' : 'ok',
            text:
              res.failed > 0
                ? `已刷新 ${res.updated} 款游戏热度与关注（${res.failed} 款暂无公开数据或跳过）`
                : `已实时刷新全部 ${res.updated} 款游戏的 TapTap 热度与关注`,
          });
        }
      }
    } finally {
      setSyncingAllStats(false);
      setStatsBatchProgress(null);
    }
  };

  const handleRefreshSingleStats = async (project: ProjectCardData) => {
    const appId = project.taptap.appId ? String(project.taptap.appId).trim() : '';
    if (!appId || !/^\d+$/.test(appId)) return;
    if (refreshingStatsId === project.id) return;
    setRefreshingStatsId(project.id);
    setStatsErrorById((prev) => {
      if (!prev[project.id]) return prev;
      const next = { ...prev };
      delete next[project.id];
      return next;
    });
    try {
      const res = await window.gameHub.fetchTapTapStats(project.path, appId, { force: true });
      if (res.ok && res.data) {
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? { ...p, taptapStats: res.data } : p))
        );
      } else if (res.error) {
        setStatsErrorById((prev) => ({ ...prev, [project.id]: res.error! }));
      }
    } finally {
      setRefreshingStatsId((cur) => (cur === project.id ? null : cur));
    }
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cleanupStats: (() => void) | undefined;
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    let dailyStatsTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const [st, isMax, ver] = await Promise.all([
        window.gameHub.getState(),
        window.gameHub.winIsMaximized(),
        window.gameHub.getAppVersion(),
      ]);
      const normalizedSettings = { ...DEFAULT_SETTINGS, ...(st.settings || {}) };
      const fullState: HubPersistedState = { ...st, settings: normalizedSettings };
      setHubState(fullState);
      setViewMode(normalizedSettings.defaultViewMode || 'grid');
      setMaximized(isMax);
      if (ver) setAppVersion(ver);
      applyVisualAttributes(fullState.theme, normalizedSettings);
      await scanAll();

      if (normalizedSettings.autoCheckUpdate !== false) {
        updateTimer = setTimeout(() => {
          window.gameHub
            .checkForUpdates()
            .then((res) => {
              if (res.ok) setUpdateInfo(res);
            })
            .catch(() => {});
        }, 2500);
      }

      if (normalizedSettings.autoFetchTapTapStatsDaily !== false) {
        dailyStatsTimer = setTimeout(() => {
          setSyncingAllStats(true);
          window.gameHub
            .syncAllTapTapStats({ force: false })
            .then((res) => {
              if (res.rateLimited) {
                setStatsNotice({
                  tone: 'warn',
                  text: res.error || 'TapTap 触发临时频率保护，已自动暂停今日剩余抓取',
                });
              }
            })
            .catch(() => {})
            .finally(() => {
              setSyncingAllStats(false);
              setStatsBatchProgress(null);
            });
        }, 3200);
      }
    })();
    cleanup = window.gameHub.onWindowState((isMax) => setMaximized(isMax));
    cleanupStats = window.gameHub.onTapTapStatsProgress((p) => {
      if (p.done) {
        setStatsBatchProgress(null);
        return;
      }
      setStatsBatchProgress(p);
      if (p.stats && p.projectPath) {
        const normPath = p.projectPath.toLowerCase();
        setProjects((prev) =>
          prev.map((item) =>
            item.path.toLowerCase() === normPath ? { ...item, taptapStats: p.stats } : item
          )
        );
      }
    });
    return () => {
      cleanup?.();
      cleanupStats?.();
      if (updateTimer) clearTimeout(updateTimer);
      if (dailyStatsTimer) clearTimeout(dailyStatsTimer);
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
    const list = projects.filter((p) => {
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

    if (sortBy === 'heat' || sortBy === 'fans') {
      return [...list].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const aVal = sortBy === 'heat' ? a.taptapStats?.heat ?? -1 : a.taptapStats?.fans ?? -1;
        const bVal = sortBy === 'heat' ? b.taptapStats?.heat ?? -1 : b.taptapStats?.fans ?? -1;
        if (bVal !== aVal) return bVal - aVal;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      });
    }
    return list;
  }, [projects, quickFilter, stageFilter, searchQuery, sortBy]);

  const taptapStatsSummary = useMemo(() => {
    const todayKey = getLocalDateKey();
    const tracked = projects.filter(
      (p) => !p.archived && p.taptap.appId && /^\d+$/.test(String(p.taptap.appId).trim())
    );
    let totalHeat = 0;
    let totalFans = 0;
    let todayCount = 0;
    for (const p of tracked) {
      if (p.taptapStats) {
        totalHeat += p.taptapStats.heat || 0;
        totalFans += p.taptapStats.fans || 0;
        if (p.taptapStats.lastDateKey === todayKey) todayCount += 1;
      }
    }
    return {
      trackedCount: tracked.length,
      todayCount,
      totalHeat,
      totalFans,
    };
  }, [projects]);

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
        appVersion={appVersion}
        updateInfo={updateInfo}
        checkingUpdate={checkingUpdate}
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
        onCheckUpdate={() => handleCheckUpdate(true)}
        onOpenUpdateModal={() => {
          if (updateInfo) setShowUpdateModal(true);
          else handleCheckUpdate(true);
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
              refreshingStats={refreshingStatsId === selectedProject.id}
              statsError={statsErrorById[selectedProject.id] || null}
              onRefreshStats={() => handleRefreshSingleStats(selectedProject)}
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
              appVersion={appVersion}
              updateInfo={updateInfo}
              checkingUpdate={checkingUpdate}
              onSetTheme={handleSetTheme}
              onUpdateSettings={handleUpdateSettings}
              onAddRoot={handleAddRoot}
              onRemoveRoot={handleRemoveRoot}
              onRescanAll={scanAll}
              onRestoreRemoved={handleRestoreRemoved}
              onStateReplaced={handleStateReplaced}
              onCheckUpdate={() => handleCheckUpdate(true)}
              onOpenUpdateModal={() => {
                if (updateInfo) setShowUpdateModal(true);
                else handleCheckUpdate(true);
              }}
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

              {/* TapTap Heat & Followers Daily Sync Strip (only when active projects have TapTap AppIDs) */}
              {quickFilter !== 'archived' && taptapStatsSummary.trackedCount > 0 && (
                <div className="glass-card rounded-2xl px-4 py-2.5 mb-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap text-xs">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-500" />
                      <span>TapTap 热度与关注</span>
                    </span>

                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border tabular-nums text-[11.5px]"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                      title={`全部 ${taptapStatsSummary.trackedCount} 款带 AppID 活跃游戏累计热度：${taptapStatsSummary.totalHeat.toLocaleString('zh-CN')}`}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>总热度</span>
                      <strong className="text-orange-600 dark:text-orange-400">
                        {formatCompactCount(taptapStatsSummary.totalHeat)}
                      </strong>
                    </span>

                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border tabular-nums text-[11.5px]"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                      title={`全部 ${taptapStatsSummary.trackedCount} 款带 AppID 活跃游戏累计关注：${taptapStatsSummary.totalFans.toLocaleString('zh-CN')}`}
                    >
                      <Heart className="w-3 h-3 text-rose-500" />
                      <span style={{ color: 'var(--text-muted)' }}>总关注</span>
                      <strong className="text-rose-600 dark:text-rose-400">
                        {formatCompactCount(taptapStatsSummary.totalFans)}
                      </strong>
                    </span>

                    {syncingAllStats && statsBatchProgress ? (
                      <span className="text-[11px] text-blue-600 font-medium">
                        正在温和同步 ({statsBatchProgress.current}/{statsBatchProgress.total})：
                        {statsBatchProgress.projectName}…
                      </span>
                    ) : statsNotice ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium"
                        style={{
                          color:
                            statsNotice.tone === 'warn'
                              ? 'var(--pill-warn-text)'
                              : 'var(--pill-ok-text)',
                        }}
                      >
                        {statsNotice.tone === 'warn' && <AlertTriangle className="w-3 h-3" />}
                        <span>{statsNotice.text}</span>
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        今日已同步 {taptapStatsSummary.todayCount}/{taptapStatsSummary.trackedCount} 款
                        · 每日首次打开自动抓取 1 次（防 IP 风控）
                      </span>
                    )}
                  </div>

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
                          { id: 'recent', label: '最近活跃' },
                          { id: 'heat', label: '按热度' },
                          { id: 'fans', label: '按关注' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSortBy(opt.id)}
                          className="h-6 px-2 rounded-lg font-medium cursor-pointer transition-all"
                          style={{
                            backgroundColor:
                              sortBy === opt.id ? 'var(--bg-surface-strong)' : 'transparent',
                            color:
                              sortBy === opt.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <button
                      disabled={syncingAllStats}
                      onClick={() => handleSyncAllTapTapStats(true)}
                      title="立即逐款温和抓取全部带 AppID 游戏的最新实时热度与关注"
                      className="h-7 px-3 rounded-xl border text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-orange-400 hover:text-orange-600 transition-colors disabled:opacity-60"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${syncingAllStats ? 'animate-spin text-orange-500' : ''}`}
                      />
                      <span>{syncingAllStats ? '同步中…' : '刷新热度/关注'}</span>
                    </button>
                  </div>
                </div>
              )}

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
                  refreshingStatsId={refreshingStatsId}
                  onSelect={(id) => setSelectedId(id)}
                  onEdit={(p) => setEditingProject(p)}
                  onToggleArchive={(p) => handleUpdateProjectMeta(p, { archived: !p.archived })}
                  onRemoveFromHub={(p) => handleRemoveProjectsFromHub([p.path])}
                  onRefresh={(p) => refreshSingle(p)}
                  onRefreshStats={(p) => handleRefreshSingleStats(p)}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProjects.map((project) => (
                    <GameCard
                      key={project.id}
                      project={project}
                      refreshing={refreshingId === project.id}
                      refreshingStats={refreshingStatsId === project.id}
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
                      onRefreshStats={(e) => {
                        e.stopPropagation();
                        handleRefreshSingleStats(project);
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

      {showUpdateModal && updateInfo && (
        <UpdateModal
          info={updateInfo}
          checking={checkingUpdate}
          onRecheck={() => handleCheckUpdate(true)}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  );
}
