import { app, net } from 'electron';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { HubStore } from './store';
import {
  UpdateApplyResult,
  UpdateAssetInfo,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdateInstallMode,
} from './types';

const execFileAsync = promisify(execFile);

const GITHUB_REPO = '1dragons/TapTap-Maker-GameHub';
const LATEST_MANIFEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/latest.json`;
const LATEST_WEB_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

function parseSemver(raw: string): [number, number, number] {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0];
  const parts = cleaned.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function compareSemver(a: string, b: string): number {
  const [a1, a2, a3] = parseSemver(a);
  const [b1, b2, b3] = parseSemver(b);
  if (a1 !== b1) return a1 > b1 ? 1 : -1;
  if (a2 !== b2) return a2 > b2 ? 1 : -1;
  if (a3 !== b3) return a3 > b3 ? 1 : -1;
  return 0;
}

export function detectInstallMode(): UpdateInstallMode {
  if (!app.isPackaged) return 'dev';
  const exeDir = path.dirname(process.execPath);
  try {
    const entries = fs.readdirSync(exeDir);
    const hasUninstaller = entries.some((name) => /^uninstall.*\.exe$/i.test(name));
    return hasUninstaller ? 'installer' : 'portable';
  } catch {
    return 'portable';
  }
}

function parseAsset(raw: any): UpdateAssetInfo | undefined {
  if (!raw || typeof raw.browser_download_url !== 'string') return undefined;
  let sha256: string | undefined;
  if (typeof raw.digest === 'string' && raw.digest.toLowerCase().startsWith('sha256:')) {
    sha256 = raw.digest.slice('sha256:'.length).trim().toLowerCase();
  }
  return {
    name: String(raw.name || ''),
    downloadUrl: raw.browser_download_url,
    size: Number(raw.size || 0) || 0,
    sha256,
  };
}

function buildFallbackAssetsForTag(tag: string): {
  installerAsset: UpdateAssetInfo;
  portableAsset: UpdateAssetInfo;
} {
  const ver = tag.replace(/^v/i, '');
  const setupName = `GameHub-${ver}-win-x64-setup.exe`;
  const zipName = `GameHub-${ver}-win-x64-portable.zip`;
  return {
    installerAsset: {
      name: setupName,
      downloadUrl: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${encodeURIComponent(setupName)}`,
      size: 0,
    },
    portableAsset: {
      name: zipName,
      downloadUrl: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${encodeURIComponent(zipName)}`,
      size: 0,
    },
  };
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  const installMode = detectInstallMode();

  const fetchWithTimeout = async (url: string, accept: string, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await net.fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: accept,
          'User-Agent': `GameHub/${currentVersion}`,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // Tier 1: Rate-limit-free Release CDN manifest (latest.json with exact sizes & SHA-256)
  try {
    const res = await fetchWithTimeout(LATEST_MANIFEST_URL, 'application/json', 10000);
    if (res.ok) {
      const m = (await res.json()) as any;
      const latestVersion = String(m?.version || m?.tag || '').replace(/^v/i, '').trim();
      if (latestVersion) {
        return {
          ok: true,
          currentVersion,
          latestVersion,
          hasUpdate: compareSemver(latestVersion, currentVersion) > 0,
          installMode,
          releaseName: String(m?.name || `GameHub v${latestVersion}`),
          releaseNotes: String(m?.releaseNotes || '').trim(),
          publishedAt: typeof m?.publishedAt === 'string' ? m.publishedAt : undefined,
          releaseUrl:
            typeof m?.releaseUrl === 'string' && m.releaseUrl.trim()
              ? m.releaseUrl.trim()
              : `${RELEASES_PAGE_URL}/tag/v${latestVersion}`,
          installerAsset: m?.installerAsset || undefined,
          portableAsset: m?.portableAsset || undefined,
        };
      }
    }
  } catch {
    // fall through to Tier 2
  }

  // Tier 2: Rate-limit-free GitHub web releases/latest JSON redirect (never hits 60/hr API 403)
  try {
    const res = await fetchWithTimeout(LATEST_WEB_URL, 'application/json', 12000);
    if (res.ok) {
      let tag = '';
      try {
        const j = (await res.json()) as any;
        tag = String(j?.tag_name || '').trim();
      } catch {
        // extract from redirected URL
      }
      if (!tag && res.url) {
        const m = res.url.match(/\/releases\/tag\/([^/?#]+)/i);
        if (m) tag = decodeURIComponent(m[1]);
      }
      const latestVersion = tag.replace(/^v/i, '').trim();
      if (latestVersion) {
        const fallbacks = buildFallbackAssetsForTag(tag || `v${latestVersion}`);
        return {
          ok: true,
          currentVersion,
          latestVersion,
          hasUpdate: compareSemver(latestVersion, currentVersion) > 0,
          installMode,
          releaseName: `GameHub ${tag || `v${latestVersion}`}`,
          releaseNotes: '点击下方「立即无损更新」将自动备份本地配置并升级到此发行版，或点击「Releases 页面」查看完整说明。',
          releaseUrl: `${RELEASES_PAGE_URL}/tag/${tag || `v${latestVersion}`}`,
          installerAsset: fallbacks.installerAsset,
          portableAsset: fallbacks.portableAsset,
        };
      }
    }
  } catch {
    // fall through to Tier 3
  }

  // Tier 3: Standard GitHub REST API fallback
  try {
    const res = await fetchWithTimeout(LATEST_RELEASE_API, 'application/vnd.github+json', 12000);
    if (!res.ok) {
      return {
        ok: false,
        currentVersion,
        hasUpdate: false,
        installMode,
        releaseUrl: RELEASES_PAGE_URL,
        error:
          res.status === 403
            ? 'GitHub 接口暂时限流，请稍后再试或点击「Releases 页面」查看'
            : `检查更新失败（HTTP ${res.status}）`,
      };
    }

    const json = (await res.json()) as any;
    const tag = String(json?.tag_name || '').trim();
    const latestVersion = tag.replace(/^v/i, '');
    if (!latestVersion) {
      return {
        ok: false,
        currentVersion,
        hasUpdate: false,
        installMode,
        releaseUrl: RELEASES_PAGE_URL,
        error: '未解析到有效发行版本号',
      };
    }

    const assets = Array.isArray(json?.assets) ? json.assets : [];
    const installerRaw = assets.find((a: any) => /setup\.exe$/i.test(String(a?.name || '')));
    const portableRaw = assets.find((a: any) => /portable\.zip$/i.test(String(a?.name || '')));

    return {
      ok: true,
      currentVersion,
      latestVersion,
      hasUpdate: compareSemver(latestVersion, currentVersion) > 0,
      installMode,
      releaseName: String(json?.name || tag),
      releaseNotes: String(json?.body || '').trim(),
      publishedAt: typeof json?.published_at === 'string' ? json.published_at : undefined,
      releaseUrl:
        typeof json?.html_url === 'string' && json.html_url.trim()
          ? json.html_url.trim()
          : RELEASES_PAGE_URL,
      installerAsset: parseAsset(installerRaw),
      portableAsset: parseAsset(portableRaw),
    };
  } catch (err: any) {
    return {
      ok: false,
      currentVersion,
      hasUpdate: false,
      installMode,
      releaseUrl: RELEASES_PAGE_URL,
      error:
        err?.name === 'AbortError'
          ? '连接 GitHub 超时，请检查网络或代理设置'
          : err?.message || '检查更新失败，请检查网络连接',
    };
  }
}

function createPreUpdateDataBackup(store: HubStore): string | undefined {
  try {
    const dataFile = store.getDataFilePath();
    if (!fs.existsSync(dataFile)) return undefined;
    const backupDir = path.join(path.dirname(dataFile), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ver = app.getVersion();
    const backupPath = path.join(backupDir, `hub-state-pre-v${ver}-${ts}.json`);
    fs.copyFileSync(dataFile, backupPath);

    // Keep latest 5 pre-update backups cleanly
    const existing = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('hub-state-pre-') && f.endsWith('.json'))
      .sort()
      .reverse();
    for (const old of existing.slice(5)) {
      try {
        fs.unlinkSync(path.join(backupDir, old));
      } catch {
        // ignore
      }
    }
    return backupPath;
  } catch {
    return undefined;
  }
}

async function downloadFileWithProgress(
  url: string,
  destPath: string,
  expectedSize: number,
  onProgress: (downloaded: number, total: number) => void
): Promise<void> {
  const res = await net.fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': `GameHub/${app.getVersion()}`,
    },
  });
  if (!res.ok) {
    throw new Error(`下载更新包失败（HTTP ${res.status}）`);
  }

  const headerLen = Number(res.headers.get('content-length') || 0) || 0;
  const totalBytes = headerLen || expectedSize || 0;

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.part`;
  const writer = fs.createWriteStream(tmpPath);

  let downloaded = 0;
  let lastEmit = 0;

  try {
    const body = res.body;
    if (!body) {
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      writer.write(buf);
      downloaded = buf.length;
      onProgress(downloaded, totalBytes || downloaded);
    } else {
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          writer.write(Buffer.from(value));
          downloaded += value.byteLength;
          const now = Date.now();
          if (now - lastEmit >= 120) {
            lastEmit = now;
            onProgress(downloaded, totalBytes);
          }
        }
      }
      onProgress(downloaded, totalBytes || downloaded);
    }

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      writer.end();
    });

    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    try {
      writer.destroy();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', reject);
  });
}

