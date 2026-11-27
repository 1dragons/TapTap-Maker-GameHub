import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import {
  AiFeedbackSummary,
  AiProviderConfig,
  AppSettings,
  BuildLogEntry,
  HubPersistedState,
  ProjectUserMeta,
  QuickNoteItem,
  StageTodoItem,
  TapTapFeedbackSnapshot,
} from './types';

export const DEFAULT_AI_CONFIG: AiProviderConfig = {
  baseUrl: '',
  apiKey: '',
  model: '',
  reasoningEffort: 'low',
};

export const DEFAULT_SETTINGS: AppSettings = {
  backdrop: 'aurora',
  glassIntensity: 'balanced',
  defaultViewMode: 'grid',
  preferredEditor: 'auto',
  gitCommitLimit: 100,
  gitHideSyncByDefault: false,
  autoArchiveCopies: true,
  sopPath: '',
  ai: { ...DEFAULT_AI_CONFIG },
};

function detectDefaultRoots(): string[] {
  return [];
}

function resolveDataDir(): string {
  // Keep portable local data/ directory when running from a workspace folder or existing portable install
  const exeParentData = path.resolve(path.dirname(process.execPath), '..', '..', 'data');
  const cwdData = path.join(process.cwd(), 'data');
  for (const candidate of [exeParentData, cwdData]) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // continue
    }
  }
  const fallback = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function normalizeProjectId(projectPath: string): string {
  return path.resolve(projectPath).toLowerCase();
}

export class HubStore {
  private filePath: string;
  private state: HubPersistedState;

  constructor() {
    const dir = resolveDataDir();
    this.filePath = path.join(dir, 'hub-state.json');
    this.state = this.load();
  }

