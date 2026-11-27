import React, { useEffect, useId, useState } from 'react';
import { Check, Copy, GitBranch, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react';

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

interface ViewBoxSize {
  w: number;
  h: number;
}

function parseSvgViewBox(svgStr: string): ViewBoxSize {
  const vbMatch = svgStr.match(/viewBox="([^"]+)"/i);
  if (vbMatch) {
    const nums = vbMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (nums.length === 4 && nums[2] > 0 && nums[3] > 0) {
      return { w: nums[2], h: nums[3] };
    }
  }
  const wMatch = svgStr.match(/\bwidth="([0-9.]+)"/i);
  const hMatch = svgStr.match(/\bheight="([0-9.]+)"/i);
  const w = wMatch ? Number(wMatch[1]) : 960;
  const h = hMatch ? Number(hMatch[1]) : 540;
  return { w: w > 0 ? w : 960, h: h > 0 ? h : 540 };
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, theme }) => {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string>('');
  const [vb, setVb] = useState<ViewBoxSize>({ w: 960, h: 540 });
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fitScreen, setFitScreen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);

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
          flowchart: {
            htmlLabels: true,
            useMaxWidth: false,
            nodeSpacing: 32,
            rankSpacing: 44,
            padding: 14,
          },
          theme: 'base',
          themeVariables: isDark
            ? {
                fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
                fontSize: '14px',
                primaryColor: '#17382D',
                primaryTextColor: '#E6F4EE',
                primaryBorderColor: '#34D399',
                lineColor: '#6EE7B7',
                secondaryColor: '#1E293B',
                tertiaryColor: '#0F172A',
                clusterBkg: '#0F172A',
                clusterBorder: '#334155',
                edgeLabelBackground: '#111827',
              }
            : {
                fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
                fontSize: '14px',
                primaryColor: '#E9F4EE',
                primaryTextColor: '#183C2E',
                primaryBorderColor: '#235D48',
                lineColor: '#5A7367',
                secondaryColor: '#F6F4EC',
                tertiaryColor: '#FFFFFF',
                clusterBkg: '#F8FAFC',
                clusterBorder: '#CBD5E1',
                edgeLabelBackground: '#FFFFFF',
              },
        });

        const renderId = `mmd_${reactId}_${Date.now()}`;
        const result = await m.render(renderId, code.trim());
        if (!cancelled) {
          const parsedVb = parseSvgViewBox(result.svg);
          // Make SVG fill its sized wrapper cleanly with crisp vector scaling
          const normalizedSvg = result.svg.replace(/<svg([^>]*)>/i, (_full, attrs: string) => {
            const cleaned = attrs
              .replace(/\sstyle="[^"]*"/gi, '')
              .replace(/\swidth="[^"]*"/gi, '')
              .replace(/\sheight="[^"]*"/gi, '');
            const hasViewBox = /\bviewBox=/i.test(cleaned);
            const vbAttr = hasViewBox ? '' : ` viewBox="0 0 ${parsedVb.w} ${parsedVb.h}"`;
            return `<svg${cleaned}${vbAttr} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
          });
          setVb(parsedVb);
          setSvg(normalizedSvg);
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

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const ratio = vb.w / Math.max(1, vb.h);
  const scaleFactor = zoom / 100;

  return (
    <>
      <div
        className="my-4 rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface-strong)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="px-3.5 py-2 border-b flex items-center justify-between gap-2 flex-wrap text-[11px]"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <span
            className="inline-flex items-center gap-1.5 font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-600" />
            <span>分支流程图 · Mermaid</span>
          </span>

          <div className="flex items-center gap-1.5">
            {svg && !failed && (
              <>
                <button
                  onClick={() => setFitScreen((v) => !v)}
                  title={fitScreen ? '切换到原始像素尺寸浏览' : '缩放到一屏完整查看'}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border cursor-pointer hover:border-emerald-500 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {fitScreen ? (
                    <Maximize2 className="w-3 h-3" />
                  ) : (
                    <Minimize2 className="w-3 h-3" />
                  )}
                  <span>{fitScreen ? '原始尺寸' : '适应一屏'}</span>
                </button>

                <button
                  onClick={() => {
                    setZoom(100);
                    setFullscreen(true);
                  }}
                  title="全屏矢量放大查看流程图"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border cursor-pointer hover:border-emerald-500 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <ZoomIn className="w-3 h-3 text-emerald-600" />
                  <span>全屏查看</span>
                </button>
              </>
            )}

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
        </div>

        {svg && !failed ? (
          fitScreen ? (
            <div className="p-4 flex justify-center items-center overflow-hidden">
              <div
                style={{
                  width: `min(100%, ${Math.round(520 * ratio)}px)`,
                  aspectRatio: `${vb.w} / ${vb.h}`,
                  maxHeight: '520px',
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          ) : (
            <div className="p-4 overflow-auto max-h-[75vh]">
              <div
                className="mx-auto"
                style={{
                  width: `${Math.round(vb.w)}px`,
                  height: `${Math.round(vb.h)}px`,
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          )
        ) : (
          <pre
            className="p-4 text-[11.5px] font-mono overflow-x-auto leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            <code>{code.trim()}</code>
          </pre>
        )}
      </div>

      {/* Fullscreen Crisp Vector Zoom Modal */}
      {fullscreen && svg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="w-[94vw] h-[92vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 py-2.5 border-b flex items-center justify-between gap-3 text-xs shrink-0"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <GitBranch className="w-4 h-4 text-emerald-600" />
                <span>完整分支流程图（矢量全屏）</span>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoom((z) => Math.max(60, z - 20))}
                  title="缩小"
                  className="h-7 px-2 rounded-lg border flex items-center cursor-pointer hover:border-emerald-500"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoom(100)}
                  title="重置为铺满全屏"
                  className="h-7 px-2.5 rounded-lg border font-mono text-[11px] cursor-pointer hover:border-emerald-500"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {zoom}%
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(240, z + 20))}
                  title="放大"
                  className="h-7 px-2 rounded-lg border flex items-center cursor-pointer hover:border-emerald-500"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setFullscreen(false)}
                  title="关闭 (ESC)"
                  className="h-7 w-7 rounded-lg border flex items-center justify-center cursor-pointer hover:text-rose-500 ml-1"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 flex">
              <div
                className="m-auto shrink-0"
                style={{
                  width: `calc(min(88vw, 78vh * ${ratio.toFixed(4)}) * ${scaleFactor})`,
                  height: `calc(min(78vh, 88vw / ${ratio.toFixed(4)}) * ${scaleFactor})`,
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
