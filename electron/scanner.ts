import fs from 'fs';
import path from 'path';
import { extractSemver, getGitSummary, versionsDiffer } from './gitEngine';
import { HubStore, normalizeProjectId } from './store';
import {
  BuildLogEntry,
  BuildUploadStatus,
  EngineType,
  LifecycleStageId,
  ProjectCardData,
  SopClue,
  TapTapMeta,
} from './types';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.maker',
  '.maker-mcp',
  '.maker-preview',
  '.project',
  '.sop',
  '.tmp',
  '.agents',
  '.claude',
  '.cursor',
  '.gemini',
  '.codex',
  '.installer',
  '.ref',
  '.workbuddy',
  'engine-docs',
  'examples',
  'urhox-libs',
  'dist',
  'build',
  'release',
]);

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function isDirectProject(dirPath: string): boolean {
  return (
    fs.existsSync(path.join(dirPath, '.git')) ||
    fs.existsSync(path.join(dirPath, '.project', 'project.json')) ||
    fs.existsSync(path.join(dirPath, '.maker')) ||
    fs.existsSync(path.join(dirPath, 'package.json'))
  );
}

interface DiscoveredFolder {
  path: string;
  folderName: string;
  groupName?: string;
}

function discoverProjectFolders(roots: string[]): DiscoveredFolder[] {
  const seen = new Set<string>();
  const results: DiscoveredFolder[] = [];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const fullPath = path.join(root, entry.name);
      const norm = normalizeProjectId(fullPath);

      if (isDirectProject(fullPath)) {
        if (!seen.has(norm)) {
          seen.add(norm);
          results.push({ path: fullPath, folderName: entry.name });
        }
        continue;
      }

      // Check depth-2 nested projects (e.g. WorkspaceGroup/sub-project)
      let nestedFound = false;
      try {
        const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
          const subPath = path.join(fullPath, sub.name);
          if (isDirectProject(subPath)) {
            nestedFound = true;
            const subNorm = normalizeProjectId(subPath);
            if (!seen.has(subNorm)) {
              seen.add(subNorm);
              results.push({
                path: subPath,
                folderName: sub.name,
                groupName: entry.name,
              });
            }
          }
        }
      } catch {
        // ignore unreadable subdir
      }

      // Keep top-level non-git folder so standalone or early-stage projects are not hidden
      if (!nestedFound && !seen.has(norm)) {
        seen.add(norm);
        results.push({ path: fullPath, folderName: entry.name });
      }
    }
  }

  return results;
}

