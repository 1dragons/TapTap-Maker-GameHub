"""Add an SOP entry to an explicitly selected project without replacing existing work."""
from __future__ import annotations
import argparse
import json
from pathlib import Path

SOP_ROOT = Path(__file__).resolve().parents[1]
BEGIN = '<!-- taptap-maker-sop:begin -->'
END = '<!-- taptap-maker-sop:end -->'


def connect(project: Path, sop: Path, mode: str) -> dict:
    sop = sop.resolve()
    project = project.resolve()
    for path in (sop / 'README.md', sop / 'docs/流程/项目接入.md', sop / 'docs/模板/进度.md',
                 sop / 'docs/模板/设计决定.md', sop / 'docs/模板/验收记录.md'):
        if not path.is_file():
            raise ValueError('SOP 文件缺失，未接入：' + str(path))
    if not project.is_dir():
        raise ValueError('目标游戏目录不存在，请先明确项目目录：' + str(project))
    if project == sop or sop in project.parents:
        raise ValueError('不能把 SOP 资料库或其样例目录当作正式游戏接入')
    state = project / '.sop'
    agents = project / 'AGENTS.md'
    if state.is_symlink() or agents.is_symlink():
        raise ValueError('入口为符号链接，请人工检查其真实目标后接入')
    config_path = state / 'project.json'
    config = {'sop_root': str(sop), 'sop_version': '2.0.0', 'mode': mode}
    if config_path.exists():
        previous = json.loads(config_path.read_text(encoding='utf-8-sig'))
        if previous != config:
            raise ValueError('已有 SOP 配置与请求不同，先评估迁移，不覆盖：' + str(config_path))
    data = agents.read_bytes() if agents.exists() else b''
    text = data.decode('utf-8-sig')
    if text.count(BEGIN) != text.count(END) or text.count(BEGIN) > 1:
        raise ValueError('已有 SOP 入口标记异常，未修改 AGENTS.md')
    expected = f'''{BEGIN}
## TapTap Maker SOP v2.0 入口

- SOP 根目录：`{sop}`；项目采用版本与状态在 `.sop/project.json`。
- 开始工作先读取 SOP 的 `README.md`、`docs/流程/项目接入.md`，再读本项目 `.sop/进度.md`、`.sop/设计决定.md` 与实际源码，按需查阅对应规范，不机械重跑全流程。
- AI 防乱改纪律：改前先读目标模块与调用链；最小必要改动，保留已有设计、未提交工作与正式存档，不顺手改名稳定存档字段。
- 生产避坑前置：`dt` 上限钳制、广告返回音频恢复、多指触控隔离、4:3~20:9 全比例与右上角平台胶囊避让、显式 `saveVersion` 渐进迁移、LSP 0 警告。
- 三道人工门禁：玩法方向确认、视觉/空间与声音样板确认、发布候选确认；**构建与上传必须另有明确授权**（发版前先走 `taptap-maker-qa` 全量体检闭环）。
- 区分 6 级证据（静态/模拟/资源/官方 Lua 校验/本地预览/真机平台）；QA 与诊断报告输出至项目外目录，严禁污染游戏包体。
- SOP 根目录不可用时报告缺失路径；中央版本升级不自动覆盖本项目设计。
{END}
'''
    if BEGIN in text:
        block = text[text.index(BEGIN):text.index(END) + len(END)]
        if str(sop) not in block:
            raise ValueError('已有入口指向另一 SOP 路径，请先评估迁移')
    # Preflight all destination paths before the first write.
    for name in ('project.json', '进度.md', '设计决定.md', '验收.md'):
        p = state / name
        if p.is_symlink() or (p.exists() and not p.is_file()):
            raise ValueError('目标记录不是普通文件：' + str(p))
    if state.exists() and not state.is_dir():
        raise ValueError('.sop 不是目录')
    state.mkdir(exist_ok=True)
    created = []
    if not config_path.exists():
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        created.append('.sop/project.json')
    templates = {'进度.md': '进度.md', '设计决定.md': '设计决定.md', '验收.md': '验收记录.md'}
    for dest, source in templates.items():
        out = state / dest
        if not out.exists():
            content = (sop / 'docs/模板' / source).read_text(encoding='utf-8')
            if dest == '进度.md':
                content = content.replace('当前阶段：待评估', '当前阶段：' + ('立项研究' if mode == 'new' else '已有项目现状评估'))
            out.write_text(content, encoding='utf-8')
            created.append('.sop/' + dest)
    if BEGIN not in text:
        newline = b'\r\n' if b'\r\n' in data else b'\n'
        separator = b'' if not data else (newline if data.endswith((b'\n', b'\r')) else newline * 2)
        # Preserve every existing byte; only append a separated managed section.
        agents.write_bytes(data + separator + expected.encode('utf-8').replace(b'\n', newline))
        created.append('AGENTS.md:append')
    return {'project': str(project), 'mode': mode, 'created': created, 'unchanged': not created,
            'maker_actions': 'none', 'build_upload_authorized': False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, type=Path)
    parser.add_argument('--mode', required=True, choices=('new', 'existing'))
    parser.add_argument('--sop-root', default=SOP_ROOT, type=Path)
    args = parser.parse_args()
    try:
        result = connect(args.project, args.sop_root, args.mode)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, UnicodeError) as e:
        print(json.dumps({'error': str(e), 'action': '停止接入，保留已有文件'}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
