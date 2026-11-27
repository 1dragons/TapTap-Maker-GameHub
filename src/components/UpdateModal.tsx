import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { UpdateCheckResult, UpdateDownloadProgress } from '../types';

interface UpdateModalProps {
  info: UpdateCheckResult;
  checking: boolean;
  onRecheck: () => Promise<void>;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  info,
  checking,
  onRecheck,
  onClose,
}) => {
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = window.gameHub.onUpdateProgress((p) => {
      setProgress(p);
      if (p.stage === 'error') {
        setApplying(false);
        setApplyError(p.message);
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applying) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applying, onClose]);

  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    setApplyError(null);
    setProgress({
      stage: 'backup',
      percent: 2,
      message: '正在准备无损更新…',
    });
    try {
      const res = await window.gameHub.applyAppUpdate(info);
      if (!res.ok) {
        setApplying(false);
        setApplyError(res.error || '更新失败，请前往 Releases 页面手动下载');
      }
    } catch (err: any) {
      setApplying(false);
      setApplyError(err?.message || '更新异常');
    }
  };

  const modeBadge =
    info.installMode === 'installer'
      ? '安装版 · 保留配置无损升级'
      : info.installMode === 'portable'
      ? '绿色便携版 · 原地无损替换重启'
      : '源码开发模式';

  const canOneClickApply =
    info.ok &&
    info.hasUpdate &&
    info.installMode !== 'dev' &&
    Boolean(info.installerAsset || info.portableAsset);

  const selectedAsset =
    info.installMode === 'installer'
      ? info.installerAsset || info.portableAsset
      : info.portableAsset || info.installerAsset;

  const assetSizeMb = selectedAsset?.size
    ? `${(selectedAsset.size / (1024 * 1024)).toFixed(1)} MB`
    : '';

  const noteLines = (info.releaseNotes || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('|') && !l.startsWith('> 各发行包'))
    .slice(0, 14);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={() => {
        if (!applying) onClose();
      }}
    >
      <div
        className="w-full max-w-[540px] glass-drawer rounded-[24px] border overflow-hidden shadow-2xl"
        style={{ borderColor: 'var(--border-subtle)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                {info.hasUpdate
                  ? `发现新版本 v${info.latestVersion}`
                  : info.ok
                  ? '当前已是最新版本'
                  : '检查更新状态'}
              </h3>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {modeBadge}
              </div>
            </div>
          </div>

          {!applying && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-500/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Version Compare Pill */}
          <div
            className="rounded-2xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-500/10">
                当前 v{info.currentVersion}
              </span>
              {info.latestVersion && (
                <>
                  <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                  <span
                    className="font-mono font-bold px-2 py-0.5 rounded-md border"
                    style={{
                      backgroundColor: info.hasUpdate
                        ? 'var(--pill-ok-bg)'
                        : 'var(--pill-info-bg)',
                      borderColor: info.hasUpdate
                        ? 'var(--pill-ok-border)'
                        : 'var(--pill-info-border)',
                      color: info.hasUpdate ? 'var(--pill-ok-text)' : 'var(--pill-info-text)',
                    }}
                  >
                    最新 v{info.latestVersion}
                  </span>
                </>
              )}
            </div>

            {info.publishedAt && (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                发布于 {info.publishedAt.slice(0, 10)}
              </span>
            )}
          </div>

          {/* Lossless Guarantee Banner */}
          <div
            className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2 text-[11.5px] leading-relaxed"
            style={{
              backgroundColor: 'var(--pill-ok-bg)',
              borderColor: 'var(--pill-ok-border)',
              color: 'var(--pill-ok-text)',
            }}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>100% 无损保留数据</strong>：更新前自动备份本地{' '}
              <code className="font-mono">hub-state.json</code>（含项目配置、随手记、待办、构建打卡、AI Key
              与玩家评价缓存），仅替换程序文件，升级完成自动重启。
            </span>
          </div>

          {/* Error state */}
          {(!info.ok || applyError) && (
            <div
              className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2 text-xs"
              style={{
                backgroundColor: 'var(--pill-err-bg)',
                borderColor: 'var(--pill-err-border)',
                color: 'var(--pill-err-text)',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{applyError || info.error || '无法获取最新版本信息'}</span>
            </div>
          )}

          {/* Up to date notice */}
          {info.ok && !info.hasUpdate && !applyError && (
            <div
              className="rounded-xl border px-3.5 py-3 flex items-center gap-2 text-xs"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>你的 GameHub 已经是最新正式版（v{info.currentVersion}），无需更新。</span>
            </div>
          )}

          {/* Release Notes Preview */}
          {info.hasUpdate && noteLines.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                新版本更新内容
              </div>
              <div
                className="rounded-xl border p-3 max-h-44 overflow-y-auto space-y-1 text-[11.5px] leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {noteLines.map((line, i) => (
                  <div key={i}>{line.replace(/^#+\s*/, '').replace(/\*\*/g, '')}</div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar while updating */}
          {applying && progress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="font-medium truncate">{progress.message}</span>
                <span className="font-mono font-bold text-blue-600 shrink-0">
                  {progress.percent}%
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--border-subtle)' }}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-200"
                  style={{ width: `${Math.max(4, progress.percent)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="px-5 py-3.5 border-t flex items-center justify-between gap-2 flex-wrap"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            {info.releaseUrl && (
              <button
                onClick={() => window.gameHub.openExternal(info.releaseUrl!)}
                className="h-8 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:border-blue-400 hover:text-blue-600"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>Releases 页面</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            {!applying && (
              <button
                disabled={checking}
                onClick={onRecheck}
                className="h-8 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer hover:border-blue-400 disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
                <span>重新检测</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!applying && (
              <button
                onClick={onClose}
                className="h-8 px-3 rounded-xl border text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {info.hasUpdate ? '稍后更新' : '关闭'}
              </button>
            )}

            {canOneClickApply && (
              <button
                disabled={applying}
                onClick={handleApply}
                className="h-8 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-92 disabled:opacity-60 shadow-xs"
              >
                {applying ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>
                  {applying
                    ? '正在更新…'
                    : `立即无损更新${assetSizeMb ? ` (${assetSizeMb})` : ''}`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
