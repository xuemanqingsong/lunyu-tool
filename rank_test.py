# 用 Python 复现 full/app.js 的打分算法，用于本地测试（无 node 环境）
import json, re, sys, os

DEV = "/Users/hedonglichuifengji/Desktop/Agent工作区/把经典活出来/论语小工具/开发"
os.chdir(DEV)

def load_js_array(path):
    with open(path) as f:
        content = f.read()
    # 提取 = [ ... ]; 之间的内容
    m = re.search(r'=\s*(\[.*\])\s*;?\s*$', content, re.S)
    if not m:
        raise ValueError(f"无法解析 {path}")
    # JS 对象转 JSON：把裸属性名加引号
    text = m.group(1)
    # 处理单引号 vs 双引号：JS 用的是双引号，转成 JSON 合法
    text = re.sub(r'(\w+):', r'"\1":', text)
    return json.loads(text)

# 加载 ANCHOR_VARS（从 full/app.js）
def load_anchor_vars(app_js_path):
    with open(app_js_path) as f:
        content = f.read()
    m = re.search(r'const ANCHOR_VARS = (\{.*?\});', content, re.S)
    if not m:
        raise ValueError("找不到 ANCHOR_VARS")
    text = m.group(1)
    text = re.sub(r'(\w+):', r'"\1":', text)
    return json.loads(text)

def main():
    # 加载数据
    data = []
    for i in [1,2,3]:
        data += load_js_array(f"full/data-{i}.js")
    anchor_vars = load_anchor_vars("full/app.js")
    tagset = set()
    for c in data:
        for t in c["tags"]:
            tagset.add(t)

    print(f"数据章数: {len(data)}, 锚点数: {len(anchor_vars)}, tag总数: {len(tagset)}")

    def anchorsOf(word):
        w = word.strip()
        s = set()
        if w in tagset: s.add(w)
        for anchor, vars_ in anchor_vars.items():
            if w in vars_: s.add(anchor)
        return s

    def keywordInfo(word, ch):
        w = word.strip()
        as_ = anchorsOf(w)
        score = 0
        hitTags = set()
        if w in ch["tags"]:
            score = 12; hitTags.add(w)
        for a in as_:
            if a in ch["tags"]:
                if score < 8: score = 8
                hitTags.add(a)
        if score < 7 and len(w) >= 2:
            for t in ch["tags"]:
                if t in w or w in t:
                    score = 7; hitTags.add(t)
        if score < 5 and len(w) >= 2:
            hay = ch.get("text","") + ch.get("translation","") + ch.get("scene","")
            if w in hay:
                score = 5
        return score, hitTags

    def rank(words, n=6):
        cleaned = [w.strip() for w in words if w and w.strip()]
        if not cleaned: return []
        scored = []
        for ch in data:
            total = 0
            union = set()
            for w in cleaned:
                s, hits = keywordInfo(w, ch)
                total += s
                union |= hits
            scored.append((total + len(union)*8, ch))
        scored = [(s,c) for s,c in scored if s > 2]
        scored.sort(key=lambda x: -x[0])
        return scored[:n]

    # 测试用例（来自 test.js）
    cases = [
        (["失业","焦虑","方向"], [66,50,67]),
        (["内耗","行动","拖延"], [36,3,32]),
        (["三十岁","迷茫","转行"], [15,95,28]),
        (["没钱","心态","攀比"], [48,49,59]),
        (["孤独","社交","圈子"], [69,71,70]),
        (["父母","家庭","愧疚"], [93,92,94]),
        (["失败","低谷","勇气"], [46,37,21]),
        (["坚持","想放弃","半途而废"], [31,32,13]),
        (["熬夜","自律","刷手机"], [79,80,30]),
        (["讨好","不会拒绝","老好人"], [84,68,61]),
    ]
    print("\n=== 打分算法验证（对照 test.js 期望）===")
    pass_cnt = 0
    for words, expect in cases:
        r = rank(words)
        top = r[0][1]["id"] if r else None
        top3 = [x[1]["id"] for x in r[:3]]
        hit = top in expect
        if hit: pass_cnt += 1
        print(f"  {'✓' if hit else '✗'} {words} → top={top}, top3={top3}, 期望={expect}")

    print(f"\n通过 {pass_cnt}/{len(cases)}")
    # 额外测试单词
    print("\n=== 单锚点测试（用户词→摇出什么）===")
    for w in ["催婚","内耗","学习","职场","拖延","焦虑","背锅","孤独"]:
        r = rank([w])
        top = r[0][1]["text"][:25] if r else "无结果"
        print(f"  「{w}」→ {top}")

if __name__ == "__main__":
    main()
