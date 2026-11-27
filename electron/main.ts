import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { getCommitDetail, getGitGraph } from './gitEngine';
import { scanAllProjects, scanSingleProject } from './scanner';
import {
  connectProjectToSop,
  downloadSopFonts,
  getSopLibrary,
  installSopSkill,
  readSopDocument,
  resolveSopAssetFile,
  resolveSopRoot,
} from './sopEngine';
import { HubStore } from './store';
import { getStudioPulse } from './studioPulse';
import {
  fetchTapTapFeedback,
  listAiModels,
  summarizeFeedbackWithAi,
  testAiConnection,
} from './taptapFeedback';
import { getProjectTelemetry } from './telemetry';
import {
  AiProviderConfig,
  AiReasoningEffort,
  AppSettings,
  BuildLogEntry,
  ProjectUserMeta,
  QuickNoteItem,
  StageTodoItem,
} from './types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gamehub-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
  {
    scheme: 'gamehub-sop',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let store: HubStore;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function getAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'app.asar', 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'build', 'icon.png'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return undefined;
}

function createWindow(): void {
  const isDark = store.getState().theme === 'dark';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    backgroundColor: isDark ? '#0E1117' : '#F8FAFC',
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('win:maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('win:maximized-changed', false);
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexHtml);
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  store = new HubStore();

  // Serve local game cover/icon images safely
  protocol.handle('gamehub-media', (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('path');
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not Found', { status: 404 });
      }
      const ext = path.extname(filePath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'].includes(ext)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });

  // Serve local SOP library assets (fonts, study screenshots, licenses) safely
  protocol.handle('gamehub-sop', (request) => {
    try {
      const url = new URL(request.url);
      const rel = url.searchParams.get('rel') || '';
      const filePath = resolveSopAssetFile(store, rel);
      if (!filePath) {
        return new Response('Not Found', { status: 404 });
      }
      const ext = path.extname(filePath).toLowerCase();
      if (
        ![
          '.otf',
          '.ttf',
          '.woff',
          '.woff2',
          '.png',
          '.jpg',
          '.jpeg',
          '.webp',
          '.svg',
          '.json',
          '.md',
          '.txt',
          '.cs',
          '.csv',
        ].includes(ext)
      ) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });

  // Hub IPC
  ipcMain.handle('hub:scanAll', () => scanAllProjects(store));
  ipcMain.handle('hub:refreshProject', (_e, projectPath: string, groupName?: string) =>
    scanSingleProject(
      { path: projectPath, folderName: path.basename(projectPath), groupName },
      store
    )
  );
  ipcMain.handle('hub:getGitGraph', (_e, projectPath: string, limit?: number) =>
    getGitGraph(projectPath, limit ?? 100)
  );
  ipcMain.handle('hub:getCommitDetail', (_e, projectPath: string, hash: string) =>
    getCommitDetail(projectPath, hash)
  );
  ipcMain.handle('hub:getProjectTelemetry', (_e, projectPath: string) =>
    getProjectTelemetry(projectPath)
  );
  ipcMain.handle('hub:getStudioPulse', () => getStudioPulse(store));
  ipcMain.handle('hub:getCachedTapTapFeedback', (_e, projectPath: string) =>
    store.getTapTapFeedback(projectPath)
  );
  ipcMain.handle(
    'hub:fetchTapTapFeedback',
    async (
      _e,
      projectPath: string,
      appId: string | number,
      options?: { forceFull?: boolean }
    ) => {
      const existing = store.getTapTapFeedback(projectPath);
      const res = await fetchTapTapFeedback(appId, {
        projectPath,
        existing,
        forceFull: Boolean(options?.forceFull),
        onProgress: (progress) => {
          mainWindow?.webContents.send('taptap:feedback-progress', progress);
        },
      });
      if (res.ok && res.data) {
        const saved = store.saveTapTapFeedback(projectPath, res.data);
        return { ok: true, data: saved };
      }
      return res;
    }
  );
  ipcMain.handle(
    'hub:summarizeTapTapFeedback',
    async (
      _e,
      projectPath: string,
      projectName: string,
      version?: string,
      scope?: 'all' | 'new',
      reasoningEffort?: AiReasoningEffort
    ) => {
      const cached = store.getTapTapFeedback(projectPath);
      if (!cached) {
        return { ok: false, error: '请先拉取该游戏的玩家评价与论坛数据' };
      }
      const res = await summarizeFeedbackWithAi(
        cached,
        projectName,
        version,
        store.getState().settings.ai,
        scope || 'all',
        reasoningEffort
      );
      if (res.ok && res.summary) {
        store.saveTapTapAiSummary(projectPath, res.summary);
      }
      return res;
    }
  );
  ipcMain.handle('hub:testAiConnection', (_e, config: AiProviderConfig) =>
    testAiConnection(config)
  );
  ipcMain.handle('hub:listAiModels', (_e, config: AiProviderConfig) =>
    listAiModels(config)
  );
  ipcMain.handle('hub:getSopLibrary', () => getSopLibrary(store));
  ipcMain.handle('hub:readSopDoc', (_e, absPath: string) => readSopDocument(store, absPath));
  ipcMain.handle('hub:openSopFolder', async () => {
    const { rootPath } = resolveSopRoot(store);
    if (rootPath && fs.existsSync(rootPath)) {
      await shell.openPath(rootPath);
    }
  });
  ipcMain.handle('hub:openSopAsset', async (_e, relPath: string) => {
    const abs = resolveSopAssetFile(store, relPath);
    if (!abs) return false;
    await shell.openPath(abs);
    return true;
  });
  ipcMain.handle('hub:connectProjectSop', (_e, projectPath: string, mode: 'new' | 'existing') =>
    connectProjectToSop(store, projectPath, mode)
  );
  ipcMain.handle('hub:installSopSkill', () => installSopSkill(store));
  ipcMain.handle('hub:downloadSopFonts', () =>
    downloadSopFonts(store, (progress) => {
      mainWindow?.webContents.send('sop:font-download-progress', progress);
    })
  );

  ipcMain.handle('hub:getState', () => store.getState());
  ipcMain.handle('hub:setTheme', (_e, theme: 'dark' | 'light') => store.setTheme(theme));
  ipcMain.handle('hub:updateSettings', (_e, patch: Partial<AppSettings>) =>
    store.updateSettings(patch)
  );
  ipcMain.handle('hub:getLoginStartup', () => {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  });
  ipcMain.handle('hub:setLoginStartup', (_e, enabled: boolean) => {
    try {
      app.setLoginItemSettings({ openAtLogin: enabled });
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  });
  ipcMain.handle('hub:getDataPath', () => store.getDataFilePath());
  ipcMain.handle('hub:exportBackup', async () => {
    if (!mainWindow) return null;
    const today = new Date().toISOString().slice(0, 10);
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '导出 GameHub 配置与数据备份',
      defaultPath: `GameHub-Backup-${today}.json`,
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, JSON.stringify(store.getState(), null, 2), 'utf-8');
    return res.filePath;
  });
  ipcMain.handle('hub:importBackup', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '导入 GameHub 备份文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const raw = fs.readFileSync(res.filePaths[0], 'utf-8');
    return store.replaceStateFromBackup(raw);
  });
  ipcMain.handle('hub:addRoot', (_e, rootPath: string) => store.addRoot(rootPath));
  ipcMain.handle('hub:removeRoot', (_e, rootPath: string) => store.removeRoot(rootPath));
  ipcMain.handle('hub:setGlobalNotes', (_e, notes: QuickNoteItem[]) => store.setGlobalNotes(notes));

  ipcMain.handle('hub:updateProjectMeta', (_e, projectPath: string, patch: Partial<ProjectUserMeta>) =>
    store.updateProjectMeta(projectPath, patch)
  );
  ipcMain.handle('hub:removeProjectsFromHub', (_e, projectPaths: string[]) =>
    store.removeProjectsFromHub(projectPaths)
  );
  ipcMain.handle('hub:restoreRemovedProjects', (_e, projectPaths?: string[]) =>
    store.restoreRemovedProjects(projectPaths)
  );
  ipcMain.handle('hub:setProjectTodos', (_e, projectPath: string, todos: StageTodoItem[]) =>
    store.setProjectTodos(projectPath, todos)
  );
  ipcMain.handle('hub:setProjectNotes', (_e, projectPath: string, notes: QuickNoteItem[]) =>
    store.setProjectNotes(projectPath, notes)
  );
  ipcMain.handle(
    'hub:addBuildLog',
    (_e, projectPath: string, entry: Omit<BuildLogEntry, 'id' | 'timestamp' | 'source'>) =>
      store.addBuildLog(projectPath, entry)
  );
  ipcMain.handle('hub:deleteBuildLog', (_e, projectPath: string, logId: string) =>
    store.deleteBuildLog(projectPath, logId)
  );

  ipcMain.handle('hub:pickFolder', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择游戏项目根目录',
    });
    return res.canceled ? null : res.filePaths[0] || null;
  });

  ipcMain.handle('hub:pickImage', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择自定义封面图',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    return res.canceled ? null : res.filePaths[0] || null;
  });

  ipcMain.handle('hub:openFolder', async (_e, targetPath: string) => {
    if (targetPath && fs.existsSync(targetPath)) {
      await shell.openPath(targetPath);
    }
  });

  ipcMain.handle('hub:openTerminal', (_e, targetPath: string) => {
    if (!targetPath || !fs.existsSync(targetPath)) return;
    // Open Windows PowerShell in the project folder cleanly
    spawn('cmd.exe', ['/c', 'start', 'powershell.exe', '-NoExit', '-Command', `Set-Location -LiteralPath '${targetPath.replace(/'/g, "''")}'`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  });

  ipcMain.handle('hub:openEditor', (_e, targetPath: string) => {
    if (!targetPath || !fs.existsSync(targetPath)) return false;
    const pref = store.getState().settings.preferredEditor || 'auto';
    let cmd = '';
    if (pref === 'cursor') {
      cmd = `start "" cursor "${targetPath}"`;
    } else if (pref === 'code') {
      cmd = `start "" code "${targetPath}"`;
    } else if (pref === 'trae') {
      cmd = `start "" trae "${targetPath}"`;
    } else {
      cmd = `where cursor >nul 2>nul && (start "" cursor "${targetPath}") || (where code >nul 2>nul && (start "" code "${targetPath}") || (where trae >nul 2>nul && (start "" trae "${targetPath}") || explorer "${targetPath}"))`;
    }
    spawn('cmd.exe', ['/c', cmd], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return true;
  });

  ipcMain.handle('hub:openExternal', async (_e, url: string) => {
    if (!url || !/^https?:\/\//i.test(url.trim())) return false;
    await shell.openExternal(url.trim());
    return true;
  });

  // Window controls
  ipcMain.handle('win:minimize', () => mainWindow?.minimize());
  ipcMain.handle('win:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });
  ipcMain.handle('win:close', () => mainWindow?.close());
  ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false);

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
