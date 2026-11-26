import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  CommitDetailData,
  CommitFileStat,
  DirtyFileItem,
  GitGraphCommit,
  GitGraphData,
  GitGraphEdge,
  GitRefBadge,
  GitSummary,
} from './types';

function runGit(cwd: string, args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-c', 'core.quotepath=false', '-c', 'i18n.logOutputEncoding=utf-8', ...args],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      },
      (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout || '');
        }
      }
    );
  });
}

export function extractSemver(text: string): string | null {
  if (!text) return null;
  // Match v1.2.3, V2.0, v1.0.12, 1.8.0 (preferring explicit v/V prefix first)
  const vMatch = text.match(/(?:^|[\s(（【:：/\-_])([vV]\d+\.\d+(?:\.\d+)?)(?=$|[\s)）】:：/\-_，。、])/);
  if (vMatch) {
    return vMatch[1].replace(/^V/, 'v');
  }
  const looseV = text.match(/\b([vV]\d+\.\d+(?:\.\d+)?)\b/);
  if (looseV) {
    return looseV[1].replace(/^V/, 'v');
  }
  return null;
}

export function normalizeVersionTuple(ver: string | null | undefined): [number, number, number] | null {
  if (!ver) return null;
  const clean = ver.trim().replace(/^[vV]/, '');
  const parts = clean.split('.').map((n) => parseInt(n, 10));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2] ?? 0];
}

export function versionsDiffer(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = normalizeVersionTuple(a);
  const tb = normalizeVersionTuple(b);
  if (!ta || !tb) return false;
  return ta[0] !== tb[0] || ta[1] !== tb[1] || ta[2] !== tb[2];
}

function makeShortCommitTitle(subject: string): string {
  let clean = subject.trim();
  // Strip verbose sync timestamps like [1794806197328] sync at 2026/11/16 13:16:37
  const syncMatch = clean.match(/^\[\d+\]\s*sync at\s*(.+)$/i);
  if (syncMatch) {
    return `云端同步 · ${syncMatch[1]}`;
  }
  // Remove conventional prefix for cleaner display, keep concise essence
  clean = clean.replace(/^(feat|fix|chore|refactor|style|perf|docs|test|build)(\([^)]*\))?:\s*/i, '');
  // Remove long parenthetical details at the end for card/graph brevity
  clean = clean.replace(/[（(][^）)]{18,}[）)]/g, '').trim();
  if (clean.length > 44) {
    return clean.slice(0, 43) + '…';
  }
  return clean || subject.slice(0, 43);
}

export async function getGitSummary(repoPath: string): Promise<GitSummary> {
  const empty: GitSummary = {
    isGit: false,
    branch: '',
    hasRemote: false,
    ahead: 0,
    behind: 0,
    dirtyCount: 0,
    dirtyFiles: [],
    totalCommits: 0,
    lastCommitHash: '',
    lastCommitShort: '',
    lastCommitDate: '',
    lastCommitSubject: '',
    detectedGitVersion: null,
    branches: [],
  };

  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    return empty;
  }

  try {
    const [statusOut, logOut, countOut, remoteOut, branchOut] = await Promise.all([
      runGit(repoPath, ['status', '--porcelain=v1', '-b']).catch(() => ''),
      runGit(repoPath, ['log', '-n', '8', '--format=%H%x1f%h%x1f%aI%x1f%s']).catch(() => ''),
      runGit(repoPath, ['rev-list', '--count', 'HEAD']).catch(() => '0'),
      runGit(repoPath, ['remote']).catch(() => ''),
      runGit(repoPath, ['branch', '--format=%(refname:short)']).catch(() => ''),
    ]);

    const statusLines = statusOut.split(/\r?\n/).filter(Boolean);
    let branch = 'main';
    let ahead = 0;
    let behind = 0;
    const dirtyFiles: DirtyFileItem[] = [];

    for (const line of statusLines) {
      if (line.startsWith('## ')) {
        const header = line.slice(3);
        const branchMatch = header.match(/^([^\s.]+)/);
        if (branchMatch) branch = branchMatch[1];
        const aheadMatch = header.match(/ahead (\d+)/);
        const behindMatch = header.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
      } else if (line.length >= 3) {
        const code = line.slice(0, 2).trim() || '?';
        const filePath = line.slice(3).trim().replace(/^"|"$/g, '');
        const simpleCode = code.includes('?') ? '?' : code.includes('D') ? 'D' : code.includes('A') ? 'A' : code.includes('R') ? 'R' : 'M';
        dirtyFiles.push({ status: simpleCode, path: filePath });
      }
    }

    const logLines = logOut.split(/\r?\n/).filter(Boolean);
    let lastCommitHash = '';
    let lastCommitShort = '';
    let lastCommitDate = '';
    let lastCommitSubject = '';
    let detectedGitVersion: string | null = null;

    logLines.forEach((line, idx) => {
      const [h, sh, dt, subj] = line.split('\x1f');
      if (idx === 0) {
        lastCommitHash = h || '';
        lastCommitShort = sh || '';
        lastCommitDate = dt || '';
        lastCommitSubject = subj || '';
      }
      if (!detectedGitVersion && subj) {
        const v = extractSemver(subj);
        if (v) detectedGitVersion = v;
      }
    });

    const remotes = remoteOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const branches = branchOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    return {
      isGit: true,
      branch,
      hasRemote: remotes.length > 0,
      ahead,
      behind,
      dirtyCount: dirtyFiles.length,
      dirtyFiles: dirtyFiles.slice(0, 80),
      totalCommits: parseInt(countOut.trim(), 10) || 0,
      lastCommitHash,
      lastCommitShort,
      lastCommitDate,
      lastCommitSubject,
      detectedGitVersion,
      branches,
    };
  } catch {
    return empty;
  }
}

