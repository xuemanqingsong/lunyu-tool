# 时习 · 论语摇一摇 · 后端服务（单词版为主产品；全量版 /full/；三词版历史数据保留可查）
# 单端口三应用：/ 三词版 + /one/ 单词版 + /full/ 全量版（独立页面、独立数据、独立后台）
# 数据以 JSONL 形式落盘，无需外部数据库
import json
import os
import time
from flask import Flask, request, jsonify, send_from_directory, redirect

BASE = os.path.dirname(os.path.abspath(__file__))
ONE_BASE = os.path.join(BASE, "one")
FULL_BASE = os.path.join(BASE, "full")
QIAN_BASE = os.path.join(BASE, "qian")

# 三词版数据
FEEDBACK_FILE = os.path.join(BASE, "data", "feedback.jsonl")
SUGGESTION_FILE = os.path.join(BASE, "data", "suggestions.jsonl")
QUERY_FILE = os.path.join(BASE, "data", "queries.jsonl")

# 单词版数据（完全独立）
ONE_FEEDBACK_FILE = os.path.join(ONE_BASE, "data", "feedback.jsonl")
ONE_SUGGESTION_FILE = os.path.join(ONE_BASE, "data", "suggestions.jsonl")
ONE_QUERY_FILE = os.path.join(ONE_BASE, "data", "queries.jsonl")

# 全量版数据（完全独立；注意：全量版章句 id 与精选版不互通）
FULL_FEEDBACK_FILE = os.path.join(FULL_BASE, "data", "feedback.jsonl")
FULL_SUGGESTION_FILE = os.path.join(FULL_BASE, "data", "suggestions.jsonl")
FULL_QUERY_FILE = os.path.join(FULL_BASE, "data", "queries.jsonl")

# 论语日课（/qian/，完全独立；抽取不匹配词，只记浏览行为）
QIAN_DRAW_FILE = os.path.join(QIAN_BASE, "data", "draws.jsonl")
QIAN_FEEDBACK_FILE = os.path.join(QIAN_BASE, "data", "feedback.jsonl")

os.makedirs(os.path.join(BASE, "data"), exist_ok=True)
os.makedirs(os.path.join(ONE_BASE, "data"), exist_ok=True)
os.makedirs(os.path.join(FULL_BASE, "data"), exist_ok=True)
os.makedirs(os.path.join(QIAN_BASE, "data"), exist_ok=True)

# 只允许页面必需的静态文件；data/、server.py 等一律不对外暴露
PUBLIC_FILES = {"index.html", "style.css", "app.js", "data-1.js", "data-2.js", "data-3.js"}
QIAN_PUBLIC_FILES = {"index.html", "style.css", "app.js", "data-qian-1.js", "data-qian-2.js", "data-qian-3.js", "kongzi.png"}

app = Flask(__name__, static_folder=None)

RESULT_LABELS = {"helpful": "帮到了", "partial": "帮到了一点", "not": "没帮到"}


def append_jsonl(path, entry):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    entry["ts"] = int(time.time())
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


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


# ---------- 页面与静态文件（白名单） ----------
@app.after_request
def no_cache(resp):
    """禁用缓存：后台统计与页面始终显示最新数据（合并数据文件除外，允许浏览器缓存一天）"""
    if request.path in ("/one/data-all.js", "/full/data-all.js", "/qian/data-all.js"):
        return resp  # 已单独设置 Cache-Control: public, max-age=86400
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/")
def index():
    """根域名自动跳转到新版单词版（用户确认的设计）。三词版旧页保留于 /index.html，带横幅。"""
    return redirect("/one/", code=301)


@app.route("/<path:filename>")
def static_files(filename):
    if filename not in PUBLIC_FILES:
        return "Not Found", 404
    return send_from_directory(BASE, filename)


# ---------- 单词版：/one/（与全量版相同的请求合并优化，见下方说明） ----------
@app.route("/one")
def one_index_redirect():
    return redirect("/one/", code=301)


@app.route("/one/")
def one_index():
    return app.response_class(_one_build_page(), mimetype="text/html")


# 注意：data-all 必须定义在 /one/<path:filename> 之前（Werkzeug 按定义顺序匹配）
@app.route("/one/data-all.js")
def one_data_all():
    resp = app.response_class(_one_build_data(), mimetype="application/javascript")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.route("/one/<path:filename>")
def one_static_files(filename):
    if filename not in PUBLIC_FILES:
        return "Not Found", 404
    return send_from_directory(ONE_BASE, filename)