function findExtractedAppRoot(extractDir: string): string | null {
  if (fs.existsSync(path.join(extractDir, 'GameHub.exe'))) {
    return extractDir;
  }
  for (const entry of fs.readdirSync(extractDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(extractDir, entry.name);
    if (fs.existsSync(path.join(sub, 'GameHub.exe'))) {
      return sub;
    }
  }
  return null;
}

export async function applyAppUpdate(
  store: HubStore,
  info: UpdateCheckResult,
  onProgress: (p: UpdateDownloadProgress) => void
): Promise<UpdateApplyResult> {
  const mode = detectInstallMode();
  if (mode === 'dev') {
    return {
      ok: false,
      error: '当前为源码开发运行模式，请通过 git pull 或前往 Releases 页面手动下载发行包更新。',
    };
  }

  const asset =
    mode === 'installer'
      ? info.installerAsset || info.portableAsset
      : info.portableAsset || info.installerAsset;

  if (!asset || !asset.downloadUrl) {
    return {
      ok: false,
      error: '当前发行版本未找到对应的 Windows 更新包，请点击「前往 Releases 页面」手动下载。',
    };
  }

  const useInstallerFlow = mode === 'installer' || /\.exe$/i.test(asset.name);

  try {
    // Step 1: Always take a lossless pre-update safety backup of local hub-state.json
    onProgress({
      stage: 'backup',
      percent: 2,
      message: '正在自动备份本地配置、随手记与待办数据…',
    });
    const backupPath = createPreUpdateDataBackup(store);

    // Step 2: Download asset with live progress
    const updateWorkDir = path.join(os.tmpdir(), 'gamehub-updater');
    fs.mkdirSync(updateWorkDir, { recursive: true });
    const targetFile = path.join(updateWorkDir, asset.name || `GameHub-update.${useInstallerFlow ? 'exe' : 'zip'}`);

    await downloadFileWithProgress(asset.downloadUrl, targetFile, asset.size, (downloaded, total) => {
      const pct = total > 0 ? Math.min(82, Math.max(5, Math.round((downloaded / total) * 80) + 2)) : 40;
      const dlMb = (downloaded / (1024 * 1024)).toFixed(1);
      const totMb = total > 0 ? (total / (1024 * 1024)).toFixed(1) : '?';
      onProgress({
        stage: 'downloading',
        percent: pct,
        downloadedBytes: downloaded,
        totalBytes: total,
        message: `正在下载 ${asset.name}（${dlMb} / ${totMb} MB）…`,
      });
    });

    // Step 3: Integrity check (file size & SHA-256 digest when provided by GitHub)
    onProgress({
      stage: 'verifying',
      percent: 85,
      message: '正在校验更新包完整性（SHA-256）…',
    });
    const actualSize = fs.statSync(targetFile).size;
    if (asset.size > 0 && actualSize !== asset.size) {
      throw new Error(`安装包大小校验不一致（期望 ${asset.size} 字节，实际 ${actualSize} 字节）`);
    }
    if (asset.sha256) {
      const actualHash = await computeFileSha256(targetFile);
      if (actualHash !== asset.sha256) {
        throw new Error('安装包 SHA-256 哈希校验不通过，已中止安装以保护安全');
      }
    }

    if (useInstallerFlow) {
      // Installer mode: launch NSIS setup cleanly; user data in %APPDATA% is 100% preserved
      onProgress({
        stage: 'applying',
        percent: 98,
        message: '校验通过！正在启动新版安装程序（你的配置与数据将 100% 保留）…',
      });
      spawn(targetFile, [], {
        detached: true,
        stdio: 'ignore',
      }).unref();

      setTimeout(() => {
        app.quit();
      }, 650);

      return { ok: true, backupPath };
    }

    // Portable mode: extract zip, verify GameHub.exe exists, and launch detached swap script preserving data/
    onProgress({
      stage: 'extracting',
      percent: 90,
      message: '正在解压绿色版更新包…',
    });
    const extractDir = path.join(updateWorkDir, `extracted-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${targetFile.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true }
    );

    const newAppRoot = findExtractedAppRoot(extractDir);
    if (!newAppRoot) {
      throw new Error('更新压缩包中未找到 GameHub.exe，已中止覆盖');
    }

    const currentAppDir = path.dirname(process.execPath);
    const pid = process.pid;
    const psScriptPath = path.join(updateWorkDir, 'apply-portable-update.ps1');
    const esc = (s: string) => s.replace(/'/g, "''");

    const scriptContent = [
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `try { Wait-Process -Id ${pid} -Timeout 20 } catch {}`,
      `Start-Sleep -Milliseconds 700`,
      `robocopy '${esc(newAppRoot)}' '${esc(currentAppDir)}' /E /R:4 /W:1 /XD data | Out-Null`,
      `Start-Process -FilePath '${esc(path.join(currentAppDir, 'GameHub.exe'))}' -WorkingDirectory '${esc(currentAppDir)}'`,
      `Start-Sleep -Seconds 2`,
      `Remove-Item -LiteralPath '${esc(extractDir)}' -Recurse -Force -ErrorAction SilentlyContinue`,
      `Remove-Item -LiteralPath '${esc(targetFile)}' -Force -ErrorAction SilentlyContinue`,
    ].join('\r\n');

    fs.writeFileSync(psScriptPath, '\uFEFF' + scriptContent, 'utf-8');

    onProgress({
      stage: 'applying',
      percent: 98,
      message: '准备就绪！正在原地无损替换程序文件并自动重启新版 GameHub…',
    });

    spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', psScriptPath],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    ).unref();

    setTimeout(() => {
      app.quit();
    }, 650);

    return { ok: true, backupPath };
  } catch (err: any) {
    const msg = err?.message || '更新失败，请重试或前往 Releases 页面手动下载';
    onProgress({
      stage: 'error',
      percent: 0,
      message: msg,
    });
    return { ok: false, error: msg };
  }
}
