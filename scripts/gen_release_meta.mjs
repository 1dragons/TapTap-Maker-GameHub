import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes('--dry-run');
const positional = rawArgs.filter((a) => !a.startsWith('--'));

const tag = positional[0] || process.env.GITHUB_REF_NAME || 'v1.0.0';
const version = tag.replace(/^v/i, '');
const repo = process.env.GITHUB_REPOSITORY || '1dragons/TapTap-Maker-GameHub';
const releaseDir = path.resolve('release');
const publishDir = path.join(releaseDir, 'publish');
const changelogPath = path.resolve('CHANGELOG.md');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function findPreviousTag(currentTag) {
  const tagsRaw = runGit(['tag', '--sort=-v:refname']);
  if (!tagsRaw) return '';
  const tags = tagsRaw
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  const idx = tags.indexOf(currentTag);
  if (idx >= 0) {
    return idx + 1 < tags.length ? tags[idx + 1] : '';
  }
  // If currentTag hasn't been tagged locally yet (e.g., --dry-run on next version), pick latest existing tag
  return tags[0] || '';
}

function extractChangelogSection(targetTag, targetVersion) {
  if (!fs.existsSync(changelogPath)) return '';
  const content = fs.readFileSync(changelogPath, 'utf8');
  const lines = content.split(/\r?\n/);

  const headingRe = new RegExp(
    `^##\\s+\\[?(?:v)?${escapeRegExp(targetVersion)}\\]?(?:\\s|\\(|$)`
  );

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx < 0) return '';

  const collected = [];
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+/.test(trimmed)) break;
    if (/^---+$/.test(trimmed)) continue;
    collected.push(lines[i]);
  }

  return collected.join('\n').trim();
}

function buildGitFallbackNotes(currentTag, prevTag) {
  const hasCurrentTag = Boolean(runGit(['rev-parse', '-q', '--verify', `refs/tags/${currentTag}`]));
  const endRef = hasCurrentTag ? currentTag : 'HEAD';
  const range = prevTag ? `${prevTag}..${endRef}` : endRef;

  const logRaw = runGit(['log', range, '--no-merges', '--pretty=format:%s']);
  if (!logRaw) {
    return '- 常规维护与构建发布优化。';
  }

  const subjects = logRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !/^chore\(release\):\s*bump version/i.test(s));

  if (subjects.length === 0) {
    return '- 常规维护与构建发布优化。';
  }

  const feats = [];
  const fixes = [];
  const others = [];

  for (const s of subjects) {
    if (/^feat(\([^)]+\))?:\s*/i.test(s)) {
      feats.push(s.replace(/^feat(\([^)]+\))?:\s*/i, ''));
    } else if (/^fix(\([^)]+\))?:\s*/i.test(s)) {
      fixes.push(s.replace(/^fix(\([^)]+\))?:\s*/i, ''));
    } else {
      others.push(s.replace(/^[a-z]+(\([^)]+\))?:\s*/i, ''));
    }
  }

  const sections = [];
  if (feats.length) {
    sections.push('### ✨ 新增功能', ...feats.map((item) => `- ${item}`), '');
  }
  if (fixes.length) {
    sections.push('### 🐛 问题修复', ...fixes.map((item) => `- ${item}`), '');
  }
  if (others.length) {
    sections.push('### ⚡ 优化与调整', ...others.map((item) => `- ${item}`), '');
  }
  return sections.join('\n').trim();
}

