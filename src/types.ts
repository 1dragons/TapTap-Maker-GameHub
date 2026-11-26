export type LifecycleStageId =
  | 'concept'
  | 'prototype'
  | 'dev'
  | 'qa'
  | 'build'
  | 'public_test'
  | 'official';

export type BuildUploadStatus =
  | 'synced'
  | 'pending_upload'
  | 'pending_build'
  | 'none';

export type EngineType = 'taptap-maker' | 'web-h5' | 'other';

export type NoteTagId = 'idea' | 'art' | 'bug' | 'biz';

export interface QuickNoteItem {
  id: string;
  text: string;
  tag: NoteTagId;
  pinned?: boolean;
  createdAt: string;
}

export interface StageTodoItem {
  id: string;
  stage: LifecycleStageId;
  text: string;
  done: boolean;
  priority?: 'high' | 'normal';
  createdAt: string;
}

export interface BuildLogEntry {
  id: string;
  type: 'build' | 'upload';
  version: string;
  commitHash?: string;
  commitShort?: string;
  platform?: string;
  note?: string;
  timestamp: string;
  source: 'manual' | 'sop';
}

export interface ProjectExternalLink {
  id: string;
  label: string;
  url: string;
}

export interface ProjectUserMeta {
  pinned?: boolean;
  archived?: boolean;
  removed?: boolean;
  sprintFocus?: boolean;
  targetDate?: string;
  targetGoal?: string;
  stage?: LifecycleStageId;
  displayName?: string;
  customCover?: string;
  todos: StageTodoItem[];
  notes: QuickNoteItem[];
  buildLogs: BuildLogEntry[];
  customLinks?: ProjectExternalLink[];
}

export type GlassBackdropId =
  | 'aurora'
  | 'sakura'
  | 'mint'
  | 'sunset'
  | 'violet'
  | 'snow';

export type GlassIntensityId = 'clear' | 'balanced' | 'frosted';
export type PreferredEditorId = 'auto' | 'cursor' | 'code' | 'trae';

export interface AppSettings {
  backdrop: GlassBackdropId;
  glassIntensity: GlassIntensityId;
  defaultViewMode: 'grid' | 'table';
  preferredEditor: PreferredEditorId;
  gitCommitLimit: number;
  gitHideSyncByDefault: boolean;
  autoArchiveCopies: boolean;
  sopPath?: string;
}

export interface HubPersistedState {
  roots: string[];
  theme: 'dark' | 'light';
  settings: AppSettings;
  globalNotes: QuickNoteItem[];
  projects: Record<string, ProjectUserMeta>;
}

export interface DirtyFileItem {
  status: string;
  path: string;
}

export interface GitSummary {
  isGit: boolean;
  branch: string;
  hasRemote: boolean;
  ahead: number;
  behind: number;
  dirtyCount: number;
  dirtyFiles: DirtyFileItem[];
  totalCommits: number;
  lastCommitHash: string;
  lastCommitShort: string;
  lastCommitDate: string;
  lastCommitSubject: string;
  detectedGitVersion: string | null;
  branches: string[];
}

export interface TapTapMeta {
  isTapTapMaker: boolean;
  publishTitle?: string;
  configVersion?: string;
  luaGameVersion?: string;
  releasePhase?: 'official' | 'public_test' | 'dev' | string;
  appId?: number | string;
  miniappId?: string;
  orientation?: string;
  category?: string;
}

export interface SopClue {
  hasSop: boolean;
  sopBuildLogs: BuildLogEntry[];
  suggestedTodos: string[];
  sopLatestBuildCommit?: string;
  sopHeaderSummary?: string;
}

export interface ProjectCardData {
  id: string;
  path: string;
  folderName: string;
  groupName?: string;
  name: string;
  engine: EngineType;
  coverPath: string | null;
  lastModified: string;
  pinned: boolean;
  archived: boolean;
  autoArchived: boolean;
  archiveReason?: string;
  stage: LifecycleStageId;
  stageIsManual: boolean;
  git: GitSummary;
  taptap: TapTapMeta;
  sop: SopClue;
  versionMismatch: boolean;
  displayVersion: string;
  buildStatus: BuildUploadStatus;
  latestBuildLog: BuildLogEntry | null;
  latestUploadLog: BuildLogEntry | null;
  allBuildLogs: BuildLogEntry[];
  todos: StageTodoItem[];
  notes: QuickNoteItem[];
  sprintFocus: boolean;
  targetDate?: string;
  targetGoal?: string;
  customLinks: ProjectExternalLink[];
}

