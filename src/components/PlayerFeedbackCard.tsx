import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  ExternalLink,
  MessageSquareText,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  ThumbsUp,
  Timer,
} from 'lucide-react';
import { buildFeedbackAiPrompt } from '../aiHelpers';
import {
  AiFeedbackIssueItem,
  AiReasoningEffort,
  AppSettings,
  FeedbackCategoryId,
  GitGraphData,
  ProjectCardData,
  StageTodoItem,
  TapTapFeedbackProgress,
  TapTapFeedbackSnapshot,
} from '../types';
import { formatRelativeTime } from '../utils';

interface PlayerFeedbackCardProps {
  project: ProjectCardData;
  graph: GitGraphData | null;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onUpdateTodos: (todos: StageTodoItem[]) => Promise<void>;
  onOpenSettings: () => void;
}

const EFFORT_PILLS: { id: AiReasoningEffort; label: string; title: string }[] = [
  { id: 'none', label: '极速', title: '关闭思考模式，2~4 秒极速总结' },
  { id: 'low', label: '轻度', title: '轻度思考（推荐），兼顾速度与准确度' },
  { id: 'high', label: '深度', title: '深度思考，适合细挖复杂问题' },
  { id: 'max', label: '极致', title: '最大推理深度，耗时会明显更长' },
];

const EFFORT_LABELS: Record<AiReasoningEffort, string> = {
  none: '极速（关思考）',
  low: '轻度思考',
  high: '深度思考',
  max: '极致思考',
};

const CATEGORY_META: Record<
  FeedbackCategoryId,
  { label: string; bg: string; text: string; border: string }
> = {
  crash: {
    label: '闪退/卡死',
    bg: 'var(--pill-err-bg)',
    text: 'var(--pill-err-text)',
    border: 'var(--pill-err-border)',
  },
  ad: {
    label: '广告/激励',
    bg: 'var(--pill-warn-bg)',
    text: 'var(--pill-warn-text)',
    border: 'var(--pill-warn-border)',
  },
  save: {
    label: '存档/丢档',
    bg: 'var(--pill-err-bg)',
    text: 'var(--pill-err-text)',
    border: 'var(--pill-err-border)',
  },
  balance: {
    label: '数值/难度',
    bg: 'var(--pill-warn-bg)',
    text: 'var(--pill-warn-text)',
    border: 'var(--pill-warn-border)',
  },
  ui: {
    label: '操作/UI',
    bg: 'var(--pill-info-bg)',
    text: 'var(--pill-info-text)',
    border: 'var(--pill-info-border)',
  },
  praise: {
    label: '建议/好评',
    bg: 'var(--pill-ok-bg)',
    text: 'var(--pill-ok-text)',
    border: 'var(--pill-ok-border)',
  },
  other: {
    label: '其他反馈',
    bg: 'var(--bg-elevated)',
    text: 'var(--text-secondary)',
    border: 'var(--border-subtle)',
  },
};

function isLocalAiUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url.trim());
}

