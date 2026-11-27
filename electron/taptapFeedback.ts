import {
  AiConnectionTestResult,
  AiFeedbackIssueItem,
  AiFeedbackSummarizeResult,
  AiFeedbackSummary,
  AiModelsListResult,
  AiProviderConfig,
  AiReasoningEffort,
  FeedbackCategoryId,
  FeedbackCategoryStat,
  TapTapFeedbackFetchResult,
  TapTapFeedbackProgress,
  TapTapFeedbackSnapshot,
  TapTapForumPostItem,
  TapTapRatingSummary,
  TapTapReviewItem,
} from './types';

const TAPTAP_X_UA = encodeURIComponent(
  'V=1&PN=WebApp&LANG=zh_CN&VN_CODE=102&LOC=CN&PLT=PC&DS=Android&UID=00000000-0000-4000-8000-000000000000&DT=PC&OS=Windows&OSV=10'
);

const TAPTAP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategoryId, string> = {
  crash: '闪退/卡死',
  ad: '广告/激励',
  save: '存档/丢档',
  balance: '数值/难度',
  ui: '操作/UI',
  praise: '建议/好评',
  other: '其他反馈',
};

const CATEGORY_RULES: { id: FeedbackCategoryId; pattern: RegExp }[] = [
  {
    id: 'crash',
    pattern:
      /闪退|卡死|黑屏|白屏|进不去|打不开|崩溃|卡顿|掉帧|发烫|转圈|无响应|卡住|动不了|卡关|报错|异常|bug|死机|卡在/i,
  },
  {
    id: 'ad',
    pattern:
      /广告|激励|看视频|弹窗|强制看|跳过|卡广告|没奖励|免广|看不了广告|加载不出广告|广子/i,
  },
  {
    id: 'save',
    pattern:
      /存档|丢档|回档|重置|清零|没保存|数据丢|重新开始|白玩|进度没了|进度丢|云存档/i,
  },
  {
    id: 'balance',
    pattern:
      /太难|太肝|数值|物价|太贵|赚太慢|打不过|没钱|金币|收益|平衡|无聊|后期|重复|内容太少|太短|玩完了|太慢|不够花|太贵了/i,
  },
  {
    id: 'ui',
    pattern:
      /操作|手感|误触|按钮|字太小|看不清|遮挡|界面|ui|适配|刘海|全面屏|音效|音乐|声音|静音|画质|建模|穿模|贴图|视角|灵敏度/i,
  },
  {
    id: 'praise',
    pattern:
      /建议|希望|可以加|能不能加|好玩|上头|不错|挺好|期待|五星|支持|良心|解压|很棒|喜欢|催更|加油|有趣|推荐/i,
  },
];

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function unixToIso(sec: unknown): string {
  const num = Number(sec);
  if (!Number.isFinite(num) || num <= 0) return new Date().toISOString();
  const ms = num > 1e12 ? num : num * 1000;
  return new Date(ms).toISOString();
}

export function classifyFeedbackText(text: string, score?: number): FeedbackCategoryId[] {
  const cleaned = text.trim();
  if (!cleaned) return ['other'];

  const matched: FeedbackCategoryId[] = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(cleaned)) {
      matched.push(rule.id);
    }
  }

  // If a low-star review matched concrete issues AND also says "希望/建议", keep the concrete issues without diluting into pure praise
  if (score !== undefined && score <= 3 && matched.length > 1 && matched.includes('praise')) {
    return matched.filter((c) => c !== 'praise');
  }

  if (matched.length === 0) {
    if (score !== undefined && score >= 4) return ['praise'];
    return ['other'];
  }

  return matched;
}

