import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Compass,
  Copy,
  Download,
  ExternalLink,
  FileBarChart2,
  FileCode2,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  Music,
  Palette,
  PlugZap,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  Type,
  Wand2,
} from 'lucide-react';
import {
  ProjectCardData,
  SopDocItem,
  SopFontDownloadProgress,
  SopLibraryData,
  SopStageItem,
} from '../types';
import { formatShortDate, sopAssetUrl } from '../utils';
import { MermaidDiagram } from './MermaidDiagram';

type PlaybookTabId = 'home' | 'manual' | 'library' | 'samples' | 'start';

interface SopCenterViewProps {
  projects: ProjectCardData[];
  theme: 'light' | 'dark';
  onSelectProject: (id: string) => void;
  onRefreshProjects: () => Promise<void>;
}

const CAT_META: Record<
  SopDocItem['category'],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  overview: {
    label: '说明与记录',
    color: '#2563EB',
    bg: 'rgba(37, 99, 235, 0.1)',
    icon: <BookOpen className="w-3.5 h-3.5" />,
  },
  flow: {
    label: '流程',
    color: '#059669',
    bg: 'rgba(16, 185, 129, 0.1)',
    icon: <Compass className="w-3.5 h-3.5" />,
  },
  spec: {
    label: '规范',
    color: '#7C3AED',
    bg: 'rgba(124, 58, 237, 0.1)',
    icon: <Layers className="w-3.5 h-3.5" />,
  },
  template: {
    label: '模板',
    color: '#D97706',
    bg: 'rgba(217, 119, 6, 0.1)',
    icon: <ClipboardList className="w-3.5 h-3.5" />,
  },
};

const REF_INSIGHTS: Record<string, { headline: string; detail: string }> = {
  'ui-ux-pro-max-skill': {
    headline: '设计系统与交互规范',
    detail: '研究配色、排版、状态与检查方法；筛除网站落地页布局，按手机游戏场景与触控需求重做。',
  },
  'Balatro-Feel': {
    headline: '操作与反馈的连贯性',
    detail: '研究对象按下、拖拽、槽位交换与事件解耦如何形成一致手感，再按 Maker 能力重新实现。',
  },
  magictools: {
    headline: '有明确缺口时再补充资源',
    detail: '按类别检索游戏开发工具与素材入口，逐项核查外部许可与商用条款，不盲目整包导入。',
  },
};

const FONT_PRESETS = [
  '街角早餐店 · 今天也要好好经营',
  '恭喜升级 Lv.12！新菜品「鲜肉生煎」已解锁',
  '今日营业额突破新高，点击领取奖励',
];

function resolveRelativeDocId(currentRelPath: string, href: string): string {
  const cleanHref = href.split('#')[0].split('?')[0].trim();
  if (!cleanHref) return '';
  const baseParts = currentRelPath.replace(/\\/g, '/').split('/');
  baseParts.pop();
  for (const seg of cleanHref.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') baseParts.pop();
    else baseParts.push(seg);
  }
  return baseParts.join('/');
}

function renderInline(
  text: string,
  currentRelPath: string,
  onNavigateLink: (href: string, currentRel: string) => void
): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded-md text-[11.5px] font-mono"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--accent-primary)',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      return (
        <button
          key={idx}
          type="button"
          onClick={() => onNavigateLink(href, currentRelPath)}
          className="inline font-medium text-emerald-700 dark:text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 hover:decoration-emerald-500 cursor-pointer"
        >
          {label}
        </button>
      );
    }
    return part;
  });
}