export interface GitRefBadge {
  name: string;
  kind: 'head' | 'branch' | 'remote' | 'tag';
}

export interface GitGraphEdge {
  fromLane: number;
  toLane: number;
  toIndex: number;
  colorIndex: number;
  isMerge: boolean;
}

export interface GitGraphCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  refs: GitRefBadge[];
  date: string;
  author: string;
  fullSubject: string;
  shortTitle: string;
  detectedVersion: string | null;
  isHead: boolean;
  isMerge: boolean;
  isMilestone: boolean;
  lane: number;
  colorIndex: number;
  edges: GitGraphEdge[];
}

export interface GitGraphData {
  isGit: boolean;
  maxLane: number;
  branches: string[];
  commits: GitGraphCommit[];
}

export interface CommitFileStat {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
}

export interface CommitDetailData {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  files: CommitFileStat[];
  totalAdded: number;
  totalDeleted: number;
}

export interface ProjectDocLink {
  label: string;
  path: string;
  kind: 'sop' | 'report' | 'doc';
}

export interface ProjectTelemetry {
  scriptFiles: number;
  scriptLines: number;
  scriptBytes: number;
  imageFiles: number;
  imageBytes: number;
  modelFiles: number;
  modelBytes: number;
  audioFiles: number;
  audioBytes: number;
  totalAssetBytes: number;
  adEnabled: boolean;
  adSpaceCount: number;
  daily14: { dateLabel: string; count: number; isToday: boolean }[];
  commits14d: number;
  activeDays14d: number;
  quickDocs: ProjectDocLink[];
}

export interface HeatmapCell {
  dateKey: string;
  label: string;
  count: number;
  games: { name: string; count: number }[];
}

export interface StudioActivityItem {
  id: string;
  projectId: string;
  projectName: string;
  coverPath: string | null;
  hash: string;
  shortHash: string;
  date: string;
  title: string;
  version: string | null;
  kind: 'version' | 'feat' | 'fix' | 'opt' | 'normal';
}

export interface StudioPulseData {
  heatmap: HeatmapCell[];
  totalCommits140d: number;
  currentStreak: number;
  longestStreak: number;
  activeDays140d: number;
  bestDayCount: number;
  bestDayLabel: string;
  topGames: { id: string; name: string; commits: number; coverPath: string | null }[];
  recentActivity: StudioActivityItem[];
}

export interface SopDocItem {
  id: string;
  title: string;
  fileName: string;
  relativePath: string;
  absPath: string;
  category: 'overview' | 'flow' | 'spec' | 'template';
  excerpt: string;
  searchText: string;
}

export interface SopStageItem {
  index: number;
  name: string;
  input: string;
  work: string;
  pass: string;
  fail: string;
  requiresConfirm: boolean;
}

export interface SopResourceFile {
  path: string;
  name: string;
  bytes: number;
  exists: boolean;
}

export interface SopLibraryResource {
  id: string;
  kind: 'reference' | 'font' | string;
  title: string;
  source: string;
  version: string;
  downloadUrl?: string;
  fontPath?: string;
  family?: string;
  usage: string;
  license?: string;
  previewPath?: string;
  previewExists?: boolean;
  verification?: string;
  fontCheck?: {
    status: string;
    glyphs?: number;
    scope?: string;
  };
  installed: boolean;
  files: SopResourceFile[];
}

export interface SopGenerationRemainingItem {
  id: string;
  tool: string;
  targetSize?: string;
  transparent?: boolean;
  prompt?: string;
  title?: string;
  style?: string;
  sounds?: { name: string; duration: number; text: string }[];
}

export interface SopGenerationPlan {
  status: string;
  date: string;
  decision: string;
  initialRequest?: {
    name: string;
    prompt: string;
    aspectRatio?: string;
    targetSize?: string;
  };
  remaining: SopGenerationRemainingItem[];
  rawJson: string;
}

export interface SopConnectResult {
  ok: boolean;
  project: string;
  mode: 'new' | 'existing';
  created: string[];
  unchanged: boolean;
  error?: string;
}