function buildCategoryStats(
  reviews: TapTapReviewItem[],
  forumPosts: TapTapForumPostItem[]
): FeedbackCategoryStat[] {
  const counts = new Map<FeedbackCategoryId, { count: number; lowStarCount: number }>();
  const allCats: FeedbackCategoryId[] = ['crash', 'ad', 'save', 'balance', 'ui', 'praise', 'other'];
  for (const id of allCats) {
    counts.set(id, { count: 0, lowStarCount: 0 });
  }

  for (const rev of reviews) {
    const isLow = rev.score <= 3;
    for (const c of rev.categories) {
      const entry = counts.get(c);
      if (entry) {
        entry.count += 1;
        if (isLow) entry.lowStarCount += 1;
      }
    }
  }

  for (const post of forumPosts) {
    for (const c of post.categories) {
      const entry = counts.get(c);
      if (entry) {
        entry.count += 1;
      }
    }
  }

  return allCats
    .map((id) => ({
      id,
      label: FEEDBACK_CATEGORY_LABELS[id],
      count: counts.get(id)?.count || 0,
      lowStarCount: counts.get(id)?.lowStarCount || 0,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => {
      // Keep issue categories with higher low-star counts or total counts up front; keep praise/other after issues when tied
      const aIsIssue = a.id !== 'praise' && a.id !== 'other';
      const bIsIssue = b.id !== 'praise' && b.id !== 'other';
      if (aIsIssue !== bIsIssue) return aIsIssue ? -1 : 1;
      return b.count - a.count;
    });
}

async function fetchTapTapJson(url: string, appId: string, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
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
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text();
    if (!contentType.includes('json') && /^\s*</.test(rawText)) {
      throw new Error('TapTap 暂时触发了频率保护，请稍等 1~2 分钟后再点击增量同步');
    }
    let json: any;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error('TapTap 返回了非标准数据（可能触发临时限流），请稍后再试');
    }
    if (json && json.success === false) {
      throw new Error(json?.data?.msg || json?.msg || 'TapTap 接口返回未成功');
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function parseReviewItem(raw: any, appId: string): TapTapReviewItem | null {
  const moment = raw?.moment || raw;
  const rev = moment?.review || raw?.review || {};
  const id = String(moment?.id_str || rev?.id || moment?.id || '');
  if (!id) return null;

  const rawText =
    rev?.contents?.raw_text ||
    rev?.contents?.text ||
    moment?.contents?.raw_text ||
    moment?.contents?.text ||
    '';
  const text = decodeHtmlEntities(String(rawText || ''));
  const score = Math.max(1, Math.min(5, Number(rev?.score || 5)));
  const author = String(moment?.author?.user?.name || 'TapTap 玩家').trim() || 'TapTap 玩家';
  const device = typeof moment?.device === 'string' && moment.device.trim() ? moment.device.trim() : undefined;

  // TapTap played_spent is in seconds (e.g. 1200 = 20 min, 73260 = 1221 min)
  const spentRaw = Number(rev?.played_spent || 0);
  const playedMinutes =
    Number.isFinite(spentRaw) && spentRaw > 0 ? Math.max(1, Math.round(spentRaw / 60)) : undefined;

  const stageLabel =
    typeof rev?.stage_label === 'string' && rev.stage_label.trim() ? rev.stage_label.trim() : undefined;
  const ups = Number(moment?.stat?.ups || rev?.ups || 0) || 0;
  const comments = Number(moment?.stat?.comments || rev?.comments || 0) || 0;
  const createdAt = unixToIso(moment?.created_time || rev?.created_time);
  const url =
    String(moment?.sharing?.url || '').trim() ||
    `https://www.taptap.cn/review/${rev?.id || id}?app_id=${appId}`;

  return {
    id,
    author,
    score,
    text: text || `（仅打分 ${score}★，未留文字）`,
    device,
    playedMinutes,
    stageLabel,
    ups,
    comments,
    createdAt,
    url,
    categories: classifyFeedbackText(text, score),
  };
}

function parseForumPostItem(raw: any): TapTapForumPostItem | null {
  const moment = raw?.moment || raw;
  const id = String(moment?.id_str || moment?.id || '');
  if (!id) return null;

  const topicObj = moment?.topic || moment?.extended_entities?.topics?.[0] || {};
  const rawTitle = String(topicObj?.title || moment?.title || '').trim();
  const rawSummary =
    topicObj?.summary ||
    moment?.contents?.raw_text ||
    moment?.contents?.text ||
    moment?.summary ||
    '';
  const title = decodeHtmlEntities(rawTitle);
  const text = decodeHtmlEntities(String(rawSummary || ''));

  // Skip completely empty non-text feed artifacts (e.g. pure system cards)
  if (!title && !text) return null;

  const userAuthor = String(moment?.author?.user?.name || '').trim();
  const appAuthor = String(moment?.author?.app?.title || '').trim();
  const author = userAuthor || (appAuthor ? `${appAuthor}（官方）` : '论坛玩家');
  const ups = Number(moment?.stat?.ups || 0) || 0;
  const comments = Number(moment?.stat?.comments || 0) || 0;
  const createdAt = unixToIso(moment?.created_time);
  const url = String(moment?.sharing?.url || '').trim() || `https://www.taptap.cn/moment/${id}`;
  const combinedText = `${title}\n${text}`.trim();

  return {
    id,
    author,
    title: title || (text.length > 28 ? `${text.slice(0, 28)}…` : text),
    text: text || title,
    ups,
    comments,
    createdAt,
    url,
    categories: classifyFeedbackText(combinedText),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildNextTapTapUrl(nextPage: string): string {
  const full = nextPage.startsWith('http') ? nextPage : `https://www.taptap.cn${nextPage}`;
  if (/[?&]X-UA=/i.test(full)) return full;
  return `${full}${full.includes('?') ? '&' : '?'}X-UA=${TAPTAP_X_UA}`;
}

interface FetchSyncOptions {
  projectPath?: string;
  existing?: TapTapFeedbackSnapshot | null;
  forceFull?: boolean;
  onProgress?: (p: TapTapFeedbackProgress) => void;
}

const FULL_SYNC_MAX_PAGES = 40; // Up to 400 items per stream (polite paging)
const INCREMENTAL_MAX_PAGES = 25; // Up to 250 new items per delta sync
const PAGE_DELAY_MS = 350;

async function fetchReviewsStream(
  appId: string,
  knownIds: Set<string>,
  incremental: boolean,
  onTick: (fetched: number, total?: number) => void
): Promise<{
  items: TapTapReviewItem[];
  newIds: string[];
  total: number;
  hasMore: boolean;
  partialWarning?: string;
}> {
  const maxPages = incremental ? INCREMENTAL_MAX_PAGES : FULL_SYNC_MAX_PAGES;
  let nextUrl: string | null =
    `https://www.taptap.cn/webapiv2/review/v2/list-by-app?app_id=${appId}&limit=10&from=0&sort=new&X-UA=${TAPTAP_X_UA}`;

  const collected: TapTapReviewItem[] = [];
  const newIds: string[] = [];
  const seenInRun = new Set<string>();
  let total = 0;
  let hasMore = false;
  let partialWarning: string | undefined;
  let consecutiveKnown = 0;

  for (let page = 0; page < maxPages && nextUrl; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);
    let json: any;
    try {
      json = await fetchTapTapJson(nextUrl, appId);
    } catch (err: any) {
      if (collected.length > 0) {
        hasMore = true;
        partialWarning = `评价已保留前 ${collected.length} 条，后续翻页暂停（${err?.message || '频率受限'}）`;
        break;
      }
      throw err;
    }
    const list = Array.isArray(json?.data?.list) ? json.data.list : [];
    if (page === 0) total = Number(json?.data?.total || 0) || 0;

    let pageNewCount = 0;
    let reachedKnownBoundary = false;

    for (const raw of list) {
      const parsed = parseReviewItem(raw, appId);
      if (!parsed || seenInRun.has(parsed.id)) continue;
      seenInRun.add(parsed.id);
      collected.push(parsed);

      if (incremental && knownIds.has(parsed.id)) {
        consecutiveKnown += 1;
        if (consecutiveKnown >= 3) {
          reachedKnownBoundary = true;
          break;
        }
      } else {
        consecutiveKnown = 0;
        pageNewCount += 1;
        newIds.push(parsed.id);
      }
    }

    onTick(incremental ? newIds.length : collected.length, total || undefined);

    const rawNext = typeof json?.data?.next_page === 'string' && json.data.next_page.trim()
      ? json.data.next_page.trim()
      : '';

    if (reachedKnownBoundary || (incremental && pageNewCount === 0)) {
      break;
    }

    if (list.length < 10 || !rawNext) {
      break;
    }

    if (page === maxPages - 1) {
      hasMore = true;
      break;
    }

    nextUrl = buildNextTapTapUrl(rawNext);
  }

  return { items: collected, newIds, total, hasMore, partialWarning };
}

async function fetchForumStream(
  appId: string,
  groupId: string,
  knownIds: Set<string>,
  incremental: boolean,
  onTick: (fetched: number, total?: number) => void
): Promise<{
  items: TapTapForumPostItem[];
  newIds: string[];
  total: number;
  hasMore: boolean;
  partialWarning?: string;
}> {
  const maxPages = incremental ? INCREMENTAL_MAX_PAGES : FULL_SYNC_MAX_PAGES;
  let nextUrl: string | null =
    `https://www.taptap.cn/webapiv2/feed/v7/by-group?group_id=${groupId}&sort=created&limit=10&from=0&X-UA=${TAPTAP_X_UA}`;

  const collected: TapTapForumPostItem[] = [];
  const newIds: string[] = [];
  const seenInRun = new Set<string>();
  let total = 0;
  let hasMore = false;
  let partialWarning: string | undefined;
  let consecutiveKnown = 0;

  for (let page = 0; page < maxPages && nextUrl; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);
    let json: any;
    try {
      json = await fetchTapTapJson(nextUrl, appId);
    } catch (err: any) {
      if (collected.length > 0) {
        hasMore = true;
        partialWarning = `论坛帖子已保留前 ${collected.length} 条，后续翻页暂停（${err?.message || '频率受限'}）`;
        break;
      }
      throw err;
    }
    const list = Array.isArray(json?.data?.list) ? json.data.list : [];
    if (page === 0) total = Number(json?.data?.total || 0) || 0;

    let pageNewCount = 0;
    let reachedKnownBoundary = false;

    for (const raw of list) {
      const parsed = parseForumPostItem(raw);
      if (!parsed || seenInRun.has(parsed.id)) continue;
      seenInRun.add(parsed.id);
      collected.push(parsed);

      if (incremental && knownIds.has(parsed.id)) {
        consecutiveKnown += 1;
        // Require 3 consecutive known items so 1-2 pinned official posts at top never cause early stop
        if (consecutiveKnown >= 3) {
          reachedKnownBoundary = true;
          break;
        }
      } else {
        consecutiveKnown = 0;
        pageNewCount += 1;
        newIds.push(parsed.id);
      }
    }

    onTick(incremental ? newIds.length : collected.length, total || undefined);

    const rawNext = typeof json?.data?.next_page === 'string' && json.data.next_page.trim()
      ? json.data.next_page.trim()
      : '';

    if (reachedKnownBoundary || (incremental && pageNewCount === 0)) {
      break;
    }

    if (list.length < 10 || !rawNext) {
      break;
    }

    if (page === maxPages - 1) {
      hasMore = true;
      break;
    }

    nextUrl = buildNextTapTapUrl(rawNext);
  }

  return { items: collected, newIds, total, hasMore, partialWarning };
}

function mergeByIdDesc<T extends { id: string; createdAt: string }>(
  fresh: T[],
  existing: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  // Fresh items overwrite existing metadata (updated likes/replies) and insert new ones
  for (const item of fresh) {
    map.set(item.id, item);
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function fetchTapTapFeedback(
  appIdInput: string | number,
  options: FetchSyncOptions = {}
): Promise<TapTapFeedbackFetchResult> {
  const appId = String(appIdInput || '').trim();
  if (!appId || !/^\d+$/.test(appId)) {
    return { ok: false, error: '当前项目缺少有效的 TapTap AppID，无法拉取商店评价与论坛。' };
  }

  const existing =
    !options.forceFull && options.existing && options.existing.appId === appId
      ? options.existing
      : null;
  const incremental = Boolean(existing);
  const mode: 'full' | 'incremental' = incremental ? 'incremental' : 'full';
  const knownReviewIds = new Set<string>((existing?.reviews || []).map((r) => r.id));
  const knownForumIds = new Set<string>((existing?.forumPosts || []).map((p) => p.id));

  const progressState: TapTapFeedbackProgress = {
    projectPath: options.projectPath || '',
    mode,
    phase: 'rating',
    reviewsFetched: 0,
    forumFetched: 0,
  };
  const emitProgress = (patch: Partial<TapTapFeedbackProgress>) => {
    Object.assign(progressState, patch);
    options.onProgress?.({ ...progressState });
  };
  emitProgress({ phase: 'rating' });

  const warnings: string[] = [];

  const detailUrl = `https://www.taptap.cn/webapiv2/app/v2/detail-by-id/${appId}?X-UA=${TAPTAP_X_UA}`;
  const groupUrl = `https://www.taptap.cn/webapiv2/group/v1/detail?app_id=${appId}&X-UA=${TAPTAP_X_UA}`;

  const [detailRes, groupRes] = await Promise.allSettled([
    fetchTapTapJson(detailUrl, appId),
    fetchTapTapJson(groupUrl, appId),
  ]);

  let appTitle: string | undefined = existing?.appTitle;
  let rating: TapTapRatingSummary = existing?.rating || {
    score: '--',
    totalReviews: 0,
    voteDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  };

  let detailOk = false;
  if (detailRes.status === 'fulfilled') {
    const d = detailRes.value?.data;
    if (d) {
      detailOk = true;
      appTitle = typeof d.title === 'string' ? d.title : appTitle;
      const stat = d.stat || {};
      const r = stat.rating || {};
      const v = stat.vote_info || {};
      const v1 = Number(v['1'] || 0) || 0;
      const v2 = Number(v['2'] || 0) || 0;
      const v3 = Number(v['3'] || 0) || 0;
      const v4 = Number(v['4'] || 0) || 0;
      const v5 = Number(v['5'] || 0) || 0;
      const voteSum = v1 + v2 + v3 + v4 + v5;
      const latestVerScoreRaw = r.latest_version_score ? String(r.latest_version_score).trim() : '';
      rating = {
        score: r.score && String(r.score) !== '0' ? String(r.score) : '--',
        latestScore:
          r.latest_score && String(r.latest_score) !== '0' ? String(r.latest_score) : undefined,
        latestVersionScore:
          latestVerScoreRaw && latestVerScoreRaw !== '0' ? latestVerScoreRaw : undefined,
        totalReviews:
          Math.max(
            voteSum,
            Number(r.latest_version_review_count || 0) || 0,
            Number(r.latest_review_count || 0) || 0
          ) || 0,
        latestVersionReviews: Number(r.latest_version_review_count || 0) || undefined,
        feedCount: Number(stat.feed_count || 0) || undefined,
        voteDistribution: { '1': v1, '2': v2, '3': v3, '4': v4, '5': v5 },
      };
    }
  } else {
    warnings.push(`商店评分拉取失败：${detailRes.reason?.message || '请求异常'}`);
  }

  let groupId: string | undefined = existing?.groupId;
  if (groupRes.status === 'fulfilled') {
    const g = groupRes.value?.data?.group;
    if (g?.id) {
      groupId = String(g.id);
      if (!rating.feedCount && Number(g?.stat?.feed_count || 0) > 0) {
        rating.feedCount = Number(g.stat.feed_count);
      }
    } else if (!groupId) {
      warnings.push('该游戏暂未开启 TapTap 公开论坛');
    }
  } else if (!groupId) {
    warnings.push(`论坛信息拉取失败：${groupRes.reason?.message || '请求异常'}`);
  }

  // Pull reviews first, then forum posts sequentially with polite pacing to avoid triggering rate limits
  emitProgress({ phase: 'reviews' });

  let reviews: TapTapReviewItem[] = existing?.reviews || [];
  let newReviewIds: string[] = [];
  let hasMoreReviews = existing?.hasMoreReviews || false;
  let reviewsOk = false;

  try {
    const stream = await fetchReviewsStream(appId, knownReviewIds, incremental, (fetched, total) => {
      emitProgress({ phase: 'reviews', reviewsFetched: fetched, reviewsTotal: total });
    });
    reviewsOk = true;
    newReviewIds = stream.newIds;
    hasMoreReviews = stream.hasMore;
    reviews = incremental ? mergeByIdDesc(stream.items, existing?.reviews || []) : stream.items;
    if (rating.totalReviews === 0 && stream.total > 0) {
      rating.totalReviews = stream.total;
    }
    if (stream.partialWarning) {
      warnings.push(stream.partialWarning);
    }
  } catch (err: any) {
    warnings.push(`玩家评价拉取失败：${err?.message || '请求异常'}`);
  }

  let forumPosts: TapTapForumPostItem[] = existing?.forumPosts || [];
  let newForumIds: string[] = [];
  let hasMoreForumPosts = existing?.hasMoreForumPosts || false;
  let forumOk = false;

  if (groupId) {
    await sleep(PAGE_DELAY_MS);
    emitProgress({ phase: 'forum' });
    try {
      const stream = await fetchForumStream(
        appId,
        groupId,
        knownForumIds,
        incremental,
        (fetched, total) => {
          emitProgress({ phase: 'forum', forumFetched: fetched, forumTotal: total });
        }
      );
      forumOk = true;
      newForumIds = stream.newIds;
      hasMoreForumPosts = stream.hasMore;
      forumPosts = incremental
        ? mergeByIdDesc(stream.items, existing?.forumPosts || [])
        : stream.items;
      if (stream.partialWarning) {
        warnings.push(stream.partialWarning);
      }
    } catch (err: any) {
      warnings.push(`论坛帖子拉取失败：${err?.message || '请求异常'}`);
    }
  }

  emitProgress({ phase: 'done' });

  if (!detailOk && !reviewsOk && !forumOk) {
    return {
      ok: false,
      error:
        '无法连接到 TapTap 公开接口，或该游戏尚未公开上架/公测。你可以点击上方「TapTap 商店页」在浏览器中直接查看。',
    };
  }

  const snapshot: TapTapFeedbackSnapshot = {
    appId,
    groupId,
    appTitle,
    fetchedAt: new Date().toISOString(),
    lastSyncMode: mode,
    lastSyncNewReviewIds: incremental ? newReviewIds : [],
    lastSyncNewForumIds: incremental ? newForumIds : [],
    hasMoreReviews,
    hasMoreForumPosts,
    rating,
    reviews,
    forumPosts,
    categoryStats: buildCategoryStats(reviews, forumPosts),
    warnings: warnings.length > 0 ? warnings : undefined,
    aiSummary:
      incremental && newReviewIds.length === 0 && newForumIds.length === 0
        ? existing?.aiSummary || null
        : existing?.aiSummary || null,
  };

  return { ok: true, data: snapshot };
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed.slice(0, -'/chat/completions'.length);
  }
  return trimmed;
}

function isLocalEndpoint(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(baseUrl);
}

function extractJsonObject(rawContent: string): any {
  const withoutThink = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : withoutThink;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型未返回有效的 JSON 结构');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function sanitizeCategory(raw: unknown): FeedbackCategoryId {
  const s = String(raw || '').toLowerCase();
  if (s === 'ad' || s === 'crash' || s === 'save' || s === 'balance' || s === 'ui' || s === 'praise') {
    return s;
  }
  return 'other';
}

function sanitizePriority(raw: unknown): 'P0' | 'P1' | 'P2' {
  const s = String(raw || '').toUpperCase();
  if (s === 'P0' || s === 'P1' || s === 'P2') return s;
  return 'P1';
}

export async function listAiModels(config: AiProviderConfig): Promise<AiModelsListResult> {
  const baseUrl = normalizeBaseUrl(config.baseUrl || '');
  const apiKey = (config.apiKey || '').trim();

  if (!baseUrl) return { ok: false, error: '请先填写 API Base URL' };
  if (!apiKey && !isLocalEndpoint(baseUrl)) {
    return { ok: false, error: '请先填写 API Key 再拉取可用模型（仅本地 Ollama 可留空）' };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const tryFetch = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      return await fetch(url, { method: 'GET', signal: controller.signal, headers });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await tryFetch(`${baseUrl}/models`);
    if (res.status === 404 && !/\/v\d+$/i.test(baseUrl)) {
      res = await tryFetch(`${baseUrl}/v1/models`);
    }
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 180);
      return { ok: false, error: `HTTP ${res.status}: ${errText || res.statusText}` };
    }
    const json = await res.json();
    const list = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.models)
      ? json.models
      : [];
    const models = list
      .map((item: any) => String(item?.id || item?.name || '').trim())
      .filter(Boolean);
    const unique = Array.from(new Set<string>(models));
    if (unique.length === 0) {
      return { ok: false, error: '接口返回成功，但未发现可用模型列表，可手动输入模型名称' };
    }
    return { ok: true, models: unique };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: '获取模型列表超时（12秒）' };
    }
    return { ok: false, error: err?.message || '获取模型列表失败' };
  }
}

