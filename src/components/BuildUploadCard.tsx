import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Code2,
  PackageCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ProjectCardData } from '../types';
import { formatRelativeTime, formatShortDate } from '../utils';

interface BuildUploadCardProps {
  project: ProjectCardData;
  onGenerateReleaseNotes: () => void;
  onAddLog: (entry: {
    type: 'build' | 'upload';
    version: string;
    commitHash?: string;
    commitShort?: string;
    platform?: string;
    note?: string;
  }) => void;
  onDeleteLog: (id: string) => void;
}

export const BuildUploadCard: React.FC<BuildUploadCardProps> = ({
  project,
  onGenerateReleaseNotes,
  onAddLog,
  onDeleteLog,
}) => {
  const defaultVer =
    project.git.detectedGitVersion ||
    project.displayVersion ||
    'v1.0.0';

  const [checkinMode, setCheckinMode] = useState<'build' | 'upload' | null>(null);
  const [verInput, setVerInput] = useState(defaultVer);
  const [noteInput, setNoteInput] = useState('');

  const openCheckin = (mode: 'build' | 'upload') => {
    setVerInput(defaultVer);
    setNoteInput('');
    setCheckinMode(checkinMode === mode ? null : mode);
  };

  const handleConfirm = () => {
    if (!checkinMode) return;
    onAddLog({
      type: checkinMode,
      version: verInput.trim() || defaultVer,
      commitHash: project.git.lastCommitHash || undefined,
      commitShort: project.git.lastCommitShort || undefined,
      platform:
        project.stage === 'official'
          ? 'TapTap 正式'
          : project.stage === 'public_test'
            ? 'TapTap 公测'
            : 'TapTap Maker',
      note: noteInput.trim() || undefined,
    });
    setCheckinMode(null);
  };

  const uploadedCurrentCommit =
    Boolean(project.latestUploadLog?.commitShort) &&
    project.latestUploadLog?.commitShort === project.git.lastCommitShort;
  const buildDone =
    project.buildStatus === 'synced' ||
    project.buildStatus === 'pending_upload' ||
    uploadedCurrentCommit;
  const uploadDone = project.buildStatus === 'synced' || uploadedCurrentCommit;

  const statusPillText =
    project.buildStatus === 'synced'
      ? '已同步发布'
      : uploadedCurrentCommit
        ? `已传 ${project.latestUploadLog?.version} · 有改动`
        : project.buildStatus === 'pending_upload'
          ? '已构建待上传'
          : project.buildStatus === 'pending_build'
            ? '代码更新待构建'
            : '暂未记录';

  return (
    <div className="glass-card rounded-[22px] p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">构建与上传状态</span>
        <span
          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
          style={{
            backgroundColor:
              project.buildStatus === 'synced'
                ? 'var(--pill-ok-bg)'
                : project.buildStatus === 'pending_upload' || project.buildStatus === 'pending_build'
                  ? 'var(--pill-warn-bg)'
                  : 'var(--pill-neutral-bg)',
            color:
              project.buildStatus === 'synced'
                ? 'var(--pill-ok-text)'
                : project.buildStatus === 'pending_upload' || project.buildStatus === 'pending_build'
                  ? 'var(--pill-warn-text)'
                  : 'var(--pill-neutral-text)',
            borderColor:
              project.buildStatus === 'synced'
                ? 'var(--pill-ok-border)'
                : project.buildStatus === 'pending_upload' || project.buildStatus === 'pending_build'
                  ? 'var(--pill-warn-border)'
                  : 'var(--pill-neutral-border)',
          }}
        >
          {statusPillText}
        </span>
      </div>

      {/* Soft Amber Version Mismatch Banner (Only when Lua script version != Git commit version) */}
      {project.versionMismatch && (
        <div
          className="rounded-xl px-3.5 py-2.5 border flex items-center gap-2.5"
          style={{
            backgroundColor: 'var(--pill-warn-bg)',
            borderColor: 'var(--pill-warn-border)',
            color: 'var(--pill-warn-text)',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div className="flex items-center justify-between flex-1 text-xs">
            <span className="font-semibold">游戏内版本不一致</span>
            <span className="font-mono font-bold">
              脚本 {project.taptap.luaGameVersion} ≠ 提交 {project.git.detectedGitVersion}
            </span>
          </div>
        </div>
      )}

      {/* Calm Maker Package Version Info when distinct from game release version */}
      {!project.versionMismatch &&
        project.taptap.configVersion &&
        project.displayVersion &&
        `v${project.taptap.configVersion}` !== project.displayVersion && (
          <div
            className="rounded-xl px-3 py-2 border flex items-center justify-between text-[11.5px]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>游戏版本 / Maker 工程包号</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {project.displayVersion}{' '}
              <span style={{ color: 'var(--text-muted)' }}>· 包 {project.taptap.configVersion}</span>
            </span>
          </div>
        )}

      {/* Clean 3-Station Visual Flow */}
      <div className="grid grid-cols-11 items-center gap-1">
        <div
          className="col-span-3 rounded-xl p-2.5 text-center border"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--pill-info-border)',
          }}
        >
          <Code2 className="w-4 h-4 text-blue-600 mx-auto mb-1" />
          <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            最新代码
          </div>
          <div className="font-mono text-xs font-bold mt-0.5 truncate">
            {project.git.detectedGitVersion || project.displayVersion || '--'}
          </div>
          <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {formatRelativeTime(project.lastModified)}
          </div>
        </div>

        <div className="col-span-1 flex justify-center">
          <ArrowRight
            className="w-3.5 h-3.5"
            style={{ color: buildDone ? '#059669' : '#D97706' }}
          />
        </div>

        <div
          className="col-span-3 rounded-xl p-2.5 text-center border"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: buildDone ? 'var(--pill-ok-border)' : 'var(--pill-warn-border)',
          }}
        >
          <PackageCheck
            className="w-4 h-4 mx-auto mb-1"
            style={{ color: buildDone ? '#059669' : '#D97706' }}
          />
          <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            最近构建
          </div>
          <div className="font-mono text-xs font-bold mt-0.5 truncate">
            {project.latestBuildLog?.version || (buildDone ? project.displayVersion : '未打卡')}
          </div>
          <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {project.latestBuildLog ? formatRelativeTime(project.latestBuildLog.timestamp) : '--'}
          </div>
        </div>

        <div className="col-span-1 flex justify-center">
          <ArrowRight
            className="w-3.5 h-3.5"
            style={{ color: uploadDone ? '#059669' : 'var(--text-muted)' }}
          />
        </div>

        <div
          className="col-span-3 rounded-xl p-2.5 text-center border"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: uploadDone ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
          }}
        >
          <CloudUpload
            className="w-4 h-4 mx-auto mb-1"
            style={{ color: uploadDone ? '#059669' : 'var(--text-muted)' }}
          />
          <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            最近上传
          </div>
          <div className="font-mono text-xs font-bold mt-0.5 truncate">
            {project.latestUploadLog?.version ||
              (project.taptap.releasePhase === 'official'
                ? project.displayVersion || '已上架'
                : '未打卡')}
          </div>
          <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {project.latestUploadLog ? formatRelativeTime(project.latestUploadLog.timestamp) : '--'}
          </div>
        </div>
      </div>

      {/* Crisp Apple-style Action Buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => openCheckin('build')}
          className="h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border"
          style={{
            backgroundColor: checkinMode === 'build' ? '#D97706' : 'var(--bg-surface-strong)',
            color: checkinMode === 'build' ? '#ffffff' : 'var(--pill-warn-text)',
            borderColor: checkinMode === 'build' ? '#D97706' : 'var(--pill-warn-border)',
          }}
        >
          <PackageCheck className="w-3.5 h-3.5" />
          <span>打卡：已构建</span>
        </button>

        <button
          onClick={() => openCheckin('upload')}
          className="h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
          style={{
            backgroundColor: checkinMode === 'upload' ? '#047857' : '#059669',
            color: '#ffffff',
          }}
        >
          <CloudUpload className="w-3.5 h-3.5" />
          <span>打卡：已上传</span>
        </button>
      </div>

      {project.git.isGit && (
        <button
          onClick={onGenerateReleaseNotes}
          className="w-full h-8 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition-all cursor-pointer hover:border-blue-400 hover:text-blue-600"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>从 Git 自动生成本版更新日志</span>
        </button>
      )}

      {checkinMode && (
        <div
          className="p-3 rounded-xl border space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={verInput}
              onChange={(e) => setVerInput(e.target.value)}
              placeholder="版本号"
              className="h-8 w-28 px-2.5 rounded-lg text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            />
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              placeholder="简短备注 (可选)"
              className="h-8 flex-1 px-2.5 rounded-lg text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono" style={{ color: 'var(--text-muted)' }}>
              提交：{project.git.lastCommitShort || '无Git'}
            </span>
            <button
              onClick={handleConfirm}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white flex items-center gap-1 cursor-pointer hover:opacity-90"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>确认记录</span>
            </button>
          </div>
        </div>
      )}

      {/* Clean History Timeline */}
      <div className="pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="text-[11.5px] font-medium mb-2.5" style={{ color: 'var(--text-muted)' }}>
          近期构建 / 上传记录
        </div>

        {project.allBuildLogs.length === 0 ? (
          <div className="text-center py-4 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            暂无记录，点上方按钮一键打卡
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {project.allBuildLogs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className="group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs border"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: log.type === 'upload' ? '#059669' : '#D97706',
                    }}
                  />
                  <span className="font-mono font-semibold text-[11.5px]">{log.version}</span>
                  <span
                    className="text-[10.5px] px-1.5 py-0.5 rounded-md font-medium"
                    style={{
                      backgroundColor:
                        log.type === 'upload' ? 'var(--pill-ok-bg)' : 'var(--pill-warn-bg)',
                      color:
                        log.type === 'upload' ? 'var(--pill-ok-text)' : 'var(--pill-warn-text)',
                    }}
                  >
                    {log.type === 'upload' ? '上传' : '构建'}
                  </span>
                  {log.source === 'sop' && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: 'var(--pill-neutral-bg)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      SOP
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10.5px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {formatShortDate(log.timestamp)}
                  </span>
                  {log.source === 'manual' && (
                    <button
                      onClick={() => onDeleteLog(log.id)}
                      className="opacity-0 group-hover:opacity-100 text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
