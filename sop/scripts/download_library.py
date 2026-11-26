"""Download only pinned research archives and official fonts; never execute them."""
from __future__ import annotations
import concurrent.futures
import datetime
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'library'
LOCK = json.loads((LIB / 'sources.lock.json').read_text(encoding='utf-8'))
DATE = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds')


def download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size:
        return
    part = path.with_suffix(path.suffix + '.part')
    request = urllib.request.Request(url, headers={'User-Agent': 'Maker-SOP-Resource-Downloader/1.0'})
    with urllib.request.urlopen(request, timeout=90) as response, part.open('wb') as out:
        shutil.copyfileobj(response, out)
    if not part.stat().st_size:
        raise ValueError('Empty response: ' + url)
    part.replace(path)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def record(item: dict, files: list[Path], **extra) -> dict:
    return {**item, 'status': 'downloaded', 'fetched_at': DATE,
            'files': [{'path': rel(p), 'bytes': p.stat().st_size} for p in files],
            'maker_verified': False, **extra}


def source(spec: dict) -> dict:
    repo, sha = spec['repo'], spec['commit']
    slug = repo.split('/')[-1]
    base = LIB / 'sources' / slug
    archive = base / (slug + '-' + sha[:12] + '.zip')
    url = f'https://codeload.github.com/{repo}/zip/{sha}'
    item = {'id': slug, 'kind': 'reference', 'title': slug, 'source': f'https://github.com/{repo}',
            'version': sha, 'download_url': url, 'usage': '只读研究；媒体授权单独核实；不执行脚本或安装技能'}
    try:
        download(url, archive)
        files = [archive]
        with zipfile.ZipFile(archive) as z:
            # Only export explanatory files; full pinned source remains in the archive.
            names = z.namelist()
            if not names:
                raise ValueError('Empty archive')
            prefix = names[0].split('/')[0] + '/'
            for name in names:
                tail = name.removeprefix(prefix)
                if '/' in tail or not tail:
                    continue
                if tail.lower().startswith(('readme', 'license', 'copying', 'notice')):
                    out = base / tail
                    out.write_bytes(z.read(name))
                    files.append(out)
            study = {
                'ui-ux-pro-max-skill': ['screenshots/website.png', 'src/ui-ux-pro-max/data/ux-guidelines.csv', 'src/ui-ux-pro-max/data/typography.csv'],
                'Balatro-Feel': ['Assets/Scripts/Card.cs', 'Assets/Scripts/CardVisual.cs', 'Assets/Scripts/HorizontalCardHolder.cs'],
            }.get(slug, [])
            for tail in study:
                name = prefix + tail
                if name in names:
                    out = base / 'study' / Path(tail).name
                    out.parent.mkdir(exist_ok=True)
                    out.write_bytes(z.read(name))
                    files.append(out)
                    if tail == 'screenshots/website.png':
                        item['preview_path'] = rel(out)
            if not any(p.name.lower().startswith(('license', 'copying')) for p in files):
                raise ValueError('No root license found; inspect source before use')
        return record(item, files, verification='归档目录与说明文件可读；第三方代码未运行；媒体未授权')
    except Exception as e:
        return {**item, 'status': 'failed', 'error': str(e), 'fetched_at': DATE}


def font_noto(weight: str) -> dict:
    spec = LOCK['noto']
    repo, sha = spec['repo'], spec['commit']
    filename = f'NotoSansCJKsc-{weight}.otf'
    base = LIB / 'fonts' / 'noto-sans-sc'
    url = f'https://raw.githubusercontent.com/{repo}/{sha}/Sans/OTF/SimplifiedChinese/{filename}'
    item = {'id': 'noto-' + weight.lower(), 'kind': 'font', 'title': 'Noto Sans CJK SC ' + weight,
            'source': f'https://github.com/{repo}', 'version': sha, 'download_url': url,
            'font_path': rel(base / filename), 'family': 'NotoSC-' + weight,
            'usage': '正文与按钮候选；需引擎兼容与小屏验证'}
    try:
        download(url, base / filename)
        download(f'https://raw.githubusercontent.com/{repo}/{sha}/Sans/LICENSE', base / 'LICENSE')
        return record(item, [base / filename, base / 'LICENSE'], license='OFL-1.1', verification='文件已下载；字体结构、字符与浏览器显示另查')
    except Exception as e:
        return {**item, 'status': 'failed', 'error': str(e), 'fetched_at': DATE}