# ---------- 全量版：/full/ ----------
# 注：外部网关对回源请求有间歇性 502，请求次数越多页面打开失败率越高。
# 因此 /one/ 与 /full/ 均做请求合并优化：
#   1) 页面路由动态内联 style.css + app.js（文件仍是独立源码，mtime 变化自动重新拼装，
#      每晚 update-mapping.py 更新映射表后无需任何额外操作）
#   2) /data-all.js 动态合并三个数据文件为一次请求，并允许浏览器缓存一天
#   → 打开页面从 7 个请求降为 2 个，二次访问仅 1 个（HTML）
def _file_sig(*paths):
    return tuple((p, os.path.getmtime(p)) for p in paths)


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def _make_builder(base_dir, data_names=("data-1.js", "data-2.js", "data-3.js"), check_global="window.LUNYU_PART_1"):
    """生成 (页面HTML构建器, 合并数据构建器)，按 mtime 缓存，源文件变化自动重建"""
    page_files = [os.path.join(base_dir, f) for f in ("index.html", "style.css", "app.js")]
    data_files = [os.path.join(base_dir, f) for f in data_names]
    pc = {"sig": None, "html": ""}
    dc = {"sig": None, "js": ""}

    def build_page():
        sig = _file_sig(*page_files)
        if pc["sig"] != sig:
            html = _read(page_files[0])
            css = _read(page_files[1])
            js = _read(page_files[2])
            html = html.replace(
                '<link rel="stylesheet" href="style.css">',
                "<style>\n" + css + "\n</style>",
            )
            for name in (*data_names, "app.js"):
                html = html.replace(f'<script src="{name}"></script>\n', "")
            ver = str(int(max(os.path.getmtime(p) for p in data_files)))
            # 数据加载失败（网关偶发502）时自动重试一次；成功则清除标记
            retry_js = (
                "<script>if(!" + check_global + "){"
                "if(!sessionStorage.getItem('dl-retry')){"
                "sessionStorage.setItem('dl-retry','1');location.reload();"
                "}else{document.body.innerHTML='<p style=\"text-align:center;padding:60px 20px;font-size:15px\">"
                "加载暂时失败，请再刷新一次</p>';}"
                "}else{sessionStorage.removeItem('dl-retry');}</script>"
            )
            html = html.replace(
                "</body>",
                '<script src="data-all.js?v=' + ver + '"></script>\n'
                "<script>\n" + js + "\n</script>\n" + retry_js + "\n</body>",
            )
            pc["sig"] = sig
            pc["html"] = html
        return pc["html"]

    def build_data_all():
        sig = _file_sig(*data_files)
        if dc["sig"] != sig:
            dc["sig"] = sig
            dc["js"] = "\n".join(_read(p) for p in data_files)
        return dc["js"]

    return build_page, build_data_all


_one_build_page, _one_build_data = _make_builder(ONE_BASE)
_full_build_page, _full_build_data = _make_builder(FULL_BASE)
_qian_build_page, _qian_build_data = _make_builder(
    QIAN_BASE,
    data_names=("data-qian-1.js", "data-qian-2.js", "data-qian-3.js"),
    check_global="window.LUNYU_QIAN_1",
)


@app.route("/full")
def full_index_redirect():
    return redirect("/full/", code=301)


@app.route("/full/")
def full_index():
    return app.response_class(_full_build_page(), mimetype="text/html")


@app.route("/full/data-all.js")
def full_data_all():
    resp = app.response_class(_full_build_data(), mimetype="application/javascript")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.route("/full/<path:filename>")
def full_static_files(filename):
    if filename not in PUBLIC_FILES:
        return "Not Found", 404
    return send_from_directory(FULL_BASE, filename)


# ---------- 论语日课：/qian/ ----------
@app.route("/qian")
def qian_index_redirect():
    return redirect("/qian/", code=301)


@app.route("/qian/")
def qian_index():
    return app.response_class(_qian_build_page(), mimetype="text/html")


@app.route("/qian/data-all.js")
def qian_data_all():
    resp = app.response_class(_qian_build_data(), mimetype="application/javascript")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.route("/qian/<path:filename>")
def qian_static_files(filename):
    if filename in QIAN_PUBLIC_FILES:
        return send_from_directory(QIAN_BASE, filename)
    return "Not Found", 404


