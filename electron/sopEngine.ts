import { execFile } from 'child_process';
import { net } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { HubStore } from './store';
import {
  BundledSkillInfo,
  SkillClientId,
  SopConnectResult,
  SopDocItem,
  SopFontDownloadProgress,
  SopGenerationPlan,
  SopLibraryData,
  SopLibraryResource,
  SopReportItem,
  SopSkillInstallOptions,
  SopSkillInstallResult,
  SopStageItem,
} from './types';

const execFileAsync = promisify(execFile);

const BEGIN_MARKER = '<!-- taptap-maker-sop:begin -->';
const END_MARKER = '<!-- taptap-maker-sop:end -->';

export function resolveSopRoot(store: HubStore): {
  rootPath: string;
  source: 'custom' | 'local' | 'bundled';
} {
  const custom = store.getState().settings.sopPath?.trim();
  if (custom && fs.existsSync(custom)) {
    return { rootPath: path.resolve(custom), source: 'custom' };
  }

  // Portable bundled SOP (works out of the box on any machine cloning GitHub or running packaged exe)
  const bundledCandidates = [
    path.join(process.resourcesPath || '', 'sop'),
    path.join(__dirname, '..', 'sop'),
    path.join(process.cwd(), 'sop'),
  ];
  for (const c of bundledCandidates) {
    if (c && fs.existsSync(path.join(c, 'docs'))) {
      return { rootPath: path.resolve(c), source: 'bundled' };
    }
  }

  return { rootPath: path.join(__dirname, '..', 'sop'), source: 'bundled' };
}

export function getDataSopLibraryRoot(store: HubStore): string {
  const dataDir = path.dirname(store.getDataFilePath());
  return path.join(dataDir, 'sop-library');
}