def font_wenkai() -> dict:
    spec = LOCK['wenkai']
    repo, tag = spec['repo'], spec['tag']
    base = LIB / 'fonts' / 'wenkai'
    filename = 'LXGWWenKai-Regular.ttf'
    url = f'https://github.com/{repo}/releases/download/{tag}/{filename}'
    item = {'id': 'wenkai', 'kind': 'font', 'title': '霞鹜文楷 Regular', 'source': f'https://github.com/{repo}',
            'version': tag, 'download_url': url, 'font_path': rel(base / filename), 'family': 'WenKai',
            'usage': '温暖生活叙事题材候选；需小字号阅读检查'}
    try:
        download(url, base / filename)
        download(f'https://raw.githubusercontent.com/{repo}/{tag}/OFL.txt', base / 'OFL.txt')
        return record(item, [base / filename, base / 'OFL.txt'], license='OFL-1.1', verification='文件已下载；字体结构、字符与浏览器显示另查')
    except Exception as e:
        return {**item, 'status': 'failed', 'error': str(e), 'fetched_at': DATE}


def font_smiley() -> dict:
    spec = LOCK['smiley']
    repo, tag = spec['repo'], spec['tag']
    base = LIB / 'fonts' / 'smiley'
    url = f'https://github.com/{repo}/releases/download/{tag}/smiley-sans-{tag}.zip'
    archive = base / ('smiley-sans-' + tag + '.zip')
    item = {'id': 'smiley', 'kind': 'font', 'title': '得意黑 Smiley Sans', 'source': f'https://github.com/{repo}',
            'version': tag, 'download_url': url, 'family': 'Smiley',
            'usage': '仅短标题候选；作者不推荐正文与手机界面长文本'}
    try:
        download(url, archive)
        with zipfile.ZipFile(archive) as z:
            candidates = [n for n in z.namelist() if n.lower().endswith('.ttf') and '__MACOSX' not in n]
            if not candidates:
                raise ValueError('No static TTF in official release')
            name = candidates[0]
            out = base / Path(name).name
            out.write_bytes(z.read(name))
        download(f'https://raw.githubusercontent.com/{repo}/{tag}/LICENSE', base / 'LICENSE')
        return record({**item, 'font_path': rel(out)}, [archive, out, base / 'LICENSE'], license='OFL-1.1', verification='文件已下载；字体结构、字符与浏览器显示另查')
    except Exception as e:
        return {**item, 'status': 'failed', 'error': str(e), 'fetched_at': DATE}


def main() -> int:
    # Noto weights share a license: keep them sequential to avoid writing the same partial file.
    tasks = [lambda s=s: source(s) for s in LOCK['sources']]
    tasks += [font_wenkai, font_smiley,
              lambda: [font_noto('Regular'), font_noto('Medium'), font_noto('Bold')]]
    items = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(lambda fn: fn(), tasks):
            items.extend(result if isinstance(result, list) else [result])
    # Preserve optional later media and review annotations, but never hide current errors.
    old_path = LIB / 'manifest.json'
    old = json.loads(old_path.read_text(encoding='utf-8')) if old_path.exists() else {'items': []}
    by_id = {x['id']: x for x in old.get('items', [])}
    for item in items:
        previous = by_id.get(item['id'], {})
        if previous.get('version') == item.get('version') and item['status'] == 'downloaded':
            for key in ('font_check', 'browser_check', 'review'):
                if key in previous:
                    item[key] = previous[key]
        by_id[item['id']] = item
    manifest = {'sop_version': '1.0.0', 'updated_at': DATE, 'items': list(by_id.values()),
                'generated_samples': {'status': 'deferred_by_user', 'path': 'samples/breakfast/样例说明.md',
                                      'reason': '未绑定 Maker 项目；用户选择先完成其余交付'}}
    old_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for item in items:
        print(item['id'], item['status'], item.get('error', ''))
    return int(any(x['status'] != 'downloaded' for x in items))


if __name__ == '__main__':
    raise SystemExit(main())