# ---------- 反馈（三词版 /api/*，单词版 /one/api/*） ----------
def _handle_feedback(feedback_file):
    body = request.get_json(silent=True) or {}
    result = body.get("result")
    if result not in RESULT_LABELS:
        return jsonify({"ok": False, "error": "invalid result"}), 400
    append_jsonl(feedback_file, {
        "queryId": (body.get("queryId") or "")[:30],
        "result": result,
        "label": RESULT_LABELS[result],
        "chapterId": body.get("chapterId"),
        "chapterText": (body.get("chapterText") or "")[:100],
        "words": [str(w)[:20] for w in (body.get("words") or [])][:3],
    })
    return jsonify({"ok": True})


def _handle_suggestion(suggestion_file):
    body = request.get_json(silent=True) or {}
    text = (body.get("text") or "").strip()[:500]
    if not text:
        return jsonify({"ok": False, "error": "empty"}), 400
    append_jsonl(suggestion_file, {"text": text})
    return jsonify({"ok": True})


def _handle_query(query_file):
    body = request.get_json(silent=True) or {}
    words = [str(w)[:20] for w in (body.get("words") or [])][:3]
    if not words:
        return jsonify({"ok": False, "error": "empty words"}), 400
    append_jsonl(query_file, {
        "queryId": (body.get("queryId") or "")[:30],
        "action": (body.get("action") or "ask")[:10],
        "words": words,
        "chapterId": body.get("chapterId"),
        "chapterText": (body.get("chapterText") or "")[:100],
        "source": (body.get("source") or "")[:20],
    })
    return jsonify({"ok": True})


@app.route("/api/feedback", methods=["POST"])
def feedback():
    return _handle_feedback(FEEDBACK_FILE)


@app.route("/api/suggestion", methods=["POST"])
def suggestion():
    return _handle_suggestion(SUGGESTION_FILE)


@app.route("/api/query", methods=["POST"])
def query_log():
    return _handle_query(QUERY_FILE)


@app.route("/one/api/feedback", methods=["POST"])
def one_feedback():
    return _handle_feedback(ONE_FEEDBACK_FILE)


@app.route("/one/api/suggestion", methods=["POST"])
def one_suggestion():
    return _handle_suggestion(ONE_SUGGESTION_FILE)


@app.route("/one/api/query", methods=["POST"])
def one_query_log():
    return _handle_query(ONE_QUERY_FILE)


@app.route("/full/api/feedback", methods=["POST"])
def full_feedback():
    return _handle_feedback(FULL_FEEDBACK_FILE)


@app.route("/full/api/suggestion", methods=["POST"])
def full_suggestion():
    return _handle_suggestion(FULL_SUGGESTION_FILE)


@app.route("/full/api/query", methods=["POST"])
def full_query_log():
    return _handle_query(FULL_QUERY_FILE)


# ---------- 后台统计 ----------
def build_stats(feedback_file, suggestion_file, query_file):
    fb = read_jsonl(feedback_file)
    sg = read_jsonl(suggestion_file)
    qy = read_jsonl(query_file)

    # (queryId, chapterId) → 最新评价：评价精确挂到被评价的那一句上
    rating_map = {}
    for e in fb:
        qid = e.get("queryId")
        if qid:
            rating_map[(qid, e.get("chapterId"))] = e.get("result")

    # 全量操作记录：每次摇 / 每次换一句，均带评价状态（None = 未评价）
    records = [
        {
            "action": e.get("action", "ask"),
            "words": e.get("words", []),
            "chapterText": e.get("chapterText", ""),
            "source": e.get("source", ""),
            "ts": e.get("ts", 0),
            "rating": rating_map.get((e.get("queryId"), e.get("chapterId"))),
        }
        for e in qy
    ]

    return {
        "queryCount": len([e for e in qy if e.get("action", "ask") == "ask"]),
        "feedbackCount": len(fb),
        "ratingDist": {
            "helpful": len([e for e in fb if e.get("result") == "helpful"]),
            "partial": len([e for e in fb if e.get("result") == "partial"]),
            "not": len([e for e in fb if e.get("result") == "not"]),
        },
        "records": records[-100:],
        "suggestions": [e.get("text") for e in sg][-50:],
        "suggestionCount": len(sg),
    }


def _stats_json(feedback_file, suggestion_file, query_file):
    return jsonify(build_stats(feedback_file, suggestion_file, query_file))