export function resolveSopAssetFile(store: HubStore, relPath: string): string | null {
  const cleaned = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || path.isAbsolute(cleaned)) return null;

  const dataLibRoot = path.resolve(getDataSopLibraryRoot(store));
  const { rootPath } = resolveSopRoot(store);
  const resolvedSopRoot = path.resolve(rootPath);

  const candidates = [
    { base: dataLibRoot, full: path.resolve(dataLibRoot, cleaned) },
    { base: resolvedSopRoot, full: path.resolve(resolvedSopRoot, cleaned) },
  ];

  for (const { base, full } of candidates) {
    if (!full.toLowerCase().startsWith(base.toLowerCase())) continue;
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return full;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function extractDocMeta(
  filePath: string,
  fallbackName: string
): { title: string; excerpt: string; searchText: string } {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    let title = fallbackName.replace(/\.md$/i, '');
    let excerpt = '';

    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('---')) continue;
      if (t.startsWith('# ')) {
        title = t.replace(/^#\s+/, '').trim();
        continue;
      }
      if (!excerpt && !t.startsWith('#') && !t.startsWith('|') && !t.startsWith('```')) {
        excerpt = t
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[*`>#]/g, '')
          .trim()
          .slice(0, 88);
        if (excerpt) break;
      }
    }

    const searchText = raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*|`>_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { title, excerpt, searchText };
  } catch {
    return { title: fallbackName.replace(/\.md$/i, ''), excerpt: '', searchText: '' };
  }
}

function collectMarkdownDir(
  rootPath: string,
  relDir: string,
  category: SopDocItem['category']
): SopDocItem[] {
  const fullDir = path.join(rootPath, relDir);
  if (!fs.existsSync(fullDir)) return [];
  try {
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => {
        const absPath = path.join(fullDir, e.name);
        const { title, excerpt, searchText } = extractDocMeta(absPath, e.name);
        const rel = path.join(relDir, e.name).replace(/\\/g, '/');
        return {
          id: rel,
          title,
          fileName: e.name,
          relativePath: rel,
          absPath,
          category,
          excerpt,
          searchText,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  } catch {
    return [];
  }
}

function parseStagesFromFlowDoc(rootPath: string): SopStageItem[] {
  const flowPath = path.join(rootPath, 'docs', '流程', '总流程.md');
  if (!fs.existsSync(flowPath)) return [];
  try {
    const raw = fs.readFileSync(flowPath, 'utf-8').replace(/^\uFEFF/, '');
    const stages: SopStageItem[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith('| ') || t.startsWith('| 阶段') || t.startsWith('|---')) continue;
      const cells = t
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      if (cells.length === 5 && cells[0] && !/^-+$/.test(cells[0])) {
        stages.push({
          index: stages.length + 1,
          name: cells[0],
          input: cells[1],
          work: cells[2],
          pass: cells[3],
          fail: cells[4],
          requiresConfirm: cells[0].includes('确认') || cells[0].includes('上传'),
        });
      }
    }
    return stages;
  } catch {
    return [];
  }
}

function loadLibraryResources(store: HubStore, rootPath: string): SopLibraryResource[] {
  const manifestPath = path.join(rootPath, 'library', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8').replace(/^\uFEFF/, '')) as {
      items?: Array<Record<string, unknown>>;
    };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    return rawItems.map((item) => {
      const kind = String(item.kind || '');
      const fontPath = typeof item.font_path === 'string' ? item.font_path : undefined;
      const previewPath = typeof item.preview_path === 'string' ? item.preview_path : undefined;
      const rawFiles = Array.isArray(item.files) ? (item.files as Array<{ path?: string; bytes?: number }>) : [];
      const files = rawFiles
        .filter((f) => typeof f.path === 'string')
        .map((f) => {
          const rel = String(f.path);
          return {
            path: rel,
            name: path.basename(rel),
            bytes: Number(f.bytes || 0),
            exists: resolveSopAssetFile(store, rel) !== null,
          };
        });

      const installed =
        kind === 'font'
          ? Boolean(fontPath && resolveSopAssetFile(store, fontPath))
          : files.some((f) => f.exists);

      const rawFc = item.font_check as Record<string, unknown> | undefined;

      return {
        id: String(item.id || ''),
        kind,
        title: String(item.title || ''),
        source: String(item.source || ''),
        version: String(item.version || ''),
        downloadUrl: typeof item.download_url === 'string' ? item.download_url : undefined,
        fontPath,
        family: typeof item.family === 'string' ? item.family : undefined,
        usage: String(item.usage || ''),
        license: typeof item.license === 'string' ? item.license : undefined,
        previewPath,
        previewExists: Boolean(previewPath && resolveSopAssetFile(store, previewPath)),
        verification: typeof item.verification === 'string' ? item.verification : undefined,
        fontCheck: rawFc
          ? {
              status: String(rawFc.status || ''),
              glyphs: typeof rawFc.glyphs === 'number' ? rawFc.glyphs : undefined,
              scope: typeof rawFc.scope === 'string' ? rawFc.scope : undefined,
            }
          : undefined,
        installed,
        files,
      };
    });
  } catch {
    return [];
  }
}

function loadGenerationPlan(rootPath: string): SopGenerationPlan | null {
  const planPath = path.join(rootPath, 'samples', 'breakfast', 'generation-plan.json');
  if (!fs.existsSync(planPath)) return null;
  try {
    const rawJson = fs.readFileSync(planPath, 'utf-8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const init = parsed.initial_request as Record<string, unknown> | undefined;
    const rem = Array.isArray(parsed.remaining) ? (parsed.remaining as Array<Record<string, unknown>>) : [];
    return {
      status: String(parsed.status || ''),
      date: String(parsed.date || ''),
      decision: String(parsed.decision || ''),
      initialRequest: init
        ? {
            name: String(init.name || ''),
            prompt: String(init.prompt || ''),
            aspectRatio: typeof init.aspect_ratio === 'string' ? init.aspect_ratio : undefined,
            targetSize: typeof init.target_size === 'string' ? init.target_size : undefined,
          }
        : undefined,
      remaining: rem.map((r) => ({
        id: String(r.id || ''),
        tool: String(r.tool || ''),
        targetSize: typeof r.target_size === 'string' ? r.target_size : undefined,
        transparent: typeof r.transparent === 'boolean' ? r.transparent : undefined,
        prompt: typeof r.prompt === 'string' ? r.prompt : undefined,
        title: typeof r.title === 'string' ? r.title : undefined,
        style: typeof r.style === 'string' ? r.style : undefined,
        sounds: Array.isArray(r.sounds)
          ? (r.sounds as Array<{ name: string; duration: number; text: string }>)
          : undefined,
      })),
      rawJson,
    };
  } catch {
    return null;
  }
}

function collectHtmlReports(rootPath: string): SopReportItem[] {
  const reports: SopReportItem[] = [];
  const folders: [string, SopReportItem['kind']][] = [
    ['qa-reports', 'qa'],
    ['diagnosis-reports', 'diagnosis'],
  ];

  for (const [sub, kind] of folders) {
    const dir = path.join(rootPath, sub);
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.html')) continue;
        const absPath = path.join(dir, e.name);
        const st = fs.statSync(absPath);
        reports.push({
          id: `${sub}/${e.name}`,
          title: e.name.replace(/\.html$/i, ''),
          absPath,
          kind,
          updatedAt: st.mtime.toISOString(),
        });
      }
    } catch {
      // ignore
    }
  }

  reports.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return reports.slice(0, 20);
}

export function getSopLibrary(store: HubStore): SopLibraryData {
  const { rootPath, source } = resolveSopRoot(store);
  const dataLibraryRoot = getDataSopLibraryRoot(store);
  const docs: SopDocItem[] = [];

  const rootFiles: [string, string, SopDocItem['category']][] = [
    ['README.md', 'SOP 总览入口', 'overview'],
    ['docs/流程/总流程.md', '总流程与阶段标准', 'flow'],
    ['docs/交付验证.md', '交付验证记录', 'overview'],
    ['library/使用与授权.md', '本地参考库使用与授权', 'overview'],
    ['samples/breakfast/样例说明.md', '街角早餐店：资源流程样例', 'overview'],
    ['AGENTS.md', 'AI 协作守则', 'overview'],
  ];

  const addedRel = new Set<string>();
  for (const [rel, fallback, cat] of rootFiles) {
    const abs = path.join(rootPath, rel);
    if (fs.existsSync(abs)) {
      const { title, excerpt, searchText } = extractDocMeta(abs, fallback);
      docs.push({
        id: rel,
        title,
        fileName: path.basename(rel),
        relativePath: rel,
        absPath: abs,
        category: cat,
        excerpt,
        searchText,
      });
      addedRel.add(rel.replace(/\\/g, '/'));
    }
  }

  for (const item of collectMarkdownDir(rootPath, 'docs/流程', 'flow')) {
    if (!addedRel.has(item.relativePath)) docs.push(item);
  }
  for (const item of collectMarkdownDir(rootPath, 'docs/规范', 'spec')) {
    docs.push(item);
  }
  for (const item of collectMarkdownDir(rootPath, 'docs/模板', 'template')) {
    docs.push(item);
  }

  const stages = parseStagesFromFlowDoc(rootPath);
  const resources = loadLibraryResources(store, rootPath);
  const fontItems = resources.filter((r) => r.kind === 'font');
  const fontInstalledCount = fontItems.filter((r) => r.installed).length;
  const fontSpecimensAvailable = resolveSopAssetFile(store, 'library/font-specimens.png') !== null;
  const generationPlan = loadGenerationPlan(rootPath);
  const reports = collectHtmlReports(rootPath);
  const bundledSkills = listBundledSkills(store, rootPath);

  return {
    rootPath,
    dataLibraryRoot,
    source,
    docs,
    stages,
    resources,
    generationPlan,
    fontSpecimensAvailable,
    fontInstalledCount,
    fontTotalCount: fontItems.length,
    reports,
    bundledSkills,
  };
}

export function readSopDocument(store: HubStore, absPath: string): string {
  const { rootPath } = resolveSopRoot(store);
  const resolvedRoot = path.resolve(rootPath).toLowerCase();
  const resolvedTarget = path.resolve(absPath);
  if (!resolvedTarget.toLowerCase().startsWith(resolvedRoot)) {
    return '';
  }
  if (!fs.existsSync(resolvedTarget)) return '';
  try {
    return fs.readFileSync(resolvedTarget, 'utf-8').replace(/^\uFEFF/, '');
  } catch {
    return '';
  }
}

export function connectProjectToSop(
  store: HubStore,
  projectPath: string,
  mode: 'new' | 'existing'
): SopConnectResult {
  const { rootPath } = resolveSopRoot(store);
  const sop = path.resolve(rootPath);
  const project = path.resolve(projectPath);

  const fail = (error: string): SopConnectResult => ({
    ok: false,
    project,
    mode,
    created: [],
    unchanged: true,
    error,
  });

  const requiredFiles = [
    path.join(sop, 'README.md'),
    path.join(sop, 'docs', '流程', '项目接入.md'),
    path.join(sop, 'docs', '模板', '进度.md'),
    path.join(sop, 'docs', '模板', '设计决定.md'),
    path.join(sop, 'docs', '模板', '验收记录.md'),
  ];
  for (const rf of requiredFiles) {
    if (!fs.existsSync(rf)) {
      return fail(`SOP 模板文件缺失，未接入：${rf}`);
    }
  }

  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    return fail(`目标游戏目录不存在：${project}`);
  }
  if (
    project.toLowerCase() === sop.toLowerCase() ||
    project.toLowerCase().startsWith(sop.toLowerCase() + path.sep)
  ) {
    return fail('不能把 SOP 资料库目录本身当作正式游戏接入');
  }

  const stateDir = path.join(project, '.sop');
  const agentsPath = path.join(project, 'AGENTS.md');
  try {
    if (fs.existsSync(stateDir) && fs.lstatSync(stateDir).isSymbolicLink()) {
      return fail('.sop 为符号链接，请人工检查后接入');
    }
    if (fs.existsSync(agentsPath) && fs.lstatSync(agentsPath).isSymbolicLink()) {
      return fail('AGENTS.md 为符号链接，请人工检查后接入');
    }
    if (fs.existsSync(stateDir) && !fs.statSync(stateDir).isDirectory()) {
      return fail('.sop 已存在且不是目录');
    }

    const configPath = path.join(stateDir, 'project.json');
    const config = { sop_root: sop, sop_version: '2.0.0', mode };
    if (fs.existsSync(configPath)) {
      const prev = JSON.parse(fs.readFileSync(configPath, 'utf-8').replace(/^\uFEFF/, '')) as Record<
        string,
        unknown
      >;
      if (
        prev.sop_root !== config.sop_root ||
        prev.sop_version !== config.sop_version ||
        prev.mode !== config.mode
      ) {
        return fail('该项目已存在不同配置的 .sop/project.json，为保护已有记录未覆盖');
      }
    }

    const existingBuf = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath) : Buffer.alloc(0);
    const existingText = existingBuf.toString('utf-8').replace(/^\uFEFF/, '');
    const beginCount = existingText.split(BEGIN_MARKER).length - 1;
    const endCount = existingText.split(END_MARKER).length - 1;
    if (beginCount !== endCount || beginCount > 1) {
      return fail('AGENTS.md 中已有 SOP 边界标记异常，已停止修改');
    }

    const expectedSection = [
      BEGIN_MARKER,
      '## TapTap Maker SOP v2.0 入口',
      '',
      `- SOP 根目录：\`${sop}\`；项目采用版本与状态在 \`.sop/project.json\`。`,
      '- 开始工作先读取 SOP 的 `README.md`、`docs/流程/项目接入.md`，再读本项目 `.sop/进度.md`、`.sop/设计决定.md` 与实际源码，按需查阅对应规范，不机械重跑全流程。',
      '- AI 防乱改纪律：改前先读目标模块与调用链；最小必要改动，保留已有设计、未提交工作与正式存档，不顺手改名稳定存档字段。',
      '- 生产避坑前置：`dt` 上限钳制、广告返回音频恢复、多指触控隔离、4:3~20:9 全比例与右上角平台胶囊避让、显式 `saveVersion` 渐进迁移、LSP 0 警告。',
      '- 三道人工门禁：玩法方向确认、视觉/空间与声音样板确认、发布候选确认；**构建与上传必须另有明确授权**（发版前先走 `taptap-maker-qa` 全量体检闭环）。',
      '- 区分 6 级证据（静态/模拟/资源/官方 Lua 校验/本地预览/真机平台）；QA 与诊断报告输出至项目外目录，严禁污染游戏包体。',
      '- SOP 根目录不可用时报告缺失路径；中央版本升级不自动覆盖本项目设计。',
      END_MARKER,
      '',
    ].join('\n');

    if (beginCount === 1) {
      const bIdx = existingText.indexOf(BEGIN_MARKER);
      const eIdx = existingText.indexOf(END_MARKER) + END_MARKER.length;
      const block = existingText.slice(bIdx, eIdx);
      if (!block.includes(sop)) {
        return fail('AGENTS.md 中已有入口指向另一套 SOP 路径，请人工确认迁移');
      }
    }

    fs.mkdirSync(stateDir, { recursive: true });
    const created: string[] = [];

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      created.push('.sop/project.json');
    }

    const templateMap: [string, string][] = [
      ['进度.md', '进度.md'],
      ['设计决定.md', '设计决定.md'],
      ['验收.md', '验收记录.md'],
    ];
    for (const [destName, srcName] of templateMap) {
      const outPath = path.join(stateDir, destName);
      if (!fs.existsSync(outPath)) {
        let content = fs
          .readFileSync(path.join(sop, 'docs', '模板', srcName), 'utf-8')
          .replace(/^\uFEFF/, '');
        if (destName === '进度.md') {
          content = content.replace(
            '当前阶段：待评估',
            `当前阶段：${mode === 'new' ? '立项研究' : '已有项目现状评估'}`
          );
        }
        fs.writeFileSync(outPath, content, 'utf-8');
        created.push(`.sop/${destName}`);
      }
    }

    if (beginCount === 0) {
      const hasCrlf = existingBuf.includes(Buffer.from('\r\n'));
      const nl = hasCrlf ? '\r\n' : '\n';
      const endsWithNewline =
        existingBuf.length > 0 &&
        (existingBuf[existingBuf.length - 1] === 0x0a || existingBuf[existingBuf.length - 1] === 0x0d);
      const sep = existingBuf.length === 0 ? '' : endsWithNewline ? nl : nl + nl;
      const appendBuf = Buffer.from((sep + expectedSection).replace(/\n/g, nl), 'utf-8');
      fs.writeFileSync(agentsPath, Buffer.concat([existingBuf, appendBuf]));
      created.push('AGENTS.md');
    }

    return {
      ok: true,
      project,
      mode,
      created,
      unchanged: created.length === 0,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const BUNDLED_SKILL_CATALOG: {
  id: string;
  title: string;
  stageBadge: string;
  description: string;
}[] = [
  {
    id: 'taptap-maker-sop',
    title: '小游戏开发 SOP v2.0',
    stageBadge: '01~08 制作全流程',
    description:
      '立项、原型、视觉与 3D 动线基线、UrhoX/Lua 生产避坑、存档风控、OPT 变现与 AI 防乱改纪律。',
  },
  {
    id: 'taptap-maker-qa',
    title: '发布前全量 QA 自动闭环',
    stageBadge: '09 发版前体检',
    description:
      '内置静态审计脚本 + 8 大维度审查 + 老档直升评估 + 自动修复回归 + 单文件 HTML 验收看板生成器。',
  },
  {
    id: 'mini-game-version-ops',
    title: '新版本运营资料与头图',
    stageBadge: '10 商店运营物料',
    description:
      '按运营后台限长规范交付版本名/卖点/标签/更新重点，并产出游戏画风一致的 16:9 头图与 2.5:1 品牌专区图。',
  },
  {
    id: 'game-diagnosis',
    title: '线上数据深度诊断看板',
    stageBadge: '11 数据驱动迭代',
    description:
      '结合 GamePropel CLI 与源码只读核查留存/漏斗/关卡/广告，输出 ≤3 个高确定性优化点与交互 HTML 看板。',
  },
];

const SKILL_CLIENTS: SkillClientId[] = ['antigravity', 'codex', 'claude', 'cursor'];

function resolveSkillClientDir(target: SkillClientId): string {
  const home = os.homedir();
  switch (target) {
    case 'antigravity':
      return path.join(home, '.gemini', 'config', 'skills');
    case 'codex':
      return path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'skills');
    case 'claude':
      return path.join(home, '.claude', 'skills');
    case 'cursor':
      return path.join(home, '.cursor', 'skills');
  }
}

