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
  taptapFeedback?: TapTapFeedbackSnapshot;
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

export type AiReasoningEffort = 'none' | 'low' | 'high' | 'max';

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: AiReasoningEffort;
}

export interface AppSettings {
  backdrop: GlassBackdropId;
  glassIntensity: GlassIntensityId;
  defaultViewMode: 'grid' | 'table';
  preferredEditor: PreferredEditorId;
  gitCommitLimit: number;
  gitHideSyncByDefault: boolean;
  autoArchiveCopies: boolean;
  autoCheckUpdate?: boolean;
  sopPath?: string;
  ai?: AiProviderConfig;
}

export interface HubPersistedState {
  roots: string[];
  theme: 'dark' | 'light';
  settings: AppSettings;
  globalNotes: QuickNoteItem[];
  projects: Record<string, ProjectUserMeta>;
}

export interface DirtyFileItem {
  status: string; // M, A, D, R, ?
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
  id: string; // normalized lowercase full path
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
  dateKey: string; // YYYY-MM-DD
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
  heatmap: HeatmapCell[]; // 140 days (20 weeks)
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

export type SkillClientId = 'antigravity' | 'codex' | 'claude' | 'cursor';

export interface BundledSkillInfo {
  id: string;
  title: string;
  stageBadge: string;
  description: string;
  fileCount: number;
  installedTargets: Record<SkillClientId, 'installed' | 'outdated' | 'missing'>;
}

export interface SopSkillInstallOptions {
  target?: SkillClientId;
  skillIds?: string[];
  overwrite?: boolean;
}

export interface SopSkillInstallResult {
  ok: boolean;
  target?: SkillClientId;
  installedPath?: string;
  installedIds?: string[];
  skippedIds?: string[];
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
  bundledSkills: BundledSkillInfo[];
}

export type FeedbackCategoryId =
  | 'ad'
  | 'crash'
  | 'save'
  | 'balance'
  | 'ui'
  | 'praise'
  | 'other';

export interface TapTapRatingSummary {
  score: string;
  latestScore?: string;
  latestVersionScore?: string;
  totalReviews: number;
  latestVersionReviews?: number;
  feedCount?: number;
  voteDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface TapTapReviewItem {
  id: string;
  author: string;
  score: number;
  text: string;
  device?: string;
  playedMinutes?: number;
  stageLabel?: string;
  ups: number;
  comments: number;
  createdAt: string;
  url: string;
  categories: FeedbackCategoryId[];
}

export interface TapTapForumPostItem {
  id: string;
  author: string;
  title: string;
  text: string;
  ups: number;
  comments: number;
  createdAt: string;
  url: string;
  categories: FeedbackCategoryId[];
}

export interface FeedbackCategoryStat {
  id: FeedbackCategoryId;
  label: string;
  count: number;
  lowStarCount: number;
}

export interface AiFeedbackIssueItem {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  category: FeedbackCategoryId;
  title: string;
  detail: string;
  evidenceCount: number;
  devices?: string[];
  suggestedAction: string;
}

export interface AiFeedbackSummary {
  generatedAt: string;
  model: string;
  scope?: 'all' | 'new';
  reasoningEffort?: AiReasoningEffort;
  durationMs?: number;
  analyzedReviews?: number;
  analyzedForumPosts?: number;
  overview: string;
  issues: AiFeedbackIssueItem[];
  highlights: string[];
}

export interface TapTapFeedbackProgress {
  projectPath: string;
  mode: 'full' | 'incremental';
  phase: 'rating' | 'reviews' | 'forum' | 'done';
  reviewsFetched: number;
  reviewsTotal?: number;
  forumFetched: number;
  forumTotal?: number;
}

export interface TapTapFeedbackSnapshot {
  appId: string;
  groupId?: string;
  appTitle?: string;
  fetchedAt: string;
  lastSyncMode?: 'full' | 'incremental';
  lastSyncNewReviewIds?: string[];
  lastSyncNewForumIds?: string[];
  hasMoreReviews?: boolean;
  hasMoreForumPosts?: boolean;
  rating: TapTapRatingSummary;
  reviews: TapTapReviewItem[];
  forumPosts: TapTapForumPostItem[];
  categoryStats: FeedbackCategoryStat[];
  warnings?: string[];
  aiSummary?: AiFeedbackSummary | null;
}

export interface TapTapFeedbackFetchResult {
  ok: boolean;
  data?: TapTapFeedbackSnapshot;
  error?: string;
}

export interface AiFeedbackSummarizeResult {
  ok: boolean;
  summary?: AiFeedbackSummary;
  error?: string;
}

export interface AiConnectionTestResult {
  ok: boolean;
  model?: string;
  error?: string;
}

export interface AiModelsListResult {
  ok: boolean;
  models?: string[];
  error?: string;
}

export type UpdateInstallMode = 'installer' | 'portable' | 'dev';

export interface UpdateAssetInfo {
  name: string;
  downloadUrl: string;
  size: number;
  sha256?: string;
}

export interface UpdateCheckResult {
  ok: boolean;
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  installMode: UpdateInstallMode;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  releaseUrl?: string;
  installerAsset?: UpdateAssetInfo;
  portableAsset?: UpdateAssetInfo;
  error?: string;
}

export interface UpdateDownloadProgress {
  stage: 'backup' | 'downloading' | 'verifying' | 'extracting' | 'applying' | 'error';
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message: string;
}

export interface UpdateApplyResult {
  ok: boolean;
  backupPath?: string;
  error?: string;
}