def _export_data(feedback_file, suggestion_file, query_file):
    """导出全部原始数据，供发布前备份迁移使用"""
    return jsonify({
        "feedback": read_jsonl(feedback_file),
        "suggestions": read_jsonl(suggestion_file),
        "queries": read_jsonl(query_file),
    })


@app.route("/api/stats")
def stats_json():
    return _stats_json(FEEDBACK_FILE, SUGGESTION_FILE, QUERY_FILE)


@app.route("/api/export")
def export_data():
    return _export_data(FEEDBACK_FILE, SUGGESTION_FILE, QUERY_FILE)


@app.route("/one/api/stats")
def one_stats_json():
    return _stats_json(ONE_FEEDBACK_FILE, ONE_SUGGESTION_FILE, ONE_QUERY_FILE)


@app.route("/one/api/export")
def one_export_data():
    return _export_data(ONE_FEEDBACK_FILE, ONE_SUGGESTION_FILE, ONE_QUERY_FILE)


@app.route("/full/api/stats")
def full_stats_json():
    return _stats_json(FULL_FEEDBACK_FILE, FULL_SUGGESTION_FILE, FULL_QUERY_FILE)


@app.route("/full/api/export")
def full_export_data():
    return _export_data(FULL_FEEDBACK_FILE, FULL_SUGGESTION_FILE, FULL_QUERY_FILE)


# ---------- 论语日课：浏览记录 + 评价 ----------
@app.route("/qian/api/draw", methods=["POST"])
def qian_draw():
    body = request.get_json(silent=True) or {}
    chapter_id = body.get("chapterId")
    if chapter_id is None:
        return jsonify({"ok": False, "error": "empty"}), 400
    append_jsonl(QIAN_DRAW_FILE, {
        "chapterId": chapter_id,
        "chapterText": (body.get("chapterText") or "")[:100],
        "source": (body.get("source") or "")[:20],
    })
    return jsonify({"ok": True})


@app.route("/qian/api/feedback", methods=["POST"])
def qian_feedback():
    body = request.get_json(silent=True) or {}
    result = body.get("result")
    if result not in RESULT_LABELS:
        return jsonify({"ok": False, "error": "invalid result"}), 400
    append_jsonl(QIAN_FEEDBACK_FILE, {
        "result": result,
        "label": RESULT_LABELS[result],
        "chapterId": body.get("chapterId"),
        "chapterText": (body.get("chapterText") or "")[:100],
    })
    return jsonify({"ok": True})


@app.route("/qian/api/stats")
def qian_stats_json():
    draws = read_jsonl(QIAN_DRAW_FILE)
    fb = read_jsonl(QIAN_FEEDBACK_FILE)
    per_chapter = {}
    for d in draws:
        cid = d.get("chapterId")
        if cid is not None:
            per_chapter[cid] = per_chapter.get(cid, 0) + 1
    rating_map = {}
    for e in fb:
        if e.get("chapterId") is not None:
            rating_map[e.get("chapterId")] = e.get("result")
    return jsonify({
        "drawCount": len(draws),
        "feedbackCount": len(fb),
        "ratingDist": {
            "helpful": len([e for e in fb if e.get("result") == "helpful"]),
            "partial": len([e for e in fb if e.get("result") == "partial"]),
            "not": len([e for e in fb if e.get("result") == "not"]),
        },
        "recent": [
            {
                "ts": d.get("ts", 0),
                "chapterText": d.get("chapterText", ""),
                "source": d.get("source", ""),
                "rating": rating_map.get(d.get("chapterId")),
            }
            for d in draws[-100:]
        ],
        "topChapters": sorted(
            [{"chapterId": k, "count": v} for k, v in per_chapter.items()],
            key=lambda x: -x["count"],
        )[:20],
    })


@app.route("/stats")
def stats_page():
    return _stats_page(
        FEEDBACK_FILE, SUGGESTION_FILE, QUERY_FILE,
        "三词版",
    )


@app.route("/one/stats")
def one_stats_page():
    return _stats_page(
        ONE_FEEDBACK_FILE, ONE_SUGGESTION_FILE, ONE_QUERY_FILE,
        "单词版",
    )


@app.route("/full/stats")
def full_stats_page():
    return _stats_page(
        FULL_FEEDBACK_FILE, FULL_SUGGESTION_FILE, FULL_QUERY_FILE,
        "全量版",
    )


