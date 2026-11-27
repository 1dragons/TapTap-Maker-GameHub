import { discoverProjectFolders, scanSingleProject } from './scanner';
import { HubStore } from './store';
import {
  TapTapStatsBatchProgress,
  TapTapStatsBatchResult,
  TapTapStatsFetchResult,
  TapTapStatsHistoryPoint,
  TapTapStatsSnapshot,
} from './types';

const TAPTAP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TAPTAP_X_UA = encodeURIComponent(
  'V=1&PN=WebApp&LANG=zh_CN&VN_CODE=102&LOC=CN&PLT=PC&DS=Android&UID=00000000-0000-4000-8000-000000000000&DT=PC&OS=Windows&OSV=10'
);

const MAX_HISTORY_DAYS = 60;
const MANUAL_COOLDOWN_MS = 4000;
const BATCH_MIN_DELAY_MS = 1100;
const BATCH_JITTER_MS = 600;

let batchSyncRunning = false;
const lastFetchTsByAppId = new Map<string, number>();

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseChineseCompactNumber(raw: string): number {
  const cleaned = String(raw || '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return 0;
  const m = cleaned.match(/^(\d+(?:\.\d+)?)(亿|万)?$/);
  if (!m) return 0;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return 0;
  if (m[2] === '亿') return Math.round(base * 100_000_000);
  if (m[2] === '万') return Math.round(base * 10_000);
  return Math.round(base);
}

interface RawParsedStats {
  heat: number;
  fans: number;
  reserve?: number;
  reviewCount?: number;
  score?: string;
}

function normalizeScore(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s || s === '0' || s === '0.0' || s === '--') return undefined;
  return s;
}

/**
 * Extract exact integer heat (hits_total) & followers (fans_count) from TapTap SSR __NUXT_DATA__ payload.
 * TapTap Maker mini-games expose exact heat inside SSR __NUXT_DATA__ even when webapiv2 detail-by-id returns 0.
 */
function parseNuxtDataStats(html: string, appId: string): RawParsedStats | null {
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;

  let arr: any[];
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return null;
    arr = parsed;
  } catch {
    return null;
  }

  const resolveVal = (v: any, depth = 0): any => {
    if (depth > 4) return v;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < arr.length) {
      return arr[v];
    }
    return v;
  };

  const extractFromStatObj = (statObj: any): RawParsedStats | null => {
    if (!statObj || typeof statObj !== 'object' || Array.isArray(statObj)) return null;
    if (!('fans_count' in statObj) && !('hits_total' in statObj) && !('hits_total_val' in statObj)) {
      return null;
    }
    const hitsTotalVal = Number(resolveVal(statObj.hits_total_val)) || 0;
    const hitsTotal = Number(resolveVal(statObj.hits_total)) || 0;
    const playTotal = Number(resolveVal(statObj.play_total)) || 0;
    const fansCount = Number(resolveVal(statObj.fans_count)) || 0;
    const reserveCount = Number(resolveVal(statObj.reserve_count)) || 0;
    const reviewCount = Number(resolveVal(statObj.review_count)) || 0;
    const ratingObj = resolveVal(statObj.rating);
    const score =
      ratingObj && typeof ratingObj === 'object'
        ? normalizeScore(resolveVal(ratingObj.score))
        : undefined;

    return {
      heat: hitsTotalVal || hitsTotal || playTotal || 0,
      fans: fansCount,
      reserve: reserveCount > 0 ? reserveCount : undefined,
      reviewCount: reviewCount > 0 ? reviewCount : undefined,
      score,
    };
  };

  const targetNumId = Number(appId);

  // Pass 1: Strictly match the main app object whose resolved `id` === appId
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && typeof item === 'object' && !Array.isArray(item) && 'id' in item && 'stat' in item) {
      const resolvedId = Number(resolveVal(item.id));
      if (resolvedId === targetNumId) {
        const statObj = resolveVal(item.stat);
        const extracted = extractFromStatObj(statObj);
        if (extracted) return extracted;
      }
    }
  }

  // Pass 2: Fallback to first stat-shaped object containing fans_count + hits_total/reserve_count
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      'fans_count' in item &&
      ('hits_total' in item || 'hits_total_val' in item || 'reserve_count' in item)
    ) {
      const extracted = extractFromStatObj(item);
      if (extracted) return extracted;
    }
  }

  return null;
}

/**
 * Fallback DOM parser if __NUXT_DATA__ format ever changes on TapTap web pages.
 */
function parseHtmlBasicInfoStats(html: string): RawParsedStats | null {
  const heatMatch = html.match(
    />热度<\/span>[\s\S]{0,180}?class="app-basic-info__value"[^>]*>([^<]+)</i
  );
  const fansMatch = html.match(
    />关注<\/span>[\s\S]{0,180}?class="app-basic-info__value"[^>]*>([^<]+)</i
  );
  if (!heatMatch && !fansMatch) return null;

  const heat = heatMatch ? parseChineseCompactNumber(heatMatch[1]) : 0;
  const fans = fansMatch ? parseChineseCompactNumber(fansMatch[1]) : 0;
  return { heat, fans };
}

