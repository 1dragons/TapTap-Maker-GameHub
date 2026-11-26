import React from 'react';
import {
  ArrowLeft,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  RefreshCw,
  Search,
  Sun,
  X,
} from 'lucide-react';

interface TitleBarProps {
  theme: 'dark' | 'light';
  maximized: boolean;
  scanning: boolean;
  pageTitle: string;
  selectedName?: string;
  searchQuery: string;
  viewMode: 'grid' | 'table';
  onViewModeChange: (m: 'grid' | 'table') => void;
  onSearchChange: (q: string) => void;
  onBack?: () => void;
  onOpenPalette: () => void;
  onRefreshAll: () => void;
  onToggleTheme: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  theme,
  maximized,
  scanning,
  pageTitle,
  selectedName,
  searchQuery,
  viewMode,
  onViewModeChange,
  onSearchChange,
  onBack,
  onOpenPalette,
  onRefreshAll,
  onToggleTheme,
}) => {
  return (
    <header
      className="titlebar-drag glass-topbar h-13 shrink-0 flex items-center justify-between px-6 border-b select-none"
      style={{
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Left: Clean Page Heading or Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack ? (
          <>
            <button
              onClick={onBack}
              className="titlebar-nodrag h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回总览</span>
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <h1 className="text-[14px] font-semibold tracking-tight truncate max-w-[380px]">
              {selectedName}
            </h1>
          </>
        ) : (
          <h1 className="text-[15px] font-semibold tracking-tight">{pageTitle}</h1>
        )}
      </div>

      {/* Right: Search + View Switcher + Subtle Utility + Window Controls */}
      <div className="titlebar-nodrag flex items-center gap-2">
        {!onBack && (
          <>
            <div className="relative w-56">
              <Search
                className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="搜索游戏 / 版本..."
                className="w-full h-8 pl-8 pr-7 rounded-lg text-xs outline-none transition-all"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Grid / Table View Switcher */}
            <div
              className="flex items-center p-0.5 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <button
                onClick={() => onViewModeChange('grid')}
                title="卡片视图"
                className="w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer"
                style={{
                  backgroundColor: viewMode === 'grid' ? 'var(--bg-surface)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: viewMode === 'grid' ? 'var(--card-shadow)' : 'none',
                }}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewModeChange('table')}
                title="精简列表视图"
                className="w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer"
                style={{
                  backgroundColor: viewMode === 'table' ? 'var(--bg-surface)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: viewMode === 'table' ? 'var(--card-shadow)' : 'none',
                }}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}

        <button
          onClick={onOpenPalette}
          title="全局命令面板与快速随手记 (Ctrl+K)"
          className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer hover:border-blue-400"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Search className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-mono text-[11px]">Ctrl+K</span>
        </button>

        <button
          onClick={onRefreshAll}
          title="刷新扫描"
          className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin text-blue-600' : ''}`} />
          <span>刷新</span>
        </button>

        <button
          onClick={onToggleTheme}
          title={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
        >
          {theme === 'light' ? (
            <Moon className="w-3.5 h-3.5" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>

        <div className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--border-subtle)' }} />

        <button
          onClick={() => window.gameHub.winMinimize()}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-slate-500/10"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.gameHub.winMaximize()}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-slate-500/10"
          style={{ color: 'var(--text-secondary)' }}
        >
          {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => window.gameHub.winClose()}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-rose-500 hover:text-white"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