@app.route("/qian/stats")
def qian_stats_page():
    def fmt_ts(ts):
        return time.strftime("%m-%d %H:%M", time.localtime(ts)) if ts else ""

    RATING_LABELS_Q = {"helpful": "帮到了", "partial": "帮到了一点", "not": "没帮到"}
    draws = read_jsonl(QIAN_DRAW_FILE)
    fb = read_jsonl(QIAN_FEEDBACK_FILE)
    rating_map = {}
    for e in fb:
        if e.get("chapterId") is not None:
            rating_map[e.get("chapterId")] = e.get("result")

    per_chapter = {}
    for d in draws:
        cid = d.get("chapterId")
        if cid is not None:
            per_chapter[cid] = per_chapter.get(cid, 0) + 1
    top = sorted(per_chapter.items(), key=lambda x: -x[1])[:20]

    rd = {"helpful": 0, "partial": 0, "not": 0}
    for e in fb:
        r = e.get("result")
        if r in rd:
            rd[r] += 1
    if fb:
        rate = f" · 帮助率（帮到了及以上）{(rd['helpful'] + rd['partial']) / len(fb) * 100:.0f}%"
    else:
        rate = ""

    recent_rows = "".join(
        f"<tr><td class='ts'>{fmt_ts(d.get('ts', 0))}</td>"
        f"<td>{d.get('chapterText', '')}<span class='src'>《{d.get('source', '')}》</span></td>"
        f"<td class='rt r-{rating_map.get(d.get('chapterId'))}'>{RATING_LABELS_Q.get(rating_map.get(d.get('chapterId')), '未评价')}</td></tr>"
        for d in reversed(draws[-100:])
    ) or "<tr><td colspan='3'>暂无数据</td></tr>"

    top_rows = "".join(
        f"<tr><td>{cid}</td><td>{_qian_text(cid)}</td><td>{n}</td></tr>"
        for cid, n in top
    ) or "<tr><td colspan='3'>暂无数据</td></tr>"

    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>时习 · 数据后台（论语日课）</title>