function buildThinkingPayload(
  baseUrl: string,
  model: string,
  effort: AiReasoningEffort
): Record<string, any> {
  const urlLower = baseUrl.toLowerCase();
  const modelLower = model.toLowerCase();

  // DeepSeek official OpenAI-compatible endpoint (deepseek-flash / deepseek-v4-pro / deepseek-reasoner)
  if (urlLower.includes('deepseek.com') || modelLower.includes('deepseek')) {
    if (effort === 'none') {
      return {
        thinking: { type: 'disabled' },
      };
    }
    return {
      thinking: { type: 'enabled' },
      reasoning_effort: effort,
    };
  }

  // Alibaba Qwen / DashScope
  if (urlLower.includes('dashscope') || modelLower.includes('qwen')) {
    if (effort === 'none') {
      return { enable_thinking: false };
    }
    return {
      enable_thinking: true,
      reasoning_effort: effort === 'max' ? 'high' : effort,
    };
  }

  // Zhipu GLM
  if (urlLower.includes('bigmodel.cn') || modelLower.includes('glm')) {
    return {
      thinking: { type: effort === 'none' ? 'disabled' : 'enabled' },
    };
  }

  // Generic OpenAI-compatible reasoning parameter
  if (effort === 'none') {
    return { reasoning_effort: 'none' };
  }
  return { reasoning_effort: effort === 'max' ? 'high' : effort };
}

