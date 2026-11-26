import React, { useEffect, useId, useState } from 'react';
import { Check, Copy, GitBranch } from 'lucide-react';

declare global {
  interface Window {
    mermaid?: {
      initialize: (cfg: Record<string, unknown>) => void;
      render: (id: string, definition: string) => Promise<{ svg: string }>;
    };
  }
}

interface MermaidDiagramProps {
  code: string;
  theme: 'light' | 'dark';
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, theme }) => {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string>('');
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const tryRender = async () => {
      if (cancelled) return;
      const m = window.mermaid;
      if (!m) {
        if (attempts < 15) {
          attempts++;
          retryTimer = setTimeout(tryRender, 180);
        } else {
          setFailed(true);
        }
        return;
      }

      try {
        const isDark = theme === 'dark';
        m.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: isDark
            ? {
                fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
                primaryColor: '#17382D',
                primaryTextColor: '#E6F4EE',
                primaryBorderColor: '#34D399',
                lineColor: '#6EE7B7',
                secondaryColor: '#1E293B',
                tertiaryColor: '#0F172A',
                edgeLabelBackground: '#111827',
              }
            : {
                fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
                primaryColor: '#E9F4EE',
                primaryTextColor: '#183C2E',
                primaryBorderColor: '#235D48',
                lineColor: '#5A7367',
                secondaryColor: '#F6F4EC',
                tertiaryColor: '#FFFFFF',
                edgeLabelBackground: '#FFFFFF',
              },
        });

        const renderId = `mmd_${reactId}_${Date.now()}`;
        const result = await m.render(renderId, code.trim());
        if (!cancelled) {
          setSvg(result.svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    tryRender();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [code, theme, reactId]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="my-4 rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface-strong)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div
        className="px-3.5 py-2 border-b flex items-center justify-between text-[11px]"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>
          <GitBranch className="w-3.5 h-3.5 text-emerald-600" />
          <span>分支流程图 · Mermaid</span>
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border cursor-pointer hover:border-emerald-500 transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? '已复制' : '复制源码'}</span>
        </button>
      </div>

      {svg && !failed ? (
        <div
          className="p-4 overflow-x-auto flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre
          className="p-4 text-[11.5px] font-mono overflow-x-auto leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          <code>{code.trim()}</code>
        </pre>
      )}
    </div>
  );
};