const RichMarkdown: React.FC<{
  content: string;
  currentRelPath: string;
  theme: 'light' | 'dark';
  onNavigateLink: (href: string, currentRel: string) => void;
}> = ({ content, currentRelPath, theme, onNavigateLink }) => {
  const blocks = useMemo(() => {
    const lines = content.split(/\r?\n/);
    const out: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      // Fenced code block (including Mermaid!)
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim().toLowerCase();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++;
        if (lang === 'mermaid') {
          out.push(<MermaidDiagram key={`mmd-${i}`} code={codeLines.join('\n')} theme={theme} />);
        } else {
          out.push(
            <pre
              key={`code-${i}`}
              className="p-3.5 rounded-xl text-[11.5px] font-mono overflow-x-auto border my-3 leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <code>{codeLines.join('\n')}</code>
            </pre>
          );
        }
        continue;
      }

      // Markdown table
      if (trimmed.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        const headerCells = trimmed
          .split('|')
          .slice(1, -1)
          .map((s) => s.trim());
        i += 2;
        const bodyRows: string[][] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          bodyRows.push(
            lines[i]
              .trim()
              .split('|')
              .slice(1, -1)
              .map((s) => s.trim())
          );
          i++;
        }
        out.push(
          <div
            key={`tbl-${i}`}
            className="my-3.5 rounded-xl border overflow-x-auto"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className="border-b"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {headerCells.map((h, hi) => (
                    <th key={hi} className="px-3 py-2.5 font-semibold whitespace-nowrap">
                      {renderInline(h, currentRelPath, onNavigateLink)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b last:border-b-0"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2.5 align-top leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {renderInline(cell, currentRelPath, onNavigateLink)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Headings
      if (trimmed.startsWith('# ')) {
        out.push(
          <h1 key={`h1-${i}`} className="text-xl font-bold tracking-tight mt-1 mb-3">
            {renderInline(trimmed.slice(2), currentRelPath, onNavigateLink)}
          </h1>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        out.push(
          <h2
            key={`h2-${i}`}
            className="text-[15.5px] font-bold mt-6 mb-2.5 pb-1.5 border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {renderInline(trimmed.slice(3), currentRelPath, onNavigateLink)}
          </h2>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        out.push(
          <h3
            key={`h3-${i}`}
            className="text-[13.5px] font-semibold mt-4 mb-1.5 text-emerald-700 dark:text-emerald-400"
          >
            {renderInline(trimmed.slice(4), currentRelPath, onNavigateLink)}
          </h3>
        );
        i++;
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('> ')) {
        out.push(
          <blockquote
            key={`bq-${i}`}
            className="my-3 pl-3.5 py-2 rounded-r-xl border-l-3 text-xs leading-relaxed"
            style={{
              borderColor: '#235D48',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
            }}
          >
            {renderInline(trimmed.slice(2), currentRelPath, onNavigateLink)}
          </blockquote>
        );
        i++;
        continue;
      }

      // Horizontal rule
      if (/^---+$/.test(trimmed)) {
        out.push(
          <hr key={`hr-${i}`} className="my-4 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
        );
        i++;
        continue;
      }

      // Lists
      if (/^([-*]|\d+\.)\s+/.test(trimmed)) {
        const listItems: { text: string; checked?: boolean; num?: string }[] = [];
        while (i < lines.length && /^([-*]|\d+\.)\s+/.test(lines[i].trim())) {
          const rawLine = lines[i].trim();
          const numMatch = rawLine.match(/^(\d+\.)\s+(.+)$/);
          const itemLine = rawLine.replace(/^([-*]|\d+\.)\s+/, '');
          const cbMatch = itemLine.match(/^\[([ xX])\]\s+(.+)$/);
          if (cbMatch) {
            listItems.push({ text: cbMatch[2], checked: cbMatch[1].toLowerCase() === 'x' });
          } else {
            listItems.push({ text: itemLine, num: numMatch ? numMatch[1] : undefined });
          }
          i++;
        }
        out.push(
          <ul key={`ul-${i}`} className="my-2.5 space-y-1.5 pl-0.5">
            {listItems.map((li, liIdx) => (
              <li
                key={liIdx}
                className="flex items-start gap-2.5 text-[13px] leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {li.checked !== undefined ? (
                  <span
                    className="mt-1 w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: li.checked ? '#059669' : 'transparent',
                      borderColor: li.checked ? '#059669' : 'var(--border-strong)',
                      color: '#fff',
                    }}
                  >
                    {li.checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                ) : li.num ? (
                  <span className="text-[11.5px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5 min-w-[18px]">
                    {li.num}
                  </span>
                ) : (
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-600/70 shrink-0" />
                )}
                <span className="flex-1">{renderInline(li.text, currentRelPath, onNavigateLink)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Normal paragraph
      out.push(
        <p
          key={`p-${i}`}
          className="my-2.5 text-[13px] leading-7"
          style={{ color: 'var(--text-secondary)' }}
        >
          {renderInline(trimmed, currentRelPath, onNavigateLink)}
        </p>
      );
      i++;
    }

    return out;
  }, [content, currentRelPath, theme, onNavigateLink]);

  return <div className="space-y-0.5">{blocks}</div>;
};

export const SopCenterView: React.FC<SopCenterViewProps> = ({
  projects,
  theme,
  onSelectProject,
  onRefreshProjects,
}) => {
  const [activeTab, setActiveTab] = useState<PlaybookTabId>('home');
  const [library, setLibrary] = useState<SopLibraryData | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<SopDocItem | null>(null);
  const [docContent, setDocContent] = useState('');
  const [docLoading, setDocLoading] = useState(false);

  // Overview stage selection
  const [selectedStage, setSelectedStage] = useState<SopStageItem | null>(null);

  // Global full-text search
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Manual category filter
  const [catFilter, setCatFilter] = useState<'all' | SopDocItem['category']>('all');

  // Font specimen tester
  const [fontSampleText, setFontSampleText] = useState(FONT_PRESETS[0]);
  const [fontCacheBust, setFontCacheBust] = useState(1);
  const [downloadingFonts, setDownloadingFonts] = useState(false);
  const [fontProgress, setFontProgress] = useState<SopFontDownloadProgress | null>(null);

  // Samples JSON/prompt drawer
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>('initial');
  const [showRawPlan, setShowRawPlan] = useState(false);

  // Actions & toast feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [installingSkill, setInstallingSkill] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const showToast = (text: string, kind: 'ok' | 'err' = 'ok') => {
    setToastMsg({ text, kind });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  };

  const loadLibrary = async () => {
    const lib = await window.gameHub.getSopLibrary();
    setLibrary(lib);
    return lib;
  };

  useEffect(() => {
    loadLibrary();
    const unsub = window.gameHub.onSopFontProgress((p) => {
      setFontProgress(p);
    });
    return () => unsub();
  }, []);

  // Inject @font-face for installed SOP fonts cleanly
  useEffect(() => {
    if (!library) return;
    const styleId = 'gamehub-sop-fonts-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const rules: string[] = [];
    for (const item of library.resources) {
      if (item.kind === 'font' && item.installed && item.family && item.fontPath) {
        const url = sopAssetUrl(item.fontPath, fontCacheBust);
        if (!url) continue;
        const weight =
          item.id === 'noto-bold' ? 700 : item.id === 'noto-medium' ? 500 : 400;
        rules.push(
          `@font-face { font-family: "SopFont_${item.family}"; src: url("${url}"); font-weight: ${weight}; font-display: swap; }`
        );
      }
    }
    styleEl.textContent = rules.join('\n');
  }, [library, fontCacheBust]);

  // '/' shortcut focuses SOP full-text search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && searchFocused) {
        setSearchFocused(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchFocused]);

  // Load selected markdown doc
  useEffect(() => {
    if (!selectedDoc) return;
    setDocLoading(true);
    window.gameHub
      .readSopDoc(selectedDoc.absPath)
      .then((txt) => setDocContent(txt))
      .finally(() => setDocLoading(false));
  }, [selectedDoc?.absPath]);

  const activeProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const sopConnected = useMemo(
    () => activeProjects.filter((p) => p.sop.hasSop),
    [activeProjects]
  );

  const referenceItems = useMemo(
    () => (library?.resources || []).filter((r) => r.kind === 'reference'),
    [library]
  );
  const fontItems = useMemo(
    () => (library?.resources || []).filter((r) => r.kind === 'font'),
    [library]
  );

  const openDocById = (relId: string) => {
    if (!library) return;
    const norm = relId.replace(/\\/g, '/').toLowerCase();
    const target = library.docs.find(
      (d) =>
        d.relativePath.toLowerCase() === norm ||
        d.id.toLowerCase() === norm ||
        d.fileName.toLowerCase() === norm
    );
    if (target) {
      setSelectedDoc(target);
      setActiveTab('manual');
      setSearchFocused(false);
    }
  };

  const handleNavigateMarkdownLink = (href: string, currentRel: string) => {
    if (/^https?:\/\//i.test(href)) {
      window.gameHub.openExternal(href);
      return;
    }
    const resolved = resolveRelativeDocId(currentRel, href);
    if (resolved.toLowerCase().endsWith('.md')) {
      openDocById(resolved);
    } else if (resolved) {
      window.gameHub.openSopAsset(resolved);
    }
  };

  // Global full-text search matches with context snippet
  const searchMatches = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q || !library) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    return library.docs
      .filter((d) => {
        const haystack = `${d.title} ${d.relativePath} ${d.searchText}`.toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .slice(0, 14)
      .map((d) => {
        const lower = d.searchText.toLowerCase();
        const idx = lower.indexOf(terms[0]);
        const snippet =
          idx >= 0
            ? d.searchText.slice(Math.max(0, idx - 24), idx + 96)
            : d.excerpt || d.searchText.slice(0, 96);
        return { doc: d, snippet };
      });
  }, [globalSearch, library]);

  const filteredManualDocs = useMemo(() => {
    if (!library) return [];
    return library.docs.filter((d) => catFilter === 'all' || d.category === catFilter);
  }, [library, catFilter]);

  const copyText = (key: string, text: string, label = '已复制到剪贴板') => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    showToast(label);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  };

  const handleConnectProject = async (project: ProjectCardData, mode: 'new' | 'existing') => {
    const key = `${project.id}:${mode}`;
    setConnectingKey(key);
    try {
      const res = await window.gameHub.connectProjectSop(project.path, mode);
      if (res.ok) {
        showToast(
          res.unchanged
            ? `《${project.name}》已接入 SOP（无需重复写入）`
            : `《${project.name}》接入成功：新增 ${res.created.join('、')}`
        );
        await onRefreshProjects();
      } else {
        showToast(res.error || '接入失败，已保留原文件', 'err');
      }
    } finally {
      setConnectingKey(null);
    }
  };

  const handleInstallSkill = async () => {
    setInstallingSkill(true);
    try {
      const res = await window.gameHub.installSopSkill();
      if (res.ok) {
        showToast(`Codex Skill 已安装到 ${res.installedPath}（新聊天生效）`);
      } else {
        showToast(res.error || '安装 Skill 失败', 'err');
      }
    } finally {
      setInstallingSkill(false);
    }
  };

  const handleDownloadFonts = async () => {
    setDownloadingFonts(true);
    setFontProgress({ current: 0, total: 5, label: '正在连接官方开源字体仓库...', status: 'downloading' });
    try {
      const res = await window.gameHub.downloadSopFonts();
      if (res.ok) {
        setFontCacheBust((v) => v + 1);
        await loadLibrary();
        showToast(`全部 ${res.installed} 款开源中文字体已就绪，可直接实时预览！`);
      } else {
        showToast(res.error || '字体下载失败，请检查网络连接', 'err');
      }
    } finally {
      setDownloadingFonts(false);
    }
  };

  const activeSopPath = library?.rootPath || '<SOP根目录>';

  const aiPrompts = useMemo(
    () => [
      {
        key: 'new',
        tag: '新项目',
        title: '接入并验证新想法',
        text: `使用 $taptap-maker-sop 为当前 Maker 项目接入 ${activeSopPath}，保留已有文件与规则。我的游戏想法是：……。先研究参考和核心玩法，再进入实际原型。`,
      },
      {
        key: 'existing',
        tag: '已有项目',
        title: '从现状开始改进',
        text: `使用 $taptap-maker-sop 为当前已有 Maker 游戏接入 ${activeSopPath}。先评估现状，保留现有设计、未提交工作与正式存档，提出优先改进的一段体验。`,
      },
      {
        key: 'resume',
        tag: '继续开发',
        title: '换聊天也能接着做',
        text: '使用 $taptap-maker-sop，读取当前项目规则、SOP 版本、进度与设计决定，并核实实际代码，继续下一项已授权工作。',
      },
      {
        key: 'ui',
        tag: '专项任务',
        title: '只走这次需要的环节',
        text: '按当前项目 SOP 设计并制作商店界面，先出整页设计图确认风格与字体方向，再以真实组件还原并覆盖适用状态、声音反馈与手机适配，完成后进行本地预览和针对性检查。',
      },
    ],
    [activeSopPath]
  );

  const navTabs: { id: PlaybookTabId; num: string; label: string; badge?: string }[] = [
    { id: 'home', num: '01', label: '总览与流程' },
    { id: 'manual', num: '02', label: '制作手册', badge: library ? String(library.docs.length) : undefined },
    {
      id: 'library',
      num: '03',
      label: '参考与字体',
      badge: library ? `${library.fontInstalledCount}/${library.fontTotalCount}` : undefined,
    },
    { id: 'samples', num: '04', label: '资源样例' },
    {
      id: 'start',
      num: '05',
      label: '调用与验收',
      badge: activeProjects.length > 0 ? `${sopConnected.length}/${activeProjects.length}` : undefined,
    },
  ];

  const sourceBadge =
    library?.source === 'custom' ? '自定义 SOP 目录' : '内置原生 SOP 工作台';

  return (
    <div className="max-w-[1380px] mx-auto px-6 py-4 space-y-4 relative">
      {/* Top Integrated Playbook Navigation & Full-Text Search Bar */}
      <div className="glass-card rounded-[20px] px-4 py-3 space-y-2.5 relative z-20">
        {/* Top Row: Brand Identity + Full-Text Search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{
                background: 'linear-gradient(135deg, #235D48 0%, #164031 100%)',
              }}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13.5px] font-bold tracking-tight whitespace-nowrap">
                  Maker Playbook
                </span>
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--pill-ok-bg)',
                    color: 'var(--pill-ok-text)',
                  }}
                >
                  {sourceBadge}
                </span>
                <span className="text-[11px] hidden md:inline" style={{ color: 'var(--text-muted)' }}>
                  TapTap Maker 小游戏制作手册 · v1.0.0
                </span>
              </div>
            </div>
          </div>

          {/* Global Full-Text Search Input */}
          <div className="relative w-full sm:w-[270px] shrink-0">
            <Search
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              ref={searchRef}
              type="text"
              value={globalSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="全文搜索规范、页面或验收..."
              className="w-full h-8 pl-8 pr-7 rounded-xl text-[11.5px] outline-none transition-all"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            />
            <kbd
              className="absolute right-2 top-1/2 -translate-y-1/2 px-1 py-0.5 rounded text-[9.5px] font-mono border pointer-events-none"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              /
            </kbd>

            {/* Search Dropdown */}
            {searchFocused && globalSearch.trim().length > 0 && (
              <div
                className="absolute right-0 top-10 w-[460px] max-w-[90vw] max-h-[420px] overflow-y-auto rounded-2xl border shadow-xl p-2 space-y-1 z-50"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-strong)',
                }}
              >
                {searchMatches.length > 0 ? (
                  searchMatches.map(({ doc, snippet }) => {
                    const cm = CAT_META[doc.category];
                    return (
                      <button
                        key={doc.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          openDocById(doc.relativePath);
                          setGlobalSearch('');
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-emerald-500/10 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold truncate">{doc.title}</span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                            style={{ backgroundColor: cm.bg, color: cm.color }}
                          >
                            {cm.label}
                          </span>
                        </div>
                        <p
                          className="text-[11px] line-clamp-2 mt-1 leading-relaxed"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {snippet}...
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    没有找到相关内容。试试搜索“存档”“结算”“字体”“广告”或“循环”。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: 5 Editorial Navigation Tabs (Clean full-width tray, zero overflow at any size) */}
        <nav
          className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-xl border"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {navTabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                style={
                  active
                    ? {
                        backgroundColor: '#235D48',
                        color: '#FFFAF0',
                        boxShadow: '0 2px 8px rgba(35, 93, 72, 0.22)',
                      }
                    : {
                        color: 'var(--text-secondary)',
                      }
                }
              >
                <span className="text-[10px] font-mono opacity-75">{t.num}</span>
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className="px-1.5 py-0.2 rounded text-[10px] font-mono"
                    style={{
                      backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'var(--bg-surface-strong)',
                      color: active ? '#FFFAF0' : 'var(--text-muted)',
                    }}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ==================== TAB 01: 总览与流程 ==================== */}
      {activeTab === 'home' && (
        <div className="space-y-4">
          {/* Editorial Hero Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-7 glass-card rounded-[22px] p-6 flex flex-col justify-between">
              <div>
                <div
                  className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2"
                  style={{ color: '#BE643D' }}
                >
                  GAMEHUB · MAKER PLAYBOOK
                </div>
                <h1 className="text-[30px] sm:text-[34px] font-extrabold leading-[1.2] tracking-tight mb-3">
                  让好想法，
                  <br />
                  长成好游戏。
                </h1>
                <p
                  className="text-[13px] leading-relaxed max-w-[540px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  从一次有意思的操作开始。用参考、样板和实际试玩，把玩法、画面与声音打磨成同一种体验。无需外部命令，在软件内即可完整阅读、对照字体并一键为本地项目接入
                  SOP。
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap mt-4">
                <button
                  onClick={() => setActiveTab('start')}
                  className="h-8 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-sm hover:brightness-110 whitespace-nowrap"
                  style={{ backgroundColor: '#235D48', color: '#FFF8E8' }}
                >
                  <span>开始使用 SOP</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openDocById('docs/流程/总流程.md')}
                  className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  阅读完整流程图
                </button>
                <button
                  onClick={() => setActiveTab('manual')}
                  className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  浏览制作手册
                </button>
                <button
                  onClick={() => setActiveTab('library')}
                  className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  字体与参考对照
                </button>
              </div>
            </div>

            {/* Right Deep Forest Emerald Editorial Card */}
            <div
              className="lg:col-span-5 rounded-[22px] p-6 flex flex-col justify-between shadow-lg relative overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, #235D48 0%, #174032 60%, #102D23 100%)',
                color: '#F5F1DE',
              }}
            >
              <div
                className="absolute -right-14 -top-14 w-48 h-48 rounded-full opacity-15 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #A7F3D0 0%, transparent 70%)' }}
              />
              <div>
                <div className="text-[10.5px] tracking-[0.18em] uppercase text-emerald-200/80 font-semibold">
                  先样板，后扩展
                </div>
                <div className="h-px bg-white/20 my-4" />
                <div className="text-[38px] sm:text-[42px] font-extrabold tracking-tight leading-none">
                  想法 → 体验
                </div>
              </div>
              <div className="mt-5 space-y-1.5">
                <p className="text-[12.5px] leading-relaxed text-emerald-100/90">
                  你确定关键方向与体验取舍。
                  <br />
                  AI 协助研究、制作、预览并留下可继续的证据。
                </p>
                <div className="text-[11px] text-emerald-200/70 pt-0.5">
                  先把一段体验做好，再让它长成完整游戏。
                </div>
              </div>
            </div>
          </div>

          {/* 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                val: library?.docs.length ?? 0,
                label: '份手册与模板',
                sub: '流程 · 规范 · 模板全收录',
                onClick: () => setActiveTab('manual'),
              },
              {
                val: library?.resources.length ?? 8,
                label: '项开源参考与字体',
                sub: `已就绪 ${library?.fontInstalledCount ?? 0}/${library?.fontTotalCount ?? 5} 款中文字体`,
                onClick: () => setActiveTab('library'),
              },
              {
                val: 3,
                label: '个人工方向确认节点',
                sub: '玩法 · 视觉声音样板 · 发布候选',
                onClick: () => openDocById('docs/流程/总流程.md'),
              },
              {
                val: 0,
                label: '次擅自构建上传',
                sub: '发布候选确认 ≠ 上传授权',
                onClick: () => setActiveTab('start'),
              },
            ].map((s, idx) => (
              <button
                key={idx}
                onClick={s.onClick}
                className="glass-card-interactive rounded-2xl px-4.5 py-3.5 text-left cursor-pointer"
              >
                <div className="text-xl font-extrabold font-mono tracking-tight">{s.val}</div>
                <div className="text-xs font-semibold mt-0.5">{s.label}</div>
                <div className="text-[10.5px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                  {s.sub}
                </div>
              </button>
            ))}
          </div>

          {/* 11-Stage Interactive Workflow Grid */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap px-1">
              <h2 className="text-[18px] font-bold tracking-tight">一款游戏，从这里走下去</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                点击任意阶段卡片，展开查看输入、交付与通过依据
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(library?.stages || []).map((stage) => {
                const isSelected = selectedStage?.index === stage.index;
                return (
                  <button
                    key={stage.index}
                    onClick={() =>
                      setSelectedStage(isSelected ? null : stage)
                    }
                    className="glass-card rounded-2xl p-4 text-left transition-all cursor-pointer border"
                    style={{
                      borderColor: isSelected ? '#235D48' : 'var(--border-subtle)',
                      boxShadow: isSelected
                        ? '0 0 0 2px rgba(35, 93, 72, 0.2), var(--card-shadow)'
                        : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className="text-[11px] font-mono font-semibold tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {String(stage.index).padStart(2, '0')}
                      </span>
                      {stage.requiresConfirm && (
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
                          style={{
                            backgroundColor: 'rgba(190, 100, 61, 0.14)',
                            color: '#B4532A',
                          }}
                        >
                          你来确认
                        </span>
                      )}
                    </div>
                    <div className="text-[14.5px] font-bold mb-1.5 flex items-center justify-between">
                      <span>{stage.name}</span>
                      <ChevronRight
                        className={`w-3.5 h-3.5 transition-transform ${
                          isSelected ? 'rotate-90 text-emerald-700' : 'opacity-40'
                        }`}
                      />
                    </div>
                    <p
                      className="text-xs leading-relaxed line-clamp-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {stage.work}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Expanded Stage Detail Inspector */}
            {selectedStage && (
              <div
                className="glass-card rounded-2xl p-5 border-2 space-y-4"
                style={{ borderColor: '#235D48' }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-white"
                      style={{ backgroundColor: '#235D48' }}
                    >
                      阶段 {String(selectedStage.index).padStart(2, '0')}
                    </span>
                    <h3 className="text-base font-bold">{selectedStage.name}</h3>
                    {selectedStage.requiresConfirm && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                        style={{ backgroundColor: 'rgba(190, 100, 61, 0.14)', color: '#B4532A' }}
                      >
                        人工方向确认节点
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => openDocById('docs/流程/总流程.md')}
                    className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer border hover:border-emerald-500 transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span>查看完整 Mermaid 分支流程图</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {[
                    { k: '输入', v: selectedStage.input },
                    { k: '工作与交付', v: selectedStage.work },
                    { k: '通过依据', v: selectedStage.pass },
                    { k: '不通过时', v: selectedStage.fail },
                  ].map((row) => (
                    <div
                      key={row.k}
                      className="p-3.5 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="font-bold mb-1 text-emerald-700 dark:text-emerald-400">
                        {row.k}
                      </div>
                      <div className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {row.v}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Governance Notice Banner */}
          <div
            className="rounded-2xl px-4 py-3.5 border-l-4 flex items-start gap-2.5 text-xs leading-relaxed"
            style={{
              borderLeftColor: '#BE643D',
              backgroundColor: theme === 'dark' ? 'rgba(190, 100, 61, 0.14)' : 'rgba(241, 233, 220, 0.78)',
              color: theme === 'dark' ? '#FCD9B6' : '#765437',
            }}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>安全授权边界：</strong>
              构建、上传必须有你的明确同意；发布候选确认不等于上传授权。日常小改动只走必要环节，不机械重复全流程。
            </span>
          </div>

          {/* Bottom 2 Principle Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card rounded-2xl p-5 flex flex-col justify-between gap-3">
              <div>
                <span
                  className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-semibold mb-2.5"
                  style={{ backgroundColor: 'var(--pill-ok-bg)', color: 'var(--pill-ok-text)' }}
                >
                  看得见的标准
                </span>
                <h3 className="text-[15px] font-bold mb-1.5">界面、美术、字体与声音</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  每个页面有明确目的、信息层级和完整状态；先生成整页视觉设计稿确认方向，再以真实组件和统一资产落地。
                </p>
              </div>
              <div>
                <button
                  onClick={() => openDocById('docs/规范/界面与交互.md')}
                  className="h-8 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  查看页面设计目录 →
                </button>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 flex flex-col justify-between gap-3">
              <div>
                <span
                  className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-semibold mb-2.5"
                  style={{ backgroundColor: 'var(--pill-ok-bg)', color: 'var(--pill-ok-text)' }}
                >
                  可继续的制作
                </span>
                <h3 className="text-[15px] font-bold mb-1.5">把决定与证据留在项目里</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  换一个聊天或重启电脑也能无缝续做。设计决定、当前阶段、验收证据和下一步都保存在项目自身的
                  <code className="mx-1 font-mono">.sop/</code>目录中。
                </p>
              </div>
              <div>
                <button
                  onClick={() => openDocById('docs/流程/项目接入.md')}
                  className="h-8 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  了解项目接入方式 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 02: 制作手册 ==================== */}
      {activeTab === 'manual' && (
        <div className="space-y-4">
          {!selectedDoc ? (
            <>
              <div className="glass-card rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div
                    className="text-[10.5px] font-bold tracking-[0.2em] uppercase mb-1"
                    style={{ color: '#BE643D' }}
                  >
                    THE MANUAL
                  </div>
                  <h2 className="text-xl font-extrabold tracking-tight">制作手册与项目模板</h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    从立项到上线，按需读取对应规范；所有文档支持 Mermaid 流程图可视化与一键复制给 AI。
                  </p>
                </div>

                {/* Category Filter */}
                <div
                  className="flex items-center gap-1 p-1 rounded-xl border text-xs"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {(
                    [
                      { id: 'all', label: '全部' },
                      { id: 'flow', label: '流程' },
                      { id: 'spec', label: '规范' },
                      { id: 'template', label: '模板' },
                      { id: 'overview', label: '说明与记录' },
                    ] as const
                  ).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCatFilter(c.id)}
                      className="px-3 py-1 rounded-lg font-semibold cursor-pointer transition-all"
                      style={
                        catFilter === c.id
                          ? { backgroundColor: '#235D48', color: '#FFFAF0' }
                          : { color: 'var(--text-secondary)' }
                      }
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredManualDocs.map((doc) => {
                  const cm = CAT_META[doc.category];
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="glass-card-interactive rounded-2xl p-4.5 text-left flex flex-col justify-between gap-2.5 cursor-pointer"
                    >
                      <div>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold mb-2"
                          style={{ backgroundColor: cm.bg, color: cm.color }}
                        >
                          {cm.icon}
                          <span>{cm.label}</span>
                        </span>
                        <h3 className="text-[14px] font-bold leading-snug mb-1.5">{doc.title}</h3>
                        <p
                          className="text-xs leading-relaxed line-clamp-2"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {doc.excerpt || doc.relativePath}
                        </p>
                      </div>
                      <div
                        className="text-[10.5px] font-mono truncate pt-2 border-t"
                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                      >
                        {doc.relativePath}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* Immersive 2-Column Document Reader */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Sticky Directory */}
              <div className="lg:col-span-3 glass-card rounded-2xl p-3.5 space-y-2.5">
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="w-full h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer hover:border-emerald-500 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>返回手册总览</span>
                </button>

                <div className="max-h-[640px] overflow-y-auto space-y-3 pr-1">
                  {(['flow', 'spec', 'template', 'overview'] as const).map((cat) => {
                    const group = (library?.docs || []).filter((d) => d.category === cat);
                    if (group.length === 0) return null;
                    return (
                      <div key={cat}>
                        <div
                          className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {CAT_META[cat].label} ({group.length})
                        </div>
                        <div className="space-y-0.5">
                          {group.map((doc) => {
                            const active = selectedDoc.id === doc.id;
                            return (
                              <button
                                key={doc.id}
                                onClick={() => setSelectedDoc(doc)}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs truncate cursor-pointer transition-colors border-l-2"
                                style={{
                                  borderLeftColor: active ? '#235D48' : 'transparent',
                                  backgroundColor: active ? 'var(--pill-ok-bg)' : 'transparent',
                                  color: active ? 'var(--pill-ok-text)' : 'var(--text-secondary)',
                                  fontWeight: active ? 600 : 400,
                                }}
                              >
                                {doc.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Article Stage */}
              <div className="lg:col-span-9 glass-card rounded-2xl overflow-hidden flex flex-col">
                <div
                  className="px-5 py-3.5 border-b flex items-center justify-between gap-3 flex-wrap"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span className="text-[14.5px] font-bold truncate">{selectedDoc.title}</span>
                    <span
                      className="text-[11px] font-mono px-2 py-0.5 rounded-md hidden sm:inline"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                    >
                      {selectedDoc.relativePath}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() =>
                        copyText(
                          'doc-ai',
                          `请严格按照以下小游戏开发 SOP 规范执行当前任务（来源：${selectedDoc.relativePath}）：\n\n${docContent}`,
                          '已复制当前规范给 AI'
                        )
                      }
                      className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs text-white"
                      style={{ backgroundColor: copiedKey === 'doc-ai' ? '#059669' : '#235D48' }}
                    >
                      {copiedKey === 'doc-ai' ? <Check className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'doc-ai' ? '已复制' : '复制给 AI'}</span>
                    </button>
                    <button
                      onClick={() => window.gameHub.openFolder(selectedDoc.absPath)}
                      className="h-8 px-2.5 rounded-xl text-xs font-medium flex items-center gap-1 border cursor-pointer hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>原文件</span>
                    </button>
                  </div>
                </div>

                <div className="p-6 sm:p-8 overflow-y-auto max-h-[680px] select-text">
                  {docLoading ? (
                    <div className="py-16 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      正在加载文档...
                    </div>
                  ) : (
                    <RichMarkdown
                      content={docContent}
                      currentRelPath={selectedDoc.relativePath}
                      theme={theme}
                      onNavigateLink={handleNavigateMarkdownLink}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 03: 参考与字体 ==================== */}
      {activeTab === 'library' && (
        <div className="space-y-6">
          {/* Reference Studies Header */}
          <div className="glass-card rounded-2xl p-5">
            <div
              className="text-[10.5px] font-bold tracking-[0.2em] uppercase mb-1"
              style={{ color: '#BE643D' }}
            >
              REFERENCE LIBRARY
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">有依据地借鉴，有选择地使用。</h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              精选参考源码按固定 commit 版本选读研究，不自动执行第三方脚本或安装外部技能；下方内置 5 款免费可商用（OFL-1.1）中文字体实时对照工具。
            </p>
          </div>

          {/* 3 Reference Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {referenceItems.map((item) => {
              const insight = REF_INSIGHTS[item.id];
              const previewSrc = item.previewExists ? sopAssetUrl(item.previewPath) : null;
              const readableFiles = item.files.filter((f) => f.exists);
              return (
                <div key={item.id} className="glass-card rounded-2xl p-5 flex flex-col justify-between gap-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold"
                        style={{ backgroundColor: 'var(--pill-ok-bg)', color: 'var(--pill-ok-text)' }}
                      >
                        只读研究参考
                      </span>
                      <span className="text-[10.5px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {item.version.slice(0, 10)}
                      </span>
                    </div>
                    <h3 className="text-[15.5px] font-bold">{item.title}</h3>
                    {insight && (
                      <>
                        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          {insight.headline}
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {insight.detail}
                        </p>
                      </>
                    )}

                    {previewSrc && (
                      <div className="pt-1">
                        <img
                          src={previewSrc}
                          alt={item.title}
                          className="w-full h-40 object-cover rounded-xl border"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        />
                        <div className="text-[10.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          上游自带截图，仅研究设计系统展示，不作为游戏资产
                        </div>
                      </div>
                    )}

                    {readableFiles.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <div className="text-[10.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          内置选读文件：
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {readableFiles.slice(0, 5).map((f) => (
                            <button
                              key={f.path}
                              onClick={() => window.gameHub.openSopAsset(f.path)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-mono border cursor-pointer hover:border-emerald-500 transition-colors"
                              style={{
                                backgroundColor: 'var(--bg-surface-strong)',
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <FileCode2 className="w-3 h-3 text-emerald-600" />
                              <span>{f.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                      媒体许可需独立核实
                    </span>
                    <button
                      onClick={() => window.gameHub.openExternal(item.source)}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer hover:underline"
                    >
                      <span>原始仓库</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Live Font Specimen Playground */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap px-1">
              <div>
                <h2 className="text-[18px] font-bold tracking-tight flex items-center gap-2">
                  <Type className="w-4.5 h-4.5 text-emerald-700 dark:text-emerald-400" />
                  <span>给游戏选择合适的字 · 实时文案对照</span>
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  输入你的游戏名、按钮或弹窗文案，直接对照标题、金额数字与正文在不同开源中文字体下的真实观感
                </p>
              </div>

              {library && library.fontInstalledCount < library.fontTotalCount && (
                <button
                  disabled={downloadingFonts}
                  onClick={handleDownloadFonts}
                  className="h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 text-white cursor-pointer shadow-sm disabled:opacity-60"
                  style={{ backgroundColor: '#235D48' }}
                >
                  {downloadingFonts ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {downloadingFonts
                      ? fontProgress?.label || '正在下载开源字体...'
                      : `一键下载 ${library.fontTotalCount - library.fontInstalledCount} 款开源字体包 (OFL)`}
                  </span>
                </button>
              )}
            </div>

            {downloadingFonts && fontProgress && (
              <div className="glass-card rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>{fontProgress.label}</span>
                  <span className="font-mono">
                    {fontProgress.current}/{fontProgress.total}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((fontProgress.current / Math.max(1, fontProgress.total)) * 100)}%`,
                      backgroundColor: '#235D48',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Live Sample Text Input */}
            <div className="glass-card rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-semibold">试试你的游戏文案（输入即实时同步全部字体卡片）</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {FONT_PRESETS.map((preset, pi) => (
                    <button
                      key={pi}
                      onClick={() => setFontSampleText(preset)}
                      className="px-2 py-0.5 rounded-lg text-[10.5px] border cursor-pointer hover:border-emerald-500 transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      示例 {pi + 1}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={fontSampleText}
                onChange={(e) => setFontSampleText(e.target.value)}
                rows={2}
                className="w-full rounded-xl p-3 text-sm outline-none resize-none"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* 5 Font Specimen Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fontItems.map((item) => {
                const fontFamilyStyle = item.installed && item.family ? `"SopFont_${item.family}", sans-serif` : undefined;
                return (
                  <div key={item.id} className="glass-card rounded-2xl p-5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold"
                          style={
                            item.installed
                              ? { backgroundColor: 'var(--pill-ok-bg)', color: 'var(--pill-ok-text)' }
                              : { backgroundColor: 'rgba(190, 100, 61, 0.14)', color: '#B4532A' }
                          }
                        >
                          {item.installed ? '本地字体已就绪 · 真实渲染' : '未下载本地字体'}
                        </span>
                        <span className="text-[10.5px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          {item.license || 'OFL-1.1'}
                        </span>
                      </div>

                      <h3 className="text-[15px] font-bold">{item.title}</h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {item.usage}
                      </p>

                      {item.installed ? (
                        <div
                          className="mt-3.5 pt-3.5 border-t space-y-2.5 select-text"
                          style={{ borderColor: 'var(--border-subtle)', fontFamily: fontFamilyStyle }}
                        >
                          <div className="text-[26px] leading-snug break-words">
                            {fontSampleText || '请输入你的项目文案'}
                          </div>
                          <div className="text-[19px] tracking-wide opacity-90">
                            ￥1,234,567.89　　00:09　　Lv.12
                          </div>
                          <div className="text-[14.5px] opacity-85">
                            订单已完成。余额不足，请先完成当前经营目标。
                          </div>
                        </div>
                      ) : (
                        <div
                          className="mt-3.5 p-4 rounded-xl border border-dashed text-xs text-center"
                          style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
                        >
                          点击上方「一键下载开源字体包」后即可在此实时渲染 {item.title}
                        </div>
                      )}
                    </div>

                    <div
                      className="pt-2.5 border-t flex items-center justify-between gap-2 flex-wrap text-[11px]"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                    >
                      <span>
                        {item.fontCheck?.glyphs ? `${item.fontCheck.glyphs.toLocaleString()} 字形` : item.version.slice(0, 10)}
                        {item.fontCheck?.status ? ` · ${item.fontCheck.status}` : ''}
                      </span>
                      <div className="flex items-center gap-2.5">
                        {item.installed && item.fontPath && (
                          <button
                            onClick={() => window.gameHub.openSopAsset(item.fontPath!)}
                            className="font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer hover:underline"
                          >
                            打开字体文件
                          </button>
                        )}
                        <button
                          onClick={() => window.gameHub.openExternal(item.source)}
                          className="inline-flex items-center gap-0.5 cursor-pointer hover:underline"
                        >
                          <span>仓库</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Static specimen fallback preview when fonts aren't all installed */}
            {library && library.fontInstalledCount === 0 && library.fontSpecimensAvailable && (
              <div className="glass-card rounded-2xl p-5 space-y-2.5">
                <div className="text-xs font-bold">内置字体样张对照图（离线静态参考）</div>
                <img
                  src={sopAssetUrl('library/font-specimens.png') || ''}
                  alt="字体样张对照"
                  className="w-full rounded-xl border"
                  style={{ borderColor: 'var(--border-subtle)' }}
                />
              </div>
            )}

            <div
              className="rounded-2xl px-4 py-3.5 border-l-4 text-xs leading-relaxed flex items-center justify-between gap-3 flex-wrap"
              style={{
                borderLeftColor: '#BE643D',
                backgroundColor: theme === 'dark' ? 'rgba(190, 100, 61, 0.14)' : 'rgba(241, 233, 220, 0.78)',
                color: theme === 'dark' ? '#FCD9B6' : '#765437',
              }}
            >
              <span>
                得意黑仅适合短标题强调，不建议用于手机端长正文；正式选用前务必在 Maker 小屏实机核对清晰度。
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openDocById('docs/规范/字体与排版.md')}
                  className="px-3 py-1 rounded-lg font-semibold bg-white/80 dark:bg-black/30 cursor-pointer"
                >
                  阅读字体规范
                </button>
                <button
                  onClick={() => openDocById('library/使用与授权.md')}
                  className="px-3 py-1 rounded-lg font-semibold bg-white/80 dark:bg-black/30 cursor-pointer"
                >
                  来源与授权边界
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 04: 资源样例 ==================== */}
      {activeTab === 'samples' && (
        <div className="space-y-5">
          <div className="glass-card rounded-2xl p-5">
            <div
              className="text-[10.5px] font-bold tracking-[0.2em] uppercase mb-1"
              style={{ color: '#BE643D' }}
            >
              ASSET WORKFLOW
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">街角早餐店：资源流程样例</h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              用于示范「风格锚点 → 规格清单 → AI 提示词草案 → 审查入库」标准方法的虚构主题（并非所有经营游戏的默认画风）。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div
                className="h-36 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1.5 text-center px-4"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
              >
                <Palette className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
                <div className="text-sm font-bold">场景 · 店员角色 · 商品图标</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  720×1280 竖屏场景 + 512×768 透明角色 + 512×512 图标规格
                </div>
              </div>
              <h3 className="text-[15px] font-bold">先定风格锚点，再生成一组连贯美术</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                温暖明亮、圆润轮廓、统一中粗描边；奶油米白、陶土橙与浅青绿。干净色块、无任何噪点与颗粒，绝不让生图模型画正式 UI 文字。
              </p>
              <button
                onClick={() => openDocById('samples/breakfast/样例说明.md')}
                className="h-8 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                查看完整样例规范与待办 →
              </button>
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div
                className="h-36 rounded-xl border border-dashed flex flex-col items-center justify-center gap-1.5 text-center px-4"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
              >
                <Music className="w-6 h-6 text-amber-600" />
                <div className="text-sm font-bold">主题音乐 · 3 级关键事件音效</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  1 次纯音乐任务 + 点击(0.2s) / 交易(0.6s) / 订单完成(1.2s)
                </div>
              </div>
              <h3 className="text-[15px] font-bold">声音服务于经营节奏与正向反馈</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                柔和纯音乐配轻木质打击；不同反馈有清晰时长与听感层级。试听时重点检查循环接缝与高频连点是否疲劳。
              </p>
              <button
                onClick={() => setShowRawPlan((v) => !v)}
                className="h-8 px-3.5 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface-strong)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {showRawPlan ? '收起原始 JSON 草案' : '查看 generation-plan.json 原文'}
              </button>
            </div>
          </div>

          {/* Interactive Prompt Drafts from generation-plan.json */}
          {library?.generationPlan && (
            <div className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <h3 className="text-sm font-bold">标准资源提示词草案（可直接复用改写）</h3>
                </div>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  点击任意条目展开查看或一键复制 Prompt
                </span>
              </div>

              <div className="space-y-2">
                {library.generationPlan.initialRequest && (
                  <div
                    className="rounded-xl border overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      onClick={() =>
                        setExpandedPromptId(expandedPromptId === 'initial' ? null : 'initial')
                      }
                      className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                          generate_image
                        </span>
                        <span className="text-xs font-bold truncate">
                          {library.generationPlan.initialRequest.name}
                        </span>
                        {library.generationPlan.initialRequest.targetSize && (
                          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                            {library.generationPlan.initialRequest.targetSize}
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          expandedPromptId === 'initial' ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {expandedPromptId === 'initial' && (
                      <div
                        className="px-4 pb-3.5 pt-2 border-t space-y-2"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <p className="text-xs leading-relaxed select-text" style={{ color: 'var(--text-secondary)' }}>
                          {library.generationPlan.initialRequest.prompt}
                        </p>
                        <button
                          onClick={() =>
                            copyText(
                              'gp-init',
                              library.generationPlan!.initialRequest!.prompt,
                              '已复制场景提示词模板'
                            )
                          }
                          className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 border cursor-pointer hover:border-emerald-500"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          {copiedKey === 'gp-init' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>复制提示词</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {library.generationPlan.remaining.map((item) => {
                  const open = expandedPromptId === item.id;
                  const copyPayload =
                    item.prompt ||
                    (item.sounds
                      ? item.sounds.map((s) => `[${s.name} / ${s.duration}s] ${s.text}`).join('\n')
                      : '');
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border overflow-hidden"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <button
                        onClick={() => setExpandedPromptId(open ? null : item.id)}
                        className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/12 text-blue-700 dark:text-blue-400">
                            {item.tool}
                          </span>
                          <span className="text-xs font-bold truncate">{item.title || item.id}</span>
                          {item.targetSize && (
                            <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                              {item.targetSize}
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div
                          className="px-4 pb-3.5 pt-2 border-t space-y-2"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          {item.prompt && (
                            <p className="text-xs leading-relaxed select-text" style={{ color: 'var(--text-secondary)' }}>
                              {item.prompt}
                            </p>
                          )}
                          {item.sounds && (
                            <div className="space-y-1.5">
                              {item.sounds.map((s) => (
                                <div key={s.name} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 mr-2">
                                    {s.name} ({s.duration}s)
                                  </span>
                                  <span>{s.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {copyPayload && (
                            <button
                              onClick={() => copyText(`gp-${item.id}`, copyPayload, '已复制资源提示词模板')}
                              className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 border cursor-pointer hover:border-emerald-500"
                              style={{ borderColor: 'var(--border-subtle)' }}
                            >
                              {copiedKey === `gp-${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>复制提示词</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {showRawPlan && (
                <pre
                  className="p-4 rounded-xl text-[11px] font-mono overflow-x-auto max-h-80 border select-text"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {library.generationPlan.rawJson}
                </pre>
              )}
            </div>
          )}

          {/* 7-Step Asset Pipeline */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold">每次资源生成都遵循 7 步标准流水线</h3>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {[
                '1. 需求与规格',
                '2. 风格锚点与参考',
                '3. 明确目标目录',
                '4. 出小样验证',
                '5. 外观/试听检查',
                '6. 一致性集中修订',
                '7. 入库并记证据',
              ].map((step, si) => (
                <React.Fragment key={step}>
                  <span
                    className="px-3 py-1.5 rounded-xl font-semibold border"
                    style={{
                      backgroundColor: 'var(--bg-surface-strong)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {step}
                  </span>
                  {si < 6 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                onClick={() => openDocById('docs/模板/资源需求表.md')}
                className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500"
                style={{ backgroundColor: 'var(--bg-surface-strong)', borderColor: 'var(--border-subtle)' }}
              >
                使用资源需求表模板
              </button>
              <button
                onClick={() => openDocById('docs/规范/美术与资源.md')}
                className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500"
                style={{ backgroundColor: 'var(--bg-surface-strong)', borderColor: 'var(--border-subtle)' }}
              >
                查看美术规范
              </button>
              <button
                onClick={() => openDocById('docs/规范/音乐与音效.md')}
                className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500"
                style={{ backgroundColor: 'var(--bg-surface-strong)', borderColor: 'var(--border-subtle)' }}
              >
                查看声音规范
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 05: 调用与验收 ==================== */}
      {activeTab === 'start' && (
        <div className="space-y-5">
          {/* Native One-Click Project Connect Panel */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div
                  className="text-[10.5px] font-bold tracking-[0.2em] uppercase mb-1"
                  style={{ color: '#BE643D' }}
                >
                  ONE-CLICK CONNECT
                </div>
                <h2 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
                  <PlugZap className="w-4.5 h-4.5 text-emerald-700 dark:text-emerald-400" />
                  <span>一键为本地游戏项目接入 SOP</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold"
                    style={{ backgroundColor: 'var(--pill-ok-bg)', color: 'var(--pill-ok-text)' }}
                  >
                    已接入 {sopConnected.length}/{activeProjects.length}
                  </span>
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  纯软件原生安全接入（无需敲 Python 命令）：自动创建 <code className="font-mono">.sop/</code>{' '}
                  记录目录并在 <code className="font-mono">AGENTS.md</code> 末尾追加边界块，绝不覆盖已有规则或改动正式存档。
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  disabled={installingSkill}
                  onClick={handleInstallSkill}
                  className="h-8 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 text-white cursor-pointer shadow-xs disabled:opacity-60"
                  style={{ backgroundColor: '#235D48' }}
                >
                  {installingSkill ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                  <span>一键安装 Codex Skill</span>
                </button>
                <button
                  onClick={() => window.gameHub.openSopFolder()}
                  className="h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer hover:border-emerald-500"
                  style={{
                    backgroundColor: 'var(--bg-surface-strong)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>打开 SOP 目录</span>
                </button>
              </div>
            </div>

            {activeProjects.length === 0 ? (
              <div
                className="p-6 rounded-xl border border-dashed text-center text-xs"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
              >
                暂未扫描到活跃游戏项目。请先在首页添加游戏根目录，即可在此一键为每个项目接入 SOP。
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {activeProjects.map((p) => {
                  const busyNew = connectingKey === `${p.id}:new`;
                  const busyExisting = connectingKey === `${p.id}:existing`;
                  return (
                    <div
                      key={p.id}
                      className="px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: p.sop.hasSop ? 'var(--pill-ok-border)' : 'var(--border-subtle)',
                      }}
                    >
                      <button
                        onClick={() => onSelectProject(p.id)}
                        className="min-w-0 text-left flex items-center gap-2 cursor-pointer group"
                      >
                        {p.sop.hasSop ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-400/70 shrink-0 ml-1" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                            {p.name}
                          </div>
                          <div className="text-[10.5px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                            {p.folderName}
                          </div>
                        </div>
                      </button>

                      {p.sop.hasSop ? (
                        <button
                          onClick={() => onSelectProject(p.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer"
                          style={{ backgroundColor: 'var(--pill-ok-bg)', color: 'var(--pill-ok-text)' }}
                        >
                          已接入 SOP
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            disabled={busyNew || busyExisting}
                            onClick={() => handleConnectProject(p, 'existing')}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer hover:border-emerald-500 disabled:opacity-50"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            {busyExisting ? '接入中...' : '接入(已有)'}
                          </button>
                          <button
                            disabled={busyNew || busyExisting}
                            onClick={() => handleConnectProject(p, 'new')}
                            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                            style={{ backgroundColor: '#235D48' }}
                          >
                            {busyNew ? '接入中...' : '接入(新项)'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4 Scenario AI Prompts */}
          <div className="space-y-3">
            <div className="px-1">
              <h3 className="text-base font-bold">从一句话开始，有标准地继续</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                已自动代入当前生效的 SOP 路径，点击即可复制给 Codex / Claude / Cursor / Antigravity 使用
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aiPrompts.map((p) => (
                <div key={p.key} className="glass-card rounded-2xl p-5 flex flex-col justify-between gap-3">
                  <div>
                    <span
                      className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-semibold mb-2"
                      style={{ backgroundColor: 'var(--pill-ok-bg)', color: 'var(--pill-ok-text)' }}
                    >
                      {p.tag}
                    </span>
                    <h4 className="text-[14.5px] font-bold mb-2">{p.title}</h4>
                    <div
                      className="p-3.5 rounded-xl text-xs leading-relaxed select-text break-words"
                      style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      {p.text}
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => copyText(`prompt-${p.key}`, p.text, `已复制「${p.tag}」提示词`)}
                      className="h-8 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border cursor-pointer hover:border-emerald-500 transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      {copiedKey === `prompt-${p.key}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === `prompt-${p.key}` ? '已复制提示词' : '复制提示词'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Validation & Local QA/Diagnosis Reports */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card rounded-2xl p-5 space-y-2.5">
              <h3 className="text-sm font-bold">交付验证与接入边界</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                所有检查项、已知使用边界与版本演进集中在交付验证记录中。不会因为接入 SOP 推翻已有玩法，也不会自动执行构建上传。
              </p>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button
                  onClick={() => openDocById('docs/交付验证.md')}
                  className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500"
                  style={{ backgroundColor: 'var(--bg-surface-strong)', borderColor: 'var(--border-subtle)' }}
                >
                  查看交付验证记录
                </button>
                <button
                  onClick={() => openDocById('docs/流程/项目接入.md')}
                  className="h-8 px-3 rounded-xl text-xs font-semibold border cursor-pointer hover:border-emerald-500"
                  style={{ backgroundColor: 'var(--bg-surface-strong)', borderColor: 'var(--border-subtle)' }}
                >
                  阅读项目接入细则
                </button>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <FileBarChart2 className="w-4 h-4 text-emerald-600" />
                <span>本地 QA 与诊断看板 ({library?.reports.length ?? 0})</span>
              </div>
              {library && library.reports.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                  {library.reports.slice(0, 8).map((rep) => (
                    <button
                      key={rep.id}
                      onClick={() => window.gameHub.openFolder(rep.absPath)}
                      className="w-full px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-left text-xs cursor-pointer hover:border-emerald-500 transition-colors"
                      style={{
                        backgroundColor: 'var(--bg-surface-strong)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Sparkles
                          className={`w-3.5 h-3.5 shrink-0 ${
                            rep.kind === 'diagnosis' ? 'text-violet-600' : 'text-emerald-600'
                          }`}
                        />
                        <span className="truncate font-medium">{rep.title}</span>
                      </div>
                      <span className="text-[10.5px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {formatShortDate(rep.updatedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  当你使用 QA 检测或游戏诊断生成 HTML 报告后，放入 SOP 目录的{' '}
                  <code className="font-mono">qa-reports/</code> 或{' '}
                  <code className="font-mono">diagnosis-reports/</code> 即可在这里直接点击查看。
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast */}
      {toastMsg && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl z-50 flex items-center gap-2 text-white"
          style={{ backgroundColor: toastMsg.kind === 'err' ? '#DC2626' : '#235D48' }}
        >
          {toastMsg.kind === 'ok' ? <Check className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          <span>{toastMsg.text}</span>
        </div>
      )}
    </div>
  );
};
