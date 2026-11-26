import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { extractSemver } from './gitEngine';
import { scanAllProjects } from './scanner';
import { HubStore } from './store';
import { HeatmapCell, StudioActivityItem, StudioPulseData } from './types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function cleanShortTitle(subject: string): string {
  let s = subject.trim();
  s = s.replace(/^(feat|fix|chore|refactor|style|perf|docs|test|build)(\([^)]*\))?:\s*/i, '');
  s = s.replace(/[（(][^）)]{18,}[）)]/g, '').trim();
  if (s.length > 42) return s.slice(0, 41) + '…';
  return s || subject.slice(0, 42);
}

function detectActivityKind(subject: string, ver: string | null): StudioActivityItem['kind'] {
  if (ver) return 'version';
  if (/^(fix|bug)|修复|修正|解决|根治|消除|屏蔽/i.test(subject)) return 'fix';
  if (/^(feat)|新增|加入|上线|重做|扩建|实装|add /i.test(subject)) return 'feat';
  if (/^(perf|refactor|chore|style)|优化|精简|打磨|QA|体检|验收|拆分|调整/i.test(subject)) return 'opt';
  return 'normal';
}

function readRepoRecentCommits(
  repoPath: string
): Promise<{ hash: string; shortHash: string; date: string; subject: string }[]> {
  return new Promise((resolve) => {
    if (!fs.existsSync(path.join(repoPath, '.git'))) {
      resolve([]);
      return;
    }
    execFile(
      'git',
      [
        '-c',
        'core.quotepath=false',
        '-c',
        'i18n.logOutputEncoding=utf-8',
        'log',
        '--since=145 days ago',
        '--format=%H%x1f%h%x1f%aI%x1f%s',
        '-n',
        '260',
      ],
      { cwd: repoPath, timeout: 6000, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        const items = stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => {
            const [hash, shortHash, date, subject] = line.split('\x1f');
            return {
              hash: hash || '',
              shortHash: shortHash || '',
              date: date || '',
              subject: subject || '',
            };
          });
        resolve(items);
      }
    );
  });
}

export async function getStudioPulse(store: HubStore): Promise<StudioPulseData> {
  const all = await scanAllProjects(store);
  const activeGit = all.filter((p) => !p.archived && p.git.isGit);

  // Build 140-day (20 full weeks, aligned so last cell is today) grid
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const DAYS = 140;

  const cellMap = new Map<string, { cell: HeatmapCell; gameCounts: Map<string, number> }>();
  const orderedKeys: string[] = [];

  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(todayStart.getTime() - i * 86_400_000);
    const key = toDateKey(d);
    const label = i === 0 ? '今天' : `${d.getMonth() + 1}月${d.getDate()}日`;
    orderedKeys.push(key);
    cellMap.set(key, {
      cell: { dateKey: key, label, count: 0, games: [] },
      gameCounts: new Map<string, number>(),
    });
  }

  const perRepoLogs = await Promise.all(
    activeGit.map(async (p) => ({
      project: p,
      commits: await readRepoRecentCommits(p.path),
    }))
  );

  const activityPool: StudioActivityItem[] = [];
  const gameTotals: { id: string; name: string; commits: number; coverPath: string | null }[] = [];

  for (const { project, commits } of perRepoLogs) {
    let repoInWindow = 0;

    for (const c of commits) {
      const dt = new Date(c.date);
      if (Number.isNaN(dt.getTime())) continue;
      const key = toDateKey(dt);
      const bucket = cellMap.get(key);
      if (bucket) {
        bucket.cell.count += 1;
        bucket.gameCounts.set(project.name, (bucket.gameCounts.get(project.name) || 0) + 1);
        repoInWindow += 1;
      }

      // Skip noisy cloud sync commits in global human activity feed
      if (/^\[\d+\]\s*sync at|commit cloud/i.test(c.subject)) continue;

      const ver = extractSemver(c.subject);
      activityPool.push({
        id: `${project.id}-${c.hash}`,
        projectId: project.id,
        projectName: project.name,
        coverPath: project.coverPath,
        hash: c.hash,
        shortHash: c.shortHash,
        date: c.date,
        title: cleanShortTitle(c.subject),
        version: ver,
        kind: detectActivityKind(c.subject, ver),
      });
    }

    if (repoInWindow > 0) {
      gameTotals.push({
        id: project.id,
        name: project.name,
        commits: repoInWindow,
        coverPath: project.coverPath,
      });
    }
  }

  let totalCommits140d = 0;
  let activeDays140d = 0;
  let bestDayCount = 0;
  let bestDayLabel = '--';
  let longestStreak = 0;
  let runningStreak = 0;

  const heatmap: HeatmapCell[] = orderedKeys.map((key) => {
    const entry = cellMap.get(key)!;
    const cell = entry.cell;
    cell.games = Array.from(entry.gameCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    totalCommits140d += cell.count;
    if (cell.count > 0) {
      activeDays140d += 1;
      runningStreak += 1;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
      if (cell.count > bestDayCount) {
        bestDayCount = cell.count;
        bestDayLabel = cell.label;
      }
    } else {
      runningStreak = 0;
    }
    return cell;
  });

  // Current streak (counting backwards from today; allow today=0 if yesterday was active)
  let currentStreak = 0;
  let idx = heatmap.length - 1;
  if (idx >= 0 && heatmap[idx].count === 0) idx -= 1;
  while (idx >= 0 && heatmap[idx].count > 0) {
    currentStreak += 1;
    idx -= 1;
  }

  activityPool.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  gameTotals.sort((a, b) => b.commits - a.commits);

  return {
    heatmap,
    totalCommits140d,
    currentStreak,
    longestStreak,
    activeDays140d,
    bestDayCount,
    bestDayLabel,
    topGames: gameTotals.slice(0, 8),
    recentActivity: activityPool.slice(0, 36),
  };
}
