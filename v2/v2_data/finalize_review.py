# -*- coding: utf-8 -*-
"""全506章审稿及逐章记录齐全才可发布本地稿。默认只读；--apply才写。
--self-test 在临时目录测试，不触碰正式数据。
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import re
import tempfile
import sys
sys.dont_write_bytecode = True
from merge import BASE, validate, load_json, load_js, render_js, safe_write

BATCHES = [('output_0.json', 'notes_0.md', 1, 40),
           ('review_41_230.json', 'review_41_230.md', 41, 230),
           ('review_231_506.json', 'review_231_506.md', 231, 506)]


def note_ids(text):
    # 本轮记录实际格式：- 31学思…、- 21补全…、- 11：…、- **41**：…
    ids = []
    for line in text.splitlines():
        m = re.match(r'^\s*-\s+(?:\*\*)?(\d+)(?:\*\*)?(?=[：:、.\s\u4e00-\u9fff])', line)
        if m:
            ids.append(int(m[1]))
    return ids


def build(base):
    review = base / '独立复核_20260916'
    baseline = validate(load_json(review / 'baseline.json'))
    result, reports = [], []
    observed = {}
    required = [review / 'baseline.json', review / 'before_data.js']
    for data_name, note_name, lo, hi in BATCHES:
        required.extend([review / data_name, review / note_name])
    for p in required:
        observed[p] = p.read_bytes()  # 缺文件即停止；先记录防止审稿者并发更新
    for data_name, note_name, lo, hi in BATCHES:
        batch = validate(load_json(review / data_name), range(lo, hi + 1))
        text = (review / note_name).read_text(encoding='utf-8')
        counts = Counter(note_ids(text))
        expected = set(range(lo, hi + 1))
        if set(counts) != expected or any(n != 1 for n in counts.values()):
            raise ValueError(f'{note_name}逐章记录缺失/重复/越界；缺失={sorted(expected-set(counts))}')
        for d in batch:
            for k in ('id', 'theme', 'source', 'text'):
                if d[k] != baseline[d['id']-1][k]:
                    raise ValueError(f'{data_name} id={d["id"]}擅改受保护字段{k}')
        result.extend(batch)
        reports.append((note_name, text))
    validate(result)
    current = base.parent / 'data.js'
    authority = base / 'reviewed_data.json'
    for p in (current, authority):
        if p.exists():
            observed[p] = p.read_bytes()
    before = load_js(review / 'before_data.js')
    if authority.exists() and validate(load_json(authority)) != result:
        raise ValueError('已有权威稿与本轮结果不同，拒绝覆盖；需人工核对新增改动')
    if current.exists() and load_js(current) not in (before, result):
        raise ValueError('data.js存在本轮快照之外的用户改动，拒绝覆盖')
    lines = ['# 论语全章文字稿 · 506章独立复核版', '',
             '> 原文字段保留底稿，未完成底本校勘；疑点及释义分歧见文末审校记录，勿将本稿视为原文校勘定本。', '']
    for d in result:
        lines += [f'## {d["id"]} · {d["source"]}', '', '### 原文', d['text'], '',
                  '### 白话', d['translation'], '', '### 讲解', d['insight'], '', '### 情境']
        lines += [f'- {s}' for s in d['scenes']]
        lines += ['', '### 今日行动（独立选用，不与情境配对）']
        lines += [f'- {s}' for s in d['practices']]
        lines += ['']
    lines += ['# 原文疑点与逐章审校记录（保留原报告）', '']
    for name, text in reports:
        lines += [f'## {name}', '', text, '']
    changed = Counter(k for d,b in zip(result,baseline) for k in d if d[k] != b[k])
    summary = {'chapters': 506, 'scenes': 1518, 'practices': 1518,
               'changed_chapters_vs_baseline': sum(d != b for d,b in zip(result,baseline)),
               'changed_fields_vs_baseline': dict(changed)}
    targets = {authority: json.dumps(result, ensure_ascii=False, indent=2)+'\n',
               current: render_js(result), review / '论语全章文字稿_506章.md': '\n'.join(lines),
               review / 'validation_summary.json': json.dumps(summary, ensure_ascii=False, indent=2)+'\n'}
    return observed, targets, summary


def run(base=BASE, apply=False):
    observed, targets, summary = build(base)
    if apply:
        # 写前再次检查全部输入及现有正式稿；先完整预检，再写入。
        for p, raw in observed.items():
            if p.read_bytes() != raw:
                raise ValueError(f'文件在验证过程中变化，拒绝写入：{p.name}')
        authority = base / 'reviewed_data.json'
        if authority not in observed and authority.exists():
            raise ValueError('验证期间出现新的权威稿，拒绝覆盖')
        for p, text in targets.items():
            safe_write(p, text)
        if load_js(base.parent/'data.js') != load_json(authority):
            raise ValueError('写后数据一致性失败；备份保留，需检查')
    print(json.dumps(summary, ensure_ascii=False), '已写本地稿' if apply else '只读验证通过，未写文件')


def self_test():
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)/'v2_data'; base.mkdir()
        r = base/'独立复核_20260916';r.mkdir()
        data = [dict(id=i,theme=['内心'],scenes=['甲','乙','丙'],practices=['一','二','三'],text='原文',source='学而篇',translation='译文',insight='讲解') for i in range(1,507)]
        def dump(p,d): p.write_text(json.dumps(d,ensure_ascii=False),encoding='utf-8')
        dump(r/'baseline.json',data)
        (r/'before_data.js').write_text(render_js(data),encoding='utf-8')
        (base.parent/'data.js').write_text(render_js(data),encoding='utf-8')
        for name,note,lo,hi in BATCHES:
            dump(r/name,data[lo-1:hi])
            (r/note).write_text('\n'.join(f'- **{i}**：已审' for i in range(lo,hi+1)),encoding='utf-8')
        def rejected():
            snapshots = {p:p.read_bytes() for p in [base.parent/'data.js'] if p.exists()}
            try: run(base,True)
            except (ValueError,OSError): pass
            else: raise AssertionError('应拒绝却通过')
            assert all(p.read_bytes()==raw for p,raw in snapshots.items())
            assert not (base/'reviewed_data.json').exists()
        p=r/'review_231_506.json'
        dump(p,data[230:357]);rejected();dump(p,data[230:])
        q=r/'review_231_506.md';saved=q.read_text();q.write_text('- 231：已审');rejected();q.write_text(saved)
        bad=copy.deepcopy(data[230:]);bad[0]['text']='猜改';dump(p,bad);rejected();dump(p,data[230:])
        bad=copy.deepcopy(data[230:]);bad[0]['scenes'].pop();dump(p,bad);rejected();dump(p,data[230:])
        bad=copy.deepcopy(data[230:]);bad[1]['id']=231;dump(p,bad);rejected();dump(p,data[230:])
        original=(base.parent/'data.js').read_text();user=copy.deepcopy(data);user[0]['insight']='用户改动'
        (base.parent/'data.js').write_text(render_js(user));rejected();(base.parent/'data.js').write_text(original)
        p.rename(p.with_suffix('.tmp'));rejected();p.with_suffix('.tmp').rename(p)
        approved=copy.deepcopy(data);approved[0]['insight']='独立审改后讲解'
        dump(r/'output_0.json',approved[:40])
        run(base,False);assert not (base/'reviewed_data.json').exists()
        run(base,True)
        assert list((base.parent/'_review_backups').glob('data.js.*'))
        files=[base/'reviewed_data.json',base.parent/'data.js',r/'论语全章文字稿_506章.md']
        stamps={p:(p.read_bytes(),p.stat().st_mtime_ns) for p in files}
        run(base,True)
        assert all((p.read_bytes(),p.stat().st_mtime_ns)==v for p,v in stamps.items())
        assert load_js(base.parent/'data.js')==approved
    print('临时目录测试通过：缺文件/缺章/缺简记/重复id/3+3/原文保护/用户改动/只读/幂等')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group()
    group.add_argument('--apply',action='store_true')
    group.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    try:
        self_test() if args.self_test else run(apply=args.apply)
    except (ValueError,OSError) as e:
        raise SystemExit(f'拒绝合并：{e}')
