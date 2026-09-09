# -*- coding: utf-8 -*-
"""准备子智能体批次输入：506 章拆成若干批，每批一个输入文件。
输入：full_506.json
输出：v2_data/批次输入/批<N>.md
"""
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "..", "..", "..", "full_506.json")
OUT_DIR = os.path.join(BASE, "批次输入")

with open(SRC, encoding="utf-8") as f:
    DATA = json.load(f)

BATCH_SIZE = 25

def format_item(d):
    tags = "、".join(d.get("tags", []))
    return (
        f"### id {d['id']}（《论语·{d['source']}》| 标签：{tags}）\n"
        f"- 原文：{d['text']}\n"
        f"- 白话：{d.get('translation','')}\n"
        f"- 讲解（insight）：{d.get('insight','')}\n"
        f"- 现有情境（scene，供参考风格，可改可不改）：{d.get('scene','')}\n"
        f"- 现有今日行动（practice，供参考风格）：{d.get('practice','')}\n"
    )

batches = [DATA[i:i+BATCH_SIZE] for i in range(0, len(DATA), BATCH_SIZE)]
print(f"共 {len(batches)} 批，每批 ≤{BATCH_SIZE} 章")

os.makedirs(OUT_DIR, exist_ok=True)
for idx, batch in enumerate(batches, 1):
    header = f"""# 论语小工具 v2 · 批次 {idx} 输入（{len(batch)} 章）

请为以下每一章生成 **3 个情境切片 + 3 条今日行动**，严格遵循标准文档：
`开发/v2/标准_情境切片与今日行动.md`

输出要求：
- 每章一个 JSON 块：{{"id": N, "scenes": ["…","…","…"], "practices": ["…","…","…"]}}
- 情境切片：具体、有画面、让成年人一眼认出"这就是我"的处境，贴合本章论语。
- 今日行动：今天就能做的一件小事，具体可执行，贴合本章论语。
- 风格：禁 AI 套话、禁说教腔、禁空泛词。
- 3 条互不相同，尽量错开生活面（工作/家庭/待人/内心）。

请将完整结果写入：`v2_data/产出/批{idx}.json`

---
"""
    body = "\n".join(format_item(d) for d in batch)
    with open(os.path.join(OUT_DIR, f"批{idx}.md"), "w", encoding="utf-8") as f:
        f.write(header + body)
    print(f"批{idx}: {os.path.join(OUT_DIR, f'批{idx}.md')}")

print("完成")
