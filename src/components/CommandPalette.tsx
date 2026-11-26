import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Code2,
  CornerDownLeft,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Lightbulb,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { ProjectCardData, QuickFilterId } from '../types';
import { mediaUrl } from '../utils';

interface CommandPaletteProps {
  projects: ProjectCardData[];
  theme: 'dark' | 'light';
  onClose: () => void;
  onSelectProject: (id: string) => void;
  onNavigateView: (view: QuickFilterId) => void;
  onQuickAddGlobalNote: (text: string) => Promise<void>;
  onToggleTheme: () => Promise<void>;
  onRefreshAll: () => Promise<void>;
}

interface PaletteItem {
  id: string;
  section: 'capture' | 'games' | 'commands';
  title: string;
  subtitle?: string;
  thumb?: string | null;
  icon?: React.ReactNode;
  project?: ProjectCardData;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  projects,
  theme,
  onClose,
  onSelectProject,
  onNavigateView,
  onQuickAddGlobalNote,
  onToggleTheme,
  onRefreshAll,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const activeProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const ql = q.toLowerCase();
    const list: PaletteItem[] = [];

    // Instant note capture whenever user types anything
    if (q.length > 0) {
      const cleanNote = q.replace(/^[>：:\s]+/, '').trim();
      if (cleanNote) {
        list.push({
          id: 'quick-note-capture',
          section: 'capture',
          title: `秒记为全局灵感：「${cleanNote}」`,
          subtitle: '直接存入灵感与待办箱',
          icon: <Lightbulb className="w-4 h-4 text-amber-500" />,
          run: async () => {
            await onQuickAddGlobalNote(cleanNote);
            onClose();
          },
        });
      }
    }

    // Matching games
    const matchedGames = activeProjects.filter((p) => {
      if (!ql) return true;
      const hay = `${p.name} ${p.folderName} ${p.taptap.publishTitle || ''} ${p.displayVersion}`.toLowerCase();
      return hay.includes(ql);
    });

    for (const p of matchedGames.slice(0, 7)) {
      list.push({
        id: `game-${p.id}`,
        section: 'games',
        title: p.name,
        subtitle: `${p.displayVersion || '开发版'}${p.git.dirtyCount > 0 ? ` · ${p.git.dirtyCount} 未提交` : ''}`,
        thumb: mediaUrl(p.coverPath),
        project: p,
        run: () => {
          onSelectProject(p.id);
          onClose();
        },
      });
    }

    // Studio commands
    const cmds: PaletteItem[] = [
      {
        id: 'cmd-pulse',
        section: 'commands',
        title: '工作室脉搏（热力图与跨游戏动态流）',
        subtitle: '查看 20 周开发产出与连续活跃天数',
        icon: <Activity className="w-4 h-4 text-emerald-600" />,
        run: () => {
          onNavigateView('pulse');
          onClose();
        },
      },
      {
        id: 'cmd-board',
        section: 'commands',
        title: '灵感随手记 & 全局待办',
        subtitle: '集中查看所有游戏待办与新游戏点子',
        icon: <Lightbulb className="w-4 h-4 text-amber-500" />,
        run: () => {
          onNavigateView('board');
          onClose();
        },
      },
      {
        id: 'cmd-sop',
        section: 'commands',
        title: '打开内置 SOP 开发中心',
        subtitle: '浏览 30+ 篇流程、规范与模板，一键复制给 AI',
        icon: <BookOpen className="w-4 h-4 text-blue-600" />,
        run: () => {
          onNavigateView('sop');
          onClose();
        },
      },
      {
        id: 'cmd-sop-dir',
        section: 'commands',
        title: '在资源管理器打开 SOP 原始目录',
        icon: <FolderOpen className="w-4 h-4 text-sky-600" />,
        run: () => {
          window.gameHub.openSopFolder();
          onClose();
        },
      },
      {
        id: 'cmd-taptap-dev',
        section: 'commands',
        title: '打开 TapTap 开发者中心',
        subtitle: 'developer.taptap.cn',
        icon: <ExternalLink className="w-4 h-4 text-sky-600" />,
        run: () => {
          window.gameHub.openExternal('https://developer.taptap.cn/');
          onClose();
        },
      },
      {
        id: 'cmd-settings',
        section: 'commands',
        title: '打开系统设置',
        subtitle: '切换 6 款苹果毛玻璃氛围背景、编辑器与备份',
        icon: <Settings className="w-4 h-4 text-violet-600" />,
        run: () => {
          onNavigateView('settings');
          onClose();
        },
      },
      {
        id: 'cmd-theme',
        section: 'commands',
        title: theme === 'light' ? '切换为深色静谧模式' : '切换为浅色毛玻璃模式',
        icon:
          theme === 'light' ? (
            <Moon className="w-4 h-4 text-indigo-500" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          ),
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: 'cmd-refresh',
        section: 'commands',
        title: '立即重新扫描全部游戏项目',
        icon: <RefreshCw className="w-4 h-4 text-blue-600" />,
        run: () => {
          onRefreshAll();
          onClose();
        },
      },
    ];

    for (const c of cmds) {
      if (!ql || `${c.title} ${c.subtitle || ''}`.toLowerCase().includes(ql)) {
        list.push(c);
      }
    }

    return list;
  }, [query, activeProjects, theme]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (items.length > 0 ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIndex]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-slate-900/20 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="glass-drawer w-full max-w-xl rounded-[24px] border overflow-hidden shadow-2xl"
        style={{ borderColor: 'var(--border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spotlight Search Input */}
        <div
          className="px-4 py-3.5 border-b flex items-center gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <Search className="w-4 h-4 text-blue-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜游戏直达、执行指令，或直接打字回车秒记灵感..."
            className="flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd
            className="px-1.5 py-0.5 rounded-md text-[10.5px] font-mono border"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto p-2 space-y-1">
          {items.map((item, idx) => {
            const selected = idx === activeIndex;
            return (
              <div
                key={item.id}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => item.run()}
                className="px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors"
                style={{
                  backgroundColor: selected ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.project ? (
                    <div
                      className="w-8 h-6 rounded-lg overflow-hidden shrink-0 border flex items-center justify-center"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        backgroundColor: 'var(--bg-elevated)',
                      }}
                    >
                      {item.thumb ? (
                        <img src={item.thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Gamepad2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                  ) : (
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {item.icon}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline quick icons for matched games */}
                <div className="flex items-center gap-1 shrink-0">
                  {item.project && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.gameHub.openEditor(item.project!.path);
                          onClose();
                        }}
                        title="用编辑器打开"
                        className="p-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <Code2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.gameHub.openFolder(item.project!.path);
                          onClose();
                        }}
                        title="打开文件夹"
                        className="p-1.5 rounded-lg hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {selected && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-blue-600 ml-1" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Hints */}
        <div
          className="px-4 py-2 border-t flex items-center justify-between text-[10.5px]"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-elevated)',
          }}
        >
          <span>↑↓ 选择 · Enter 执行</span>
          <span>Ctrl + K 随时呼出</span>
        </div>
      </div>
    </div>
  );
};
