import React, { useEffect, useState } from 'react';
import { Check, Copy, Sparkles, X } from 'lucide-react';
import { generateReleaseNotesDraft } from '../aiHelpers';
import { GitGraphData, ProjectCardData } from '../types';

interface ReleaseNotesModalProps {
  project: ProjectCardData;
  graph: GitGraphData | null;
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({
  project,
  graph,
  onClose,
}) => {
  const [scope, setScope] = useState<'since_prev' | 'recent_10' | 'recent_20'>('since_prev');
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(generateReleaseNotesDraft(project, graph, scope));
  }, [project, graph, scope]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="glass-drawer w-full max-w-xl rounded-2xl border p-5 space-y-4 shadow-2xl"
        style={{ borderColor: 'var(--border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold">自动生成本版更新日志</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-500/10 cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scope Selector */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            自动过滤云端同步，按 新增 / 优化 / 修复 归类，可直接微调
          </span>
          <div
            className="flex items-center p-0.5 rounded-xl border text-[11px]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {(
              [
                { id: 'since_prev', label: '本版以来' },
                { id: 'recent_10', label: '近 10 条' },
                { id: 'recent_20', label: '近 20 条' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className="px-2.5 py-1 rounded-lg font-medium cursor-pointer"
                style={{
                  backgroundColor: scope === s.id ? 'var(--bg-surface-strong)' : 'transparent',
                  color: scope === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={12}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full p-3.5 rounded-xl text-xs leading-relaxed outline-none resize-none font-sans border"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 px-3.5 rounded-xl text-xs font-medium border cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            关闭
          </button>
          <button
            onClick={handleCopy}
            className="h-8 px-4 rounded-xl text-xs font-semibold bg-blue-600 text-white flex items-center gap-1.5 cursor-pointer hover:opacity-92 shadow-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制到剪贴板！' : '一键复制去发版'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
