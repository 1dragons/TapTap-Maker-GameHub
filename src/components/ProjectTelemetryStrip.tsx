import React from 'react';
import {
  Activity,
  Box,
  Code2,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Music,
  Sparkles,
} from 'lucide-react';
import { ProjectTelemetry } from '../types';

interface ProjectTelemetryStripProps {
  telemetry: ProjectTelemetry | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLines(lines: number): string {
  if (lines >= 1000) return `${(lines / 1000).toFixed(1)}k 行`;
  return `${lines} 行`;
}

export const ProjectTelemetryStrip: React.FC<ProjectTelemetryStripProps> = ({
  telemetry,
  loading,
}) => {
  if (loading && !telemetry) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 glass-card rounded-[22px] h-32 animate-pulse" />
        <div className="lg:col-span-5 glass-card rounded-[22px] h-32 animate-pulse" />
      </div>
    );
  }

  if (!telemetry) return null;

  const totalBytes = Math.max(1, telemetry.totalAssetBytes);
  const segments = [
    {
      label: '脚本',
      count: `${telemetry.scriptFiles}个 · ${formatLines(telemetry.scriptLines)}`,
      bytes: telemetry.scriptBytes,
      color: '#2563EB',
      icon: <Code2 className="w-3 h-3" />,
    },
    {
      label: '贴图',
      count: `${telemetry.imageFiles}`,
      bytes: telemetry.imageBytes,
      color: '#7C3AED',
      icon: <ImageIcon className="w-3 h-3" />,
    },
    {
      label: '模型',
      count: `${telemetry.modelFiles}`,
      bytes: telemetry.modelBytes,
      color: '#EA580C',
      icon: <Box className="w-3 h-3" />,
    },
    {
      label: '音频',
      count: `${telemetry.audioFiles}`,
      bytes: telemetry.audioBytes,
      color: '#059669',
      icon: <Music className="w-3 h-3" />,
    },
  ];

  const maxDaily = Math.max(1, ...telemetry.daily14.map((d) => d.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left (7 cols): macOS Storage-Style Asset Breakdown + Quick Doc Chips */}
      <div className="lg:col-span-7 glass-card rounded-[22px] p-4 flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-500/12 text-blue-600 flex items-center justify-center">
              <HardDrive className="w-3.5 h-3.5" />
            </div>
            <span className="text-[13px] font-semibold">工程资产构成</span>
          </div>
          <span
            className="text-xs font-mono font-semibold tabular-nums px-2 py-0.5 rounded-md border"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {formatBytes(telemetry.totalAssetBytes)}
          </span>
        </div>

        {/* Silky macOS-style Segmented Storage Bar */}
        <div
          className="h-3 w-full rounded-full overflow-hidden flex gap-[2px] p-[2px]"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          {segments.map((seg) => {
            if (seg.bytes <= 0) return null;
            const pct = Math.max(3, (seg.bytes / totalBytes) * 100);
            return (
              <div
                key={seg.label}
                title={`${seg.label}：${seg.count} (${formatBytes(seg.bytes)})`}
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: seg.color,
                }}
              />
            );
          })}
        </div>

        {/* Bottom Row: Compact Asset Counts + Quick SOP/Report Doc Links */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center flex-wrap gap-x-3.5 gap-y-1 text-[11.5px]">
            {segments.map((seg) => (
              <span key={seg.label} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{seg.label}</span>
                <span className="font-mono font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {seg.count}
                </span>
              </span>
            ))}
          </div>

          {telemetry.quickDocs.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {telemetry.quickDocs.slice(0, 4).map((doc) => (
                <button
                  key={doc.path}
                  onClick={() => window.gameHub.openFolder(doc.path)}
                  title={`打开 ${doc.path}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-medium border transition-all cursor-pointer hover:border-blue-400 hover:text-blue-600"
                  style={{
                    backgroundColor:
                      doc.kind === 'report' ? 'var(--pill-ok-bg)' : 'var(--bg-surface-strong)',
                    borderColor:
                      doc.kind === 'report' ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                    color:
                      doc.kind === 'report' ? 'var(--pill-ok-text)' : 'var(--text-secondary)',
                  }}
                >
                  {doc.kind === 'report' ? (
                    <Sparkles className="w-2.5 h-2.5" />
                  ) : (
                    <FileText className="w-2.5 h-2.5" />
                  )}
                  <span>{doc.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right (5 cols): Apple Health-Style 14-Day Commit Cadence Chart */}
      <div className="lg:col-span-5 glass-card rounded-[22px] p-4 flex flex-col justify-between gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/12 text-emerald-600 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <span className="text-[13px] font-semibold">近 14 天开发节奏</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
            <span className="font-semibold text-blue-600">{telemetry.commits14d} 提交</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)' }}>活跃 {telemetry.activeDays14d} 天</span>
          </div>
        </div>

        {/* 14 Sleek Vertical Bars */}
        <div className="flex items-end gap-1.5 h-14 pt-1">
          {telemetry.daily14.map((day, idx) => {
            const pct = day.count === 0 ? 12 : Math.max(24, Math.round((day.count / maxDaily) * 100));
            return (
              <div
                key={idx}
                title={`${day.dateLabel}：${day.count} 次提交`}
                className="flex-1 h-full flex flex-col justify-end items-center group"
              >
                <div
                  className="w-full max-w-[16px] rounded-full transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                  style={{
                    height: `${pct}%`,
                    background:
                      day.count === 0
                        ? 'var(--bg-elevated)'
                        : day.isToday
                          ? 'linear-gradient(180deg, #10B981 0%, #059669 100%)'
                          : 'linear-gradient(180deg, #60A5FA 0%, #2563EB 100%)',
                    opacity: day.count === 0 ? 0.85 : 0.72 + (idx / 42),
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          <span>14天前</span>
          <span>7天前</span>
          <span className="font-semibold text-emerald-600">今天</span>
        </div>
      </div>
    </div>
  );
};