async function postChatCompletionWithFallback(
  baseUrl: string,
  headers: Record<string, string>,
  baseBody: Record<string, any>,
  extraThinkingBody: Record<string, any>,
  signal: AbortSignal
): Promise<Response> {
  const send = async (bodyObj: Record<string, any>) => {
    const bodyStr = JSON.stringify(bodyObj);
    let res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers,
      body: bodyStr,
    });
    if (res.status === 404 && !/\/v\d+$/i.test(baseUrl)) {
      res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        signal,
        headers,
        body: bodyStr,
      });
    }
    return res;
  };

  const hasExtra = Object.keys(extraThinkingBody).length > 0;
  if (!hasExtra) {
    return send(baseBody);
  }

  const firstRes = await send({ ...baseBody, ...extraThinkingBody });
  // If a third-party OpenAI proxy rejects unknown thinking/reasoning fields with 400/422, cleanly fall back
  if (firstRes.status === 400 || firstRes.status === 422) {
    return send(baseBody);
  }
  return firstRes;
}

export async function testAiConnection(config: AiProviderConfig): Promise<AiConnectionTestResult> {
  const baseUrl = normalizeBaseUrl(config.baseUrl || '');
  const apiKey = (config.apiKey || '').trim();
  const model = (config.model || '').trim();

  if (!baseUrl) return { ok: false, error: '请先填写 API Base URL' };
  if (!model) return { ok: false, error: '请先填写模型名称（Model）' };
  if (!apiKey && !isLocalEndpoint(baseUrl)) {
    return { ok: false, error: '请填写 API Key（仅本地 Ollama 可留空）' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    // Disable thinking during connection ping so test finishes in <1s
    const extraThinking = buildThinkingPayload(baseUrl, model, 'none');
    const res = await postChatCompletionWithFallback(
      baseUrl,
      headers,
      {
        model,
        messages: [{ role: 'user', content: 'Reply OK' }],
        max_tokens: 16,
        temperature: 0,
      },
      extraThinking,
      controller.signal
    );

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 200);
      return { ok: false, error: `HTTP ${res.status}: ${errText || res.statusText}` };
    }
    const json = await res.json();
    const returnedModel = typeof json?.model === 'string' ? json.model : model;
    return { ok: true, model: returnedModel };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: '连接超时（15秒），请检查接口地址或网络状态' };
    }
    return { ok: false, error: err?.message || '连接失败' };
  } finally {
    clearTimeout(timer);
  }
}

