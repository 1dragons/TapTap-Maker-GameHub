export function mediaUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  return `gamehub-media://file?path=${encodeURIComponent(filePath)}`;
}

export function sopAssetUrl(relPath: string | null | undefined, cacheKey?: number): string | null {
  if (!relPath) return null;
  const suffix = cacheKey ? `&v=${cacheKey}` : '';
  return `gamehub-sop://asset?rel=${encodeURIComponent(relPath)}${suffix}`;
}

export function formatRelativeTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '--';
  const ms = new Date(isoDate).getTime();
  if (Number.isNaN(ms)) return '--';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}天前`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}个月前`;
  return `${Math.floor(diffMonth / 12)}年前`;
}

export function formatShortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '--';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '--';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${hh}:${mm}`;
}

const PALETTES = [
  ['#0EA5E9', '#6366F1'],
  ['#10B981', '#0D9488'],
  ['#F59E0B', '#EF4444'],
  ['#8B5CF6', '#EC4899'],
  ['#06B6D4', '#3B82F6'],
  ['#F97316', '#E11D48'],
];

export function getProjectGradient(seed: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTES[Math.abs(hash) % PALETTES.length] as [string, string];
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatCompactCount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 100_000_000) {
    return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
  }
  if (n >= 10_000) {
    return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  }
  return n.toLocaleString('zh-CN');
}

export function formatStatsDelta(current: number, prev?: number): string | null {
  if (prev === undefined || prev === null || !Number.isFinite(prev)) return null;
  const diff = current - prev;
  if (diff === 0) return null;
  const sign = diff > 0 ? '+' : '-';
  return `${sign}${formatCompactCount(Math.abs(diff))}`;
}
