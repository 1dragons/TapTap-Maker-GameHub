"""Targeted consistency and isolated project-connection checks; no Maker actions."""
from __future__ import annotations
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import unquote, urlsplit
import zipfile
from connect_project import connect, BEGIN
from build_portal import build

ROOT = Path(__file__).resolve().parents[1]


def run() -> dict:
    checks = []
    def check(name, predicate, detail):
        checks.append({'name':name,'passed':bool(predicate),'detail':detail})
    doc_paths = [ROOT/'README.md'] + list((ROOT/'docs').rglob('*.md')) + [ROOT/'library/使用与授权.md', ROOT/'samples/breakfast/样例说明.md']
    broken = []
    for path in doc_paths:
        text = path.read_text(encoding='utf-8')
        for href in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
            href=href.strip('<>')
            parts=urlsplit(href)
            if parts.scheme or not parts.path:
                continue
            target=(path.parent/unquote(parts.path)).resolve()
            if not target.is_file():broken.append({'from':str(path),'target':str(target)})
    check('第一方文档本地链接',not broken,broken)
    manifest=json.loads((ROOT/'library/manifest.json').read_text(encoding='utf-8'))
    missing=[]
    for item in manifest['items']:
        if item['status']!='downloaded':missing.append(item['id']+':'+item['status'])
        for file in item.get('files',[]):
            path=ROOT/file['path']
            if not path.is_file() or path.stat().st_size!=file['bytes']:missing.append(file['path'])
    check('八项下载及实际文件尺寸',len(manifest['items'])==8 and not missing,missing or '3 个源码参考、5 个字体文件均存在；未作哈希校验')
    archives=[]
    for item in manifest['items']:
        if item['kind']=='reference' and item['status']=='downloaded':
            archive=ROOT/next(f['path'] for f in item['files'] if f['path'].endswith('.zip'))
            with zipfile.ZipFile(archive) as z:
                archives.append({'id':item['id'],'entries':len(z.infolist())})
    check('源码归档目录可读',len(archives)==3,archives)
    font_checks=[x.get('font_check',{}) for x in manifest['items'] if x['kind']=='font']
    check('字体结构与样本文字覆盖',len(font_checks)==5 and all(x and not x.get('missing') for x in font_checks),'只检查指定样本文字，不代表全部字符或 Maker 兼容')
    licenses=[]
    for item in manifest['items']:
        available=[f for f in item.get('files',[]) if Path(f['path']).name.lower().startswith(('license','ofl','copying'))]
        licenses.append({'id':item['id'],'files':[f['path'] for f in available]})
    check('下载对应许可证',all(x['files'] for x in licenses),licenses)
    with tempfile.TemporaryDirectory(prefix='maker-sop-check-') as temp:
        base=Path(temp).resolve()
        assert base.parent==Path(tempfile.gettempdir()).resolve() and base.name.startswith('maker-sop-check-')
        new=base/'new';new.mkdir()
        result=connect(new,ROOT,'new')
        config=json.loads((new/'.sop/project.json').read_text(encoding='utf-8'))
        check('隔离新项目接入',result['created'] and config['mode']=='new' and config['sop_version']=='1.0.0','生成入口、版本、进度和设计验收记录；无 Maker 调用')
        existing=base/'existing';existing.mkdir()
        original=b'\xef\xbb\xbf# Existing rules\r\nKeep the player save.\r\n'
        (existing/'AGENTS.md').write_bytes(original)
        (existing/'save.json').write_text('{"coins":17}',encoding='utf-8')
        connect(existing,ROOT,'existing')
        after=(existing/'AGENTS.md').read_bytes()
        check('保留已有规则和正式文件',after.startswith(original) and (existing/'save.json').read_text(encoding='utf-8')=='{"coins":17}','原有 UTF-8 BOM 与 CRLF 字节保留，入口仅追加')
        progress=existing/'.sop/进度.md'
        progress.write_text('# 实际进度\n已确认：采用现有视觉风格。\n',encoding='utf-8')
        before={str(p.relative_to(existing)):p.read_bytes() for p in existing.rglob('*') if p.is_file()}
        repeated=connect(existing,ROOT,'existing')
        after_files={str(p.relative_to(existing)):p.read_bytes() for p in existing.rglob('*') if p.is_file()}
        check('重复接入不改设计与进度',repeated['unchanged'] and before==after_files,'保留用户编辑记录，不重复追加入口')
        missing_project=base/'missing-root';missing_project.mkdir()
        try:connect(missing_project,base/'absent-sop','new');rejected=False
        except ValueError:rejected=True
        check('SOP 路径缺失时停止',rejected and not list(missing_project.iterdir()),'明确报错且不创建项目记录')
        try:connect(existing,base/'absent-sop','existing');rejected=False
        except ValueError:rejected=True
        check('失败保留现有项目',rejected and before=={str(p.relative_to(existing)):p.read_bytes() for p in existing.rglob('*') if p.is_file()},'失败路径无写入')
        try:connect(existing,ROOT,'new');rejected=False
        except ValueError:rejected=True
        check('模式冲突不静默迁移',rejected and before=={str(p.relative_to(existing)):p.read_bytes() for p in existing.rglob('*') if p.is_file()},'需评估迁移，不覆盖现有配置')
    result=build()
    for file in ('index.html','style.css','app.js','catalog.js','fonts.css','vendor/mermaid.min.js','vendor/mermaid-LICENSE'):
        check('本地页面依赖 '+file,(ROOT/'portal'/file).is_file(),file)
    check('文档与流程索引',result['documents']>=28 and result['stages']==11,result)
    sample=json.loads((ROOT/'samples/breakfast/generation-plan.json').read_text(encoding='utf-8'))
    check('生成待办保留用户决定',sample['status']=='deferred_by_user','无绑定拒绝后用户选择延后，没有自动重试或构建上传')
    report={'suite':'targeted SOP consistency and isolated connection checks','checks':checks,
            'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),
            'limits':['未在新 Codex 聊天中证明技能自动触发','未做 Maker 导入、真实设备、真实广告或云服务验证','本脚本不替代浏览器交互检查','未生成样例图片、音乐和音效']}
    out=ROOT/'validation';out.mkdir(exist_ok=True)
    (out/'checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return report


if __name__=='__main__':
    report=run()
    print(json.dumps({'passed':report['passed'],'failed':report['failed'],'report':'validation/checks.json'},ensure_ascii=False))
    for c in report['checks']:
        if not c['passed']:print(json.dumps(c,ensure_ascii=False))
    raise SystemExit(int(report['failed']>0))
