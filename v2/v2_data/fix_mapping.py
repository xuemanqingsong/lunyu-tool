# -*- coding: utf-8 -*-
"""修复情境↔行动映射：A类97对。
策略：清单建议优先对调（保留行动内容），无法对调的用清单建议重写。
"""
import json, re
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "reviewed_data.json"
data = json.loads(SRC.read_text(encoding="utf-8"))
by_id = {d["id"]: d for d in data}

# ===== 对调方案：{id: [(i,j), ...]} 0-based，依次执行 =====
SWAPS = {
    7:  [(1,2),(2,3)],     # 4条，P2<->P3, P3<->P4（循环轮转2->3->4->2）
    21: [(1,2)],
    59: [(1,2)],
    62: [(1,2)],
    70: [(1,2)],
    75: [(0,1)],
    82: [(0,1),(0,2)],
    103:[(1,2)],
    111:[(0,1),(0,2),(1,2)],  # 3条循环轮转
    125:[(1,2)],
    126:[(0,2),(1,2)],
    132:[(1,2)],
    134:[(1,2)],
    166:[(0,2),(1,2)],
    184:[(0,1)],
    188:[(1,2)],
    191:[(1,2)],
    192:[(1,2)],
    196:[(0,1)],
    203:[(1,2)],
    223:[(0,2)],
    241:[(1,2)],
    242:[(0,1),(0,2),(1,2)],  # 循环轮转
    248:[(0,1),(1,2)],
    250:[(0,1),(0,2),(1,2)],  # 循环轮转
    254:[(0,1),(0,2),(1,2)],  # 循环轮转
    260:[(0,1),(0,2),(1,2)],  # 循环轮转
    266:[(0,1)],
    268:[(0,1),(0,2)],
    279:[(0,1)],
    294:[(0,1)],
    310:[(1,2)],
    313:[(0,1)],
    330:[(1,2)],
    346:[(0,1),(1,2)],
    350:[(1,2)],
    360:[(1,2)],
    385:[(0,2)],
    391:[(0,1)],
    397:[(0,1)],
    409:[(0,1)],
    427:[(1,2)],
    430:[(1,2)],
    431:[(1,2)],
    438:[(0,1),(1,2)],
    476:[(0,1)],
    477:[(0,1)],
    480:[(1,2)],
    490:[(0,1)],
    491:[(0,1)],
    504:[(2,3)],
}

# ===== 重写方案：{id: {idx(0-based): 新文案}} =====
REWRITES = {
    6:  {2: "今天在群里认领一件能分担的小事，做完再说"},
    29: {1: "今天把会上答应负责的那件事推进第一步，或如实说明进展"},
    40: {2: "今天选合适的渠道，平静指出那处资料错误并给出依据"},
    85: {2: "今天主动向家里说明你的近况和去处，不让他们瞎猜"},
    100:{2: "今天评价一个人时，把能办事与为人是否可靠分开看，各写一项事实"},
    123:{1: "今天核对那笔补助是否符合实际用途，不因对方开口就答应"},
    140:{2: "今天把那件应承担的麻烦事推进一个具体步骤，不等别人先做"},
    143:{1: "今天向对方核对该服务的真实内容，不被名称误导"},
    148:{2: "今天处理别人的请求时，像自己希望被对待那样听完、再回应"},
    151:{3: "今天对亲近的人，把一次不耐烦换成平静的回应"},
    268:{0: "今天把旧方案中值得保留的部分写清，在讨论中提出来"},
    297:{2: "今天向对方及时说明承诺遇到的新困难及新的安排"},
    437:{2: "今天遇到拿不准的事，当场问一句或查一下，不装懂"},
}

# 应用对调
swap_count = 0
for cid, pairs in SWAPS.items():
    if cid not in by_id:
        print(f"警告: id {cid} 不存在"); continue
    practices = by_id[cid]["practices"]
    for i, j in pairs:
        if i >= len(practices) or j >= len(practices):
            print(f"警告: id {cid} 对调越界 {i},{j} (共{len(practices)}条)"); continue
        practices[i], practices[j] = practices[j], practices[i]
        swap_count += 1

# 应用重写
rewrite_count = 0
for cid, idx_map in REWRITES.items():
    if cid not in by_id:
        print(f"警告: id {cid} 不存在"); continue
    practices = by_id[cid]["practices"]
    for idx, new_text in idx_map.items():
        if idx >= len(practices):
            print(f"警告: id {cid} 重写越界 {idx} (共{len(practices)}条)"); continue
        old = practices[idx]
        practices[idx] = new_text
        print(f"id {cid} P{idx+1}: {old} → {new_text}")
        rewrite_count += 1

print(f"\n对调 {swap_count} 次, 重写 {rewrite_count} 条")
SRC.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print("已写回 reviewed_data.json")