function isLikelyWafHtml(html: string): boolean {
  const lower = html.slice(0, 6000).toLowerCase();
  if (lower.includes('__nuxt_data__') || lower.includes('app-basic-info')) return false;
  return (
    lower.includes('aliyun_waf') ||
    lower.includes('captcha') ||
    lower.includes('verify') ||
    lower.includes('安全验证') ||
    lower.includes('访问过于频繁') ||
    lower.includes('人机验证')
  );
}

async function fetchStatsFromApiFallback(
  appId: string,
  timeoutMs = 10000
): Promise<{ ok: boolean; raw?: RawParsedStats; rateLimited?: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://www.taptap.cn/webapiv2/app/v2/detail-by-id/${appId}?X-UA=${TAPTAP_X_UA}`;
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': TAPTAP_USER_AGENT,
        Referer: `https://www.taptap.cn/app/${appId}`,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    if (res.status === 429 || res.status === 403) {
      return {
        ok: false,
        rateLimited: true,
        error: 'TapTap 触发临时频率限制，已自动停止本次拉取，请稍后再试',
      };
    }
    if (res.status === 404) {
      return { ok: false, error: '该游戏尚未公开上架，暂无公开热度与关注数据' };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    if (/^\s*</.test(text)) {
      return {
        ok: false,
        rateLimited: true,
        error: 'TapTap 触发临时频率保护，已自动暂停拉取，请稍后再试',
      };
    }
    const json = JSON.parse(text);
    const stat = json?.data?.stat;
    if (!stat || typeof stat !== 'object') {
      return { ok: false, error: '未获取到该游戏的公开统计数据' };
    }
    const heat =
      Number(stat.hits_total_val || 0) ||
      Number(stat.hits_total || 0) ||
      Number(stat.play_total || 0) ||
      0;
    const fans = Number(stat.fans_count || 0) || 0;
    const reserve = Number(stat.reserve_count || 0) || 0;
    const reviewCount = Number(stat.review_count || 0) || 0;
    const score = normalizeScore(stat.rating?.score);
    return {
      ok: true,
      raw: {
        heat,
        fans,
        reserve: reserve > 0 ? reserve : undefined,
        reviewCount: reviewCount > 0 ? reviewCount : undefined,
        score,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.name === 'AbortError' ? '连接 TapTap 超时' : err?.message || '网络请求失败',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTapTapAppStats(
  appIdInput: string | number,
  timeoutMs = 12000
): Promise<{ ok: boolean; raw?: RawParsedStats; rateLimited?: boolean; error?: string }> {
  const appId = String(appIdInput || '').trim();
  if (!appId || !/^\d+$/.test(appId)) {
    return { ok: false, error: '当前项目缺少有效的 TapTap AppID' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://www.taptap.cn/app/${appId}`, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': TAPTAP_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    if (res.status === 429 || res.status === 403) {
      return {
        ok: false,
        rateLimited: true,
        error: 'TapTap 触发临时频率限制，已自动停止拉取以保护 IP，请稍后再试',
      };
    }
    if (res.status === 404) {
      return { ok: false, error: '该游戏尚未公开上架，暂无公开热度与关注数据' };
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    if (isLikelyWafHtml(html)) {
      return {
        ok: false,
        rateLimited: true,
        error: 'TapTap 触发临时频率保护，已自动暂停本次拉取，请稍后再试',
      };
    }

    const parsed = parseNuxtDataStats(html, appId) || parseHtmlBasicInfoStats(html);
    if (parsed) {
      return { ok: true, raw: parsed };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: '连接 TapTap 超时，请稍后重试' };
    }
  } finally {
    clearTimeout(timer);
  }

  // Fallback only if SSR HTML did not contain parseable stats (and was not rate-limited)
  return fetchStatsFromApiFallback(appId, timeoutMs);
}

export function mergeTapTapStatsSnapshot(
  appId: string,
  fresh: RawParsedStats,
  existing?: TapTapStatsSnapshot | null
): TapTapStatsSnapshot {
  const nowIso = new Date().toISOString();
  const todayKey = getLocalDateKey();

  const existingHistory: TapTapStatsHistoryPoint[] =
    existing && existing.appId === appId && Array.isArray(existing.history)
      ? existing.history.filter((pt) => pt && typeof pt.dateKey === 'string')
      : [];

  const byDate = new Map<string, TapTapStatsHistoryPoint>();
  for (const pt of existingHistory) {
    byDate.set(pt.dateKey, pt);
  }

  byDate.set(todayKey, {
    dateKey: todayKey,
    heat: fresh.heat,
    fans: fresh.fans,
    reserve: fresh.reserve,
    score: fresh.score,
    fetchedAt: nowIso,
  });

  const sortedHistory = Array.from(byDate.values())
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-MAX_HISTORY_DAYS);

  // Pick the most recent snapshot strictly BEFORE today for accurate "较昨日 +N" delta
  let prevPoint: TapTapStatsHistoryPoint | undefined;
  for (let i = sortedHistory.length - 1; i >= 0; i--) {
    if (sortedHistory[i].dateKey < todayKey) {
      prevPoint = sortedHistory[i];
      break;
    }
  }

  return {
    appId,
    heat: fresh.heat,
    fans: fresh.fans,
    reserve: fresh.reserve,
    reviewCount: fresh.reviewCount,
    score: fresh.score,
    fetchedAt: nowIso,
    lastDateKey: todayKey,
    prevHeat: prevPoint ? prevPoint.heat : undefined,
    prevFans: prevPoint ? prevPoint.fans : undefined,
    history: sortedHistory,
  };
}

export async function syncSingleProjectTapTapStats(
  store: HubStore,
  projectPath: string,
  appIdInput: string | number,
  options: { force?: boolean } = {}
): Promise<TapTapStatsFetchResult> {
  const appId = String(appIdInput || '').trim();
  if (!appId || !/^\d+$/.test(appId)) {
    return { ok: false, error: '当前项目缺少有效的 TapTap AppID' };
  }

  const existing = store.getTapTapStats(projectPath);
  const todayKey = getLocalDateKey();

  if (!options.force && existing && existing.appId === appId && existing.lastDateKey === todayKey) {
    return { ok: true, data: existing, skipped: true };
  }

  // Gentle anti-spam cooldown when user rapidly clicks refresh on the exact same app
  const lastHit = lastFetchTsByAppId.get(appId) || 0;
  if (Date.now() - lastHit < MANUAL_COOLDOWN_MS && existing && existing.appId === appId) {
    return { ok: true, data: existing, skipped: true };
  }
  lastFetchTsByAppId.set(appId, Date.now());

  const res = await fetchTapTapAppStats(appId);
  if (!res.ok || !res.raw) {
    return {
      ok: false,
      rateLimited: res.rateLimited,
      error: res.error || '拉取热度与关注失败',
    };
  }

  const snapshot = mergeTapTapStatsSnapshot(appId, res.raw, existing);
  const saved = store.saveTapTapStats(projectPath, snapshot);
  return { ok: true, data: saved };
}

export async function syncAllProjectsTapTapStats(
  store: HubStore,
  options: { force?: boolean } = {},
  onProgress?: (p: TapTapStatsBatchProgress) => void
): Promise<TapTapStatsBatchResult> {
  if (batchSyncRunning) {
    return {
      ok: true,
      totalTargets: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      error: '热度与关注同步正在进行中，请稍候',
    };
  }

  batchSyncRunning = true;
  try {
    const roots = store.getState().roots;
    const folders = discoverProjectFolders(roots).filter(
      (f) => !store.getProjectMeta(f.path).removed
    );

    const targets: { path: string; name: string; appId: string; alreadyToday: boolean }[] = [];
    const todayKey = getLocalDateKey();

    for (const folder of folders) {
      const card = await scanSingleProject(folder, store);
      if (card.archived) continue;
      const appId = card.taptap.appId ? String(card.taptap.appId).trim() : '';
      if (!appId || !/^\d+$/.test(appId)) continue;
      const existing = store.getTapTapStats(card.path);
      const alreadyToday = Boolean(
        existing && existing.appId === appId && existing.lastDateKey === todayKey
      );
      targets.push({
        path: card.path,
        name: card.name,
        appId,
        alreadyToday,
      });
    }

    const queue = options.force ? targets : targets.filter((t) => !t.alreadyToday);
    const skipped = targets.length - queue.length;

    if (queue.length === 0) {
      return {
        ok: true,
        totalTargets: targets.length,
        updated: 0,
        skipped,
        failed: 0,
      };
    }

    let updated = 0;
    let failed = 0;
    let rateLimited = false;
    let lastError: string | undefined;

    for (let i = 0; i < queue.length; i++) {
      const target = queue[i];
      if (i > 0) {
        const delayMs = BATCH_MIN_DELAY_MS + Math.floor(Math.random() * BATCH_JITTER_MS);
        await sleep(delayMs);
      }

      const res = await syncSingleProjectTapTapStats(store, target.path, target.appId, {
        force: true,
      });

      if (res.ok && res.data) {
        updated += 1;
        onProgress?.({
          current: i + 1,
          total: queue.length,
          projectPath: target.path,
          projectName: target.name,
          stats: res.data,
        });
      } else {
        failed += 1;
        lastError = res.error;
        onProgress?.({
          current: i + 1,
          total: queue.length,
          projectPath: target.path,
          projectName: target.name,
          error: res.error,
          rateLimited: res.rateLimited,
        });
        if (res.rateLimited) {
          // Immediately trip circuit breaker to protect user IP!
          rateLimited = true;
          break;
        }
      }
    }

    onProgress?.({
      current: queue.length,
      total: queue.length,
      projectPath: '',
      projectName: '',
      done: true,
      rateLimited,
      error: rateLimited ? lastError : undefined,
    });

    return {
      ok: !rateLimited || updated > 0,
      totalTargets: targets.length,
      updated,
      skipped,
      failed,
      rateLimited,
      error: rateLimited ? lastError : undefined,
    };
  } finally {
    batchSyncRunning = false;
  }
}
