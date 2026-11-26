import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ProjectDocLink, ProjectTelemetry } from './types';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'engine-docs',
  'examples',
  'urhox-libs',
  '.tmp',
  '.maker-preview',
  '.installer',
  '.agents',
  '.claude',
  '.codex',
  '.cursor',
  '.gemini',
  '.emmylua',
  '.workbuddy',
  'dist',
  'out',
  'outputs',
  'release',
  'logs',
  'archive',
]);

const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.dds']);
const MODEL_EXTS = new Set(['.mdl', '.glb', '.gltf', '.fbx', '.obj', '.blend']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

function runGitLogDates(repoPath: string): Promise<string[]> {
  return new Promise((resolve) => {
    if (!fs.existsSync(path.join(repoPath, '.git'))) {
      resolve([]);
      return;
    }
    execFile(
      'git',
      ['log', '--since=15 days ago', '--format=%aI', '-n', '300'],
      { cwd: repoPath, timeout: 4000, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err || !stdout) resolve([]);
        else resolve(stdout.split(/\r?\n/).filter(Boolean));
      }
    );
  });
}

function readAdConfig(projectPath: string): { enabled: boolean; count: number } {
  const settingsPath = path.join(projectPath, '.project', 'settings.json');
  if (!fs.existsSync(settingsPath)) return { enabled: false, count: 0 };
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8').replace(/^\uFEFF/, '');
    const json = JSON.parse(raw);
    const ad = json['@runtime']?.ad;
    if (!ad) return { enabled: false, count: 0 };
    const spaces = Array.isArray(ad.ad_spaces) ? ad.ad_spaces.length : 0;
    return {
      enabled: ad.status === 1 || spaces > 0,
      count: spaces,
    };
  } catch {
    return { enabled: false, count: 0 };
  }
}

function discoverQuickDocs(projectPath: string): ProjectDocLink[] {
  const docs: ProjectDocLink[] = [];
  const checkList: [string, string, ProjectDocLink['kind']][] = [
    [path.join(projectPath, '.sop', '进度.md'), '项目进度', 'sop'],
    [path.join(projectPath, '.sop', '设计决定.md'), '设计决定', 'sop'],
    [path.join(projectPath, '.sop', '验收.md'), '验收记录', 'sop'],
    [path.join(projectPath, 'README.md'), 'README', 'doc'],
    [path.join(projectPath, 'AGENTS.md'), '项目规则', 'doc'],
  ];

  for (const [fullPath, label, kind] of checkList) {
    if (fs.existsSync(fullPath)) {
      docs.push({ label, path: fullPath, kind });
    }
  }

  // Look for latest HTML QA / diagnosis dashboard reports in root or docs/ or acceptance/
  for (const sub of ['', 'docs', 'acceptance', 'outputs']) {
    const dir = sub ? path.join(projectPath, sub) : projectPath;
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const html = entries
        .filter((e) => e.isFile() && e.name.endsWith('.html') && !e.name.startsWith('__') && e.name !== 'index.html')
        .sort((a, b) => {
          const sa = fs.statSync(path.join(dir, a.name)).mtimeMs;
          const sb = fs.statSync(path.join(dir, b.name)).mtimeMs;
          return sb - sa;
        })[0];
      if (html) {
        docs.push({
          label: html.name.includes('诊断') ? '诊断看板' : 'QA 报告',
          path: path.join(dir, html.name),
          kind: 'report',
        });
        break;
      }
    } catch {
      // ignore
    }
  }

  return docs.slice(0, 6);
}

export async function getProjectTelemetry(projectPath: string): Promise<ProjectTelemetry> {
  let scriptFiles = 0;
  let scriptLines = 0;
  let scriptBytes = 0;
  let imageFiles = 0;
  let imageBytes = 0;
  let modelFiles = 0;
  let modelBytes = 0;
  let audioFiles = 0;
  let audioBytes = 0;
  let otherBytes = 0;

  // Walk project assets & scripts cleanly (bounded depth/count for snappy <50ms speed)
  let visited = 0;
  const MAX_FILES = 3500;

  function walk(dir: string, depth: number) {
    if (depth > 6 || visited >= MAX_FILES || !fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (visited >= MAX_FILES) break;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        walk(path.join(dir, e.name), depth + 1);
      } else if (e.isFile()) {
        visited++;
        const full = path.join(dir, e.name);
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        const ext = path.extname(e.name).toLowerCase();
        if (ext === '.lua' || ext === '.ts' || ext === '.tsx' || ext === '.js') {
          scriptFiles++;
          scriptBytes += size;
          if (size < 600_000) {
            try {
              const txt = fs.readFileSync(full, 'utf-8');
              scriptLines += txt.split('\n').length;
            } catch {
              // ignore
            }
          }
        } else if (IMG_EXTS.has(ext)) {
          imageFiles++;
          imageBytes += size;
        } else if (MODEL_EXTS.has(ext)) {
          modelFiles++;
          modelBytes += size;
        } else if (AUDIO_EXTS.has(ext)) {
          audioFiles++;
          audioBytes += size;
        } else {
          otherBytes += size;
        }
      }
    }
  }

  walk(projectPath, 0);

  // Build 14-day daily commit counts
  const commitDates = await runGitLogDates(projectPath);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daily14: { dateLabel: string; count: number; isToday: boolean }[] = [];

  for (let i = 13; i >= 0; i--) {
    const dayMs = todayStart - i * 86_400_000;
    const d = new Date(dayMs);
    const label = i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`;
    daily14.push({ dateLabel: label, count: 0, isToday: i === 0 });
  }

  for (const iso of commitDates) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((todayStart - dayStart) / 86_400_000);
    if (diffDays >= 0 && diffDays < 14) {
      daily14[13 - diffDays].count += 1;
    }
  }

  const commits14d = daily14.reduce((s, x) => s + x.count, 0);
  const activeDays14d = daily14.filter((x) => x.count > 0).length;

  const ad = readAdConfig(projectPath);
  const docs = discoverQuickDocs(projectPath);

  return {
    scriptFiles,
    scriptLines,
    scriptBytes,
    imageFiles,
    imageBytes,
    modelFiles,
    modelBytes,
    audioFiles,
    audioBytes,
    totalAssetBytes: scriptBytes + imageBytes + modelBytes + audioBytes + otherBytes,
    adEnabled: ad.enabled,
    adSpaceCount: ad.count,
    daily14,
    commits14d,
    activeDays14d,
    quickDocs: docs,
  };
}