  private load(): HubPersistedState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw) as Partial<HubPersistedState>;
        return {
          roots: Array.isArray(parsed.roots) ? parsed.roots : detectDefaultRoots(),
          theme: parsed.theme === 'dark' ? 'dark' : 'light',
          settings: {
            ...DEFAULT_SETTINGS,
            ...(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}),
            ai: {
              ...DEFAULT_AI_CONFIG,
              ...(parsed.settings?.ai && typeof parsed.settings.ai === 'object'
                ? parsed.settings.ai
                : {}),
            },
          },
          globalNotes: Array.isArray(parsed.globalNotes) ? parsed.globalNotes : [],
          projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {},
        };
      }
    } catch {
      // ignore corrupted file, recreate clean
    }
    return {
      roots: detectDefaultRoots(),
      theme: 'light',
      settings: { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI_CONFIG } },
      globalNotes: [],
      projects: {},
    };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('Failed to save hub state:', err);
    }
  }

  getDataFilePath(): string {
    return this.filePath;
  }

  getState(): HubPersistedState {
    return this.state;
  }

  setTheme(theme: 'dark' | 'light'): HubPersistedState {
    this.state.theme = theme;
    this.save();
    return this.state;
  }

  updateSettings(patch: Partial<AppSettings>): HubPersistedState {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
      ai: patch.ai
        ? {
            ...DEFAULT_AI_CONFIG,
            ...(this.state.settings.ai || {}),
            ...patch.ai,
          }
        : {
            ...DEFAULT_AI_CONFIG,
            ...(this.state.settings.ai || {}),
          },
    };
    this.save();
    return this.state;
  }

  replaceStateFromBackup(rawJson: string): HubPersistedState {
    const parsed = JSON.parse(rawJson.replace(/^\uFEFF/, '')) as Partial<HubPersistedState>;
    this.state = {
      roots: Array.isArray(parsed.roots) && parsed.roots.length > 0 ? parsed.roots : this.state.roots,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}),
        ai: {
          ...DEFAULT_AI_CONFIG,
          ...(parsed.settings?.ai && typeof parsed.settings.ai === 'object'
            ? parsed.settings.ai
            : {}),
        },
      },
      globalNotes: Array.isArray(parsed.globalNotes) ? parsed.globalNotes : [],
      projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {},
    };
    this.save();
    return this.state;
  }

  addRoot(rootPath: string): HubPersistedState {
    const resolved = path.resolve(rootPath);
    const exists = this.state.roots.some((r) => r.toLowerCase() === resolved.toLowerCase());
    if (!exists && fs.existsSync(resolved)) {
      this.state.roots.push(resolved);
      this.save();
    }
    return this.state;
  }

  removeRoot(rootPath: string): HubPersistedState {
    const norm = path.resolve(rootPath).toLowerCase();
    this.state.roots = this.state.roots.filter((r) => path.resolve(r).toLowerCase() !== norm);
    this.save();
    return this.state;
  }

  setGlobalNotes(notes: QuickNoteItem[]): HubPersistedState {
    this.state.globalNotes = notes;
    this.save();
    return this.state;
  }

  getProjectMeta(projectPath: string): ProjectUserMeta {
    const id = normalizeProjectId(projectPath);
    const existing = this.state.projects[id];
    if (existing) {
      return {
        ...existing,
        todos: Array.isArray(existing.todos) ? existing.todos : [],
        notes: Array.isArray(existing.notes) ? existing.notes : [],
        buildLogs: Array.isArray(existing.buildLogs) ? existing.buildLogs : [],
      };
    }
    return { todos: [], notes: [], buildLogs: [] };
  }

  updateProjectMeta(projectPath: string, patch: Partial<ProjectUserMeta>): ProjectUserMeta {
    const id = normalizeProjectId(projectPath);
    const current = this.getProjectMeta(projectPath);
    const next: ProjectUserMeta = {
      ...current,
      ...patch,
      todos: patch.todos !== undefined ? patch.todos : current.todos,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
      buildLogs: patch.buildLogs !== undefined ? patch.buildLogs : current.buildLogs,
    };
    this.state.projects[id] = next;
    this.save();
    return next;
  }

  setProjectTodos(projectPath: string, todos: StageTodoItem[]): ProjectUserMeta {
    return this.updateProjectMeta(projectPath, { todos });
  }

  setProjectNotes(projectPath: string, notes: QuickNoteItem[]): ProjectUserMeta {
    return this.updateProjectMeta(projectPath, { notes });
  }

  removeProjectsFromHub(projectPaths: string[]): HubPersistedState {
    for (const p of projectPaths) {
      const id = normalizeProjectId(p);
      const current = this.getProjectMeta(p);
      this.state.projects[id] = {
        ...current,
        removed: true,
      };
    }
    this.save();
    return this.state;
  }

  restoreRemovedProjects(projectPaths?: string[]): HubPersistedState {
    if (!projectPaths || projectPaths.length === 0) {
      for (const id of Object.keys(this.state.projects)) {
        if (this.state.projects[id]?.removed) {
          this.state.projects[id] = { ...this.state.projects[id], removed: false };
        }
      }
    } else {
      for (const p of projectPaths) {
        const id = normalizeProjectId(p);
        if (this.state.projects[id]) {
          this.state.projects[id] = { ...this.state.projects[id], removed: false };
        }
      }
    }
    this.save();
    return this.state;
  }

  addBuildLog(projectPath: string, entry: Omit<BuildLogEntry, 'id' | 'timestamp' | 'source'> & { timestamp?: string }): ProjectUserMeta {
    const current = this.getProjectMeta(projectPath);
    const newEntry: BuildLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: entry.type,
      version: entry.version,
      commitHash: entry.commitHash,
      commitShort: entry.commitShort,
      platform: entry.platform,
      note: entry.note,
      timestamp: entry.timestamp || new Date().toISOString(),
      source: 'manual',
    };
    const buildLogs = [newEntry, ...current.buildLogs].slice(0, 50);
    return this.updateProjectMeta(projectPath, { buildLogs });
  }

  deleteBuildLog(projectPath: string, logId: string): ProjectUserMeta {
    const current = this.getProjectMeta(projectPath);
    const buildLogs = current.buildLogs.filter((l) => l.id !== logId);
    return this.updateProjectMeta(projectPath, { buildLogs });
  }

  getTapTapFeedback(projectPath: string): TapTapFeedbackSnapshot | null {
    const current = this.getProjectMeta(projectPath);
    return current.taptapFeedback || null;
  }

  saveTapTapFeedback(
    projectPath: string,
    snapshot: TapTapFeedbackSnapshot
  ): TapTapFeedbackSnapshot {
    this.updateProjectMeta(projectPath, { taptapFeedback: snapshot });
    return snapshot;
  }

  saveTapTapAiSummary(
    projectPath: string,
    summary: AiFeedbackSummary
  ): TapTapFeedbackSnapshot | null {
    const current = this.getProjectMeta(projectPath);
    if (!current.taptapFeedback) return null;
    const next: TapTapFeedbackSnapshot = {
      ...current.taptapFeedback,
      aiSummary: summary,
    };
    this.updateProjectMeta(projectPath, { taptapFeedback: next });
    return next;
  }
}