function detectLuaGameVersion(projectPath: string): string | undefined {
  const candidates = [
    path.join(projectPath, 'scripts', 'main.lua'),
    path.join(projectPath, 'scripts', 'Config.lua'),
    path.join(projectPath, 'scripts', 'Game', 'Config.lua'),
    path.join(projectPath, 'scripts', 'Game', 'Analytics.lua'),
    path.join(projectPath, 'scripts', 'Analytics.lua'),
  ];

  const patterns = [
    /(?:GAME_VERSION|APP_VERSION|appVersion|VERSION_STR)\s*=\s*["'](v?\d+\.\d+(?:\.\d+)?)["']/i,
    /Started\s*===\s*["']?.*?\b(v\d+\.\d+(?:\.\d+)?)\b/i,
    /===\s*[^=\r\n]*?\b(v\d+\.\d+(?:\.\d+)?)\b\s*Started/i,
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const content = fs.readFileSync(file, 'utf-8');
      for (const re of patterns) {
        const m = content.match(re);
        if (m && m[1]) {
          const v = m[1].trim();
          return v.startsWith('v') || v.startsWith('V') ? v.replace(/^V/, 'v') : `v${v}`;
        }
      }
    } catch {
      // ignore unreadable lua file
    }
  }
  return undefined;
}

function readTapTapMeta(projectPath: string): { meta: TapTapMeta; iconHint?: string } {
  const projJsonPath = path.join(projectPath, '.project', 'project.json');
  const hasMakerDir = fs.existsSync(path.join(projectPath, '.maker'));
  const luaGameVersion = detectLuaGameVersion(projectPath);

  if (!fs.existsSync(projJsonPath)) {
    return {
      meta: { isTapTapMaker: hasMakerDir, luaGameVersion },
    };
  }

  try {
    const raw = fs.readFileSync(projJsonPath, 'utf-8');
    const json = JSON.parse(raw);
    const pub = json.taptap_publish || {};
    const iconHint = json.assets?.icon || undefined;
    return {
      meta: {
        isTapTapMaker: true,
        publishTitle: pub.title || undefined,
        configVersion: json.version ? String(json.version) : undefined,
        luaGameVersion,
        releasePhase: pub.release_phase || undefined,
        appId: pub.app_id || undefined,
        miniappId: pub.miniapp_id || undefined,
        orientation: pub.screen_orientation || undefined,
        category: pub.category || undefined,
      },
      iconHint,
    };
  } catch {
    return {
      meta: { isTapTapMaker: true, luaGameVersion },
    };
  }
}

function detectEngine(projectPath: string, taptap: TapTapMeta): EngineType {
  if (taptap.isTapTapMaker) return 'taptap-maker';
  if (fs.existsSync(path.join(projectPath, 'package.json'))) return 'web-h5';
  return 'other';
}

function findImagesInDir(dir: string, maxDepth: number, results: { file: string; size: number; score: number }[], baseScore: number): void {
  if (maxDepth < 0 || !fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      findImagesInDir(path.join(dir, e.name), maxDepth - 1, results, baseScore - 10);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const full = path.join(dir, e.name);
      const st = safeStat(full);
      if (!st || st.size < 12_000) continue; // skip tiny icons/noise
      const lower = e.name.toLowerCase();
      let bonus = 0;
      if (lower.includes('cover_horizontal') || lower.includes('cover')) bonus += 60;
      else if (lower.includes('publish_icon') || lower.includes('icon')) bonus += 45;
      else if (lower.includes('启动画面') || lower.includes('lobby') || lower.includes('background') || lower.includes('wallart')) bonus += 40;
      else if (lower.includes('preview') || lower.includes('scene') || lower.includes('hud')) bonus += 20;
      if (lower.includes('mask') || lower.includes('normal') || lower.includes('rough') || lower.includes('atlas') || lower.includes('font')) bonus -= 50;
      // Slight boost for crisp visual size (between 80KB and 8MB)
      const sizeScore = Math.min(25, Math.floor(st.size / 120_000));
      results.push({ file: full, size: st.size, score: baseScore + bonus + sizeScore });
    }
  }
}