export const PlayerFeedbackCard: React.FC<PlayerFeedbackCardProps> = ({
  project,
  graph,
  settings,
  onUpdateSettings,
  onUpdateTodos,
  onOpenSettings,
}) => {
  const [snapshot, setSnapshot] = useState<TapTapFeedbackSnapshot | null>(null);
  const [loadingCache, setLoadingCache] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [syncProgress, setSyncProgress] = useState<TapTapFeedbackProgress | null>(null);
  const [summarizingScope, setSummarizingScope] = useState<'all' | 'new' | null>(null);
  const [aiElapsedSec, setAiElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiErrorMsg, setAiErrorMsg] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const [activeTab, setActiveTab] = useState<'reviews' | 'forum'>('reviews');
  const [categoryFilter, setCategoryFilter] = useState<
    FeedbackCategoryId | 'all' | 'low_star' | 'only_new'
  >('all');
  const [reviewSort, setReviewSort] = useState<'latest' | 'low_first'>('latest');
  const [keyword, setKeyword] = useState('');
  const [justAddedKeys, setJustAddedKeys] = useState<Record<string, boolean>>({});

  const appId = project.taptap.appId ? String(project.taptap.appId).trim() : '';
  const aiCfg = settings.ai;
  const currentEffort: AiReasoningEffort = aiCfg?.reasoningEffort || 'low';
  const aiReady = Boolean(
    aiCfg?.baseUrl?.trim() &&
      aiCfg?.model?.trim() &&
      (aiCfg?.apiKey?.trim() || isLocalAiUrl(aiCfg.baseUrl))
  );

  useEffect(() => {
    if (!summarizingScope) {
      setAiElapsedSec(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setAiElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [summarizingScope]);

  const handleSelectEffort = async (effort: AiReasoningEffort) => {
    await onUpdateSettings({
      ai: {
        baseUrl: aiCfg?.baseUrl || '',
        apiKey: aiCfg?.apiKey || '',
        model: aiCfg?.model || '',
        reasoningEffort: effort,
      },
    });
  };

  useEffect(() => {
    let active = true;
    setErrorMsg(null);
    setAiErrorMsg(null);
    setSyncProgress(null);
    setCategoryFilter('all');
    setKeyword('');
    setLoadingCache(true);
    window.gameHub
      .getCachedTapTapFeedback(project.path)
      .then((cached) => {
        if (active) setSnapshot(cached);
      })
      .catch(() => {
        if (active) setSnapshot(null);
      })
      .finally(() => {
        if (active) setLoadingCache(false);
      });
    return () => {
      active = false;
    };
  }, [project.path]);

  useEffect(() => {
    const unsub = window.gameHub.onTapTapFeedbackProgress((p) => {
      if (p.projectPath.toLowerCase() === project.path.toLowerCase()) {
        setSyncProgress(p);
      }
    });
    return () => unsub?.();
  }, [project.path]);

  const handleFetch = async (forceFull = false) => {
    if (!appId || fetching) return;
    setFetching(true);
    setSyncProgress(null);
    setErrorMsg(null);
    setAiErrorMsg(null);
    try {
      const res = await window.gameHub.fetchTapTapFeedback(project.path, appId, { forceFull });
      if (res.ok && res.data) {
        setSnapshot(res.data);
        const newTotal =
          (res.data.lastSyncNewReviewIds?.length || 0) +
          (res.data.lastSyncNewForumIds?.length || 0);
        if (res.data.lastSyncMode === 'incremental' && newTotal > 0) {
          setCategoryFilter('only_new');
          if (
            (res.data.lastSyncNewReviewIds?.length || 0) === 0 &&
            (res.data.lastSyncNewForumIds?.length || 0) > 0
          ) {
            setActiveTab('forum');
          } else {
            setActiveTab('reviews');
          }
        } else if (forceFull) {
          setCategoryFilter('all');
        }
      } else {
        setErrorMsg(res.error || '拉取失败，请稍后重试');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '拉取异常');
    } finally {
      setFetching(false);
      setSyncProgress(null);
    }
  };

  const handleAiSummarize = async (scope: 'all' | 'new') => {
    if (!snapshot || summarizingScope) return;
    if (!aiReady) {
      onOpenSettings();
      return;
    }
    setSummarizingScope(scope);
    setAiErrorMsg(null);
    try {
      const res = await window.gameHub.summarizeTapTapFeedback(
        project.path,
        project.name,
        project.displayVersion || undefined,
        scope,
        currentEffort
      );
      if (res.ok && res.summary) {
        setSnapshot((prev) => (prev ? { ...prev, aiSummary: res.summary } : prev));
      } else {
        setAiErrorMsg(res.error || 'AI 总结失败');
      }
    } catch (err: any) {
      setAiErrorMsg(err?.message || 'AI 总结请求异常');
    } finally {
      setSummarizingScope(null);
    }
  };

  const newReviewIdSet = useMemo(
    () => new Set(snapshot?.lastSyncNewReviewIds || []),
    [snapshot?.lastSyncNewReviewIds]
  );
  const newForumIdSet = useMemo(
    () => new Set(snapshot?.lastSyncNewForumIds || []),
    [snapshot?.lastSyncNewForumIds]
  );
  const newTotalCount = newReviewIdSet.size + newForumIdSet.size;

  const handleCopyForAi = () => {
    if (!snapshot) return;
    const onlyNew = categoryFilter === 'only_new' && newTotalCount > 0;
    const prompt = buildFeedbackAiPrompt(project, snapshot, graph, onlyNew);
    navigator.clipboard?.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const existingTodoTexts = useMemo(
    () => new Set(project.todos.map((t) => t.text.trim())),
    [project.todos]
  );

  const handleAddToTodo = async (key: string, text: string, priority: 'high' | 'normal') => {
    const clean = text.trim();
    if (!clean) return;
    if (!existingTodoTexts.has(clean)) {
      const item: StageTodoItem = {
        id: `fb-todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        stage: project.stage,
        text: clean,
        done: false,
        priority,
        createdAt: new Date().toISOString(),
      };
      await onUpdateTodos([item, ...project.todos]);
    }
    setJustAddedKeys((prev) => ({ ...prev, [key]: true }));
  };

  const lowStarReviewCount = useMemo(
    () => (snapshot?.reviews || []).filter((r) => r.score <= 3).length,
    [snapshot]
  );

  const filteredReviews = useMemo(() => {
    if (!snapshot) return [];
    const q = keyword.trim().toLowerCase();
    const list = snapshot.reviews.filter((r) => {
      if (categoryFilter === 'only_new' && !newReviewIdSet.has(r.id)) return false;
      if (categoryFilter === 'low_star' && r.score > 3) return false;
      if (
        categoryFilter !== 'all' &&
        categoryFilter !== 'low_star' &&
        categoryFilter !== 'only_new' &&
        !r.categories.includes(categoryFilter)
      ) {
        return false;
      }
      if (q) {
        const hay = `${r.text} ${r.author} ${r.device || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (reviewSort === 'low_first') {
      return [...list].sort((a, b) => a.score - b.score || b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [snapshot, categoryFilter, keyword, reviewSort, newReviewIdSet]);

  const filteredForumPosts = useMemo(() => {
    if (!snapshot) return [];
    const q = keyword.trim().toLowerCase();
    return snapshot.forumPosts.filter((p) => {
      if (categoryFilter === 'only_new' && !newForumIdSet.has(p.id)) return false;
      if (
        categoryFilter !== 'all' &&
        categoryFilter !== 'low_star' &&
        categoryFilter !== 'only_new' &&
        !p.categories.includes(categoryFilter)
      ) {
        return false;
      }
      if (q) {
        const hay = `${p.title} ${p.text} ${p.author}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [snapshot, categoryFilter, keyword, newForumIdSet]);

  const voteTotal = useMemo(() => {
    if (!snapshot) return 0;
    const v = snapshot.rating.voteDistribution;
    return v['1'] + v['2'] + v['3'] + v['4'] + v['5'];
  }, [snapshot]);

  const progressText = useMemo(() => {
    if (!fetching) return '';
    if (!syncProgress) {
      return snapshot ? '正在增量检测新反馈…' : '正在连接 TapTap 准备全量拉取…';
    }
    const modeLabel = syncProgress.mode === 'incremental' ? '增量拉取中' : '首次全量拉取中';
    const revPart = syncProgress.reviewsTotal
      ? `评价 ${syncProgress.reviewsFetched}/${syncProgress.reviewsTotal}`
      : `评价 ${syncProgress.reviewsFetched}`;
    const forumPart = syncProgress.forumTotal
      ? `论坛 ${syncProgress.forumFetched}/${syncProgress.forumTotal}`
      : `论坛 ${syncProgress.forumFetched}`;
    return `${modeLabel}… ${revPart} · ${forumPart}`;
  }, [fetching, syncProgress, snapshot]);

  const renderIssuePriorityPill = (priority: AiFeedbackIssueItem['priority']) => {
    if (priority === 'P0') {
      return (
        <span
          className="px-2 py-0.5 rounded-md text-[10.5px] font-bold border shrink-0"
          style={{
            backgroundColor: 'var(--pill-err-bg)',
            color: 'var(--pill-err-text)',
            borderColor: 'var(--pill-err-border)',
          }}
        >
          P0 阻断
        </span>
      );
    }
    if (priority === 'P1') {
      return (
        <span
          className="px-2 py-0.5 rounded-md text-[10.5px] font-bold border shrink-0"
          style={{
            backgroundColor: 'var(--pill-warn-bg)',
            color: 'var(--pill-warn-text)',
            borderColor: 'var(--pill-warn-border)',
          }}
        >
          P1 槽点
        </span>
      );
    }
    return (
      <span
        className="px-2 py-0.5 rounded-md text-[10.5px] font-bold border shrink-0"
        style={{
          backgroundColor: 'var(--pill-info-bg)',
          color: 'var(--pill-info-text)',
          borderColor: 'var(--pill-info-border)',
        }}
      >
        P2 建议
      </span>
    );
  };

  return (
    <section id="player-feedback-radar" className="glass-card rounded-[22px] p-5 space-y-4">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Radar className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[14px] font-semibold">TapTap 玩家评价 & 论坛问题雷达</h2>
              {appId && (
                <span
                  className="text-[10.5px] font-mono px-2 py-0.5 rounded-md border"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  AppID {appId}
                </span>
              )}
              {snapshot && (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  更新于 {formatRelativeTime(snapshot.fetchedAt)}
                </span>
              )}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              首次全量抓取历史评价与帖子，后续仅增量拉取新增内容 · 本地痛点聚合 · AI 总结与一键转待办
            </p>
          </div>
        </div>

        {/* Action Controls */}
        {appId && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {snapshot && (
              <>
                <button
                  onClick={handleCopyForAi}
                  title="将评价、机型、星级分布和论坛问题打包成提示词，直接粘贴给外部 AI"
                  className="h-8 px-3 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer hover:border-blue-400 hover:text-blue-600"
                  style={{
                    backgroundColor: copiedPrompt ? 'var(--pill-ok-bg)' : 'var(--bg-surface-strong)',
                    borderColor: copiedPrompt ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                    color: copiedPrompt ? 'var(--pill-ok-text)' : 'var(--text-primary)',
                  }}
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedPrompt
                      ? '已复制诊断包!'
                      : categoryFilter === 'only_new' && newTotalCount > 0
                      ? `复制新增给 AI (${newTotalCount})`
                      : '复制给 AI'}
                  </span>
                </button>

                {aiReady && newTotalCount > 0 && (
                  <button
                    onClick={() => handleAiSummarize('new')}
                    disabled={Boolean(summarizingScope)}
                    title={`仅分析本次增量新增的 ${newTotalCount} 条反馈`}
                    className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: 'var(--pill-ok-bg)',
                      borderColor: 'var(--pill-ok-border)',
                      color: 'var(--pill-ok-text)',
                    }}
                  >
                    {summarizingScope === 'new' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {summarizingScope === 'new'
                        ? `分析新增 ${aiElapsedSec}s…`
                        : `AI 总结新增 (${newTotalCount})`}
                    </span>
                  </button>
                )}

                <button
                  onClick={() => handleAiSummarize('all')}
                  disabled={Boolean(summarizingScope)}
                  title={
                    aiReady
                      ? `使用 ${aiCfg?.model}（${EFFORT_LABELS[currentEffort]}）总结全量评价与论坛高频问题`
                      : '前往设置填写 DeepSeek / 通义千问 / Ollama 等可选接口'
                  }
                  className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 shadow-xs"
                  style={{
                    backgroundColor: aiReady ? '#7C3AED' : 'var(--bg-surface-strong)',
                    color: aiReady ? '#FFFFFF' : 'var(--text-primary)',
                    border: aiReady ? '1px solid #7C3AED' : '1px solid var(--border-subtle)',
                  }}
                >
                  {summarizingScope === 'all' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : aiReady ? (
                    <Sparkles className="w-3.5 h-3.5" />
                  ) : (
                    <Settings className="w-3.5 h-3.5 text-violet-600" />
                  )}
                  <span>
                    {summarizingScope === 'all'
                      ? `AI 分析中 ${aiElapsedSec}s…`
                      : aiReady
                      ? snapshot.aiSummary
                        ? 'AI 重新全量总结'
                        : 'AI 一键总结问题'
                      : '配置 AI 总结'}
                  </span>
                </button>
              </>
            )}

            <button
              onClick={() => handleFetch(false)}
              disabled={fetching}
              className="h-8 px-3.5 rounded-xl text-xs font-semibold bg-teal-600 text-white flex items-center gap-1.5 cursor-pointer hover:opacity-92 disabled:opacity-60 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
              <span>
                {fetching
                  ? snapshot
                    ? '增量检测中…'
                    : '全量拉取中…'
                  : snapshot
                  ? '增量拉取新反馈'
                  : '首次全量抓取'}
              </span>
            </button>

            {snapshot && (
              <button
                onClick={() => handleFetch(true)}
                disabled={fetching}
                title="忽略本地缓存，重新全量拉取所有评价与论坛帖子"
                className="h-8 w-8 rounded-xl border flex items-center justify-center cursor-pointer hover:border-teal-500 hover:text-teal-600 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live Sync Progress Banner */}
      {fetching && (
        <div
          className="rounded-2xl border px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
          style={{
            backgroundColor: 'var(--pill-info-bg)',
            borderColor: 'var(--pill-info-border)',
            color: 'var(--pill-info-text)',
          }}
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="font-medium">{progressText}</span>
          </div>
          <span className="text-[11px] opacity-80">分页安全限速中，完成后自动缓存到本地</span>
        </div>
      )}

      {/* No AppID Notice */}
      {!appId && (
        <div
          className="rounded-2xl border border-dashed px-4 py-5 flex items-center justify-between gap-3 flex-wrap"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div className="space-y-0.5">
            <div className="text-xs font-semibold">当前项目尚未绑定 TapTap AppID</div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              等项目在 TapTap Maker 关联并上传公测/正式版后，GameHub 会自动从配置文件识别 AppID，届时即可一键抓取玩家评价与论坛问题。
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div
          className="rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-xs"
          style={{
            backgroundColor: 'var(--pill-err-bg)',
            borderColor: 'var(--pill-err-border)',
            color: 'var(--pill-err-text)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          {appId && (
            <button
              onClick={() => window.gameHub.openExternal(`https://www.taptap.cn/app/${appId}`)}
              className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0 bg-white/80 text-slate-800"
              style={{ borderColor: 'var(--pill-err-border)' }}
            >
              <span>打开 TapTap 商店页</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* First-Time Empty CTA (AppID present, no cached snapshot yet) */}
      {appId && !snapshot && !loadingCache && !errorMsg && (
        <div
          className="rounded-2xl border px-5 py-7 flex flex-col items-center justify-center text-center space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="w-11 h-11 rounded-2xl bg-teal-500/12 text-teal-600 flex items-center justify-center">
            <MessageSquareText className="w-5 h-5" />
          </div>
          <div className="text-[13px] font-semibold">实时洞察 TapTap 玩家原声与论坛 Bug</div>
          <div className="text-[11.5px] max-w-lg leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            首次点击将<strong>全量拉取</strong>该游戏的全部历史玩家评价（含机型与游玩时长）及论坛帖子并缓存本地；
            之后每次点击仅<strong>增量同步新增内容</strong>，秒出最新玩家反馈。
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => handleFetch(false)}
              disabled={fetching}
              className="h-9 px-4 rounded-xl bg-teal-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-92 shadow-xs"
            >
              <Radar className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
              <span>{fetching ? '正在全量抓取…' : '首次全量抓取评价 & 论坛'}</span>
            </button>
            <button
              onClick={() => window.gameHub.openExternal(`https://www.taptap.cn/app/${appId}/review`)}
              className="h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:border-blue-400 hover:text-blue-600"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>浏览器打开评价页</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] pt-1" style={{ color: 'var(--text-muted)' }}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>隐私承诺：平时零后台联网，仅在手动点击时按需拉取，结果仅保存在本地</span>
          </div>
        </div>
      )}

      {/* Loaded Snapshot View */}
      {snapshot && (
        <div className="space-y-4">
          {/* Incremental / Full Sync Result Strip */}
          {!fetching && snapshot.lastSyncMode && (
            <div
              className="rounded-xl border px-3.5 py-2 flex items-center justify-between gap-2 flex-wrap text-[11.5px]"
              style={{
                backgroundColor:
                  snapshot.lastSyncMode === 'incremental' && newTotalCount > 0
                    ? 'var(--pill-ok-bg)'
                    : 'var(--bg-surface-strong)',
                borderColor:
                  snapshot.lastSyncMode === 'incremental' && newTotalCount > 0
                    ? 'var(--pill-ok-border)'
                    : 'var(--border-subtle)',
                color:
                  snapshot.lastSyncMode === 'incremental' && newTotalCount > 0
                    ? 'var(--pill-ok-text)'
                    : 'var(--text-secondary)',
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {snapshot.lastSyncMode === 'incremental' ? (
                  newTotalCount > 0 ? (
                    <>
                      <span className="font-bold">本次增量同步成功：</span>
                      <span>
                        新增 <strong>{newReviewIdSet.size}</strong> 条评价、
                        <strong>{newForumIdSet.size}</strong> 条论坛帖子（其余已直接复用本地缓存，累计{' '}
                        {snapshot.reviews.length} 评价 · {snapshot.forumPosts.length} 帖子）
                      </span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        增量检测完成：暂无新增评价与论坛帖子（本地已完整保留{' '}
                        <strong>{snapshot.reviews.length}</strong> 条评价 ·{' '}
                        <strong>{snapshot.forumPosts.length}</strong> 条帖子）
                      </span>
                    </>
                  )
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>
                      已完成全量基线拉取：本地共缓存 <strong>{snapshot.reviews.length}</strong>{' '}
                      条评价 · <strong>{snapshot.forumPosts.length}</strong> 条论坛帖子
                      {(snapshot.hasMoreReviews || snapshot.hasMoreForumPosts) && '（部分更早历史受分页上限或限流暂停，已完整保留已拉取内容）'}
                      ，下次点击将自动仅增量拉取新增内容
                    </span>
                  </>
                )}
              </div>

              {snapshot.lastSyncMode === 'incremental' && newTotalCount > 0 && (
                <button
                  onClick={() =>
                    setCategoryFilter(categoryFilter === 'only_new' ? 'all' : 'only_new')
                  }
                  className="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border cursor-pointer bg-white/80 text-emerald-700"
                  style={{ borderColor: 'var(--pill-ok-border)' }}
                >
                  {categoryFilter === 'only_new' ? '切回查看全部' : `仅看本次新增 (${newTotalCount})`}
                </button>
              )}
            </div>
          )}

          {/* Top Metrics Bento: Score + Star Distribution + Category Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Score & Star Breakdown */}
            <div
              className="lg:col-span-5 rounded-2xl border p-3.5 flex items-center gap-4"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="text-center shrink-0 min-w-[78px]">
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className="text-[28px] font-extrabold tracking-tight text-teal-600 leading-none">
                    {snapshot.rating.score}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    /10
                  </span>
                </div>
                <div className="text-[10.5px] font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
                  TapTap 评分
                </div>
                {snapshot.rating.latestVersionScore && (
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    当前版 {snapshot.rating.latestVersionScore}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                {(['5', '4', '3', '2', '1'] as const).map((star) => {
                  const cnt = snapshot.rating.voteDistribution[star] || 0;
                  const pct = voteTotal > 0 ? Math.round((cnt / voteTotal) * 100) : 0;
                  const barColor =
                    star === '5' || star === '4'
                      ? '#14B8A6'
                      : star === '3'
                      ? '#F59E0B'
                      : '#F43F5E';
                  return (
                    <div key={star} className="flex items-center gap-2 text-[10.5px]">
                      <span className="w-5 font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {star}★
                      </span>
                      <div
                        className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: 'var(--border-subtle)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: barColor }}
                        />
                      </div>
                      <span
                        className="w-8 text-right font-mono shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {cnt}
                      </span>
                    </div>
                  );
                })}
                <div
                  className="pt-1 flex items-center justify-between text-[10.5px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>总评分人数 {snapshot.rating.totalReviews}</span>
                  <span>
                    已缓存 {snapshot.reviews.length} 评价 · {snapshot.forumPosts.length} 帖子
                  </span>
                </div>
              </div>
            </div>

            {/* Local 6-Dimension Pain-Point Chips */}
            <div
              className="lg:col-span-7 rounded-2xl border p-3.5 flex flex-col justify-between gap-2.5"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">本地痛点自动归类（点击筛选下方原帖）</span>
                <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                  零 API 消耗 · 全量实时聚合
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer"
                  style={{
                    backgroundColor:
                      categoryFilter === 'all' ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    borderColor:
                      categoryFilter === 'all' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    color:
                      categoryFilter === 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  全部 ({snapshot.reviews.length + snapshot.forumPosts.length})
                </button>

                {newTotalCount > 0 && (
                  <button
                    onClick={() =>
                      setCategoryFilter(categoryFilter === 'only_new' ? 'all' : 'only_new')
                    }
                    className="px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer"
                    style={{
                      backgroundColor:
                        categoryFilter === 'only_new' ? 'var(--pill-ok-bg)' : 'var(--bg-elevated)',
                      borderColor:
                        categoryFilter === 'only_new'
                          ? 'var(--pill-ok-border)'
                          : 'var(--border-subtle)',
                      color: 'var(--pill-ok-text)',
                    }}
                  >
                    NEW 本次新增 ({newTotalCount})
                  </button>
                )}

                <button
                  onClick={() => {
                    setCategoryFilter(categoryFilter === 'low_star' ? 'all' : 'low_star');
                    setActiveTab('reviews');
                  }}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer"
                  style={{
                    backgroundColor:
                      categoryFilter === 'low_star' ? 'var(--pill-err-bg)' : 'var(--bg-elevated)',
                    borderColor:
                      categoryFilter === 'low_star'
                        ? 'var(--pill-err-border)'
                        : 'var(--border-subtle)',
                    color:
                      categoryFilter === 'low_star'
                        ? 'var(--pill-err-text)'
                        : lowStarReviewCount > 0
                        ? 'var(--pill-err-text)'
                        : 'var(--text-secondary)',
                  }}
                >
                  差评 ≤3★ ({lowStarReviewCount})
                </button>

                {snapshot.categoryStats.map((stat) => {
                  const active = categoryFilter === stat.id;
                  const meta = CATEGORY_META[stat.id];
                  return (
                    <button
                      key={stat.id}
                      onClick={() => setCategoryFilter(active ? 'all' : stat.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-all cursor-pointer"
                      style={{
                        backgroundColor: active ? meta.bg : 'var(--bg-elevated)',
                        borderColor: active ? meta.border : 'var(--border-subtle)',
                        color: active ? meta.text : 'var(--text-secondary)',
                      }}
                    >
                      <span>{stat.label}</span>
                      <span className="font-mono font-semibold">{stat.count}</span>
                      {stat.lowStarCount > 0 && stat.id !== 'praise' && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-rose-500"
                          title={`含 ${stat.lowStarCount} 条 ≤3★ 低星评价`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                {aiReady ? (
                  <>
                    <span>
                      当前模型 <strong className="font-mono">{aiCfg?.model}</strong> · 可按需切换思考强度：
                    </span>
                    <div
                      className="inline-flex p-0.5 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {EFFORT_PILLS.map((opt) => {
                        const active = currentEffort === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.title}
                            disabled={Boolean(summarizingScope)}
                            onClick={() => handleSelectEffort(opt.id)}
                            className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold cursor-pointer transition-all disabled:opacity-50"
                            style={{
                              backgroundColor: active ? 'var(--bg-surface-strong)' : 'transparent',
                              color: active ? '#7C3AED' : 'var(--text-muted)',
                              boxShadow: active ? 'var(--card-shadow)' : 'none',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <span>
                    未配置内置 AI Key 时，可点「复制给 AI」秒贴到 Cursor / Antigravity，或点「配置 AI 总结」接入 DeepSeek / Ollama
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* AI Error Banner */}
          {aiErrorMsg && (
            <div
              className="rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: 'var(--pill-err-bg)',
                borderColor: 'var(--pill-err-border)',
                color: 'var(--pill-err-text)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{aiErrorMsg}</span>
              </div>
              <button
                onClick={onOpenSettings}
                className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold bg-white/80 text-slate-800 cursor-pointer shrink-0"
                style={{ borderColor: 'var(--pill-err-border)' }}
              >
                检查 AI 设置
              </button>
            </div>
          )}

          {/* AI Summary Panel */}
          {snapshot.aiSummary && (
            <div
              className="rounded-2xl border p-4 space-y-3"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--accent-primary)',
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-6 h-6 rounded-lg bg-violet-600 text-white flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold">AI 玩家问题诊断报告</span>
                  <span
                    className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md border"
                    style={{
                      backgroundColor:
                        snapshot.aiSummary.scope === 'new'
                          ? 'var(--pill-ok-bg)'
                          : 'var(--pill-info-bg)',
                      borderColor:
                        snapshot.aiSummary.scope === 'new'
                          ? 'var(--pill-ok-border)'
                          : 'var(--pill-info-border)',
                      color:
                        snapshot.aiSummary.scope === 'new'
                          ? 'var(--pill-ok-text)'
                          : 'var(--pill-info-text)',
                    }}
                  >
                    {snapshot.aiSummary.scope === 'new' ? '增量新增诊断' : '全量综合诊断'}
                  </span>
                  <span
                    className="text-[10.5px] font-mono px-2 py-0.5 rounded-md border"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {snapshot.aiSummary.model}
                  </span>
                  {snapshot.aiSummary.reasoningEffort && (
                    <span
                      className="text-[10.5px] px-2 py-0.5 rounded-md border"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {EFFORT_LABELS[snapshot.aiSummary.reasoningEffort]}
                      {snapshot.aiSummary.durationMs
                        ? ` · ${(snapshot.aiSummary.durationMs / 1000).toFixed(1)}s`
                        : ''}
                    </span>
                  )}
                  <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                    {formatRelativeTime(snapshot.aiSummary.generatedAt)}
                  </span>
                </div>
              </div>

              <div
                className="text-xs leading-relaxed px-3.5 py-2.5 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {snapshot.aiSummary.overview}
              </div>

              {snapshot.aiSummary.issues.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {snapshot.aiSummary.issues.map((issue) => {
                    const todoText = `[${issue.priority} · 玩家反馈] ${issue.title}${
                      issue.suggestedAction ? `（${issue.suggestedAction}）` : ''
                    }`;
                    const added = justAddedKeys[issue.id] || existingTodoTexts.has(todoText);
                    const catMeta = CATEGORY_META[issue.category] || CATEGORY_META.other;
                    return (
                      <div
                        key={issue.id}
                        className="rounded-xl border p-3 flex flex-col justify-between gap-2"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {renderIssuePriorityPill(issue.priority)}
                              <span
                                className="px-1.5 py-0.5 rounded-md text-[10px] font-medium border"
                                style={{
                                  backgroundColor: catMeta.bg,
                                  color: catMeta.text,
                                  borderColor: catMeta.border,
                                }}
                              >
                                {catMeta.label}
                              </span>
                              <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                                约 {issue.evidenceCount} 条提及
                              </span>
                            </div>

                            <button
                              onClick={() =>
                                handleAddToTodo(
                                  issue.id,
                                  todoText,
                                  issue.priority === 'P0' ? 'high' : 'normal'
                                )
                              }
                              className="h-6 px-2 rounded-lg text-[10.5px] font-semibold border flex items-center gap-1 shrink-0 cursor-pointer transition-all hover:border-blue-400"
                              style={{
                                backgroundColor: added ? 'var(--pill-ok-bg)' : 'var(--bg-surface-strong)',
                                borderColor: added ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                                color: added ? 'var(--pill-ok-text)' : 'var(--text-primary)',
                              }}
                            >
                              {added ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                              <span>{added ? '已转待办' : '转待办'}</span>
                            </button>
                          </div>

                          <div className="text-xs font-bold leading-snug">{issue.title}</div>
                          {issue.detail && (
                            <div
                              className="text-[11px] leading-relaxed"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {issue.detail}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          {issue.suggestedAction && (
                            <div className="text-[11px] leading-snug">
                              <span className="font-semibold text-blue-600">排查建议：</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{issue.suggestedAction}</span>
                            </div>
                          )}
                          {issue.devices && issue.devices.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <Smartphone className="w-3 h-3 opacity-60 shrink-0" />
                              {issue.devices.map((dev) => (
                                <span
                                  key={dev}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                                  style={{
                                    backgroundColor: 'var(--bg-surface-strong)',
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {dev}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {snapshot.aiSummary.highlights.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] font-semibold text-emerald-600 mr-1">玩家好评亮点：</span>
                  {snapshot.aiSummary.highlights.map((hl, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-full text-[11px] border"
                      style={{
                        backgroundColor: 'var(--pill-ok-bg)',
                        borderColor: 'var(--pill-ok-border)',
                        color: 'var(--pill-ok-text)',
                      }}
                    >
                      {hl}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Raw Reviews & Forum Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Tab Pills */}
              <div
                className="inline-flex p-1 rounded-xl border"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <button
                  onClick={() => setActiveTab('reviews')}
                  className="h-7 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                  style={{
                    backgroundColor:
                      activeTab === 'reviews' ? 'var(--bg-surface-strong)' : 'transparent',
                    color: activeTab === 'reviews' ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: activeTab === 'reviews' ? 'var(--card-shadow)' : 'none',
                  }}
                >
                  玩家评价 ({filteredReviews.length}/{snapshot.reviews.length})
                </button>
                <button
                  onClick={() => setActiveTab('forum')}
                  className="h-7 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                  style={{
                    backgroundColor:
                      activeTab === 'forum' ? 'var(--bg-surface-strong)' : 'transparent',
                    color: activeTab === 'forum' ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: activeTab === 'forum' ? 'var(--card-shadow)' : 'none',
                  }}
                >
                  论坛帖子 ({filteredForumPosts.length}/{snapshot.forumPosts.length})
                </button>
              </div>

              {/* Search & Sort Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {activeTab === 'reviews' && (
                  <div
                    className="inline-flex p-0.5 rounded-lg border text-[11px]"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      onClick={() => setReviewSort('latest')}
                      className="px-2 py-1 rounded-md font-medium cursor-pointer"
                      style={{
                        backgroundColor:
                          reviewSort === 'latest' ? 'var(--bg-surface-strong)' : 'transparent',
                        color: reviewSort === 'latest' ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      最新
                    </button>
                    <button
                      onClick={() => setReviewSort('low_first')}
                      className="px-2 py-1 rounded-md font-medium cursor-pointer"
                      style={{
                        backgroundColor:
                          reviewSort === 'low_first' ? 'var(--bg-surface-strong)' : 'transparent',
                        color:
                          reviewSort === 'low_first' ? 'var(--pill-err-text)' : 'var(--text-muted)',
                      }}
                    >
                      差评优先
                    </button>
                  </div>
                )}

                <div
                  className="h-7 px-2.5 rounded-xl border flex items-center gap-1.5 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Search className="w-3.5 h-3.5 opacity-55" />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜关键词 / 机型…"
                    className="bg-transparent outline-none text-[11.5px] w-36"
                  />
                </div>
              </div>
            </div>

            {/* Feed List */}
            <div className="max-h-[440px] overflow-y-auto pr-1 space-y-2">
              {activeTab === 'reviews' ? (
                filteredReviews.length === 0 ? (
                  <div
                    className="rounded-xl border py-8 text-center text-xs"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    当前筛选条件下没有匹配的玩家评价
                  </div>
                ) : (
                  filteredReviews.map((rev) => {
                    const isNew = newReviewIdSet.has(rev.id);
                    const snippet = rev.text.replace(/\s+/g, ' ').slice(0, 68);
                    const todoText = `[玩家评价 ${rev.score}★] ${snippet}${
                      rev.text.length > 68 ? '…' : ''
                    }`;
                    const todoKey = `rev-${rev.id}`;
                    const added = justAddedKeys[todoKey] || existingTodoTexts.has(todoText);
                    const starColor =
                      rev.score <= 2 ? '#F43F5E' : rev.score === 3 ? '#F59E0B' : '#14B8A6';

                    return (
                      <div
                        key={rev.id}
                        className="rounded-xl border px-3.5 py-3 space-y-1.5 transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-surface-strong)',
                          borderColor: isNew
                            ? 'var(--pill-ok-border)'
                            : rev.score <= 2
                            ? 'var(--pill-err-border)'
                            : 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap text-[11px]">
                            {isNew && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9.5px] font-bold tracking-wide">
                                NEW
                              </span>
                            )}
                            <span
                              className="inline-flex items-center gap-0.5 font-bold"
                              style={{ color: starColor }}
                            >
                              {Array.from({ length: 5 }).map((_, idx) => (
                                <Star
                                  key={idx}
                                  className="w-3 h-3"
                                  fill={idx < rev.score ? starColor : 'none'}
                                  strokeWidth={2}
                                />
                              ))}
                              <span className="ml-0.5 font-mono">{rev.score}★</span>
                            </span>
                            <span className="font-semibold">{rev.author}</span>
                            {rev.device && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono text-[10px] border"
                                style={{
                                  backgroundColor: 'var(--bg-elevated)',
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <Smartphone className="w-2.5 h-2.5" />
                                {rev.device}
                              </span>
                            )}
                            {rev.playedMinutes !== undefined && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[10.5px]"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <Timer className="w-3 h-3" />
                                游玩{' '}
                                {rev.playedMinutes >= 60
                                  ? `${(rev.playedMinutes / 60).toFixed(1)} 小时`
                                  : `${rev.playedMinutes} 分钟`}
                              </span>
                            )}
                            <span style={{ color: 'var(--text-muted)' }}>
                              {formatRelativeTime(rev.createdAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                handleAddToTodo(todoKey, todoText, rev.score <= 2 ? 'high' : 'normal')
                              }
                              className="h-6 px-2 rounded-lg text-[10.5px] font-medium border flex items-center gap-1 cursor-pointer hover:border-blue-400"
                              style={{
                                backgroundColor: added ? 'var(--pill-ok-bg)' : 'var(--bg-elevated)',
                                borderColor: added ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                                color: added ? 'var(--pill-ok-text)' : 'var(--text-secondary)',
                              }}
                            >
                              {added ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                              <span>{added ? '已转待办' : '转待办'}</span>
                            </button>
                            <button
                              onClick={() => window.gameHub.openExternal(rev.url)}
                              title="在浏览器查看原始评价"
                              className="h-6 w-6 rounded-lg border flex items-center justify-center cursor-pointer hover:border-blue-400 hover:text-blue-600"
                              style={{
                                backgroundColor: 'var(--bg-elevated)',
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div
                          className="text-xs leading-relaxed whitespace-pre-line"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {rev.text}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                          <div className="flex items-center gap-1 flex-wrap">
                            {rev.categories.map((cat) => {
                              const meta = CATEGORY_META[cat];
                              return (
                                <span
                                  key={cat}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                                  style={{
                                    backgroundColor: meta.bg,
                                    color: meta.text,
                                    borderColor: meta.border,
                                  }}
                                >
                                  {meta.label}
                                </span>
                              );
                            })}
                          </div>
                          {(rev.ups > 0 || rev.comments > 0) && (
                            <div
                              className="flex items-center gap-2.5 text-[10.5px]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <span className="inline-flex items-center gap-0.5">
                                <ThumbsUp className="w-3 h-3" />
                                {rev.ups}
                              </span>
                              <span>回复 {rev.comments}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )
              ) : filteredForumPosts.length === 0 ? (
                <div
                  className="rounded-xl border py-8 text-center text-xs"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  当前筛选条件下没有匹配的论坛帖子
                </div>
              ) : (
                filteredForumPosts.map((post) => {
                  const isNew = newForumIdSet.has(post.id);
                  const todoText = `[论坛反馈] ${post.title.slice(0, 68)}`;
                  const todoKey = `post-${post.id}`;
                  const added = justAddedKeys[todoKey] || existingTodoTexts.has(todoText);

                  return (
                    <div
                      key={post.id}
                      className="rounded-xl border px-3.5 py-3 space-y-1.5"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: isNew ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isNew && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9.5px] font-bold tracking-wide shrink-0">
                                NEW
                              </span>
                            )}
                            <span className="text-xs font-bold leading-snug">{post.title}</span>
                          </div>
                          <div
                            className="flex items-center gap-2 text-[10.5px] mt-0.5"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <span>{post.author}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(post.createdAt)}</span>
                            <span>·</span>
                            <span>{post.comments} 回复</span>
                            {post.ups > 0 && <span>· {post.ups} 赞</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() =>
                              handleAddToTodo(
                                todoKey,
                                todoText,
                                post.categories.includes('crash') || post.categories.includes('save')
                                  ? 'high'
                                  : 'normal'
                              )
                            }
                            className="h-6 px-2 rounded-lg text-[10.5px] font-medium border flex items-center gap-1 cursor-pointer hover:border-blue-400"
                            style={{
                              backgroundColor: added ? 'var(--pill-ok-bg)' : 'var(--bg-elevated)',
                              borderColor: added ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                              color: added ? 'var(--pill-ok-text)' : 'var(--text-secondary)',
                            }}
                          >
                            {added ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            <span>{added ? '已转待办' : '转待办'}</span>
                          </button>
                          <button
                            onClick={() => window.gameHub.openExternal(post.url)}
                            title="在浏览器打开论坛原帖"
                            className="h-6 w-6 rounded-lg border flex items-center justify-center cursor-pointer hover:border-blue-400 hover:text-blue-600"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {post.text && post.text !== post.title && (
                        <div
                          className="text-[11.5px] leading-relaxed line-clamp-3 whitespace-pre-line"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {post.text}
                        </div>
                      )}

                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {post.categories.map((cat) => {
                          const meta = CATEGORY_META[cat];
                          return (
                            <span
                              key={cat}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium border"
                              style={{
                                backgroundColor: meta.bg,
                                color: meta.text,
                                borderColor: meta.border,
                              }}
                            >
                              {meta.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {snapshot.warnings && snapshot.warnings.length > 0 && (
              <div className="text-[10.5px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                <span>{snapshot.warnings.join('；')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