function parseRefs(decorateStr: string): { refs: GitRefBadge[]; isHead: boolean; tagVersion: string | null } {
  const refs: GitRefBadge[] = [];
  let isHead = false;
  let tagVersion: string | null = null;

  if (!decorateStr.trim()) return { refs, isHead, tagVersion };

  const tokens = decorateStr.split(',').map((s) => s.trim()).filter(Boolean);
  for (const tok of tokens) {
    if (tok.startsWith('HEAD -> ')) {
      isHead = true;
      refs.push({ name: tok.replace('HEAD -> ', '').trim(), kind: 'head' });
    } else if (tok === 'HEAD') {
      isHead = true;
      refs.push({ name: 'HEAD', kind: 'head' });
    } else if (tok.startsWith('tag: ')) {
      const tagName = tok.replace('tag: ', '').trim();
      refs.push({ name: tagName, kind: 'tag' });
      const v = extractSemver(tagName);
      if (v) tagVersion = v;
    } else if (tok.includes('/')) {
      if (!tok.endsWith('/HEAD')) {
        refs.push({ name: tok, kind: 'remote' });
      }
    } else {
      refs.push({ name: tok, kind: 'branch' });
    }
  }
  return { refs, isHead, tagVersion };
}

export async function getGitGraph(repoPath: string, limit = 100): Promise<GitGraphData> {
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    return { isGit: false, maxLane: 0, branches: [], commits: [] };
  }

  try {
    const [logOut, branchOut] = await Promise.all([
      runGit(repoPath, [
        'log',
        '--all',
        '--topo-order',
        '--decorate=short',
        `--format=%H%x1f%h%x1f%P%x1f%D%x1f%aI%x1f%an%x1f%s`,
        '-n',
        String(limit),
      ]),
      runGit(repoPath, ['branch', '-a', '--format=%(refname:short)']).catch(() => ''),
    ]);

    const rawLines = logOut.split(/\r?\n/).filter(Boolean);
    const rawCommits = rawLines.map((line) => {
      const [hash, shortHash, parentsStr, decStr, date, author, subject] = line.split('\x1f');
      const parents = (parentsStr || '').split(' ').map((p) => p.trim()).filter(Boolean);
      const { refs, isHead, tagVersion } = parseRefs(decStr || '');
      const detectedVersion = tagVersion || extractSemver(subject || '');
      const isMerge = parents.length > 1;
      return {
        hash: hash || '',
        shortHash: shortHash || '',
        parents,
        refs,
        date: date || '',
        author: author || '',
        fullSubject: subject || '',
        shortTitle: makeShortCommitTitle(subject || ''),
        detectedVersion,
        isHead,
        isMerge,
      };
    });

    const hashToIndex = new Map<string, number>();
    rawCommits.forEach((c, i) => hashToIndex.set(c.hash, i));

    // Classic multi-lane DAG lane allocation
    const activeLanes: (string | null)[] = [];
    const laneColorMap: number[] = [];
    let nextColor = 0;
    let maxLane = 0;

    const assignedLanes: number[] = [];
    const assignedColors: number[] = [];

    for (let i = 0; i < rawCommits.length; i++) {
      const c = rawCommits[i];
      let lane = activeLanes.indexOf(c.hash);
      if (lane === -1) {
        lane = activeLanes.indexOf(null);
        if (lane === -1) {
          lane = activeLanes.length;
          activeLanes.push(c.hash);
          laneColorMap.push(nextColor++);
        } else {
          activeLanes[lane] = c.hash;
          laneColorMap[lane] = nextColor++;
        }
      }

      const colorIndex = laneColorMap[lane] ?? lane;
      assignedLanes.push(lane);
      assignedColors.push(colorIndex);
      if (lane > maxLane) maxLane = lane;

      // Clear any duplicate lanes waiting for this same hash
      for (let l = 0; l < activeLanes.length; l++) {
        if (l !== lane && activeLanes[l] === c.hash) {
          activeLanes[l] = null;
        }
      }

      // Advance lane to first parent, allocate lanes for additional parents
      if (c.parents.length === 0) {
        activeLanes[lane] = null;
      } else {
        const firstParent = c.parents[0];
        const existingFirst = activeLanes.indexOf(firstParent);
        if (existingFirst !== -1 && existingFirst !== lane) {
          activeLanes[lane] = null;
        } else {
          activeLanes[lane] = firstParent;
        }

        for (let pIdx = 1; pIdx < c.parents.length; pIdx++) {
          const pHash = c.parents[pIdx];
          if (activeLanes.indexOf(pHash) === -1) {
            let free = activeLanes.indexOf(null);
            if (free === -1) {
              free = activeLanes.length;
              activeLanes.push(pHash);
              laneColorMap.push(nextColor++);
            } else {
              activeLanes[free] = pHash;
              laneColorMap[free] = nextColor++;
            }
            if (free > maxLane) maxLane = free;
          }
        }
      }
    }

    const commits: GitGraphCommit[] = rawCommits.map((c, i) => {
      const lane = assignedLanes[i];
      const colorIndex = assignedColors[i];
      const edges: GitGraphEdge[] = [];

      c.parents.forEach((pHash, pIdx) => {
        const toIndex = hashToIndex.get(pHash);
        if (toIndex !== undefined) {
          const toLane = assignedLanes[toIndex];
          const edgeColor = pIdx === 0 ? colorIndex : assignedColors[toIndex];
          edges.push({
            fromLane: lane,
            toLane,
            toIndex,
            colorIndex: edgeColor,
            isMerge: pIdx > 0 || lane !== toLane,
          });
        }
      });

      const isMilestone =
        c.isHead ||
        c.isMerge ||
        Boolean(c.detectedVersion) ||
        c.refs.some((r) => r.kind === 'tag' || r.kind === 'branch') ||
        i === rawCommits.length - 1;

      return {
        ...c,
        isMilestone,
        lane,
        colorIndex,
        edges,
      };
    });

    const branches = branchOut
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.endsWith('/HEAD'));

    return {
      isGit: true,
      maxLane,
      branches,
      commits,
    };
  } catch {
    return { isGit: false, maxLane: 0, branches: [], commits: [] };
  }
}

