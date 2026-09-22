// ============================================================================
// 时习·论语日课 · 情境版 —— 数据上报 Worker（Cloudflare Workers + KV）
// 阶段A 4.1 数据上报落地（方案1：Cloudflare Workers + KV，免费、无服务器）
//
// 部署方式（需号主 Cloudflare 账号，wrangler 部署）：
//   1. npm install -g wrangler 或 npx wrangler
//   2. wrangler login（号主浏览器授权一次）
//   3. wrangler kv namespace create EVENTS   → 得到 id，填入 wrangler.toml
//   4. wrangler deploy
// 部署后把生成的 https://xxx.workers.dev 地址填入前端 v2/app.js 的 REPORT_ENDPOINT
//
// 前端上报格式（v2/app.js bumpStat 已按此发送）：
//   POST /  {"evt":"pv|draw|again|claim|pick|checkin|helpful|feedback",
//            "uid":"u_xxx", "date":"2026-09-22", "ts":1699999999999, "extra":{...}}
//
// 号主看板（GET）：
//   GET /?report=1&from=2026-09-15&to=2026-09-22
//     → 按日聚合：pv/draw/again/claim/pick/checkin/helpful/feedback + 独立uid数
//   GET /?report=feedback&from=...&to=...
//     → 反馈文字列表
// ============================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const kv = env.EVENTS; // KV namespace，绑定名 EVENTS

    // ---------- 号主看板：GET ----------
    if (request.method === "GET") {
      const mode = url.searchParams.get("report");
      if (!mode) return new Response("OK", { status: 200 });

      const from = url.searchParams.get("from") || "1970-01-01";
      const to = url.searchParams.get("to") || "2099-12-31";

      // 反馈文字列表
      if (mode === "feedback") {
        const list = await kv.get("feedbacks", "json").catch(() => null) || [];
        const filtered = list.filter(f => f.date >= from && f.date <= to);
        return json({ ok: true, count: filtered.length, feedbacks: filtered });
      }

      // 按日聚合
      const days = {};
      const keys = await kv.list({ prefix: "day:" });
      for (const k of keys.keys) {
        const d = k.name.slice(4);
        if (d < from || d > to) continue;
        days[d] = await kv.get(k.name, "json");
      }
      return json({ ok: true, days });
    }

    // ---------- 事件写入：POST ----------
    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch (e) { return json({ ok: false, err: "bad json" }, 400); }
      const evt = String(body.evt || "");
      const uid = String(body.uid || "u_anon");
      const date = String(body.date || new Date().toISOString().slice(0, 10));
      const ts = Number(body.ts) || Date.now();
      const extra = body.extra || null;

      // 当日聚合
      const dayKey = "day:" + date;
      const day = await kv.get(dayKey, "json").catch(() => null) || {};
      day[evt] = (day[evt] || 0) + 1;
      // 独立访客去重（按日）
      const ukey = "uv:" + date;
      const uvSet = await kv.get(ukey, "json").catch(() => null) || [];
      if (uvSet.indexOf(uid) < 0) uvSet.push(uid);
      if (uvSet.length > 5000) uvSet.shift();
      day.uv = uvSet.length;
      await kv.put(dayKey, JSON.stringify(day));
      await kv.put(ukey, JSON.stringify(uvSet));

      // 反馈文字单独存（供看板读取）
      if (evt === "feedback" && extra && extra.text) {
        const list = await kv.get("feedbacks", "json").catch(() => null) || [];
        list.push({ date, ts, text: extra.text });
        if (list.length > 500) list.splice(0, list.length - 500); // 上限500条
        await kv.put("feedbacks", JSON.stringify(list));
      }

      return json({ ok: true });
    }

    return json({ ok: false, err: "method not allowed" }, 405);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
  });
}
