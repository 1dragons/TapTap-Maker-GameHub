import React, { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  Code2,
  Download,
  Eye,
  EyeOff,
  Flame,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  GitBranch,
  HardDrive,
  LayoutGrid,
  List,
  Moon,
  Palette,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AiProviderConfig,
  AiReasoningEffort,
  AppSettings,
  GlassBackdropId,
  GlassIntensityId,
  HubPersistedState,
  PreferredEditorId,
  UpdateCheckResult,
} from '../types';

interface SettingsViewProps {
  hubState: HubPersistedState;
  scanning: boolean;
  appVersion: string;
  updateInfo: UpdateCheckResult | null;
  checkingUpdate: boolean;
  onSetTheme: (theme: 'dark' | 'light') => Promise<void>;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onAddRoot: () => Promise<void>;
  onRemoveRoot: (rootPath: string) => Promise<void>;
  onRescanAll: () => Promise<void>;
  onRestoreRemoved: (projectPaths?: string[]) => Promise<void>;
  onStateReplaced: (next: HubPersistedState) => Promise<void>;
  onCheckUpdate: () => Promise<void>;
  onOpenUpdateModal: () => void;
}

const BACKDROP_PRESETS: {
  id: GlassBackdropId;
  name: string;
  preview: string;
}[] = [
  {
    id: 'aurora',
    name: '冰川极光',
    preview: 'linear-gradient(135deg, #BFDBFE 0%, #DDD6FE 52%, #A7F3D0 100%)',
  },
  {
    id: 'sakura',
    name: '樱花暖晨',
    preview: 'linear-gradient(135deg, #FECDD3 0%, #FDE68A 52%, #DDD6FE 100%)',
  },
  {
    id: 'mint',
    name: '薄荷森林',
    preview: 'linear-gradient(135deg, #A7F3D0 0%, #BAE6FD 55%, #CCFBF1 100%)',
  },
  {
    id: 'sunset',
    name: '日落琥珀',
    preview: 'linear-gradient(135deg, #FED7AA 0%, #FBCFE8 55%, #FEF08A 100%)',
  },
  {
    id: 'violet',
    name: '紫罗兰梦',
    preview: 'linear-gradient(135deg, #C4B5FD 0%, #BFDBFE 55%, #F5D0FE 100%)',
  },
  {
    id: 'snow',
    name: '极简纯雪',
    preview: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 60%, #EFF6FF 100%)',
  },
];

const AI_PROVIDER_PRESETS: {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  models: string[];
  hint: string;
}[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
    hint: 'DeepSeek 官方 OpenAI 兼容端点，支持 deepseek-flash / deepseek-v4-pro',
  },
  {
    id: 'qwen',
    label: '通义千问 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    hint: '阿里云百炼 OpenAI 兼容接口',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2.5',
    models: ['MiniMax-M2.5', 'MiniMax-M2.7', 'MiniMax-Text-01'],
    hint: 'MiniMax 官方 OpenAI 兼容端点',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4.5', 'glm-4-plus'],
    hint: '智谱开放平台轻量快速模型',
  },
  {
    id: 'ollama',
    label: '本地 Ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    models: ['qwen2.5:7b', 'qwen3:8b', 'deepseek-r1:8b'],
    hint: '100% 本地离线推理，API Key 可留空',
  },
];

const REASONING_EFFORT_OPTIONS: {
  id: AiReasoningEffort;
  label: string;
  desc: string;
}[] = [
  { id: 'none', label: '极速（关思考）', desc: '关闭深度思考，2~4秒极速出结论' },
  { id: 'low', label: '轻度思考（推荐）', desc: '兼顾速度与归类准确度，约 4~8秒' },
  { id: 'high', label: '深度思考', desc: 'DeepSeek 默认档位，分析更深但较慢' },
  { id: 'max', label: '极致思考', desc: '最大推理预算，适合几百条复杂舆情' },
];

const AppleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  onChange,
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="w-11 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer shrink-0"
    style={{
      backgroundColor: checked ? '#10B981' : 'var(--border-strong)',
    }}
  >
    <div
      className="w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
      style={{
        transform: checked ? 'translateX(20px)' : 'translateX(0px)',
      }}
    />
  </button>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  hubState,
  scanning,
  appVersion,
  updateInfo,
  checkingUpdate,
  onSetTheme,
  onUpdateSettings,
  onAddRoot,
  onRemoveRoot,
  onRescanAll,
  onRestoreRemoved,
  onStateReplaced,
  onCheckUpdate,
  onOpenUpdateModal,
}) => {
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [dataPath, setDataPath] = useState('');
  const [sopInfo, setSopInfo] = useState<{ rootPath: string; source: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const settings = hubState.settings;
  const [aiForm, setAiForm] = useState<AiProviderConfig>({
    baseUrl: settings.ai?.baseUrl || '',
    apiKey: settings.ai?.apiKey || '',
    model: settings.ai?.model || '',
    reasoningEffort: settings.ai?.reasoningEffort || 'low',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);

  const matchedPreset = AI_PROVIDER_PRESETS.find((p) => {
    const cur = aiForm.baseUrl.trim().replace(/\/+$/, '');
    return cur === p.baseUrl || cur === `${p.baseUrl}/v1`;
  });
  const modelSuggestions = fetchedModels.length > 0 ? fetchedModels : matchedPreset?.models || [];

  useEffect(() => {
    setAiForm({
      baseUrl: settings.ai?.baseUrl || '',
      apiKey: settings.ai?.apiKey || '',
      model: settings.ai?.model || '',
      reasoningEffort: settings.ai?.reasoningEffort || 'low',
    });
  }, [
    settings.ai?.baseUrl,
    settings.ai?.apiKey,
    settings.ai?.model,
    settings.ai?.reasoningEffort,
  ]);
  const removedIds = Object.entries(hubState.projects || {})
    .filter(([, meta]) => meta?.removed)
    .map(([id, meta]) => ({
      id,
      label: meta.displayName || id.split('\\').pop() || id,
    }));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 2600);
  };

  useEffect(() => {
    (async () => {
      const [startup, dp, sop] = await Promise.all([
        window.gameHub.getLoginStartup(),
        window.gameHub.getDataPath(),
        window.gameHub.getSopLibrary(),
      ]);
      setOpenAtLogin(startup);
      if (dp) setDataPath(dp);
      if (sop) setSopInfo({ rootPath: sop.rootPath, source: sop.source });
    })();
  }, [settings.sopPath]);

  const handleToggleStartup = async (next: boolean) => {
    const actual = await window.gameHub.setLoginStartup(next);
    setOpenAtLogin(actual);
    showToast(actual ? '已开启开机自动启动' : '已关闭开机自动启动');
  };

  const handleExport = async () => {
    const saved = await window.gameHub.exportBackup();
    if (saved) showToast(`备份已导出至 ${saved}`);
  };

  const handleImport = async () => {
    const restored = await window.gameHub.importBackup();
    if (restored) {
      await onStateReplaced(restored);
      showToast('备份已恢复并重新加载');
    }
  };

  const handleSaveAiConfig = async () => {
    await onUpdateSettings({
      ai: {
        baseUrl: aiForm.baseUrl.trim(),
        apiKey: aiForm.apiKey.trim(),
        model: aiForm.model.trim(),
        reasoningEffort: aiForm.reasoningEffort || 'low',
      },
    });
    setAiTestResult(null);
    showToast('AI 总结接口配置已保存至本地');
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await window.gameHub.testAiConnection(aiForm);
      if (res.ok) {
        setAiTestResult({
          ok: true,
          msg: `连接成功！可用模型：${res.model || aiForm.model}`,
        });
      } else {
        setAiTestResult({
          ok: false,
          msg: res.error || '连接失败',
        });
      }
    } catch (err: any) {
      setAiTestResult({ ok: false, msg: err?.message || '连接异常' });
    } finally {
      setTestingAi(false);
    }
  };

  const handleFetchModels = async () => {
    setLoadingModels(true);
    setAiTestResult(null);
    try {
      const res = await window.gameHub.listAiModels(aiForm);
      if (res.ok && res.models && res.models.length > 0) {
        setFetchedModels(res.models);
        if (!aiForm.model.trim() || !res.models.includes(aiForm.model.trim())) {
          setAiForm((prev) => ({ ...prev, model: res.models![0] }));
        }
        setAiTestResult({
          ok: true,
          msg: `已获取 ${res.models.length} 个实时可用模型，点击下方标签可直接切换`,
        });
      } else {
        setAiTestResult({ ok: false, msg: res.error || '获取模型列表失败' });
      }
    } catch (err: any) {
      setAiTestResult({ ok: false, msg: err?.message || '获取模型列表异常' });
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <div className="max-w-[1120px] mx-auto px-7 py-6 space-y-5">
      {/* Feedback Toast */}
      {toast && (
        <div
          className="fixed bottom-5 right-6 z-50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg border flex items-center gap-2 glass-drawer"
          style={{
            borderColor: 'var(--pill-ok-border)',
            color: 'var(--pill-ok-text)',
          }}
        >
          <Check className="w-4 h-4" />
          <span>{toast}</span>
        </div>
      )}

      {/* Section 1: Appearance & Apple Frosted Glass */}
      <section className="glass-card rounded-[22px] p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold">外观与毛玻璃质感</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              所有主题与毛玻璃效果即时生效
            </p>
          </div>
        </div>

        {/* Light / Dark Mode + Default Home Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="p-3.5 rounded-2xl border space-y-2.5"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span className="text-xs font-semibold block">主题外观</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetTheme('light')}
                className="h-11 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer"
                style={{
                  backgroundColor: hubState.theme === 'light' ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                  borderColor: hubState.theme === 'light' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  color: hubState.theme === 'light' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}
              >
                <Sun className="w-4 h-4 text-amber-500" />
                <span>浅色毛玻璃</span>
              </button>
              <button
                onClick={() => onSetTheme('dark')}
                className="h-11 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer"
                style={{
                  backgroundColor: hubState.theme === 'dark' ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                  borderColor: hubState.theme === 'dark' ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  color: hubState.theme === 'dark' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}
              >
                <Moon className="w-4 h-4 text-indigo-400" />
                <span>深色静谧</span>
              </button>
            </div>
          </div>

          <div
            className="p-3.5 rounded-2xl border space-y-2.5"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span className="text-xs font-semibold block">毛玻璃通透度</span>
            <div
              className="grid grid-cols-3 p-1 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {(
                [
                  { id: 'clear', label: '清透' },
                  { id: 'balanced', label: '标准' },
                  { id: 'frosted', label: '浓雾' },
                ] as { id: GlassIntensityId; label: string }[]
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onUpdateSettings({ glassIntensity: item.id })}
                  className="h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                  style={{
                    backgroundColor:
                      settings.glassIntensity === item.id ? 'var(--bg-surface-strong)' : 'transparent',
                    color:
                      settings.glassIntensity === item.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: settings.glassIntensity === item.id ? 'var(--card-shadow)' : 'none',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 6 Apple Ambient Backdrops */}
        <div className="space-y-2.5">
          <span className="text-xs font-semibold block">浅色毛玻璃氛围底色</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {BACKDROP_PRESETS.map((bg) => {
              const active = settings.backdrop === bg.id;
              return (
                <button
                  key={bg.id}
                  onClick={() => {
                    if (hubState.theme !== 'light') onSetTheme('light');
                    onUpdateSettings({ backdrop: bg.id });
                  }}
                  className="group rounded-2xl p-2 border transition-all cursor-pointer text-left"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    boxShadow: active ? '0 0 0 2px rgba(37, 99, 235, 0.22)' : 'none',
                  }}
                >
                  <div
                    className="h-12 rounded-xl relative overflow-hidden border border-white/80"
                    style={{ background: bg.preview }}
                  >
                    {active && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <div className="text-[11.5px] font-medium text-center mt-2">{bg.name}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Default Home View */}
        <div
          className="pt-3 border-t flex items-center justify-between gap-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <div className="text-xs font-semibold">首页默认展示视图</div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              启动软件时默认使用画廊卡片或精简表格
            </div>
          </div>
          <div
            className="flex items-center p-1 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <button
              onClick={() => onUpdateSettings({ defaultViewMode: 'grid' })}
              className="h-7 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor:
                  settings.defaultViewMode === 'grid' ? 'var(--bg-surface-strong)' : 'transparent',
                color:
                  settings.defaultViewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>卡片网格</span>
            </button>
            <button
              onClick={() => onUpdateSettings({ defaultViewMode: 'table' })}
              className="h-7 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor:
                  settings.defaultViewMode === 'table' ? 'var(--bg-surface-strong)' : 'transparent',
                color:
                  settings.defaultViewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <List className="w-3.5 h-3.5" />
              <span>精简列表</span>
            </button>
          </div>
        </div>
      </section>

      {/* Section 2 & 3: 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Scan Directories & Auto-Archive */}
        <section className="glass-card rounded-[22px] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-sky-500/15 text-sky-600 flex items-center justify-center">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <h2 className="text-[14px] font-semibold">游戏目录与扫描</h2>
              </div>

              <button
                onClick={onRescanAll}
                className="h-7 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1 border cursor-pointer hover:opacity-90"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin text-blue-600' : ''}`} />
                <span>重新扫描</span>
              </button>
            </div>

            <div className="space-y-2">
              {hubState.roots.map((r) => (
                <div
                  key={r}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-mono"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <span className="truncate">{r}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => window.gameHub.openFolder(r)}
                      title="打开文件夹"
                      className="p-1 rounded-lg hover:bg-blue-500/10 text-blue-600 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    {hubState.roots.length > 1 && (
                      <button
                        onClick={() => onRemoveRoot(r)}
                        title="移除此目录"
                        className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onAddRoot}
              className="w-full h-9 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-92 shadow-xs"
            >
              <FolderPlus className="w-4 h-4" />
              <span>添加游戏根目录</span>
            </button>
          </div>

          <div
            className="pt-3.5 border-t space-y-2"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold">SOP 资料库目录</div>
                <div className="text-[10.5px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                  {sopInfo?.rootPath || '使用软件内置开源 SOP'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={async () => {
                    const picked = await window.gameHub.pickFolder();
                    if (picked) {
                      await onUpdateSettings({ sopPath: picked });
                      showToast('已切换自定义 SOP 目录');
                    }
                  }}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-medium border cursor-pointer hover:border-blue-400 hover:text-blue-600"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  自定义
                </button>
                {settings.sopPath && (
                  <button
                    onClick={async () => {
                      await onUpdateSettings({ sopPath: '' });
                      showToast('已恢复默认 SOP');
                    }}
                    className="h-7 px-2 rounded-lg text-[11px] border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    默认
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className="pt-3.5 border-t flex items-center justify-between gap-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div>
              <div className="text-xs font-semibold">自动归档空目录与脱敏副本</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                新扫到含「脱敏 / 备份」或空文件夹时自动归档
              </div>
            </div>
            <AppleSwitch
              checked={settings.autoArchiveCopies}
              onChange={async (v) => {
                await onUpdateSettings({ autoArchiveCopies: v });
                await onRescanAll();
              }}
            />
          </div>

          {removedIds.length > 0 && (
            <div
              className="pt-3.5 border-t space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  已从软件移除的项目 ({removedIds.length})
                </span>
                <button
                  onClick={async () => {
                    await onRestoreRemoved();
                    showToast('已全部恢复显示');
                  }}
                  className="text-[11px] font-medium text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>全部恢复</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {removedIds.map((item) => (
                  <button
                    key={item.id}
                    onClick={async () => {
                      await onRestoreRemoved([item.id]);
                      showToast(`已恢复显示：${item.label}`);
                    }}
                    title="点击恢复在软件中显示"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border cursor-pointer hover:border-blue-400 hover:text-blue-600"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>{item.label}</span>
                    <RotateCcw className="w-2.5 h-2.5 opacity-65" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Editor & Git Preferences */}
        <section className="glass-card rounded-[22px] p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-violet-500/15 text-violet-600 flex items-center justify-center">
              <Code2 className="w-4 h-4" />
            </div>
            <h2 className="text-[14px] font-semibold">开发工具与 Git 演进树</h2>
          </div>

          {/* Preferred Editor */}
          <div className="space-y-2">
            <div className="text-xs font-semibold">默认代码编辑器</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'auto', label: '自动识别' },
                  { id: 'cursor', label: 'Cursor' },
                  { id: 'code', label: 'VS Code' },
                  { id: 'trae', label: 'Trae' },
                ] as { id: PreferredEditorId; label: string }[]
              ).map((ed) => (
                <button
                  key={ed.id}
                  onClick={() => onUpdateSettings({ preferredEditor: ed.id })}
                  className="h-8 rounded-xl border text-xs font-medium transition-all cursor-pointer"
                  style={{
                    backgroundColor:
                      settings.preferredEditor === ed.id
                        ? 'var(--accent-soft)'
                        : 'var(--bg-surface-strong)',
                    borderColor:
                      settings.preferredEditor === ed.id
                        ? 'var(--accent-primary)'
                        : 'var(--border-subtle)',
                    color:
                      settings.preferredEditor === ed.id
                        ? 'var(--accent-primary)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {ed.label}
                </button>
              ))}
            </div>
          </div>

          {/* Git Commit Limit */}
          <div
            className="pt-3 border-t flex items-center justify-between gap-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-blue-600" />
              <div>
                <div className="text-xs font-semibold">Git 演进树加载深度</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  单项目最多显示的最近提交节点数
                </div>
              </div>
            </div>
            <div
              className="flex items-center p-0.5 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {[50, 100, 200].map((num) => (
                <button
                  key={num}
                  onClick={() => onUpdateSettings({ gitCommitLimit: num })}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer"
                  style={{
                    backgroundColor:
                      settings.gitCommitLimit === num ? 'var(--bg-surface-strong)' : 'transparent',
                    color:
                      settings.gitCommitLimit === num ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Default Hide Cloud Sync */}
          <div
            className="pt-3 border-t flex items-center justify-between gap-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div>
              <div className="text-xs font-semibold">默认过滤「云端同步」提交</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                打开 Git 树时自动隐藏零碎的 sync 记录，只看关键开发节点
              </div>
            </div>
            <AppleSwitch
              checked={settings.gitHideSyncByDefault}
              onChange={(v) => onUpdateSettings({ gitHideSyncByDefault: v })}
            />
          </div>
        </section>
      </div>

      {/* Section 3.5: Optional BYOK AI Feedback Summary */}
      <section className="glass-card rounded-[22px] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-violet-500/15 text-violet-600 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">
                AI 玩家反馈总结接口（可选 · 自带 Key / 本地 Ollama）
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                不配置也能免费拉取评价、本地自动分类并「一键复制给 AI」；配置后可在项目页点击「AI 一键总结问题」
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {AI_PROVIDER_PRESETS.map((preset) => {
              const curUrl = aiForm.baseUrl.trim().replace(/\/+$/, '');
              const active = curUrl === preset.baseUrl || curUrl === `${preset.baseUrl}/v1`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.hint}
                  onClick={() => {
                    setAiForm((prev) => ({
                      ...prev,
                      baseUrl: preset.baseUrl,
                      model: preset.model,
                      apiKey: preset.id === 'ollama' ? '' : prev.apiKey,
                    }));
                    setFetchedModels([]);
                    setAiTestResult(null);
                  }}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-medium border cursor-pointer transition-all hover:border-violet-400"
                  style={{
                    backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface-strong)',
                    borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold block">API Base URL（OpenAI 兼容）</label>
            <input
              value={aiForm.baseUrl}
              onChange={(e) => {
                setAiForm((prev) => ({ ...prev, baseUrl: e.target.value }));
                setFetchedModels([]);
              }}
              placeholder="例如 https://api.deepseek.com"
              className="w-full h-9 px-3 rounded-xl border text-xs font-mono outline-none focus:border-blue-500"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-semibold">模型名称（Model）</label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={loadingModels}
                title="向当前接口 /models 拉取真实可用模型列表"
                className="text-[10.5px] font-medium text-violet-600 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${loadingModels ? 'animate-spin' : ''}`} />
                <span>{loadingModels ? '拉取中…' : '拉取实时模型'}</span>
              </button>
            </div>
            <input
              value={aiForm.model}
              onChange={(e) => setAiForm((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="例如 deepseek-flash / deepseek-v4-pro"
              className="w-full h-9 px-3 rounded-xl border text-xs font-mono outline-none focus:border-blue-500"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold block">
              API Key（本地 Ollama 可留空）
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={aiForm.apiKey}
                onChange={(e) => setAiForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full h-9 pl-3 pr-9 rounded-xl border text-xs font-mono outline-none focus:border-blue-500"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                title={showApiKey ? '隐藏 Key' : '显示 Key'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-65 hover:opacity-100 cursor-pointer"
              >
                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Clickable Model Quick-Picker Pills */}
        {modelSuggestions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10.5px] font-medium mr-0.5" style={{ color: 'var(--text-muted)' }}>
              {fetchedModels.length > 0 ? '接口实时模型：' : '快捷模型：'}
            </span>
            {modelSuggestions.slice(0, 12).map((m) => {
              const selected = aiForm.model.trim() === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAiForm((prev) => ({ ...prev, model: m }))}
                  className="px-2 py-0.5 rounded-lg text-[11px] font-mono border cursor-pointer transition-all hover:border-violet-400"
                  style={{
                    backgroundColor: selected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    borderColor: selected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}

        {/* Reasoning Effort Selector */}
        <div
          className="pt-3 border-t flex items-center justify-between gap-3 flex-wrap"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <div className="text-xs font-semibold">AI 思考强度（速度 vs 深度）</div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {
                REASONING_EFFORT_OPTIONS.find(
                  (o) => o.id === (aiForm.reasoningEffort || 'low')
                )?.desc
              }
            </div>
          </div>

          <div
            className="inline-flex p-1 rounded-xl border flex-wrap"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {REASONING_EFFORT_OPTIONS.map((opt) => {
              const active = (aiForm.reasoningEffort || 'low') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.desc}
                  onClick={() => setAiForm((prev) => ({ ...prev, reasoningEffort: opt.id }))}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-all"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface-strong)' : 'transparent',
                    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                    boxShadow: active ? 'var(--card-shadow)' : 'none',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Key 仅保存在本地 hub-state.json，仅在你主动点击「AI 一键总结」时请求指定接口</span>
          </div>

          <div className="flex items-center gap-2">
            {(aiForm.baseUrl || aiForm.apiKey || aiForm.model) && (
              <button
                type="button"
                onClick={async () => {
                  const empty: AiProviderConfig = {
                    baseUrl: '',
                    apiKey: '',
                    model: '',
                    reasoningEffort: 'low',
                  };
                  setAiForm(empty);
                  setFetchedModels([]);
                  setAiTestResult(null);
                  await onUpdateSettings({ ai: empty });
                  showToast('已清空 AI 接口配置');
                }}
                className="h-8 px-2.5 rounded-xl border text-xs font-medium cursor-pointer hover:text-rose-600"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                清空
              </button>
            )}
            <button
              type="button"
              onClick={handleTestAi}
              disabled={testingAi}
              className="h-8 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:border-violet-400 hover:text-violet-600 disabled:opacity-60"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingAi ? 'animate-spin' : ''}`} />
              <span>{testingAi ? '测试中…' : '测试连接'}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAiConfig}
              className="h-8 px-3.5 rounded-xl bg-violet-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-92 shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>保存 AI 配置</span>
            </button>
          </div>
        </div>

        {aiTestResult && (
          <div
            className="px-3.5 py-2 rounded-xl border text-xs font-medium"
            style={{
              backgroundColor: aiTestResult.ok ? 'var(--pill-ok-bg)' : 'var(--pill-err-bg)',
              borderColor: aiTestResult.ok ? 'var(--pill-ok-border)' : 'var(--pill-err-border)',
              color: aiTestResult.ok ? 'var(--pill-ok-text)' : 'var(--pill-err-text)',
            }}
          >
            {aiTestResult.msg}
          </div>
        )}
      </section>

      {/* Section 4: System Startup, Lossless Update & Local Data Backup */}
      <section className="glass-card rounded-[22px] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <h2 className="text-[14px] font-semibold">系统启动、软件无损更新与数据备份</h2>
          </div>

          <div className="flex items-center gap-2">
            {updateInfo?.hasUpdate && updateInfo.latestVersion && (
              <button
                onClick={onOpenUpdateModal}
                className="h-8 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: 'var(--pill-ok-bg)',
                  borderColor: 'var(--pill-ok-border)',
                  color: 'var(--pill-ok-text)',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>发现新版 v{updateInfo.latestVersion} · 立即无损更新</span>
              </button>
            )}
            <button
              disabled={checkingUpdate}
              onClick={onCheckUpdate}
              className="h-8 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:border-blue-400 hover:text-blue-600 disabled:opacity-60"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin text-blue-600' : ''}`} />
              <span>{checkingUpdate ? '检测更新中…' : '检测新版本'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Auto Check Update Toggle */}
          <div
            className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold">启动时自动检测更新</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  仅读取 GitHub 公开版本号，升级前自动备份数据
                </div>
              </div>
            </div>
            <AppleSwitch
              checked={settings.autoCheckUpdate !== false}
              onChange={(v) => onUpdateSettings({ autoCheckUpdate: v })}
            />
          </div>

          {/* Daily Auto Fetch TapTap Heat & Followers Toggle */}
          <div
            className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Flame className="w-4 h-4 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold">每日首次打开自动抓取 TapTap 热度与关注</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  每天最多自动抓取 1 次，逐款间隔 1.1~1.7 秒防 IP 风控；随时可手动刷新
                </div>
              </div>
            </div>
            <AppleSwitch
              checked={settings.autoFetchTapTapStatsDaily !== false}
              onChange={(v) => onUpdateSettings({ autoFetchTapTapStatsDaily: v })}
            />
          </div>

          {/* Startup Toggle */}
          <div
            className="p-3.5 rounded-2xl border flex items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <Power className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-semibold">开机自动启动 GameHub</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  进入 Windows 桌面后自动打开总控台
                </div>
              </div>
            </div>
            <AppleSwitch checked={openAtLogin} onChange={handleToggleStartup} />
          </div>

          {/* Export / Import */}
          <div
            className="p-3.5 rounded-2xl border flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold">配置与随手记备份</div>
              <div className="text-[10.5px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                {dataPath}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => window.gameHub.openFolder(dataPath.replace(/\\[^\\]+$/, ''))}
                title="打开数据目录"
                className="h-8 px-2.5 rounded-xl border text-xs font-medium cursor-pointer hover:opacity-90"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                打开
              </button>
              <button
                onClick={handleExport}
                className="h-8 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer hover:border-blue-400 hover:text-blue-600"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出</span>
              </button>
              <button
                onClick={handleImport}
                className="h-8 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer hover:border-emerald-500 hover:text-emerald-600"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>导入</span>
              </button>
            </div>
          </div>
        </div>

        {/* Minimal About Strip */}
        <div
          className="pt-3 border-t flex items-center justify-between text-[11.5px]"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <span className="inline-flex items-center gap-2">
            <Gamepad2 className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              GameHub 游戏总控台
            </span>
            <span className="font-mono">v{appVersion || '1.3.0'}</span>
          </span>
          <span>默认本地只读 · 联网仅按需触发 · 绝不上传或修改你的游戏源码</span>
        </div>
      </section>
    </div>
  );
};
