import React from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  FolderOpen,
  Gamepad2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { LIFECYCLE_STAGES, STAGE_INDEX_MAP } from '../constants';
import { ProjectCardData } from '../types';
import { formatRelativeTime, mediaUrl } from '../utils';

interface GameTableProps {
  projects: ProjectCardData[];
  refreshingId: string | null;
  onSelect: (id: string) => void;
  onEdit: (project: ProjectCardData) => void;
  onToggleArchive: (project: ProjectCardData) => void;
  onRemoveFromHub: (project: ProjectCardData) => void;
  onRefresh: (project: ProjectCardData) => void;
}

export const GameTable: React.FC<GameTableProps> = ({
  projects,
  refreshingId,
  onSelect,
  onEdit,
  onToggleArchive,
  onRemoveFromHub,
  onRefresh,
}) => {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr
            className="border-b text-[11px] font-medium"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-elevated)',
            }}
          >
            <th className="py-2.5 pl-4 pr-3 font-medium">游戏项目</th>
            <th className="py-2.5 px-3 font-medium">当前阶段</th>
            <th className="py-2.5 px-3 font-medium">版本号</th>
            <th className="py-2.5 px-3 font-medium">工作区</th>
            <th className="py-2.5 px-3 font-medium">构建与上传</th>
            <th className="py-2.5 px-3 font-medium text-right">最近活跃</th>
            <th className="py-2.5 pl-3 pr-4 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const thumb = mediaUrl(p.coverPath);
            const stageIdx = STAGE_INDEX_MAP[p.stage];
            const stageDef = LIFECYCLE_STAGES[stageIdx];
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="group border-b last:border-b-0 transition-colors cursor-pointer"
                style={{ borderColor: 'var(--border-subtle)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {/* Project */}
                <td className="py-3 pl-4 pr-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-7 rounded-lg overflow-hidden shrink-0 border flex items-center justify-center"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        backgroundColor: 'var(--bg-elevated)',
                      }}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Gamepad2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate max-w-[260px]">
                        {p.name}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {p.engine === 'taptap-maker' ? 'TapTap Maker' : p.engine === 'web-h5' ? 'H5' : '其他'}
                        {p.git.isGit ? ` · ${p.git.totalCommits} 提交` : ''}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Stage */}
                <td className="py-3 px-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border"
                    style={{
                      backgroundColor: stageDef.bgSoft,
                      color: stageDef.textColor,
                      borderColor: stageDef.borderSoft,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: stageDef.color }}
                    />
                    {stageDef.label}
                  </span>
                </td>

                {/* Version */}
                <td className="py-3 px-3">
                  {p.versionMismatch ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border"
                      style={{
                        backgroundColor: 'var(--pill-warn-bg)',
                        color: 'var(--pill-warn-text)',
                        borderColor: 'var(--pill-warn-border)',
                      }}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {p.taptap.luaGameVersion} ≠ {p.git.detectedGitVersion}
                    </span>
                  ) : p.displayVersion ? (
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {p.displayVersion}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      --
                    </span>
                  )}
                </td>

                {/* Working Tree */}
                <td className="py-3 px-3">
                  {!p.git.isGit ? (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      无 Git
                    </span>
                  ) : p.git.dirtyCount > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                      style={{
                        backgroundColor: 'var(--pill-err-bg)',
                        color: 'var(--pill-err-text)',
                        borderColor: 'var(--pill-err-border)',
                      }}
                    >
                      {p.git.dirtyCount} 未提交
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs"
                      style={{ color: 'var(--pill-ok-text)' }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      干净
                    </span>
                  )}
                </td>

                {/* Build / Upload */}
                <td className="py-3 px-3">
                  {p.buildStatus === 'synced' ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                      style={{
                        backgroundColor: 'var(--pill-ok-bg)',
                        color: 'var(--pill-ok-text)',
                        borderColor: 'var(--pill-ok-border)',
                      }}
                    >
                      已上传
                    </span>
                  ) : p.buildStatus === 'pending_upload' ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                      style={{
                        backgroundColor: 'var(--pill-warn-bg)',
                        color: '#C2410C',
                        borderColor: 'var(--pill-warn-border)',
                      }}
                    >
                      待上传
                    </span>
                  ) : p.buildStatus === 'pending_build' ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                      style={{
                        backgroundColor: 'var(--pill-warn-bg)',
                        color: 'var(--pill-warn-text)',
                        borderColor: 'var(--pill-warn-border)',
                      }}
                    >
                      待构建
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      未记录
                    </span>
                  )}
                </td>

                {/* Time */}
                <td
                  className="py-3 px-3 text-right text-xs tabular-nums"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {formatRelativeTime(p.lastModified)}
                </td>

                {/* Quick Actions */}
                <td className="py-3 pl-3 pr-4 text-right">
                  <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(p);
                      }}
                      title="编辑名称与封面"
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.gameHub.openFolder(p.path);
                      }}
                      title="打开文件夹"
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                    {p.archived && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleArchive(p);
                          }}
                          title="移出归档"
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: '#059669',
                          }}
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveFromHub(p);
                          }}
                          title="仅从软件中移除（不删本地文件）"
                          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: '#E11D48',
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRefresh(p);
                      }}
                      title="刷新"
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${refreshingId === p.id ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
