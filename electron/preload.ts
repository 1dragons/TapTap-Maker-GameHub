import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  AiConnectionTestResult,
  AiFeedbackSummarizeResult,
  AiModelsListResult,
  AiProviderConfig,
  AiReasoningEffort,
  AppSettings,
  BuildLogEntry,
  CommitDetailData,
  GitGraphData,
  HubPersistedState,
  ProjectCardData,
  ProjectTelemetry,
  ProjectUserMeta,
  QuickNoteItem,
  SopConnectResult,
  SopFontDownloadProgress,
  SopLibraryData,
  SopSkillInstallResult,
  StageTodoItem,
  StudioPulseData,
  TapTapFeedbackFetchResult,
  TapTapFeedbackProgress,
  TapTapFeedbackSnapshot,
} from './types';

const api = {
  scanAll: (): Promise<ProjectCardData[]> => ipcRenderer.invoke('hub:scanAll'),
  refreshProject: (projectPath: string, groupName?: string): Promise<ProjectCardData> =>
    ipcRenderer.invoke('hub:refreshProject', projectPath, groupName),
  getGitGraph: (projectPath: string, limit?: number): Promise<GitGraphData> =>
    ipcRenderer.invoke('hub:getGitGraph', projectPath, limit),
  getCommitDetail: (projectPath: string, hash: string): Promise<CommitDetailData | null> =>
    ipcRenderer.invoke('hub:getCommitDetail', projectPath, hash),
  getProjectTelemetry: (projectPath: string): Promise<ProjectTelemetry> =>
    ipcRenderer.invoke('hub:getProjectTelemetry', projectPath),
  getStudioPulse: (): Promise<StudioPulseData> => ipcRenderer.invoke('hub:getStudioPulse'),
  getCachedTapTapFeedback: (projectPath: string): Promise<TapTapFeedbackSnapshot | null> =>
    ipcRenderer.invoke('hub:getCachedTapTapFeedback', projectPath),
  fetchTapTapFeedback: (
    projectPath: string,
    appId: string | number,
    options?: { forceFull?: boolean }
  ): Promise<TapTapFeedbackFetchResult> =>
    ipcRenderer.invoke('hub:fetchTapTapFeedback', projectPath, appId, options),
  onTapTapFeedbackProgress: (cb: (p: TapTapFeedbackProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: TapTapFeedbackProgress) => cb(p);
    ipcRenderer.on('taptap:feedback-progress', listener);
    return () => ipcRenderer.removeListener('taptap:feedback-progress', listener);
  },
  summarizeTapTapFeedback: (
    projectPath: string,
    projectName: string,
    version?: string,
    scope?: 'all' | 'new',
    reasoningEffort?: AiReasoningEffort
  ): Promise<AiFeedbackSummarizeResult> =>
    ipcRenderer.invoke(
      'hub:summarizeTapTapFeedback',
      projectPath,
      projectName,
      version,
      scope,
      reasoningEffort
    ),
  testAiConnection: (config: AiProviderConfig): Promise<AiConnectionTestResult> =>
    ipcRenderer.invoke('hub:testAiConnection', config),
  listAiModels: (config: AiProviderConfig): Promise<AiModelsListResult> =>
    ipcRenderer.invoke('hub:listAiModels', config),
  getSopLibrary: (): Promise<SopLibraryData> => ipcRenderer.invoke('hub:getSopLibrary'),
  readSopDoc: (absPath: string): Promise<string> => ipcRenderer.invoke('hub:readSopDoc', absPath),
  openSopFolder: (): Promise<void> => ipcRenderer.invoke('hub:openSopFolder'),
  openSopAsset: (relPath: string): Promise<boolean> => ipcRenderer.invoke('hub:openSopAsset', relPath),
  connectProjectSop: (projectPath: string, mode: 'new' | 'existing'): Promise<SopConnectResult> =>
    ipcRenderer.invoke('hub:connectProjectSop', projectPath, mode),
  installSopSkill: (): Promise<SopSkillInstallResult> => ipcRenderer.invoke('hub:installSopSkill'),
  downloadSopFonts: (): Promise<{ ok: boolean; installed: number; total: number; error?: string }> =>
    ipcRenderer.invoke('hub:downloadSopFonts'),
  onSopFontProgress: (cb: (p: SopFontDownloadProgress) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: SopFontDownloadProgress) => cb(p);
    ipcRenderer.on('sop:font-download-progress', listener);
    return () => ipcRenderer.removeListener('sop:font-download-progress', listener);
  },

  getState: (): Promise<HubPersistedState> => ipcRenderer.invoke('hub:getState'),
  setTheme: (theme: 'dark' | 'light'): Promise<HubPersistedState> =>
    ipcRenderer.invoke('hub:setTheme', theme),
  updateSettings: (patch: Partial<AppSettings>): Promise<HubPersistedState> =>
    ipcRenderer.invoke('hub:updateSettings', patch),
  getLoginStartup: (): Promise<boolean> => ipcRenderer.invoke('hub:getLoginStartup'),
  setLoginStartup: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('hub:setLoginStartup', enabled),
  getDataPath: (): Promise<string> => ipcRenderer.invoke('hub:getDataPath'),
  exportBackup: (): Promise<string | null> => ipcRenderer.invoke('hub:exportBackup'),
  importBackup: (): Promise<HubPersistedState | null> => ipcRenderer.invoke('hub:importBackup'),
  addRoot: (rootPath: string): Promise<HubPersistedState> =>
    ipcRenderer.invoke('hub:addRoot', rootPath),
  removeRoot: (rootPath: string): Promise<HubPersistedState> =>
    ipcRenderer.invoke('hub:removeRoot', rootPath),
  setGlobalNotes: (notes: QuickNoteItem[]): Promise<HubPersistedState> =>
    ipcRenderer.invoke('hub:setGlobalNotes', notes),

  updateProjectMeta: (projectPath: string, patch: Partial<ProjectUserMeta>): Promise<ProjectUserMeta> =>
    ipcRenderer.invoke('hub:updateProjectMeta', projectPath, patch),
  removeProjectsFromHub: (projectPaths: string[]): Promise<HubPersistedState> =>
    ipcRenderer.invoke('hub:removeProjectsFromHub', projectPaths),
  restoreRemovedProjects: (projectPaths?: string[]): Promise<HubPersistedState> =>
    ipcRenderer.invoke('hub:restoreRemovedProjects', projectPaths),
  setProjectTodos: (projectPath: string, todos: StageTodoItem[]): Promise<ProjectUserMeta> =>
    ipcRenderer.invoke('hub:setProjectTodos', projectPath, todos),
  setProjectNotes: (projectPath: string, notes: QuickNoteItem[]): Promise<ProjectUserMeta> =>
    ipcRenderer.invoke('hub:setProjectNotes', projectPath, notes),
  addBuildLog: (
    projectPath: string,
    entry: Omit<BuildLogEntry, 'id' | 'timestamp' | 'source'>
  ): Promise<ProjectUserMeta> => ipcRenderer.invoke('hub:addBuildLog', projectPath, entry),
  deleteBuildLog: (projectPath: string, logId: string): Promise<ProjectUserMeta> =>
    ipcRenderer.invoke('hub:deleteBuildLog', projectPath, logId),

  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('hub:pickFolder'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('hub:pickImage'),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  openFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke('hub:openFolder', targetPath),
  openTerminal: (targetPath: string): Promise<void> => ipcRenderer.invoke('hub:openTerminal', targetPath),
  openEditor: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('hub:openEditor', targetPath),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('hub:openExternal', url),

  winMinimize: (): Promise<void> => ipcRenderer.invoke('win:minimize'),
  winMaximize: (): Promise<boolean> => ipcRenderer.invoke('win:maximize'),
  winClose: (): Promise<void> => ipcRenderer.invoke('win:close'),
  winIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('win:isMaximized'),
  onWindowState: (cb: (maximized: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized);
    ipcRenderer.on('win:maximized-changed', listener);
    return () => ipcRenderer.removeListener('win:maximized-changed', listener);
  },
};

contextBridge.exposeInMainWorld('gameHub', api);

export type GameHubApi = typeof api;