export async function summarizeFeedbackWithAi(
  snapshot: TapTapFeedbackSnapshot,
  projectName: string,
  version: string | undefined,
  config: AiProviderConfig | undefined,
  scope: 'all' | 'new' = 'all',
  effortOverride?: AiReasoningEffort
): Promise<AiFeedbackSummarizeResult> {
  const baseUrl = normalizeBaseUrl(config?.baseUrl || '');
  const apiKey = (config?.apiKey || '').trim();
  const model = (config?.model || '').trim();
  const effort: AiReasoningEffort = effortOverride || config?.reasoningEffort || 'low';

  if (!baseUrl || !model || (!apiKey && !isLocalEndpoint(baseUrl))) {
    return {
      ok: false,
      error: '尚未配置 AI 接口，请前往「系统设置 → AI 玩家反馈总结」填写 API Key 或本地 Ollama 地址。',
    };
  }

  const newRevSet = new Set(snapshot.lastSyncNewReviewIds || []);
  const newForumSet = new Set(snapshot.lastSyncNewForumIds || []);
  const targetReviews =
    scope === 'new' && newRevSet.size > 0
      ? snapshot.reviews.filter((r) => newRevSet.has(r.id))
      : scope === 'new'
      ? []
      : snapshot.reviews;
  const targetForumPosts =
    scope === 'new' && newForumSet.size > 0
      ? snapshot.forumPosts.filter((p) => newForumSet.has(p.id))
      : scope === 'new'
      ? []
      : snapshot.forumPosts;

  if (targetReviews.length === 0 && targetForumPosts.length === 0) {
    return {
      ok: false,
      error:
        scope === 'new'
          ? '本次增量拉取没有新增评价或论坛帖子，无需重复总结。'
          : '当前没有可分析的玩家评价或论坛帖子，请先拉取数据。',
    };
  }

  // Prioritize low-star & newest reviews so full-history datasets stay high-signal and token-efficient
  const sortedReviews = [...targetReviews].sort((a, b) => {
    const aLow = a.score <= 3 ? 0 : 1;
    const bLow = b.score <= 3 ? 0 : 1;
    if (aLow !== bLow) return aLow - bLow;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const maxReviewsInPrompt = scope === 'new' ? 60 : 45;
  const maxForumInPrompt = scope === 'new' ? 40 : 30;

  const selectedReviews = sortedReviews.slice(0, maxReviewsInPrompt);
  const selectedForumPosts = targetForumPosts.slice(0, maxForumInPrompt);

  const reviewLines = selectedReviews.map((r, i) => {
    const snippet = r.text.replace(/\s+/g, ' ').slice(0, 180);
    const meta = [
      `${r.score}★`,
      r.device ? `机型:${r.device}` : '',
      r.playedMinutes ? `游玩:${r.playedMinutes}分钟` : '',
      r.createdAt.slice(0, 10),
    ]
      .filter(Boolean)
      .join(' | ');
    return `${i + 1}. [${meta}] ${snippet}`;
  });

  const forumLines = selectedForumPosts.map((p, i) => {
    const body = p.text === p.title ? '' : ` — ${p.text.replace(/\s+/g, ' ').slice(0, 140)}`;
    return `${i + 1}. [${p.createdAt.slice(0, 10)} | 回复${p.comments}] ${p.title}${body}`;
  });

  const categoryOverview = snapshot.categoryStats
    .map((s) => `${s.label}:${s.count}(低星${s.lowStarCount})`)
    .join(' / ');

  const systemPrompt = [
    '你是资深手游/小游戏制作人与 QA 诊断专家。',
    scope === 'new'
      ? '以下是本次增量同步新收到的 TapTap 玩家评价与论坛帖子，请聚焦分析这批最新反馈中的新 Bug、高频槽点与新建议。'
      : '请基于 TapTap 真实玩家评价与论坛帖子，为独立开发者提炼最值得立刻修复的 Bug、体验槽点与玩家好评亮点。',
    '严格只输出合法 JSON 对象，不要输出任何额外解释或 Markdown 文本。',
    'JSON 格式：',
    '{',
    '  "overview": "2-3句整体口碑与最紧急痛点总结",',
    '  "issues": [',
    '    {',
    '      "priority": "P0 或 P1 或 P2",',
    '      "category": "crash | ad | save | balance | ui | praise | other",',
    '      "title": "简短清晰的问题标题（10-24字）",',
    '      "detail": "玩家具体反馈现象归纳（25-80字）",',
    '      "evidenceCount": 2,',
    '      "devices": ["相关机型，没有则空数组"],',
    '      "suggestedAction": "给开发者的具体排查或优化建议（20-50字）"',
    '    }',
    '  ],',
    '  "highlights": ["玩家最认可的游戏亮点1", "亮点2"]',
    '}',
    '分级标准：P0=闪退/卡死/黑屏/丢档/卡死流程/激励广告无奖励等阻断问题；P1=广告频率过高/数值卡点/UI遮挡/操作手感差等高频槽点；P2=新玩法许愿与锦上添花建议。issues 按优先级输出 3~7 条，合并同类问题，不要编造未出现的事实。',
  ].join('\n');

  const userPrompt = [
    `游戏名称：${projectName}${version ? `（当前版本 ${version}）` : ''}`,
    `分析范围：${scope === 'new' ? '仅本次增量新增反馈' : `全量反馈（累计 ${snapshot.reviews.length} 条评价 + ${snapshot.forumPosts.length} 条论坛帖子）`}`,
    `TapTap 评分：${snapshot.rating.score} 分（总评价数约 ${snapshot.rating.totalReviews}，5★:${snapshot.rating.voteDistribution['5']} / 4★:${snapshot.rating.voteDistribution['4']} / 3★:${snapshot.rating.voteDistribution['3']} / 2★:${snapshot.rating.voteDistribution['2']} / 1★:${snapshot.rating.voteDistribution['1']}）`,
    categoryOverview ? `全量关键词分布：${categoryOverview}` : '',
    '',
    `【${scope === 'new' ? '本次新增' : '低星与最新优先'}玩家评价（展示 ${reviewLines.length}/${targetReviews.length} 条）】`,
    reviewLines.length > 0 ? reviewLines.join('\n') : '（暂无）',
    '',
    `【${scope === 'new' ? '本次新增' : '最新'}论坛帖子（展示 ${forumLines.length}/${targetForumPosts.length} 条）】`,
    forumLines.length > 0 ? forumLines.join('\n') : '（暂无）',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const timeoutMs = effort === 'high' || effort === 'max' ? 120000 : 60000;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const extraThinking = buildThinkingPayload(baseUrl, model, effort);
    const res = await postChatCompletionWithFallback(
      baseUrl,
      headers,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
      },
      extraThinking,
      controller.signal
    );

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 240);
      return { ok: false, error: `AI 接口返回 HTTP ${res.status}：${errText || res.statusText}` };
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, error: 'AI 接口返回内容为空，请检查模型名称是否正确' };
    }

    const parsed = extractJsonObject(content);
    const rawIssues = Array.isArray(parsed?.issues) ? parsed.issues : [];
    const issues: AiFeedbackIssueItem[] = rawIssues
      .filter((x: any) => x && typeof x.title === 'string' && x.title.trim())
      .slice(0, 8)
      .map((x: any, idx: number) => ({
        id: `ai-issue-${Date.now()}-${idx}`,
        priority: sanitizePriority(x.priority),
        category: sanitizeCategory(x.category),
        title: String(x.title).trim(),
        detail: String(x.detail || '').trim(),
        evidenceCount: Math.max(1, Number(x.evidenceCount || 1) || 1),
        devices: Array.isArray(x.devices)
          ? x.devices.map((d: any) => String(d || '').trim()).filter(Boolean).slice(0, 4)
          : [],
        suggestedAction: String(x.suggestedAction || '').trim(),
      }))
      .sort((a: AiFeedbackIssueItem, b: AiFeedbackIssueItem) => {
        const order = { P0: 0, P1: 1, P2: 2 };
        return order[a.priority] - order[b.priority];
      });

    const highlights = Array.isArray(parsed?.highlights)
      ? parsed.highlights.map((h: any) => String(h || '').trim()).filter(Boolean).slice(0, 5)
      : [];

    const summary: AiFeedbackSummary = {
      generatedAt: new Date().toISOString(),
      model: typeof json?.model === 'string' ? json.model : model,
      scope,
      reasoningEffort: effort,
      durationMs: Date.now() - startedAt,
      analyzedReviews: selectedReviews.length,
      analyzedForumPosts: selectedForumPosts.length,
      overview: String(parsed?.overview || '已完成玩家评价与论坛问题提炼。').trim(),
      issues,
      highlights,
    };

    return { ok: true, summary };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        error: `AI 总结超时（${Math.round(timeoutMs / 1000)}秒），建议把思考强度调为「极速」或「轻度」后重试`,
      };
    }
    return { ok: false, error: err?.message || 'AI 总结失败' };
  } finally {
    clearTimeout(timer);
  }
}