function resolveCoverImage(projectPath: string, customCover: string | undefined, iconHint: string | undefined): string | null {
  if (customCover && fs.existsSync(customCover)) {
    return customCover;
  }

  // 1. Official game_material covers
  const gmDir = path.join(projectPath, '.project', 'game_material');
  if (fs.existsSync(gmDir)) {
    try {
      const gmFiles = fs.readdirSync(gmDir).filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
      const horiz = gmFiles.find((f) => f.toLowerCase().includes('cover_horizontal'));
      if (horiz) return path.join(gmDir, horiz);
      const anyCover = gmFiles.find((f) => f.toLowerCase().includes('cover') || f.toLowerCase().includes('icon'));
      if (anyCover) return path.join(gmDir, anyCover);
      if (gmFiles[0]) return path.join(gmDir, gmFiles[0]);
    } catch {
      // ignore
    }
  }

  // 2. Explicit icon hint from project.json
  if (iconHint) {
    const candidates = [
      path.resolve(projectPath, iconHint),
      path.resolve(projectPath, '.project', iconHint),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // 3. Curated visual search across key asset/preview folders (fast, depth-limited)
  const candidates: { file: string; size: number; score: number }[] = [];
  const searchDirs: [string, number, number][] = [
    [path.join(projectPath, 'assets', 'image'), 2, 100],
    [path.join(projectPath, '.sop', 'ui-designs'), 1, 95],
    [path.join(projectPath, '.sop', 'blender'), 1, 88],
    [path.join(projectPath, 'screenshots'), 2, 82],
    [path.join(projectPath, 'docs'), 3, 72],
    [path.join(projectPath, '.sop', 'evidence'), 1, 68],
    [path.join(projectPath, 'assets'), 1, 60],
    [projectPath, 0, 55],
  ];

  for (const [d, depth, score] of searchDirs) {
    findImagesInDir(d, depth, candidates, score);
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || b.size - a.size);
  return candidates[0].file;
}

function readSopClues(projectPath: string): SopClue {
  const sopDir = path.join(projectPath, '.sop');
  if (!fs.existsSync(sopDir)) {
    return { hasSop: false, sopBuildLogs: [], suggestedTodos: [] };
  }

  const sopBuildLogs: BuildLogEntry[] = [];
  const suggestedTodos: string[] = [];
  let sopLatestBuildCommit: string | undefined;
  let sopHeaderSummary: string | undefined;

  try {
    const files = fs.readdirSync(sopDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.md')) continue;
      // Match build/upload markdown records like V1.4.15构建上传_2026-11-02.md
      const buildMatch = f.name.match(/(v\d+\.\d+(?:\.\d+)?)[_\-\s]*(构建|上传|发布)/i);
      if (buildMatch) {
        const st = safeStat(path.join(sopDir, f.name));
        const dateInName = f.name.match(/(\d{4}-\d{2}-\d{2})/);
        const dateStr = dateInName
          ? `${dateInName[1]}T12:00:00.000Z`
          : st?.mtime.toISOString() || new Date().toISOString();
        const isUpload = f.name.includes('上传') || f.name.includes('发布');
        sopBuildLogs.push({
          id: `sop-${f.name}`,
          type: isUpload ? 'upload' : 'build',
          version: buildMatch[1].replace(/^V/, 'v'),
          platform: 'TapTap Maker',
          note: f.name.replace(/\.md$/i, ''),
          timestamp: dateStr,
          source: 'sop',
        });
      }
    }

    // Parse concise header & unchecked items from 进度.md (NEVER dump raw essay)
    const progressPath = path.join(sopDir, '进度.md');
    if (fs.existsSync(progressPath)) {
      const content = fs.readFileSync(progressPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const line = lines[i];
        if (line.includes('当前阶段：')) {
          const m = line.match(/当前阶段：([^｜|]+)/);
          if (m) sopHeaderSummary = m[1].trim().slice(0, 48);
          const commitM = line.match(/提交\s*`?([0-9a-f]{7,10})`?/i);
          if (commitM) sopLatestBuildCommit = commitM[1];
          const verM = extractSemver(line);
          const dateM = line.match(/最近更新：(\d{4}-\d{2}-\d{2})/);
          if (verM && (line.includes('已构建') || line.includes('已上传'))) {
            const ts = dateM ? `${dateM[1]}T12:00:00.000Z` : safeStat(progressPath)?.mtime.toISOString() || new Date().toISOString();
            sopBuildLogs.push({
              id: `sop-progress-${verM}`,
              type: line.includes('上传') ? 'upload' : 'build',
              version: verM,
              commitShort: sopLatestBuildCommit,
              platform: 'TapTap Maker',
              note: '来自 .sop 进度记录',
              timestamp: ts,
              source: 'sop',
            });
          }
        }
      }

      // Extract concise markdown checkboxes (- [ ] ...) if any
      for (const line of lines) {
        const todoM = line.match(/^\s*[-*]\s*\[\s*\]\s+(.+)$/);
        if (todoM && suggestedTodos.length < 10) {
          const clean = todoM[1].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '').trim();
          if (clean.length > 0) {
            suggestedTodos.push(clean.length > 34 ? clean.slice(0, 33) + '…' : clean);
          }
        }
      }
    }
  } catch {
    // ignore read errors
  }

  sopBuildLogs.sort((a, b) => {
    const dt = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    if (dt !== 0) return dt;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });

  return {
    hasSop: true,
    sopBuildLogs: sopBuildLogs.slice(0, 12),
    suggestedTodos,
    sopLatestBuildCommit,
    sopHeaderSummary,
  };
}

function detectAutoArchive(projectPath: string, folderName: string): { autoArchived: boolean; reason?: string } {
  if (/脱敏|备份|backup|_old|副本|copy/i.test(folderName)) {
    return { autoArchived: true, reason: '脱敏/副本' };
  }
  try {
    const items = fs.readdirSync(projectPath);
    if (items.length === 0) {
      return { autoArchived: true, reason: '空文件夹' };
    }
  } catch {
    return { autoArchived: true, reason: '无法读取' };
  }
  return { autoArchived: false };
}

function inferStage(
  projectPath: string,
  taptap: TapTapMeta,
  gitTotalCommits: number,
  lastSubject: string,
  sop: SopClue
): LifecycleStageId {
  if (taptap.releasePhase === 'official') return 'official';
  if (taptap.releasePhase === 'public_test') return 'public_test';
  if (sop.sopBuildLogs.length > 0) return 'build';
  if (gitTotalCommits >= 10 && /QA|验收|体检/i.test(lastSubject)) return 'qa';
  if (gitTotalCommits >= 15) return 'dev';
  if (gitTotalCommits >= 3) return 'prototype';
  if (gitTotalCommits === 0 && fs.existsSync(path.join(projectPath, 'dist'))) return 'build';
  return 'concept';
}

const NON_BUILD_DIR_RE =
  /(?:^|\/)(?:docs?|documentation|\.sop|\.maker|\.maker-mcp|\.maker-preview|\.tmp|\.ref|\.claude|\.cursor|\.codex|\.gemini|\.agents|\.workbuddy|acceptance|screenshots?|backups?|logs?|reports?|素材备份|聊天记录|备份|副本)(?:\/|$)/i;

const NON_BUILD_FILE_RE =
  /(?:^|\/)(?:\.gitignore|\.gitattributes|\.editorconfig|\.ds_store|thumbs\.db|save\.json(?:\.(?:backup|bak|pending|tmp))?|\.project\/(?:elevenlabs-voice-mapping|taptap-video-cache)\.json(?:\.meta)?)$|\.(?:md|txt|log|tmp|bak|backup|pending|html|pdf|docx?|xlsx?|pptx?)$/i;

const NON_BUILD_PROMO_RE = /(?:^|\/)assets\/video(?:\/|$)/i;

function isNonBuildDirtyPath(rawPath: string): boolean {
  const norm = rawPath.replace(/\\/g, '/').replace(/\/+$/, '').trim();
  if (!norm) return true;
  return NON_BUILD_DIR_RE.test(norm) || NON_BUILD_FILE_RE.test(norm) || NON_BUILD_PROMO_RE.test(norm);
}

function getLatestMtimeRecursive(targetPath: string, maxDepth = 3, budget = { left: 120 }): number {
  if (budget.left <= 0) return 0;
  budget.left -= 1;
  const st = safeStat(targetPath);
  if (!st) return 0;
  if (!st.isDirectory()) return st.mtimeMs;
  let maxMs = st.mtimeMs;
  if (maxDepth <= 0) return maxMs;
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const e of entries) {
      if (budget.left <= 0) break;
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const childMs = getLatestMtimeRecursive(path.join(targetPath, e.name), maxDepth - 1, budget);
      if (childMs > maxMs) maxMs = childMs;
    }
  } catch {
    // ignore unreadable subdirs
  }
  return maxMs;
}

