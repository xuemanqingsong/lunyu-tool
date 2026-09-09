# -*- coding: utf-8 -*-
"""生成 v2 情境版数据：四主题划分 + 情境切片。
输入：../../full_506.json（每章 {id,text,source,translation,scene,insight,practice,tags}）
输出：data.js（window.LUNYU_V2 = [{id, theme, scene, ...}]）
"""
import json, os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "..", "..", "full_506.json")
OUT = os.path.join(BASE, "data.js")

with open(SRC, encoding="utf-8") as f:
    DATA = json.load(f)
BY_ID = {d["id"]: d for d in DATA}

# 主题 -> 标签集合（确定性规则）
# 原则：只用"具体生活面"标签定主题；"原则/判断/价值观/态度/选择"这类过泛标签不作为依据，
#       避免内心池过度膨胀、主题失去区分度。
THEME_TAGS = {
    "工作": {"职场", "领导", "管理", "责任", "敬业", "从政", "治理", "使民", "尽职", "事业",
            "职业", "上级", "下属", "为政", "办公", "能力", "任务"},
    "家庭": {"家庭", "孝顺", "父母", "孝", "悌", "兄弟", "亲子", "婚姻", "长辈", "子女", "家人", "孝弟"},
    "待人": {"人际", "朋友", "诚信", "承诺", "信任", "边界", "沟通", "交友", "尊重", "宽容",
            "礼貌", "礼仪", "社交", "和睦", "为人", "识别", "冤", "嫉妒"},
    "内心": {"学习", "修养", "心态", "自省", "坚持", "情绪", "行动", "格局", "理想", "谦虚",
            "自律", "欲望", "习惯", "知足", "改过", "正直", "勇气", "智慧", "仁爱", "同理心",
            "底线", "分寸", "独立", "专注", "健康", "时间", "金钱", "远见", "急躁", "执念",
            "诚实", "品格", "接纳", "遗憾", "等待"},
}

# 17 章手动兜底（tags 不含主题标签，但内容明确）：id -> [themes]
MANUAL = {
    50:  ["内心"],      # 走过场想离场——内心
    80:  ["工作"],      # 失业/怕丢工作——工作
    123: ["待人"],      # 帮人却给错人——待人
    128: ["内心"],      # 亲友遭不幸、命运——内心
    200: ["内心"],      # 音乐之美——内心
    210: ["内心"],      # 毋意毋必毋固毋我——内心
    212: ["工作"],      # 出身起点自卑——工作
    223: ["内心"],      # 逝者如斯——内心
    228: ["内心"],      # 付出了没结果——内心
    326: ["工作"],      # 为政欲速不达——工作
    336: ["内心"],      # 羡慕口才嘴笨自卑——内心
    375: ["待人"],      # 以直报怨——待人
    397: ["内心"],      # 人无远虑——内心
    411: ["待人"],      # 查证 vs 胡编——待人
    424: ["工作"],      # 有教无类、带人——工作
    478: ["待人"],      # 靠谱可托付之人——待人
    498: ["待人"],      # 舆论泼脏水——待人
}

def themes_for(item):
    tags = set(item.get("tags", []))
    themes = [th for th, tset in THEME_TAGS.items() if tags & tset]
    mid = item["id"]
    if not themes:
        themes = MANUAL.get(mid, ["内心"])  # 兜底默认内心
    return themes

# 生成输出
out = []
theme_count = {}
for item in DATA:
    themes = themes_for(item)
    for th in themes:
        theme_count[th] = theme_count.get(th, 0) + 1
    rec = {
        "id": item["id"],
        "theme": themes,          # 该章所属主题（可多）
        "scene": item["scene"],   # 情境切片（scene 字段现成）
        "text": item["text"],
        "source": item["source"],
        "translation": item["translation"],
        "insight": item["insight"],
        "practice": item["practice"],
    }
    out.append(rec)

print("主题分布:", theme_count)
print("总章数:", len(out))
unassigned_left = [d["id"] for d in DATA if not themes_for(d)]
print("仍无主题:", unassigned_left)

js = "// 论语小工具 v2 情境版 · 全量数据\n// 每章：id/主题/情境切片/原文/白话/讲解/今日行动\nwindow.LUNYU_V2 = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
with open(OUT, "w", encoding="utf-8") as f:
    f.write(js)
print("已写出:", OUT, os.path.getsize(OUT), "bytes")
