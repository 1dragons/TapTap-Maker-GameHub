"""Compile first-party Markdown and the resource manifest into an offline catalog."""
from __future__ import annotations
import html
import json
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'portal'


def render(source: str, path: Path) -> str:
    md = MarkdownIt('commonmark', {'html': False}).enable('table')
    env = {}
    tokens = md.parse(source, env)

    def visit(nodes):
        for token in nodes:
            if token.type == 'link_open':
                href = token.attrGet('href') or ''
                parts = urlsplit(href)
                if parts.scheme in ('http', 'https'):
                    token.attrSet('target', '_blank')
                    token.attrSet('rel', 'noopener noreferrer')
                elif not parts.scheme and parts.path:
                    dest = (path.parent / unquote(parts.path)).resolve()
                    if dest.is_relative_to(ROOT):
                        relative = dest.relative_to(ROOT).as_posix()
                        if dest.suffix.lower() == '.md' and (relative == 'README.md' or relative.startswith('docs/') or relative in ('library/使用与授权.md', 'samples/breakfast/样例说明.md')):
                            token.attrSet('href', '#doc=' + quote(relative, safe=''))
                        else:
                            token.attrSet('href', '../' + quote(relative, safe='/'))
            if token.children:
                visit(token.children)
    visit(tokens)
    original_fence = md.renderer.rules.get('fence')

    def fence(ts, index, options, environment):
        token = ts[index]
        if token.info.strip() == 'mermaid':
            return '<div class="diagram"><pre class="mermaid">' + html.escape(token.content) + '</pre></div>\n'
        return original_fence(ts, index, options, environment)

    md.renderer.rules['fence'] = fence
    return md.renderer.render(tokens, md.options, env)


def build() -> dict:
    paths = [ROOT / 'README.md'] + sorted((ROOT / 'docs').rglob('*.md'))
    paths += [ROOT / 'library/使用与授权.md', ROOT / 'samples/breakfast/样例说明.md']
    documents = []
    for path in paths:
        source = path.read_text(encoding='utf-8')
        rel = path.relative_to(ROOT).as_posix()
        title = next((line[2:].strip() for line in source.splitlines() if line.startswith('# ')), path.stem)
        category = path.parent.name if rel.startswith('docs/') and path.parent.name != 'docs' else '说明与记录'
        documents.append({'id': rel, 'title': title, 'category': category, 'text': source, 'html': render(source, path)})
    manifest_path = ROOT / 'library/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'items': []}
    # The canonical stage table drives the interactive overview; do not maintain a second workflow body.
    flow = (ROOT / 'docs/流程/总流程.md').read_text(encoding='utf-8')
    stages = []
    for line in flow.splitlines():
        if line.startswith('| ') and not line.startswith('| 阶段'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if len(cells) == 5:
                stages.append({'name': cells[0], 'input': cells[1], 'work': cells[2], 'pass': cells[3], 'fail': cells[4]})
    catalog = {'version': '1.0.0', 'documents': documents, 'stages': stages, 'library': manifest,
               'generation': json.loads((ROOT / 'samples/breakfast/generation-plan.json').read_text(encoding='utf-8'))}
    OUTPUT.mkdir(exist_ok=True)
    # External JS works on file:// as well as localhost; no fetch or remote dependency.
    (OUTPUT / 'catalog.js').write_text('window.SOP_CATALOG = ' + json.dumps(catalog, ensure_ascii=False) + ';\n', encoding='utf-8')
    fonts = []
    for item in manifest.get('items', []):
        if item.get('kind') == 'font' and item.get('status') == 'downloaded':
            weight = {'noto-regular': 400, 'noto-medium': 500, 'noto-bold': 700}.get(item['id'], 400)
            url = '../' + item['font_path']
            fonts.append('@font-face{font-family:"' + item['family'] + '";src:url("' + url + '");font-weight:' + str(weight) + ';font-display:swap;}')
            if item['id'] in ('noto-medium', 'noto-bold'):
                fonts.append('@font-face{font-family:"NotoSC-Interface";src:url("' + url + '");font-weight:' + str(weight) + ';font-display:swap;}')
    (OUTPUT / 'fonts.css').write_text('\n'.join(fonts) + '\n', encoding='utf-8')
    return {'documents': len(documents), 'stages': len(stages), 'resources': len(manifest.get('items', []))}


if __name__ == '__main__':
    print(json.dumps(build(), ensure_ascii=False))