function inspectBuildDirtyFiles(
  projectPath: string,
  dirtyFiles: ProjectCardData['git']['dirtyFiles']
): { buildDirtyCount: number; latestBuildDirtyMtimeMs: number } {
  let buildDirtyCount = 0;
  let latestBuildDirtyMtimeMs = 0;

  for (const item of dirtyFiles) {
    if (isNonBuildDirtyPath(item.path)) continue;
    buildDirtyCount += 1;
    const cleanRel = item.path.replace(/\/+$/, '');
    const full = path.join(projectPath, cleanRel);
    let mtimeMs = getLatestMtimeRecursive(full);
    if (mtimeMs === 0) {
      // Deleted file: fall back to parent directory mtime so deletions still carry a real timestamp
      const parentSt = safeStat(path.dirname(full));
      mtimeMs = parentSt ? parentSt.mtimeMs : 0;
    }
    if (mtimeMs > latestBuildDirtyMtimeMs) {
      latestBuildDirtyMtimeMs = mtimeMs;
    }
  }

  return { buildDirtyCount, latestBuildDirtyMtimeMs };
}

function computeBuildStatus(
  projectPath: string,
  git: ProjectCardData['git'],
  versionMismatch: boolean,
  allBuildLogs: BuildLogEntry[],
  taptap: TapTapMeta
): BuildUploadStatus {
  const latestBuild = allBuildLogs.find((l) => l.type === 'build' || l.type === 'upload') || null;
  const latestUpload = allBuildLogs.find((l) => l.type === 'upload') || null;

  if (!git.isGit) {
    if (latestUpload) return 'synced';
    if (latestBuild) return 'pending_upload';
    return 'none';
  }

  const { buildDirtyCount, latestBuildDirtyMtimeMs } = inspectBuildDirtyFiles(
    projectPath,
    git.dirtyFiles
  );
  const lastCommitMs = git.lastCommitDate ? new Date(git.lastCommitDate).getTime() : 0;
  const latestUploadMs = latestUpload ? new Date(latestUpload.timestamp).getTime() : 0;
  const latestBuildMs = latestBuild ? new Date(latestBuild.timestamp).getTime() : 0;

  // A build/upload check-in remains valid unless real code/runtime assets were modified AFTER that check-in
  const hasBuildDirtyAfter = (tsMs: number): boolean => {
    if (buildDirtyCount === 0) return false;
    if (tsMs <= 0) return true;
    return latestBuildDirtyMtimeMs > tsMs + 2000;
  };

  if (!versionMismatch) {
    const uploadCoversHead =
      Boolean(latestUpload) &&
      ((Boolean(git.lastCommitShort) && latestUpload!.commitShort === git.lastCommitShort) ||
        (latestUploadMs > 0 && latestUploadMs >= lastCommitMs));

    if (uploadCoversHead && !hasBuildDirtyAfter(latestUploadMs)) {
      return 'synced';
    }

    const buildCoversHead =
      Boolean(latestBuild) &&
      ((Boolean(git.lastCommitShort) && latestBuild!.commitShort === git.lastCommitShort) ||
        (latestBuildMs > 0 && latestBuildMs >= lastCommitMs));

    if (buildCoversHead && !hasBuildDirtyAfter(latestBuildMs)) {
      return latestBuild!.type === 'upload' ? 'synced' : 'pending_upload';
    }
  }

  // If versionMismatch or build-relevant dirty files or commits newer than last build/upload -> pending_build
  if (versionMismatch || buildDirtyCount > 0 || git.totalCommits > 0) {
    // Official / public_test project with 0 build-relevant dirty files, no version mismatch, and no manual logs yet
    if (
      !latestBuild &&
      !versionMismatch &&
      buildDirtyCount === 0 &&
      (taptap.releasePhase === 'official' || taptap.releasePhase === 'public_test')
    ) {
      return 'synced';
    }
    return 'pending_build';
  }

  return 'none';
}

