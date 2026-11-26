import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const tag = process.argv[2] || process.env.GITHUB_REF_NAME || 'v1.0.0';
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

const sumLines = [];
const mdRows = [];

for (const name of files) {
  const src = path.join(releaseDir, name);
  const dst = path.join(publishDir, name);
  fs.copyFileSync(src, dst);

  const hash = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex');
  const mb = (fs.statSync(dst).size / (1024 * 1024)).toFixed(2);
  sumLines.push(`${hash}  ${name}`);
  mdRows.push(`| \`${name}\` | ${mb} MB | \`${hash}\` |`);
}

fs.writeFileSync(path.join(publishDir, 'SHA256SUMS.txt'), `${sumLines.join('\n')}\n`, 'utf8');

const body = [
  `## GameHub 游戏总控台 ${tag}（Windows x64 发行版）`,
  '',
  '苹果浅色毛玻璃风格本地游戏项目总控台 + 内置 TapTap Maker 小游戏开发 SOP 中心。纯本地离线运行，对你的游戏目录 100% 只读。',
  '',
  '### 下载方式',
  '- **Windows 安装版（推荐）**：`GameHub-*-win-x64-setup.exe` — 双击安装，自动创建桌面快捷方式与开始菜单入口。',
  '- **绿色免安装便携版**：`GameHub-*-win-x64-portable.zip` — 解压到任意文件夹，双击 `GameHub.exe` 即可运行。',
  '',
  '### 核心亮点',
  '- 🍎 **苹果浅色毛玻璃 UI**：6 款柔彩毛玻璃氛围背景 + 三档通透度 + 深浅模式实时切换',
  '- 🌳 **高颜值 Git 演进树**：发光渐变主干、按日菱形锚点、语义标签筛选、未提交脉冲节点与文件增删明细',
  '- 📖 **原生 5 模块 SOP 工作台**：内置 11 阶段交互流程、32 篇手册与离线 Mermaid 分支流程图、5 款开源中文字体实时文案对照、资源样例及「一键为项目接入 SOP」',
  '- 🔥 **工作室脉搏 & 提效工具**：20 周跨游戏开发热力图、一键复制 AI 续接上下文、从 Git 自动生成更新日志、`Ctrl + K` 全局命令面板',
  '',
  '### SHA-256 文件校验',
  '| 文件名 | 大小 | SHA-256 |',
  '|---|---:|---|',
  ...mdRows,
  '',
  '> Windows PowerShell 校验命令：`Get-FileHash -Algorithm SHA256 <文件名>`',
  '',
].join('\n');

fs.writeFileSync(path.join(publishDir, 'RELEASE_BODY.md'), body, 'utf8');
console.log(`Generated SHA256SUMS.txt & RELEASE_BODY.md for ${files.length} artifacts.`);
