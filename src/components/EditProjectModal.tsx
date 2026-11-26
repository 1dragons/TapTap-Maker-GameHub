import React, { useState } from 'react';
import {
  CalendarClock,
  Check,
  Flame,
  Gamepad2,
  ImagePlus,
  Link2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ProjectCardData, ProjectExternalLink } from '../types';
import { mediaUrl } from '../utils';

interface EditProjectModalProps {
  project: ProjectCardData;
  onSave: (patch: {
    displayName: string;
    customCover?: string;
    sprintFocus: boolean;
    targetDate: string;
    targetGoal: string;
    customLinks: ProjectExternalLink[];
  }) => Promise<void>;
  onClose: () => void;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({
  project,
  onSave,
  onClose,
}) => {
  const [displayName, setDisplayName] = useState(project.name);
  const [customCover, setCustomCover] = useState<string>(project.coverPath || '');
  const [coverChanged, setCoverChanged] = useState(false);

  const [sprintFocus, setSprintFocus] = useState(project.sprintFocus);
  const [targetDate, setTargetDate] = useState(project.targetDate || '');
  const [targetGoal, setTargetGoal] = useState(project.targetGoal || '');

  const [links, setLinks] = useState<ProjectExternalLink[]>(project.customLinks || []);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const previewUrl = mediaUrl(customCover);

  const handlePickImage = async () => {
    const picked = await window.gameHub.pickImage();
    if (picked) {
      setCustomCover(picked);
      setCoverChanged(true);
    }
  };

  const handleResetCover = () => {
    setCustomCover('');
    setCoverChanged(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    let droppedPath = '';
    try {
      droppedPath = window.gameHub.getFilePath(file);
    } catch {
      droppedPath = (file as File & { path?: string }).path || '';
    }
    if (droppedPath && /\.(png|jpe?g|webp|gif)$/i.test(droppedPath)) {
      setCustomCover(droppedPath);
      setCoverChanged(true);
    }
  };

  const handleAddLink = () => {
    const lbl = newLinkLabel.trim();
    let url = newLinkUrl.trim();
    if (!lbl || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setLinks([...links, { id: `lnk-${Date.now()}`, label: lbl, url }]);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const trimmedName = displayName.trim();
      const defaultAutoName = project.groupName
        ? `${project.groupName} · ${project.folderName}`
        : project.folderName;
      const patch: {
        displayName: string;
        customCover?: string;
        sprintFocus: boolean;
        targetDate: string;
        targetGoal: string;
        customLinks: ProjectExternalLink[];
      } = {
        displayName: trimmedName === defaultAutoName ? '' : trimmedName,
        sprintFocus,
        targetDate: targetDate.trim(),
        targetGoal: targetGoal.trim(),
        customLinks: links,
      };
      if (coverChanged) {
        patch.customCover = customCover;
      }
      await onSave(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="glass-drawer w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border p-5 space-y-4 shadow-2xl"
        style={{ borderColor: 'var(--border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">编辑游戏信息与冲刺目标</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-500/10 cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cover Image */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              封面背景图
            </label>
            <button
              onClick={handleResetCover}
              className="text-[11px] flex items-center gap-1 hover:underline cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复自动识别</span>
            </button>
          </div>

          <div
            onClick={handlePickImage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className="relative h-32 rounded-xl overflow-hidden border-2 border-dashed cursor-pointer group transition-all"
            style={{
              borderColor: dragOver ? '#2563EB' : 'var(--border-strong)',
              backgroundColor: 'var(--bg-elevated)',
            }}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="封面预览" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-blue-50 to-indigo-100">
                <Gamepad2 className="w-6 h-6 text-slate-400" />
                <span className="text-xs text-slate-500">点击或拖入本地图片</span>
              </div>
            )}
            <div className="absolute inset-0 bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white">
              <ImagePlus className="w-5 h-5" />
              <span className="text-xs font-medium">更换本地封面图</span>
            </div>
          </div>
        </div>

        {/* Display Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold block" style={{ color: 'var(--text-secondary)' }}>
            游戏显示名称
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={project.folderName}
            className="w-full h-9 px-3 rounded-xl text-[13px] font-medium outline-none"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
            }}
          />
          <div className="flex items-center flex-wrap gap-1.5">
            {project.taptap.publishTitle && (
              <button
                onClick={() => setDisplayName(project.taptap.publishTitle!)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border cursor-pointer"
                style={{
                  backgroundColor: 'var(--pill-info-bg)',
                  color: 'var(--pill-info-text)',
                  borderColor: 'var(--pill-info-border)',
                }}
              >
                <Sparkles className="w-3 h-3" />
                <span>上架名：{project.taptap.publishTitle}</span>
              </button>
            )}
            <button
              onClick={() => setDisplayName(project.folderName)}
              className="px-2 py-0.5 rounded-lg text-[11px] border cursor-pointer"
              style={{
                backgroundColor: 'var(--pill-neutral-bg)',
                color: 'var(--pill-neutral-text)',
                borderColor: 'var(--pill-neutral-border)',
              }}
            >
              原目录：{project.folderName}
            </button>
          </div>
        </div>

        {/* Sprint Focus & Release Countdown */}
        <div
          className="p-3.5 rounded-xl border space-y-3"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              <span>冲刺焦点 & 发版倒计时</span>
            </span>
            <button
              type="button"
              onClick={() => setSprintFocus(!sprintFocus)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all"
              style={{
                backgroundColor: sprintFocus ? 'var(--pill-warn-bg)' : 'var(--bg-elevated)',
                borderColor: sprintFocus ? 'var(--pill-warn-border)' : 'var(--border-subtle)',
                color: sprintFocus ? 'var(--pill-warn-text)' : 'var(--text-muted)',
              }}
            >
              {sprintFocus ? '🔥 已设为本周冲刺焦点' : '设为首页冲刺焦点'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10.5px] block mb-1" style={{ color: 'var(--text-muted)' }}>
                目标发版日期
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg text-xs outline-none font-mono"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>
            </div>
            <div>
              <label className="text-[10.5px] block mb-1" style={{ color: 'var(--text-muted)' }}>
                冲刺里程碑短句
              </label>
              <input
                type="text"
                value={targetGoal}
                onChange={(e) => setTargetGoal(e.target.value)}
                placeholder="例如：V2.1 正式版上线"
                className="w-full h-8 px-2.5 rounded-lg text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
            </div>
          </div>
          {targetDate && (
            <button
              onClick={() => {
                setTargetDate('');
                setTargetGoal('');
              }}
              className="text-[11px] text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CalendarClock className="w-3 h-3" />
              <span>清除倒计时</span>
            </button>
          )}
        </div>

        {/* Custom External Links / Bookmarks */}
        <div
          className="p-3.5 rounded-xl border space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-strong)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-blue-600" />
            <span>自定义传送门外链（论坛 / 数据后台 / 文档）</span>
          </span>

          {links.length > 0 && (
            <div className="space-y-1.5">
              {links.map((lnk) => (
                <div
                  key={lnk.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <div className="min-w-0 truncate">
                    <span className="font-semibold mr-2">{lnk.label}</span>
                    <span className="text-[10.5px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {lnk.url}
                    </span>
                  </div>
                  <button
                    onClick={() => setLinks(links.filter((x) => x.id !== lnk.id))}
                    className="text-rose-500 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              placeholder="名称 (如 论坛)"
              className="h-8 w-28 px-2 rounded-lg text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            />
            <input
              type="text"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddLink();
              }}
              placeholder="https://..."
              className="h-8 flex-1 px-2 rounded-lg text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            />
            <button
              onClick={handleAddLink}
              disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
              className="h-8 px-2.5 rounded-lg bg-blue-600 text-white text-xs flex items-center cursor-pointer disabled:opacity-35"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 pt-2 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            onClick={onClose}
            className="h-8 px-3.5 rounded-xl text-xs font-medium cursor-pointer border"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="h-8 px-4 rounded-xl text-xs font-semibold bg-blue-600 text-white flex items-center gap-1.5 cursor-pointer hover:opacity-92 shadow-sm shadow-blue-600/20 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? '保存中...' : '保存修改'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
