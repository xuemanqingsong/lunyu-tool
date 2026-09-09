#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
论语锦囊 · 每日映射表自动更新
每晚 0 点运行：拉取两版本后台数据 → 找出用户实际输入但词库未收录的词
→ 按保守规则自动归类进 ANCHOR_VARS（两份 app.js）与映射表文档
→ 语法验证通过才落盘 → 备份 → 发布 → 写更新报告
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.path.join(BASE, "logs")
MAPPING_MD = "/workspace/lunyu-mapping.md"
PENDING_MD = "/workspace/pending-words.md"
PUBLISH_JS = "/root/.codebuddy/skills/发布为应用/scripts/publish.js"

APPJS_PATHS = [
    os.path.join(BASE, "app.js"),
    os.path.join(BASE, "one", "app.js"),
    os.path.join(BASE, "full", "app.js"),  # 全量版（/full/ 页面动态内联此文件，更新即生效）
]
QUERY_FILES = [
    os.path.join(BASE, "data", "queries.jsonl"),        # 三词版
    os.path.join(BASE, "one", "data", "queries.jsonl"),  # 单词版
    os.path.join(BASE, "full", "data", "queries.jsonl"),  # 全量版
]
FEEDBACK_FILES = [
    os.path.join(BASE, "data", "feedback.jsonl"),
    os.path.join(BASE, "one", "data", "feedback.jsonl"),
    os.path.join(BASE, "full", "data", "feedback.jsonl"),
]

NEG_PREFIXES = ("不", "别", "无", "非", "没", "莫", "勿")  # 否定前缀词不自动归类


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return rows


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def js_check(text):
    """node --check 校验 JS 文本语法；通过返回 True"""
    fd, tmp = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True, timeout=30)
        return r.returncode == 0
    finally:
        os.unlink(tmp)


# ---------- 1. 解析 app.js 的 ANCHOR_VARS ----------
def parse_anchor_vars(text):
    """返回 {锚点: [变体...]}（保持文件中出现顺序）"""
    anchors = {}
    block = re.search(r"const ANCHOR_VARS = \{(.*?)\n\};", text, re.S)
    if not block:
        return anchors
    for m in re.finditer(r'^\s*"([^"]+)":\s*\[([^\]]*)\]', block.group(1), re.M):
        anchor, body = m.group(1), m.group(2)
        anchors[anchor] = re.findall(r'"([^"]+)"', body)
    return anchors


def load_tagset():
    """用 node 从数据文件提取全部规范 tags，最可靠"""
    code = (
        "global.window={};"
        "const fs=require('fs');"
        "eval(fs.readFileSync('%s/data-1.js','utf8'));"
        "eval(fs.readFileSync('%s/data-2.js','utf8'));"
        "eval(fs.readFileSync('%s/data-3.js','utf8'));"
        "const D=[...window.LUNYU_PART_1,...window.LUNYU_PART_2,...window.LUNYU_PART_3];"
        "const s=new Set();D.forEach(c=>c.tags.forEach(t=>s.add(t)));"
        "process.stdout.write(JSON.stringify([...s]));"
    ) % (BASE, BASE, BASE)
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        raise RuntimeError("提取 tags 失败: " + r.stderr[:300])
    return set(json.loads(r.stdout))


def variant_index(anchor_vars):
    idx = {}
    for a, vs in anchor_vars.items():
        for v in vs:
            idx.setdefault(v, []).append(a)
    return idx


# ---------- 2. 归类规则（保守） ----------
def classify(word, anchor_vars, tagset, vidx):
    """把未收录词归到锚点；返回 (锚点, 规则) 或 None"""
    if word.startswith(NEG_PREFIXES) and word[1:] in tagset:
        return None  # “不焦虑”类否定词，语义相反，不自动收
    best = None
    for t in tagset:
        if len(t) >= 2 and t in word:
            if best is None or len(t) > len(best[0]):
                best = (t, "tag子串")
    for v, anchors in vidx.items():
        if len(v) >= 2 and v in word:
            if best is None or len(v) > len(best[0]):
                best = (anchors[0], "变体子串")
    return best


# ---------- 3. 更新 app.js（先验证后落盘） ----------
def add_words_to_appjs_text(text, anchor, words):
    """在 ANCHOR_VARS 文本中加入新词，返回 (新文本, 实际新增词列表)"""
    pat = re.compile(r'("%s":\s*\[)([^\]]*)(\])' % re.escape(anchor))
    m = pat.search(text)
    if m:
        existing = set(re.findall(r'"([^"]+)"', m.group(2)))
        new = [w for w in words if w not in existing]
        if not new:
            return text, []
        addition = "".join(', "%s"' % w for w in new)
        new_text = text[: m.end(2)] + addition + text[m.end(2):]
    else:
        if ('  "%s": [' % anchor) in text:  # 双保险：该锚点行已存在
            return text, []
        ins = ", ".join('"%s"' % w for w in words)
        # 插在对象闭合 }; 之前（前一末项补逗号）
        new_text, n = re.subn(r"\]\n\};", "],\n  \"%s\": [%s]\n};" % (anchor, ins), text, count=1)
        if n != 1:
            raise RuntimeError("未找到 ANCHOR_VARS 闭合位置")
    if not js_check(new_text):
        raise RuntimeError("语法验证失败，拒绝写入锚点 %s" % anchor)
    return new_text, new


def apply_to_appjs(anchor, words):
    """对两份 app.js 应用更新；语法验证全部通过才落盘，否则都不写"""
    drafts = []
    for p in APPJS_PATHS:
        with open(p, encoding="utf-8") as f:
            text = f.read()
        new_text, new = add_words_to_appjs_text(text, anchor, words)
        drafts.append((p, new_text, new))
    changed = []
    for p, new_text, new in drafts:
        if new:
            with open(p, "w", encoding="utf-8") as f:
                f.write(new_text)
            changed.append((p, new))
    return changed


