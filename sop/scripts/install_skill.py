"""Install this first-party SOP skill; never replace a different existing skill."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'skill/taptap-maker-sop'
codex_home = Path(os.environ.get('CODEX_HOME') or (Path.home() / '.codex'))
dest = codex_home / 'skills/taptap-maker-sop'
files = [p for p in source.rglob('*') if p.is_file()]
for file in files:
    out = dest / file.relative_to(source)
    if out.is_symlink() or (out.exists() and out.read_bytes() != file.read_bytes()):
        raise SystemExit('Existing different skill file; not overwritten: ' + str(out))
for file in files:
    out = dest / file.relative_to(source)
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists():
        out.write_bytes(file.read_bytes())
print(json.dumps({'installed': str(dest), 'files': len(files), 'activation': '在目标项目中新建聊天后确认技能可用'}, ensure_ascii=False))
