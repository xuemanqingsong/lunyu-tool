# -*- coding: utf-8 -*-
"""仅从v2独立权威稿生成data.js；--check只验证，无权威稿则拒绝旧底稿回写。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

BASE = Path(__file__).resolve().parent
FIELDS = {'id', 'theme', 'scenes', 'practices', 'text', 'source', 'translation', 'insight'}


def validate(data, ids=range(1, 507)):
    expected = list(ids)
    if not isinstance(data, list):
        raise ValueError('数据必须为数组')
    actual = [d.get('id') if isinstance(d, dict) else None for d in data]
    if any(type(i) is not int for i in actual) or actual != expected:
        raise ValueError(f'章号必须完整、唯一且按序排列：{expected[0]}—{expected[-1]}；实际{len(actual)}章')
    for d in data:
        if set(d) != FIELDS:
            raise ValueError(f'{d["id"]} 字段集合不正确')
        for k in ('text', 'source', 'translation', 'insight'):
            if not isinstance(d[k], str) or not d[k].strip():
                raise ValueError(f'{d["id"]}.{k} 必须为非空字符串')
        for k in ('theme', 'scenes', 'practices'):
            v = d[k]
            if not isinstance(v, list) or not v or any(not isinstance(s, str) or not s.strip() for s in v):
                raise ValueError(f'{d["id"]}.{k} 必须为非空字符串数组')
            if len(set(v)) != len(v):
                raise ValueError(f'{d["id"]}.{k} 存在重复')
            if k != 'theme' and len(v) < 3:
                raise ValueError(f'{d["id"]}.{k} 至少3条')
            if k == 'theme' and not set(v) <= {'工作', '家庭', '待人', '内心'}:
                raise ValueError(f'{d["id"]}.theme 未知主题')
    return data


def load_json(path):
    def unique(pairs):
        out = {}
        for k, v in pairs:
            if k in out:
                raise ValueError(f'重复JSON键：{k}')
            out[k] = v
        return out
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique)


def load_js(path):
    s = Path(path).read_text(encoding='utf-8')
    m = re.search(r'window\.LUNYU_V2\s*=\s*(\[.*\])\s*;\s*$', s, re.S)
    if not m:
        raise ValueError(f'无法解析 {path}')
    return validate(json.loads(m[1]))


def render_js(data):
    validate(data)
    return '// 论语小工具 v2 · 独立审校权威稿生成，勿从共享旧底稿重建\nwindow.LUNYU_V2 = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n'


def safe_write(path, content):
    """同内容不写；旧内容按哈希留存；单文件原子替换。"""
    path = Path(path)
    raw = content.encode('utf-8')
    if path.exists():
        old = path.read_bytes()
        if old == raw:
            return False
        backup = path.parent / '_review_backups' / (path.name + '.' + hashlib.sha256(old).hexdigest())
        backup.parent.mkdir(exist_ok=True)
        if backup.exists() and backup.read_bytes() != old:
            raise ValueError('备份校验失败')
        if not backup.exists():
            with backup.open('xb') as f:
                f.write(old)
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    source = BASE / 'reviewed_data.json'
    if not source.exists():
        raise ValueError('缺少v2_data/reviewed_data.json；拒绝使用旧共享full_506.json。请先完成全库审校并运行finalize_review.py。')
    data = validate(load_json(source))
    target = BASE.parent / 'data.js'
    if target.exists() and load_js(target) != data:
        raise ValueError('现有data.js与权威稿有差异；为保护用户修改，拒绝覆盖。请由finalize_review.py核对版本后同步。')
    if not args.check:
        safe_write(target, render_js(data))
    print('验证通过：506章，1518情境，1518行动' + ('（只读）' if args.check else '；data.js已同步'))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as e:
        raise SystemExit(f'失败（未回退旧底稿）：{e}')