function resolveSkillSourceDir(activeSopRoot: string, skillId: string): string | null {
  const candidates = [
    path.join(activeSopRoot, 'skill', skillId),
    path.join(process.resourcesPath || '', 'sop', 'skill', skillId),
    path.join(__dirname, '..', 'sop', 'skill', skillId),
    path.join(process.cwd(), 'sop', 'skill', skillId),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'SKILL.md'))) {
      return path.resolve(c);
    }
  }
  return null;
}

function collectSkillFiles(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name === '.DS_Store') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSkillFiles(full, base));
    } else if (entry.isFile()) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

function renderSkillFileBytes(
  srcPath: string,
  relPath: string,
  destSkillDir: string,
  activeSopRoot: string
): Buffer {
  const raw = fs.readFileSync(srcPath);
  if (!relPath.toLowerCase().endsWith('.md')) return raw;
  const text = raw
    .toString('utf-8')
    .replace(/\{\{SKILL_ROOT\}\}/g, destSkillDir)
    .replace(/\{\{SOP_ROOT\}\}/g, activeSopRoot);
  return Buffer.from(text, 'utf-8');
}

function getSkillInstallStatus(
  srcDir: string,
  relFiles: string[],
  destSkillDir: string,
  activeSopRoot: string
): 'installed' | 'outdated' | 'missing' {
  if (!fs.existsSync(path.join(destSkillDir, 'SKILL.md'))) {
    return 'missing';
  }
  for (const rel of relFiles) {
    const outPath = path.join(destSkillDir, rel);
    if (!fs.existsSync(outPath)) return 'outdated';
    try {
      const expected = renderSkillFileBytes(
        path.join(srcDir, rel),
        rel,
        destSkillDir,
        activeSopRoot
      );
      const actual = fs.readFileSync(outPath);
      if (!actual.equals(expected)) return 'outdated';
    } catch {
      return 'outdated';
    }
  }
  return 'installed';
}