export async function getCommitDetail(repoPath: string, hash: string): Promise<CommitDetailData | null> {
  if (!/^[0-9a-f]{6,40}$/i.test(hash)) return null;
  try {
    const out = await runGit(repoPath, [
      'show',
      '--numstat',
      '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1e',
      hash,
    ]);
    const [metaPart, filesPart] = out.split('\x1e');
    const [fullHash, shortHash, author, date, subject, body] = (metaPart || '').split('\x1f');
    const files: CommitFileStat[] = [];
    let totalAdded = 0;
    let totalDeleted = 0;

    for (const line of (filesPart || '').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('\t');
      if (parts.length >= 3) {
        const binary = parts[0] === '-' || parts[1] === '-';
        const added = binary ? 0 : parseInt(parts[0], 10) || 0;
        const deleted = binary ? 0 : parseInt(parts[1], 10) || 0;
        totalAdded += added;
        totalDeleted += deleted;
        files.push({
          path: parts.slice(2).join('\t'),
          added,
          deleted,
          binary,
        });
      }
    }

    return {
      hash: (fullHash || hash).trim(),
      shortHash: (shortHash || hash.slice(0, 7)).trim(),
      author: (author || '').trim(),
      date: (date || '').trim(),
      subject: (subject || '').trim(),
      body: (body || '').trim(),
      files,
      totalAdded,
      totalDeleted,
    };
  } catch {
    return null;
  }
}
