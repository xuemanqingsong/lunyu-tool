# -*- coding: utf-8 -*-
"""准备深入讲解重写批次：486 章（排除试点 20 章）拆成若干批。
输入：v2_data/reviewed_data.json + v2_data/pilot_insights_20.json（新范例）
输出：v2_data/讲解批次/批<N>.md
"""
import json, os
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "reviewed_data.json"
PILOT_INS = BASE / "pilot_insights_20.json"
OUT_DIR = BASE / "讲解批次"

PILOT_IDS = {1,2,3,4,5,9,12,15,16,17,19,25,30,35,40,45,60,70,80,90}

data = json.loads(SRC.read_text(encoding="utf-8"))
pilot_ins = json.loads(PILOT_INS.read_text(encoding="utf-8"))
by_id = {d["id"]: d for d in data}

todo = [d for d in data if d["id"] not in PILOT_IDS]
todo.sort(key=lambda d: d["id"])
print(f"待重写章数: {len(todo)}")

BATCH_SIZE = 25

def format_item(d):
    return (
        f"### id {d['id']}（《论语·{d['source']}》| 主题：{'、'.join(d['theme'])}）\n"
        f"- 原文：{d['text']}\n"
        f"- 翻译：{d.get('translation','')}\n"
        f"- 情境切片（scenes，第N条与行动同下标对应）：\n"
        + "".join(f"  {i}. {s}\n" for i, s in enumerate(d["scenes"], 1))
        + f"- 今日行动（practices）：\n"
        + "".join(f"  {i}. {p}\n" for i, p in enumerate(d["practices"], 1))
    )

# 试点范例（3 章新讲解作风格参考）
example_ids = [1, 3, 80]
examples = []
for eid in example_ids:
    d = by_id[eid]
    new_ins = pilot_ins.get(str(eid), d["insight"])
    examples.append(f"【范例 id {eid}】\n原文：{d['text']}\n新讲解（已定稿）：\n{new_ins}\n")

os.makedirs(OUT_DIR, exist_ok=True)
batches = [todo[i:i+BATCH_SIZE] for i in range(0, len(todo), BATCH_SIZE)]
print(f"共 {len(batches)} 批，每批 ≤{BATCH_SIZE} 章")

for idx, batch in enumerate(batches, 1):
    header = f"""# 深入讲解重写 · 批次 {idx}（{len(batch)} 章）

请为以下每一章重写「深入讲解」（insight），严格遵循标准：`开发/v2/标准_深入讲解.md`

## 核心要求
- 目标篇幅：约 400–500 字，分 3–4 段（段落间用空行 \\n\\n 分隔）
- 四层结构：①字词文意（必要训诂）→ ②原语境与义理（含必要历史背景/义理辨析）→ ③现代引申（从原意自然长出）→ ④与今日行动呼应（点明为什么做这件事有意义）
- 先讲对再讲开：现代引申不能反过来解释原文；原意与现代有张力时如实指出
- 不替用户下结论，把选择的余地留给用户
- 风格：禁 AI 套话、禁说教腔、禁空泛词、禁现代术语硬套、不制造伪古意

## 输出格式（写入 v2_data/讲解产出/批{idx}.json）
每章一个 JSON 对象，key 为章 id：
{{
  "101": "第一段……\\n\\n第二段……\\n\\n第三段……\\n\\n第四段……",
  "102": "……"
}}
一个 JSON 文件包含本批全部章。确保文件是合法 JSON。

## 风格参考（已定稿的试点新讲解）
{''.join(examples)}
---
{''.join(format_item(d) for d in batch)}
"""
    out = OUT_DIR / f"批{idx}.md"
    out.write_text(header, encoding="utf-8")
    print(f"批{idx}: {out} ({out.stat().st_size} bytes)")

os.makedirs(BASE / "讲解产出", exist_ok=True)
print("完成。产出目录: v2_data/讲解产出/")