export async function scanSingleProject(
  folder: DiscoveredFolder,
  store: HubStore
): Promise<ProjectCardData> {
  const id = normalizeProjectId(folder.path);
  const userMeta = store.getProjectMeta(folder.path);
  const { meta: taptap, iconHint } = readTapTapMeta(folder.path);
  const engine = detectEngine(folder.path, taptap);
  const [git, sop] = await Promise.all([
    getGitSummary(folder.path),
    Promise.resolve(readSopClues(folder.path)),
  ]);

  const coverPath = resolveCoverImage(folder.path, userMeta.customCover, iconHint);
  const st = safeStat(folder.path);
  const lastModified = git.lastCommitDate || st?.mtime.toISOString() || new Date().toISOString();

  const autoArch = store.getState().settings.autoArchiveCopies
    ? detectAutoArchive(folder.path, folder.folderName)
    : { autoArchived: false };
  const archived = userMeta.archived !== undefined ? userMeta.archived : autoArch.autoArchived;

  const inferredStage = inferStage(folder.path, taptap, git.totalCommits, git.lastCommitSubject, sop);
  const stage: LifecycleStageId = userMeta.stage || inferredStage;

  // Only flag real mismatch when Lua in-game version differs from latest Git release commit version
  // (TapTap Maker project.json version increments separately as platform build number)
  const versionMismatch =
    Boolean(taptap.luaGameVersion) &&
    Boolean(git.detectedGitVersion) &&
    versionsDiffer(taptap.luaGameVersion, git.detectedGitVersion);

  // Merge manual build logs + SOP build clues (deduped by id)
  const allBuildLogs = [...userMeta.buildLogs, ...sop.sopBuildLogs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const latestBuildLog = allBuildLogs.find((l) => l.type === 'build' || l.type === 'upload') || null;
  const latestUploadLog = allBuildLogs.find((l) => l.type === 'upload') || null;
  const buildStatus = computeBuildStatus(folder.path, git, versionMismatch, allBuildLogs, taptap);

  const rawDisplayVersion =
    taptap.luaGameVersion ||
    git.detectedGitVersion ||
    (taptap.configVersion
      ? taptap.configVersion.startsWith('v')
        ? taptap.configVersion
        : `v${taptap.configVersion}`
      : latestBuildLog?.version ?? '');

  const displayName =
    userMeta.displayName ||
    (folder.groupName ? `${folder.groupName} · ${folder.folderName}` : folder.folderName);

  return {
    id,
    path: folder.path,
    folderName: folder.folderName,
    groupName: folder.groupName,
    name: displayName,
    engine,
    coverPath,
    lastModified,
    pinned: Boolean(userMeta.pinned),
    archived,
    autoArchived: autoArch.autoArchived,
    archiveReason: autoArch.reason,
    stage,
    stageIsManual: Boolean(userMeta.stage),
    git,
    taptap,
    sop,
    versionMismatch,
    displayVersion: rawDisplayVersion,
    buildStatus,
    latestBuildLog,
    latestUploadLog,
    allBuildLogs,
    todos: userMeta.todos,
    notes: userMeta.notes,
    sprintFocus: Boolean(userMeta.sprintFocus),
    targetDate: userMeta.targetDate,
    targetGoal: userMeta.targetGoal,
    customLinks: Array.isArray(userMeta.customLinks) ? userMeta.customLinks : [],
  };
}

export async function scanAllProjects(store: HubStore): Promise<ProjectCardData[]> {
  const roots = store.getState().roots;
  const folders = discoverProjectFolders(roots).filter(
    (f) => !store.getProjectMeta(f.path).removed
  );

  // Controlled parallel scan (batches of 6) for speed without spawning too many git processes at once
  const results: ProjectCardData[] = [];
  const batchSize = 6;
  for (let i = 0; i < folders.length; i += batchSize) {
    const batch = folders.slice(i, i + batchSize);
    const scanned = await Promise.all(batch.map((f) => scanSingleProject(f, store)));
    results.push(...scanned);
  }

  // Sort: pinned first, then most recently active
  results.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
  });

  return results;
}
