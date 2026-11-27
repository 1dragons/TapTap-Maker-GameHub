import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || 'v1.0.0';
const version = tag.replace(/^v/i, '');
const repo = process.env.GITHUB_REPOSITORY || '1dragons/TapTap-Maker-GameHub';
const releaseDir = path.resolve('release');
const publishDir = path.join(releaseDir, 'publish');

fs.mkdirSync(publishDir, { recursive: true });

const files = fs
  .readdirSync(releaseDir)
  .filter((name) => /\.(exe|zip)$/i.test(name) && !/\.blockmap$/i.test(name))
  .sort();

if (files.length === 0) {
  console.error('No .exe or .zip release artifacts found in release/');
  process.exit(1);
}

const mdRows = [];
let installerAsset;
let portableAsset;

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

const body = [
  `## GameHub 游戏总控台 ${tag}（Windows x64 发行版）`,
  '',
  '苹果浅色毛玻璃风格本地游戏项目总控台 + 内置 TapTap Maker 小游戏开发 SOP 中心 + TapTap 玩家评价与论坛问题雷达。默认本地只读运行，联网仅在手动点击时按需触发，绝不改动你的游戏源码。',
  '',
  '### 下载方式',
  '- **Windows 安装版（推荐）**：`GameHub-*-win-x64-setup.exe` — 双击安装，自动创建桌面快捷方式与开始菜单入口。',
  '- **绿色免安装便携版**：`GameHub-*-win-x64-portable.zip` — 解压到任意文件夹，双击 `GameHub.exe` 即可运行。',
  '',
  '### 核心亮点',
  '- 📡 **TapTap 玩家评价 & 论坛问题雷达（v1.1.0 重磅新增）**：按需直连 TapTap 公开接口，首次全量抓取历史评价与论坛帖子，后续秒级增量同步并高亮 `NEW` 新增项；零配置本地六维痛点聚合（闪退/广告/存档/数值/操作/好评），支持「一键复制给 AI」、一键「转待办」，并支持可选配置 DeepSeek / 通义千问 / MiniMax / 智谱 GLM / 本地 Ollama + **4 档 AI 思考强度**（极速/轻度/深度/极致）一键生成 P0/P1/P2 问题诊断报告',
  '- 🔄 **软件内一键检测与无损更新**：自动识别安装版与绿色便携版，升级前自动备份本地 `hub-state.json` 并执行 SHA-256 完整性校验，100% 无损保留项目配置、随手记、待办、AI Key 与评价缓存',
  '- 🍎 **苹果浅色毛玻璃 UI**：6 款柔彩毛玻璃氛围背景 + 三档通透度 + 深浅模式实时切换',
  '- 🌳 **高颜值 Git 演进树**：发光渐变主干、按日菱形锚点、语义标签筛选、未提交脉冲节点与文件增删明细',
  '- 📖 **SOP v2.0 工作台 + 四件套 AI 技能一键安装**：内置 2D/3D 横竖屏实战 SOP v2.0（含 UrhoX/Lua 生产避坑、存档直升风控、3D 动线、OPT 变现与三排矢量全屏流程图），并开箱内置 `taptap-maker-sop` / `taptap-maker-qa` / `mini-game-version-ops` / `game-diagnosis` 全套技能，支持一键安装到 Antigravity / Codex / Claude Code / Cursor',
  '- 🔥 **工作室脉搏 & 提效工具**：20 周跨游戏开发热力图、一键复制 AI 续接上下文、从 Git 自动生成更新日志、`Ctrl + K` 全局命令面板',
  '',
  '### 发行包清单',
  '| 文件名 | 大小 |',
  '|---|---:|',
  ...mdRows,
  '',
  '> 各发行包的 SHA-256 校验值由 GitHub Releases 自动生成并展示在下方 Assets 列表中。',
  '',
].join('\n');

fs.writeFileSync(path.join(publishDir, 'RELEASE_BODY.md'), body, 'utf8');

const latestManifest = {
  version,
  tag,
  name: `GameHub ${tag}`,
  publishedAt: new Date().toISOString(),
  releaseUrl: `https://github.com/${repo}/releases/tag/${tag}`,
  releaseNotes: body,
  installerAsset: installerAsset || null,
  portableAsset: portableAsset || null,
};
fs.writeFileSync(
  path.join(publishDir, 'latest.json'),
  JSON.stringify(latestManifest, null, 2) + '\n',
  'utf8'
);
console.log(`Prepared RELEASE_BODY.md & latest.json for ${files.length} artifacts.`);