function shiftHeadings(md, shiftBy = 1) {
  const prefix = '#'.repeat(shiftBy);
  return md
    .split(/\r?\n/)
    .map((line) => (/^#{1,5}\s+/.test(line) ? `${prefix}${line}` : line))
    .join('\n');
}

const prevTag = findPreviousTag(tag);
const fromChangelog = extractChangelogSection(tag, version);
const notesSource = fromChangelog ? 'CHANGELOG.md' : 'git log fallback';
const rawVersionNotes = fromChangelog || buildGitFallbackNotes(tag, prevTag);
const bodyVersionNotes = shiftHeadings(rawVersionNotes, 1);

const compareLine = prevTag
  ? `> **完整代码变更对比**：[\`${prevTag}...${tag}\`](https://github.com/${repo}/compare/${encodeURIComponent(
      prevTag
    )}...${encodeURIComponent(
      tag
    )}) · 查看全部历史版本记录：[\`CHANGELOG.md\`](https://github.com/${repo}/blob/main/CHANGELOG.md)`
  : `> 查看全部历史版本记录：[\`CHANGELOG.md\`](https://github.com/${repo}/blob/main/CHANGELOG.md)`;

const mdRows = [];
let installerAsset = null;
let portableAsset = null;
let artifactCount = 0;

if (!dryRun) {
  fs.mkdirSync(publishDir, { recursive: true });

  const files = fs
    .readdirSync(releaseDir)
    .filter((name) => /\.(exe|zip)$/i.test(name) && !/\.blockmap$/i.test(name))
    .sort();

  if (files.length === 0) {
    console.error('No .exe or .zip release artifacts found in release/');
    process.exit(1);
  }

  artifactCount = files.length;

  for (const name of files) {
    const src = path.join(releaseDir, name);
    const dst = path.join(publishDir, name);
    fs.copyFileSync(src, dst);

    const stat = fs.statSync(dst);
    const mb = (stat.size / (1024 * 1024)).toFixed(2);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex');
    mdRows.push(`| \`${name}\` | ${mb} MB |`);

    const assetObj = {
      name,
      downloadUrl: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
      size: stat.size,
      sha256,
    };
    if (/setup\.exe$/i.test(name)) installerAsset = assetObj;
    if (/portable\.zip$/i.test(name)) portableAsset = assetObj;
  }
} else {
  mdRows.push(
    `| \`GameHub-${version}-win-x64-setup.exe\` | (preview) |`,
    `| \`GameHub-${version}-win-x64-portable.zip\` | (preview) |`
  );
}

const body = [
  `## GameHub 游戏总控台 ${tag}（Windows x64 发行版）`,
  '',
  `### ✨ 本次更新内容（${tag}）`,
  '',
  bodyVersionNotes,
  '',
  compareLine,
  '',
  '---',
  '',
  '### 📥 下载与升级方式',
  '- **已有旧版用户（推荐）**：在 GameHub 内点击左下角版本号或「设置 → 检测更新」，可 **100% 无损保留本地数据一键升级**（自动备份 `hub-state.json`）。',
  '- **Windows 安装版**：`GameHub-*-win-x64-setup.exe` — 双击安装，自动创建桌面快捷方式与开始菜单入口。',
  '- **绿色免安装便携版**：`GameHub-*-win-x64-portable.zip` — 解压到任意文件夹，双击 `GameHub.exe` 即可运行。',
  '',
  '### 📦 发行包清单',
  '| 文件名 | 大小 |',
  '|---|---:|',
  ...mdRows,
  '',
  '> 各发行包的 SHA-256 校验值由 GitHub Releases 自动生成并展示在下方 Assets 列表中。',
  '',
  '<details>',
  '<summary>💡 关于 GameHub 核心特性（点击展开）</summary>',
  '',
  '苹果浅色毛玻璃风格本地游戏项目总控台 + 内置 TapTap Maker 小游戏开发 SOP v2.0 中心 + TapTap 玩家评价与论坛问题雷达。默认本地只读运行，联网仅在手动点击时按需触发，绝不改动你的游戏源码。',
  '',
  '- 📡 **TapTap 玩家评价 & 论坛问题雷达**：首次全量抓取、后续秒级增量同步并高亮 `NEW` 新增项；本地六维痛点聚合 + 可选 BYOK 多模型（DeepSeek / 通义千问 / MiniMax / 智谱 GLM / Ollama）+ 4 档 AI 思考强度一键诊断',
  '- 🔄 **软件内一键检测与无损更新**：自动识别安装版与绿色便携版，升级前自动备份 `hub-state.json` 并执行 SHA-256 校验，100% 无损保留配置与记录',
  '- 📖 **SOP v2.0 工作台 + 四件套 AI 技能一键安装**：覆盖 2D/3D 横竖屏实战规范与三排矢量流程图，内置 `taptap-maker-sop` / `taptap-maker-qa` / `mini-game-version-ops` / `game-diagnosis`，一键安装到 Antigravity / Codex / Claude Code / Cursor',
  '- 🌳 **高颜值 Git 演进树 & 工作室脉搏**：发光渐变多分支演进树、20 周跨游戏热力图、一键复制 AI 续接上下文、`Ctrl + K` 全局命令面板',
  '',
  '</details>',
  '',
].join('\n');

const inAppReleaseNotes = [
  `## ${tag} 更新内容`,
  '',
  rawVersionNotes,
].join('\n');

if (dryRun) {
  console.log(`[dry-run] tag=${tag}, prevTag=${prevTag || '(none)'}, source=${notesSource}`);
  console.log('\n========== RELEASE_BODY.md ==========\n');
  console.log(body);
  console.log('========== latest.json -> releaseNotes ==========\n');
  console.log(inAppReleaseNotes);
  process.exit(0);
}

fs.writeFileSync(path.join(publishDir, 'RELEASE_BODY.md'), body, 'utf8');

const latestManifest = {
  version,
  tag,
  name: `GameHub ${tag}`,
  publishedAt: new Date().toISOString(),
  releaseUrl: `https://github.com/${repo}/releases/tag/${tag}`,
  releaseNotes: inAppReleaseNotes,
  installerAsset,
  portableAsset,
};

fs.writeFileSync(
  path.join(publishDir, 'latest.json'),
  JSON.stringify(latestManifest, null, 2) + '\n',
  'utf8'
);

console.log(
  `Prepared RELEASE_BODY.md & latest.json for ${artifactCount} artifacts (tag=${tag}, notes=${notesSource}).`
);