# ---------- 4. 更新映射表文档（幂等） ----------
def add_words_to_mapping_md(anchor, words):
    with open(MAPPING_MD, encoding="utf-8") as f:
        lines = f.read().split("\n")
    target = None
    for i, line in enumerate(lines):
        if line.startswith("| %s |" % anchor):
            target = i
            break
    if target is not None:
        line = lines[target]
        cell = line.split("|")[-2] if line.count("|") >= 2 else ""
        already = set(x.strip() for x in cell.split("、"))
        add = "、".join(w for w in words if w not in already)
        if not add:
            return
        lines[target] = line[:-1].rstrip() + add + " |"
    else:
        sec = next(i for i, l in enumerate(lines) if l.startswith("## 第二部分"))
        last = max(i for i in range(sec, len(lines))
                   if lines[i].startswith("|") and not lines[i].startswith("| 锚点") and not lines[i].startswith("|---"))
        lines.insert(last + 1, "| %s | %s |" % (anchor, "、".join(words)))
    with open(MAPPING_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ---------- 5. 主流程 ----------
def main():
    os.makedirs(LOGS, exist_ok=True)
    report = ["=" * 50, "映射表每日更新 " + now_str(), "=" * 50]

    # 拉数据
    all_words = Counter()
    for qf in QUERY_FILES:
        for e in read_jsonl(qf):
            for w in e.get("words", []):
                w = (w or "").strip()
                if w:
                    all_words[w] += 1
    fb_rows = []
    for ff in FEEDBACK_FILES:
        fb_rows += read_jsonl(ff)
    report.append("输入词: %d 个不同词 / %d 次出现 | 评价 %d 条" % (len(all_words), sum(all_words.values()), len(fb_rows)))

    # 未收录词分析
    with open(APPJS_PATHS[0], encoding="utf-8") as f:
        anchor_vars = parse_anchor_vars(f.read())
    tagset = load_tagset()
    vidx = variant_index(anchor_vars)
    known = set(tagset) | set(vidx.keys())

    to_add = {}      # 锚点 -> [(词, 频次, 规则)]
    pending = []     # (词, 频次)
    for w, cnt in all_words.most_common():
        if len(w) < 2 or not re.search(r"[\u4e00-\u9fff]", w):
            continue  # 过滤单字、纯符号/字母
        if w in known:
            continue
        r = classify(w, anchor_vars, tagset, vidx)
        if r:
            to_add.setdefault(r[0], []).append((w, cnt, r[1]))
        else:
            pending.append((w, cnt))

    # 应用更新
    if to_add:
        try:
            for anchor, items in to_add.items():
                words = [w for w, _, _ in items]
                changed = apply_to_appjs(anchor, words)
                add_words_to_mapping_md(anchor, words)
                report.append("归入锚点[%s]: %s" % (
                    anchor, ", ".join("%s(%d次,%s)" % it for it in items)))
                for p, new in changed:
                    report.append("  -> 已写入 %s: %s" % (os.path.relpath(p, BASE), ",".join(new)))
            report.append("语法验证通过（app.js x2）")
        except Exception as ex:
            report.append("!! 更新失败，文件未改动: %s" % ex)
            finish(report, publish=False)
            return
    else:
        report.append("本次词库无需更新")

    # 待归类清单
    if pending:
        lines = ["# 待归类新词（自动更新脚本产出，供人工决定）", "",
                 "> 这些词用户输入过但无法按安全规则归类，人工判断后手动加进 app.js 的 ANCHOR_VARS 并同步映射文档。", "",
                 "| 词 | 频次 | 收集时间 |", "|---|---|---|"]
        for w, c in pending[:100]:
            lines.append("| %s | %d | %s |" % (w, c, datetime.now().strftime("%Y-%m-%d")))
        with open(PENDING_MD, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        report.append("待归类词 %d 个（见 pending-words.md），前5: %s" % (len(pending), ", ".join(w for w, _ in pending[:5])))
    else:
        if os.path.exists(PENDING_MD):
            report.append("待归类词已全部处理，清除旧清单")

    # 评价摘要：没帮到最多的组合
    not_helpful = Counter(
        ("·".join(e.get("words", [])), (e.get("chapterText") or "")[:15])
        for e in fb_rows if e.get("result") == "not")
    if not_helpful:
        report.append("「没帮到」反馈 TOP3: " + "; ".join("%s→%s(%d)" % (k[0], k[1], v) for k, v in not_helpful.most_common(3)))

    # 备份 + 发布
    finish(report, publish=bool(to_add))


def finish(report, publish):
    if publish:
        bk = os.path.join(LOGS, "backup-" + datetime.now().strftime("%Y%m%d-%H%M"))
        os.makedirs(bk, exist_ok=True)
        for d in ("data", os.path.join("one", "data"), os.path.join("full", "data")):
            src = os.path.join(BASE, d)
            if os.path.isdir(src):
                shutil.copytree(src, os.path.join(bk, d), dirs_exist_ok=True)
        report.append("数据已备份: " + bk)
        pub = subprocess.run(["node", PUBLISH_JS, "--dir", BASE, "--language", "python",
                              "--start-cmd", "python3 server.py"],
                             capture_output=True, text=True, timeout=300)
        ok = '"verified":true' in pub.stdout
        report.append("发布: " + ("成功" if ok else "失败 " + (pub.stdout[-200:] + pub.stderr[-200:])))
    report.append("")
    text = "\n".join(report)
    print(text, flush=True)
    with open(os.path.join(LOGS, "mapping-update.log"), "a", encoding="utf-8") as f:
        f.write(text + "\n")


if __name__ == "__main__":
    main()