function listBundledSkills(store: HubStore, activeSopRoot: string): BundledSkillInfo[] {
  const results: BundledSkillInfo[] = [];
  for (const meta of BUNDLED_SKILL_CATALOG) {
    const srcDir = resolveSkillSourceDir(activeSopRoot, meta.id);
    if (!srcDir) continue;
    const relFiles = collectSkillFiles(srcDir, srcDir);
    const installedTargets = {} as Record<SkillClientId, 'installed' | 'outdated' | 'missing'>;
    for (const client of SKILL_CLIENTS) {
      const destSkillDir = path.join(resolveSkillClientDir(client), meta.id);
      installedTargets[client] = getSkillInstallStatus(
        srcDir,
        relFiles,
        destSkillDir,
        activeSopRoot
      );
    }
    results.push({
      id: meta.id,
      title: meta.title,
      stageBadge: meta.stageBadge,
      description: meta.description,
      fileCount: relFiles.length,
      installedTargets,
    });
  }
  return results;
}

export function installSopSkill(
  store: HubStore,
  options?: SopSkillInstallOptions
): SopSkillInstallResult {
  const { rootPath } = resolveSopRoot(store);
  const target: SkillClientId = options?.target || 'antigravity';
  const overwrite = options?.overwrite !== false;
  const wantedIds =
    options?.skillIds && options.skillIds.length > 0
      ? options.skillIds
      : BUNDLED_SKILL_CATALOG.map((s) => s.id);

  const clientSkillsDir = resolveSkillClientDir(target);
  const installedIds: string[] = [];
  const skippedIds: string[] = [];
  let totalFiles = 0;

  try {
    for (const skillId of wantedIds) {
      const srcDir = resolveSkillSourceDir(rootPath, skillId);
      if (!srcDir) {
        skippedIds.push(skillId);
        continue;
      }

      const destSkillDir = path.join(clientSkillsDir, skillId);
      const relFiles = collectSkillFiles(srcDir, srcDir);

      // Guard against symlinks before writing
      for (const rel of relFiles) {
        const outPath = path.join(destSkillDir, rel);
        if (fs.existsSync(outPath) && fs.lstatSync(outPath).isSymbolicLink()) {
          return { ok: false, target, error: `目标为符号链接，未覆盖：${outPath}` };
        }
      }

      if (!overwrite) {
        let differs = false;
        for (const rel of relFiles) {
          const outPath = path.join(destSkillDir, rel);
          if (fs.existsSync(outPath)) {
            const expected = renderSkillFileBytes(
              path.join(srcDir, rel),
              rel,
              destSkillDir,
              rootPath
            );
            if (!fs.readFileSync(outPath).equals(expected)) {
              differs = true;
              break;
            }
          }
        }
        if (differs) {
          skippedIds.push(skillId);
          continue;
        }
      }

      for (const rel of relFiles) {
        const outPath = path.join(destSkillDir, rel);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        const content = renderSkillFileBytes(
          path.join(srcDir, rel),
          rel,
          destSkillDir,
          rootPath
        );
        fs.writeFileSync(outPath, content);
        totalFiles++;
      }
      installedIds.push(skillId);
    }

    if (installedIds.length === 0 && skippedIds.length > 0) {
      return {
        ok: false,
        target,
        installedPath: clientSkillsDir,
        skippedIds,
        error: '检测到已有自定义版本且未启用覆盖，未写入任何技能',
      };
    }

    return {
      ok: true,
      target,
      installedPath: clientSkillsDir,
      installedIds,
      skippedIds,
      files: totalFiles,
    };
  } catch (err) {
    return { ok: false, target, error: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchToFile(url: string, destPath: string): Promise<void> {
  const res = await net.fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`下载失败 (${res.status}): ${url}`);
  }
  const ab = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.part`;
  fs.writeFileSync(tmp, Buffer.from(ab));
  fs.renameSync(tmp, destPath);
}

export async function downloadSopFonts(
  store: HubStore,
  onProgress: (p: SopFontDownloadProgress) => void
): Promise<{ ok: boolean; installed: number; total: number; error?: string }> {
  const lib = getSopLibrary(store);
  const fonts = lib.resources.filter((r) => r.kind === 'font' && r.fontPath && r.downloadUrl);
  const dataRoot = getDataSopLibraryRoot(store);
  let installed = 0;

  try {
    for (let i = 0; i < fonts.length; i++) {
      const item = fonts[i];
      const relFont = item.fontPath!;
      if (resolveSopAssetFile(store, relFont)) {
        installed++;
        onProgress({
          current: i + 1,
          total: fonts.length,
          label: `${item.title}（已就绪）`,
          status: 'downloading',
        });
        continue;
      }

      onProgress({
        current: i + 1,
        total: fonts.length,
        label: `正在下载 ${item.title}...`,
        status: 'downloading',
      });

      const targetFontFile = path.join(dataRoot, relFont);
      if (item.downloadUrl!.toLowerCase().endsWith('.zip')) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamehub-font-'));
        const zipPath = path.join(tmpDir, 'font.zip');
        const extractDir = path.join(tmpDir, 'out');
        try {
          await fetchToFile(item.downloadUrl!, zipPath);
          onProgress({
            current: i + 1,
            total: fonts.length,
            label: `正在解压 ${item.title}...`,
            status: 'extracting',
          });
          await execFileAsync(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
            ],
            { windowsHide: true }
          );
          const wantedName = path.basename(relFont).toLowerCase();
          const findMatch = (dir: string): string | null => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                const hit = findMatch(full);
                if (hit) return hit;
              } else if (entry.name.toLowerCase() === wantedName) {
                return full;
              }
            }
            return null;
          };
          const found = findMatch(extractDir);
          if (!found) {
            throw new Error(`压缩包中未找到字体文件 ${path.basename(relFont)}`);
          }
          fs.mkdirSync(path.dirname(targetFontFile), { recursive: true });
          fs.copyFileSync(found, targetFontFile);
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } else {
        await fetchToFile(item.downloadUrl!, targetFontFile);
      }

      installed++;
    }

    onProgress({
      current: fonts.length,
      total: fonts.length,
      label: '全部 5 款开源中文字体已就绪',
      status: 'done',
    });
    return { ok: true, installed, total: fonts.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({
      current: installed,
      total: fonts.length,
      label: '字体下载中断',
      status: 'error',
      error: msg,
    });
    return { ok: false, installed, total: fonts.length, error: msg };
  }
}
