# -*- coding: utf-8 -*-
"""合并校勘版原文 + 复核版内容 → 最终权威稿 reviewed_data.json。
text/source 取 full_506_校勘版.json（校勘成果）；
theme/scenes/practices/translation/insight 取 full_review_506.json（独立复核成果，含问题1译文）。
"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
REVIEW = BASE / '独立复核_20260916' / 'full_review_506.json'
XIAOKAN = BASE.parent.parent.parent / 'full_506_校勘版.json'
OUT = BASE / 'reviewed_data.json'

FIELDS = {'id', 'theme', 'scenes', 'practices', 'text', 'source', 'translation', 'insight'}


def main():
    with open(REVIEW, encoding='utf-8') as f:
        review = json.load(f)
    with open(XIAOKAN, encoding='utf-8') as f:
        xiaokan = json.load(f)

    if len(review) != 506 or len(xiaokan) != 506:
        raise SystemExit('章数不对')
    by_id = {d['id']: d for d in xiaokan}

    merged = []
    for r in review:
        x = by_id[r['id']]
        out = dict(r)
        out['text'] = x['text']
        out['source'] = x['source']
        if set(out) != FIELDS:
            raise SystemExit(f'{r["id"]} 字段集合不对')
        merged.append(out)

    # 校验：scenes/practices 至少 3 条且不重复；text 非空
    for d in merged:
        for k in ('scenes', 'practices'):
            if len(d[k]) < 3 or len(set(d[k])) != len(d[k]):
                raise SystemExit(f'{d["id"]}.{k} 数量/重复异常: {len(d[k])}')
        for k in ('text', 'translation', 'insight', 'source'):
            if not d[k].strip():
                raise SystemExit(f'{d["id"]}.{k} 为空')

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    print(f'已合并 {len(merged)} 章 → {OUT}')


if __name__ == '__main__':
    main()
