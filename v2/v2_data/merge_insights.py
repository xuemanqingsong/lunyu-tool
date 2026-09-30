# -*- coding: utf-8 -*-
"""把全部新讲解（试点20章 + 486章批次产出）合入 reviewed_data.json（权威稿）。
不修改其他字段。合入前已备份。
"""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "reviewed_data.json"
PILOT = BASE / "pilot_insights_20.json"

data = json.loads(SRC.read_text(encoding="utf-8"))
by_id = {d["id"]: d for d in data}

# 收集所有新讲解
new_ins = {}
pilot = json.loads(PILOT.read_text(encoding="utf-8"))
for k, v in pilot.items():
    new_ins[int(k)] = v

out_dir = BASE / "讲解产出"
for p in sorted(out_dir.glob("批*.json")):
    d = json.loads(p.read_text(encoding="utf-8"))
    for k, v in d.items():
        new_ins[int(k)] = v

print(f"待合入讲解: {len(new_ins)} 章")

count = 0
for cid, txt in new_ins.items():
    if cid not in by_id:
        raise ValueError(f"id {cid} 不存在")
    by_id[cid]["insight"] = txt
    count += 1

# 按 id 排序写回
data.sort(key=lambda d: d["id"])
SRC.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"已合入 {count} 章新讲解到 {SRC.name}")