export interface SopSkillInstallResult {
  ok: boolean;
  installedPath?: string;
  files?: number;
  error?: string;
}

export interface SopFontDownloadProgress {
  current: number;
  total: number;
  label: string;
  status: 'downloading' | 'extracting' | 'done' | 'error';
  error?: string;
}

export interface SopReportItem {
  id: string;
  title: string;
  absPath: string;
  kind: 'qa' | 'diagnosis';
  updatedAt: string;
}

export interface SopLibraryData {
  rootPath: string;
  dataLibraryRoot: string;
  source: 'custom' | 'local' | 'bundled';
  docs: SopDocItem[];
  stages: SopStageItem[];
  resources: SopLibraryResource[];
  generationPlan: SopGenerationPlan | null;
  fontSpecimensAvailable: boolean;
  fontInstalledCount: number;
  fontTotalCount: number;
  reports: SopReportItem[];
}

export type QuickFilterId =
  | 'all'
  | 'pulse'
  | 'sop'
  | 'dirty'
  | 'mismatch'
  | 'pending_build'
  | 'sync'
  | 'archived'
  | 'board'
  | 'settings';

export interface GameHubBridge {
  scanAll: () => Promise<ProjectCardData[]>;
  refreshProject: (projectPath: string, groupName?: string) => Promise<ProjectCardData>;
  getGitGraph: (projectPath: string, limit?: number) => Promise<GitGraphData>;
  getCommitDetail: (projectPath: string, hash: string) => Promise<CommitDetailData | null>;
  getProjectTelemetry: (projectPath: string) => Promise<ProjectTelemetry>;
  getStudioPulse: () => Promise<StudioPulseData>;
  getSopLibrary: () => Promise<SopLibraryData>;
  readSopDoc: (absPath: string) => Promise<string>;
  openSopFolder: () => Promise<void>;
  openSopAsset: (relPath: string) => Promise<boolean>;
  connectProjectSop: (projectPath: string, mode: 'new' | 'existing') => Promise<SopConnectResult>;
  installSopSkill: () => Promise<SopSkillInstallResult>;
  downloadSopFonts: () => Promise<{ ok: boolean; installed: number; total: number; error?: string }>;
  onSopFontProgress: (cb: (p: SopFontDownloadProgress) => void) => () => void;
  getState: () => Promise<HubPersistedState>;
  setTheme: (theme: 'dark' | 'light') => Promise<HubPersistedState>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<HubPersistedState>;
  getLoginStartup: () => Promise<boolean>;
  setLoginStartup: (enabled: boolean) => Promise<boolean>;
  getDataPath: () => Promise<string>;
  exportBackup: () => Promise<string | null>;
  importBackup: () => Promise<HubPersistedState | null>;
  addRoot: (rootPath: string) => Promise<HubPersistedState>;
  removeRoot: (rootPath: string) => Promise<HubPersistedState>;
  setGlobalNotes: (notes: QuickNoteItem[]) => Promise<HubPersistedState>;
  updateProjectMeta: (projectPath: string, patch: Partial<ProjectUserMeta>) => Promise<ProjectUserMeta>;
  removeProjectsFromHub: (projectPaths: string[]) => Promise<HubPersistedState>;
  restoreRemovedProjects: (projectPaths?: string[]) => Promise<HubPersistedState>;
  setProjectTodos: (projectPath: string, todos: StageTodoItem[]) => Promise<ProjectUserMeta>;
  setProjectNotes: (projectPath: string, notes: QuickNoteItem[]) => Promise<ProjectUserMeta>;
  addBuildLog: (
    projectPath: string,
    entry: Omit<BuildLogEntry, 'id' | 'timestamp' | 'source'>
  ) => Promise<ProjectUserMeta>;
  deleteBuildLog: (projectPath: string, logId: string) => Promise<ProjectUserMeta>;
  pickFolder: () => Promise<string | null>;
  pickImage: () => Promise<string | null>;
  getFilePath: (file: File) => string;
  openFolder: (targetPath: string) => Promise<void>;
  openTerminal: (targetPath: string) => Promise<void>;
  openEditor: (targetPath: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  winMinimize: () => Promise<void>;
  winMaximize: () => Promise<boolean>;
  winClose: () => Promise<void>;
  winIsMaximized: () => Promise<boolean>;
  onWindowState: (cb: (maximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    gameHub: GameHubBridge;
  }
}