<style>
body {{ font-family: "Songti SC","SimSun",serif; background:#f3ede1; color:#2b2118; max-width:720px; margin:0 auto; padding:36px 20px; }}
h1 {{ font-size:22px; letter-spacing:3px; }}
h2 {{ font-size:15px; margin-top:34px; letter-spacing:2px; color:#5a4f42; }}
table {{ width:100%; border-collapse:collapse; font-size:13.5px; background:#fbf7ee; }}
td, th {{ border:1px solid #d9cfba; padding:7px 12px; text-align:left; }}
th {{ font-size:13px; color:#5a4f42; }}
.ts {{ font-size:12px; color:#8b7f6d; white-space:nowrap; }}
.src {{ font-size:12px; color:#9e3b2c; margin-left:4px; white-space:nowrap; }}
.rt {{ font-size:12.5px; white-space:nowrap; }}
.r-helpful {{ color:#9e3b2c; font-weight:bold; }}
.r-partial {{ color:#c47a4e; }}
.r-not {{ color:#5a4f42; }}
.r-None {{ color:#b3a790; }}
.meta {{ font-size:13px; color:#8b7f6d; }}
</style></head><body>
<h1>时习 · 数据后台（论语日课）</h1>
<p class="meta">累计学习 {len(draws)} 次 · 收到评价 {len(fb)} 条 · 评价分布：帮到了 {rd['helpful']} · 帮到了一点 {rd['partial']} · 没帮到 {rd['not']}{rate}</p>
<h2>最近学习（最近100条）</h2>
<table><tr><th>时间</th><th>摇出的章句</th><th>评价</th></tr>{recent_rows}</table>
<h2>被摇最多的章句（Top 20）</h2>
<table><tr><th>章句id</th><th>原文</th><th>次数</th></tr>{top_rows}</table>
<p class="meta other">其他版本的后台：<a href="/one/stats">单词版后台</a> · <a href="/full/stats">全量版后台</a></p>
</body></html>"""


STATS_LINKS = {"三词版": "/stats", "单词版": "/one/stats", "全量版": "/full/stats"}

# 日课后台用：id → 原文前20字（从数据文件懒加载，避免启动时读 600KB）
QIAN_TEXT_CACHE = {}


def _qian_text(cid):
    if not QIAN_TEXT_CACHE:
        import re
        for i in (1, 2, 3):
            p = os.path.join(QIAN_BASE, f"data-qian-{i}.js")
            if not os.path.exists(p):
                continue
            with open(p, encoding="utf-8") as f:
                content = f.read()
            for m in re.finditer(r'"id":\s*(\d+)[\s\S]*?"text":\s*"([^"]{1,30})', content):
                QIAN_TEXT_CACHE[int(m.group(1))] = m.group(2)
    return QIAN_TEXT_CACHE.get(cid, "")


def _stats_page(feedback_file, suggestion_file, query_file, version_label):
    s = build_stats(feedback_file, suggestion_file, query_file)

    def fmt_ts(ts):
        return time.strftime("%m-%d %H:%M", time.localtime(ts)) if ts else ""

    RATING_LABELS = {"helpful": "帮到了", "partial": "帮到了一点", "not": "没帮到"}
    ACTION_LABELS = {"ask": "摇", "swap": "换"}

    record_rows = "".join(
        f"<tr><td class='ts'>{fmt_ts(r['ts'])}</td>"
        f"<td class='act'>{ACTION_LABELS.get(r['action'], r['action'])}</td>"
        f"<td>{' · '.join(r['words'])}</td>"
        f"<td>{r['chapterText']}<span class='src'>《{r['source']}》</span></td>"
        f"<td class='rt r-{r['rating']}'>{RATING_LABELS.get(r['rating'], '未评价')}</td></tr>"
        for r in reversed(s["records"])
    ) or "<tr><td colspan='5'>暂无数据</td></tr>"

    sg_rows = "".join(
        f"<li>{t}</li>" for t in reversed(s["suggestions"])
    ) or "<li>暂无建议</li>"

    rd = s["ratingDist"]
    if s["feedbackCount"]:
        rate = f" · 帮助率（帮到了及以上）{(rd['helpful'] + rd['partial']) / s['feedbackCount'] * 100:.0f}%"
    else:
        rate = ""
    rating_line = f"评价分布：帮到了 {rd['helpful']} · 帮到了一点 {rd['partial']} · 没帮到 {rd['not']}{rate}"

    html = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>时习 · 数据后台（{version_label}）</title>
<style>
body {{ font-family: "Songti SC","SimSun",serif; background:#f3ede1; color:#2b2118; max-width:720px; margin:0 auto; padding:36px 20px; }}
h1 {{ font-size:22px; letter-spacing:3px; }}
h2 {{ font-size:15px; margin-top:34px; letter-spacing:2px; color:#5a4f42; }}
table {{ width:100%; border-collapse:collapse; font-size:13.5px; background:#fbf7ee; }}
td, th {{ border:1px solid #d9cfba; padding:7px 12px; text-align:left; }}
th {{ font-size:13px; color:#5a4f42; }}
.ts {{ font-size:12px; color:#8b7f6d; white-space:nowrap; }}
.act {{ font-size:12.5px; color:#8b7f6d; white-space:nowrap; }}
.src {{ font-size:12px; color:#9e3b2c; margin-left:4px; white-space:nowrap; }}
.rt {{ font-size:12.5px; white-space:nowrap; }}
.r-helpful {{ color:#9e3b2c; font-weight:bold; }}
.r-partial {{ color:#c47a4e; }}
.r-not {{ color:#5a4f42; }}
.r-None {{ color:#b3a790; }}
ul {{ font-size:13.5px; line-height:2; padding-left:20px; }}
.meta {{ font-size:13px; color:#8b7f6d; }}
.rating-line {{ margin-top:-8px; }}
.other {{ margin-top:30px; font-size:13px; color:#8b7f6d; }}
</style></head><body>
<h1>时习 · 数据后台（{version_label}）</h1>
<p class="meta">累计摇一摇 {s['queryCount']} 次 · 收到评价 {s['feedbackCount']} 条 · 用户建议 {s['suggestionCount']} 条</p>
<p class="meta rating-line">{rating_line}</p>
<h2>摇一摇全量记录（词 → 章句 → 评价）</h2>
<table><tr><th>时间</th><th>操作</th><th>输入的词</th><th>摇出的章句</th><th>评价</th></tr>{record_rows}</table>
<h2>用户建议（最近50条）</h2>
<ul>{sg_rows}</ul>
<p class="other">其他版本的后台：{' · '.join(f'<a href="{u}">{n}后台</a>' for n, u in STATS_LINKS.items() if n != version_label)}</p>
</body></html>"""
    return html


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # threaded=True：三版并存，静态资源较大（全量版数据 ~600KB），避免单线程排队导致网关超时 502
    app.run(host="0.0.0.0", port=port, threaded=True)
