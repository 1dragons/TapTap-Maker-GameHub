"""Inspect font structure and sample coverage, then render a local specimen sheet."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / 'library/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
sample = '街角早餐店设施升级订单已完成余额不足请先完成订单暂未解锁正在保存返回继续￥1,234,567.89-1200/899+Lv.1200:0909:59100%'
fonts = [x for x in manifest['items'] if x['kind'] == 'font' and x['status'] == 'downloaded']
image = Image.new('RGB', (1500, 120 + len(fonts)*350), '#f4f2eb')
draw = ImageDraw.Draw(image)
body_path = ROOT / next(x for x in fonts if x['id']=='noto-regular')['font_path']
label = ImageFont.truetype(str(body_path), 26)
draw.text((65, 30), '中文字体对照｜资源级样张，不代表 Maker 字体导入通过', fill='#203c33', font=label)
failed = False
for i, item in enumerate(fonts):
    path = ROOT / item['font_path']
    with TTFont(path, lazy=False) as font:
        cmap = font.getBestCmap()
        missing = sorted(set(char for char in sample if not char.isspace() and ord(char) not in cmap))
        item['font_check'] = {'status': '结构与样本文字覆盖通过' if not missing else '样本文字缺字',
                              'glyphs': len(cmap), 'missing': missing,
                              'sample': sample, 'scope': '字体结构和指定样本文字；不涵盖项目全部文案或引擎渲染'}
        failed |= bool(missing)
    y = 120 + i*350
    draw.rounded_rectangle((45,y,1455,y+325), radius=12, fill='#fffcf5', outline='#d9dfd3', width=2)
    draw.text((70,y+15), item['title'] + '  /  ' + item['version'][:16], font=label, fill='#235d48')
    draw.text((70,y+72), '街角早餐店 · 今天也要好好经营', font=ImageFont.truetype(str(path),44), fill='#203c33')
    draw.text((70,y+145), '￥1,234,567.89    00:09    99+    Lv.12', font=ImageFont.truetype(str(path),34), fill='#203c33')
    draw.text((70,y+210), '订单已完成。余额不足，请先完成订单。暂未解锁。', font=ImageFont.truetype(str(path),23), fill='#203c33')
    draw.text((70,y+265), item['usage'], font=ImageFont.truetype(str(body_path),19), fill='#69756b')
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
out = ROOT / 'library/font-specimens.png'
image.save(out)
print(json.dumps({'font_count':len(fonts),'sample_sheet':str(out),'missing_glyphs':failed},ensure_ascii=False))
raise SystemExit(int(failed))
