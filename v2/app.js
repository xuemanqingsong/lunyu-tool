// 时习·论语日课 · 情境版（v2）
// 依赖：data.js 定义 window.LUNYU_V2 = [{id, theme, scene, text, source, translation, insight, practice}]
"use strict";

const DATA = window.LUNYU_V2;
const BY_ID = {};
for (const c of DATA) BY_ID[c.id] = c;

const THEMES = ["工作", "家庭", "待人", "内心"];
const THEME_POOL = {};
for (const th of THEMES) THEME_POOL[th] = DATA.filter(c => c.theme.includes(th));

// 主题显示文案
const THEME_LABEL = { 工作: "工作", 家庭: "家庭", 待人: "待人", 内心: "内心" };

// ===== localStorage 键 =====
const K_DAY = "shixi_v2_day";     // {date, groups:[[4张卡],...], remaining, cur}
const K_WEEK = "shixi_v2_week";   // {week, ids: 已看过的情境id}
const K_STATS = "shixi_v2_stats"; // {date: {pv, draw, again, claim, feedback}}
const K_FEEDBACK = "shixi_v2_feedback"; // [{date, time, text, contact}]

// ===== 统计上报接口（占位）=====
// 纯静态站点无后端：本地先全量记录。如需远程汇总，填入一个接收 POST JSON 的端点
// （自建服务 / Formspree / Webhook 等），事件会以 {evt, date, ts} 形式 POST 过去。
const REPORT_ENDPOINT = ""; // 上线时决定是否填入

// ===== 日期工具 =====
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fmtDateLine() {
  const d = new Date();
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · " + wd;
}
function weekKey() {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - day + 3);
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return t.getFullYear() + "-W" + String(wk).padStart(2, "0");
}
function loadJSON(key, fb) { try { return JSON.parse(localStorage.getItem(key)) || fb; } catch (e) { return fb; } }
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

// ===== 抽组 =====
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pickGroup() {
  // 每主题各取 1 章，池内随机；每章从其情境切片里再随机取 1 条展示
  const group = THEMES.map(th => {
    const pool = THEME_POOL[th];
    const ch = pool[Math.floor(Math.random() * pool.length)];
    return { ch: ch, scene: pickOne(ch.scenes), theme: th };
  });
  // 打乱顺序（避免总是固定主题顺序）
  for (let i = group.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [group[i], group[j]] = [group[j], group[i]];
  }
  return group;
}

function getTodayDraw() {
  const rec = loadJSON(K_DAY, null);
  if (rec && rec.date === todayStr() && rec.groups && rec.groups.length >= 1) {
    // 兼容旧格式：{date, items, remaining} → groups
    if (!rec.groups) rec.groups = [rec.items];
    return rec;
  }
  return null;
}
function setTodayDraw(group) {
  // group: [{id, scene, theme}]；记住每组卡的章 id、展示的 scene 和主题池
  saveJSON(K_DAY, { date: todayStr(), groups: [group], remaining: 2, cur: 0 }); // 初始可再换 2 次
}

// 一周内不重复（记录已看过的情境 id）
function getWeekSeen() {
  const rec = loadJSON(K_WEEK, null);
  if (rec && rec.week === weekKey()) return rec.ids || [];
  return [];
}
function pushWeekSeen(id) {
  let ids = getWeekSeen();
  ids.push(id);
  if (ids.length > 20) ids = ids.slice(-20);
  saveJSON(K_WEEK, { week: weekKey(), ids: ids });
}

// ===== 渲染 =====
const $ = id => document.getElementById(id);
let currentGroup = [];
let currentGroupIdx = 0;

// 已抽过的组标签（第1组/第2组/…），可随时翻回
function renderGroupTabs() {
  const rec = getTodayDraw();
  const tabs = $("groupTabs");
  if (!rec || rec.groups.length <= 1) { tabs.innerHTML = ""; return; }
  tabs.innerHTML = "";
  rec.groups.forEach((g, i) => {
    const b = document.createElement("button");
    b.className = "group-tab" + (i === currentGroupIdx ? " active" : "");
    b.textContent = "第 " + (i + 1) + " 组";
    b.onclick = () => { currentGroupIdx = i; showGroupByIndex(i); };
    tabs.appendChild(b);
  });
}

function showGroupByIndex(idx) {
  const rec = getTodayDraw();
  if (!rec || !rec.groups[idx]) return;
  rec.cur = idx;
  saveJSON(K_DAY, rec);
  currentGroupIdx = idx;
  const group = rec.groups[idx]
    .map(it => ({ ch: BY_ID[it.id], scene: it.scene, theme: it.theme }))
    .filter(it => it.ch);
  showGroup(group);
}

function showGroup(group) {
  currentGroup = group;
  const cards = $("cards");
  cards.innerHTML = "";
  cards.classList.add("show");
  group.forEach((item, idx) => {
    const ch = item.ch;
    const div = document.createElement("div");
    div.className = "scene-card";
    div.innerHTML =
      '<div class="scene-text">' + item.scene + "</div>";
    div.onclick = () => openDetail(item, idx);
    cards.appendChild(div);
  });
  $("againRow").style.display = "inline-block";
  renderGroupTabs();
  updateAgainCount();
}

function openDetail(item, idx) {
  // 进入详情 = 认领了这个情境，记入本周
  const ch = item.ch;
  pushWeekSeen(ch.id);
  bumpStat("claim");
  $("drawView").style.display = "none";
  $("detailView").style.display = "block";
  $("sceneBanner").textContent = item.scene;
  currentScene = item.scene;
  $("chapterText").textContent = ch.text;
  $("chapterTranslation").textContent = ch.translation || "";
  $("chapterSource").textContent = "《论语 · " + ch.source + "》";
  $("insightText").textContent = ch.insight || "";
  // 今日行动从该章行动列表里随机展示 1 条
  $("practiceText").textContent = pickOne(ch.practices) || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("detailView").scrollIntoView({ block: "start" });
  currentDetail = ch;
}

function updateAgainCount() {
  const rec = getTodayDraw();
  if (rec) {
    const n = rec.remaining;
    $("againCount").textContent = n > 0 ? "还可以换 " + n + " 组" : "今天的组已用完，明天再来";
    $("againBtn").style.opacity = n > 0 ? 1 : 0.4;
  }
}

// ===== 抽组动作 =====
function draw() {
  let rec = getTodayDraw();
  let group;
  if (rec) {
    // 当日已有组——直接展示当前组（记住的 cur）
    currentGroupIdx = Math.min(rec.cur || 0, rec.groups.length - 1);
    group = rec.groups[currentGroupIdx]
      .map(it => ({ ch: BY_ID[it.id], scene: it.scene, theme: it.theme }))
      .filter(it => it.ch);
  } else {
    group = pickGroup();
    setTodayDraw(group.map(g => ({ id: g.ch.id, scene: g.scene, theme: g.theme })));
    bumpStat("draw");
  }
  showGroup(group);
}

function drawNew() {
  let rec = getTodayDraw();
  if (!rec || rec.remaining <= 0) return;
  rec.remaining -= 1;
  const group = pickGroup();
  rec.groups.push(group.map(g => ({ id: g.ch.id, scene: g.scene, theme: g.theme })));
  rec.cur = rec.groups.length - 1;
  currentGroupIdx = rec.cur;
  saveJSON(K_DAY, rec);
  bumpStat("again");
  showGroup(group);
  $("cards").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== 使用统计（本地 + 可选远程上报）=====
function bumpStat(key) {
  const stats = loadJSON(K_STATS, {});
  const t = todayStr();
  if (!stats[t]) stats[t] = { pv: 0, draw: 0, again: 0, claim: 0, feedback: 0 };
  stats[t][key] = (stats[t][key] || 0) + 1;
  // 只保留最近 60 天
  const keys = Object.keys(stats).sort();
  while (keys.length > 60) { delete stats[keys.shift()]; }
  saveJSON(K_STATS, stats);
  // 远程上报（可选）
  if (REPORT_ENDPOINT) {
    try {
      fetch(REPORT_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evt: key, date: t, ts: Date.now() }),
        keepalive: true
      });
    } catch (e) {}
  }
}

// ===== 分享卡（Canvas，复用 qian_v2 逻辑改造）=====
let currentDetail = null;
let currentScene = "";
const shareState = { fmt: "v", canvas: null };

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShareCard(fmt) {
  const W = 1080, H = fmt === "v" ? 1440 : 1080;
  const scale = fmt === "v" ? 1 : 0.96;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  grad.addColorStop(0, "#faf6ee");
  grad.addColorStop(0.55, "#f2ead8");
  grad.addColorStop(1, "#e8dcc4");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(138,122,92,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, W - 88, H - 88);

  const px = v => v * scale;
  const pad = fmt === "v" ? 88 : 72;
  const cur = currentDetail;

  // 顶部品牌 + 日期
  ctx.fillStyle = "#8a3d2b";
  ctx.font = "600 " + px(42) + "px 'PingFang SC', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("时  习", pad, pad + 8);
  ctx.fillStyle = "#8a7a5c";
  ctx.font = px(34) + "px 'PingFang SC', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(fmtDateLine(), W - pad, pad + 12);
  ctx.textAlign = "left";

  // 情境（顶部，小字）
  ctx.fillStyle = "#4a4030";
  ctx.font = px(36) + "px 'PingFang SC', sans-serif";
  const sceneLines = wrapText(ctx, currentScene, W - pad * 2 - 40, px(44));
  let y = pad + px(150);
  for (const ln of sceneLines) {
    ctx.fillText(ln, pad + 20, y);
    y += px(52);
  }

  // 句子（书法感：楷体，按句读断行）
  const raw = cur.text.replace(/[？?！!。；;，,]\s*$/, "");
  const parts = raw.split(/[，,；;]/).filter(Boolean);
  let lines = [];
  if (parts.length >= 2) {
    if (parts.length <= 4) lines = parts.map(s => s.replace(/^[、\s]+/, ""));
    else {
      const half = Math.ceil(parts.length / 2);
      lines = [parts.slice(0, half).join("，"), parts.slice(half).join("，")];
    }
  } else {
    if (raw.length > 12) {
      const mid = Math.ceil(raw.length / 2);
      lines = [raw.slice(0, mid), raw.slice(mid)];
    } else lines = [raw];
  }
  const maxLineLen = Math.max(...lines.map(l => l.length));
  let fontSize = fmt === "v" ? 122 : 104;
  const maxW = W - pad * 2 - 40;
  if (maxLineLen * fontSize * 1.05 > maxW) fontSize = Math.floor(maxW / (maxLineLen * 1.05));
  fontSize = Math.max(fontSize, 46);

  y += px(30);
  ctx.fillStyle = "#2a2318";
  ctx.font = fontSize + "px 'Kaiti SC', 'STKaiti', 'KaiTi', 'Songti SC', serif";
  ctx.textAlign = "center";
  const lineH = fontSize * 1.55;
  const textBlockH = lines.length * lineH;

  // 让句子块居中
  const availH = H - y - pad * 2 - px(150);
  y = y + Math.max(0, (availH - textBlockH - px(70)) / 2);

  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineH;
  }

  // 出处
  y += px(14);
  ctx.fillStyle = "#8a7a5c";
  ctx.font = px(fmt === "v" ? 46 : 42) + "px 'Songti SC', serif";
  ctx.fillText("——《论语 · " + cur.source + "》", W / 2, y);

  // 底部品牌区
  const by = H - pad - px(120);
  ctx.strokeStyle = "rgba(138,122,92,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad + px(60), by);
  ctx.lineTo(W - pad - px(60), by);
  ctx.stroke();
  ctx.fillStyle = "#8a7a5c";
  ctx.font = px(38) + "px 'PingFang SC', sans-serif";
  ctx.fillText("时习·论语日课 · 情境版", W / 2, by + px(14));
  ctx.fillStyle = "#b0a48c";
  ctx.font = px(34) + "px 'PingFang SC', sans-serif";
  ctx.fillText("抽一组情境 · 认领像你的那个", W / 2, by + px(78));

  return canvas;
}

function wrapText(ctx, text, maxW, lineH) {
  const chars = text.split("");
  const lines = [];
  let cur = "";
  for (const ch of chars) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function openShare() {
  $("shareOverlay").classList.add("show");
  renderShare("v");
}
function renderShare(fmt) {
  shareState.fmt = fmt;
  document.querySelectorAll(".share-tab").forEach(t => t.classList.toggle("active", t.dataset.fmt === fmt));
  const wrap = $("shareCanvasWrap");
  wrap.innerHTML = '<div class="gen-tip">生成中…</div>';
  setTimeout(() => {
    const canvas = drawShareCard(fmt);
    shareState.canvas = canvas;
    wrap.innerHTML = "";
    wrap.appendChild(canvas);
  }, 30);
}

// ===== 意见反馈 =====
function openFeedback() { $("fbOverlay").classList.add("show"); $("fbStatus").textContent = ""; }
function closeFeedback() { $("fbOverlay").classList.remove("show"); }
function submitFeedback() {
  const text = $("fbText").value.trim();
  if (!text) { $("fbStatus").textContent = "写点什么再提交吧。"; return; }
  const contact = $("fbContact").value.trim();
  const list = loadJSON(K_FEEDBACK, []);
  list.push({ date: todayStr(), time: new Date().toTimeString().slice(0, 5), text: text, contact: contact });
  if (list.length > 100) list.shift();
  saveJSON(K_FEEDBACK, list);
  bumpStat("feedback");
  $("fbText").value = ""; $("fbContact").value = "";
  $("fbStatus").textContent = "已收到，谢谢你的意见 🙏";
  // 可选远程上报反馈内容
  if (REPORT_ENDPOINT) {
    try {
      fetch(REPORT_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evt: "feedback", date: todayStr(), ts: Date.now(), text: text, contact: contact }),
        keepalive: true
      });
    } catch (e) {}
  }
}

// ===== 审核统计面板（URL 带 ?stats=1 时显示）=====
function showStatsPanel() {
  const stats = loadJSON(K_STATS, {});
  const fb = loadJSON(K_FEEDBACK, []);
  const days = Object.keys(stats).sort().slice(-14);
  let html = '<div class="stats-panel"><h4>使用统计（本地 · 仅审核用）</h4>';
  if (days.length === 0) html += "<p>暂无数据。</p>";
  else {
    html += "<table><tr><th>日期</th><th>访问</th><th>抽组</th><th>换组</th><th>认领</th><th>反馈</th></tr>";
    for (const d of days) {
      const s = stats[d] || {};
      html += "<tr><td>" + d + "</td><td>" + (s.pv || 0) + "</td><td>" + (s.draw || 0) + "</td><td>" + (s.again || 0) + "</td><td>" + (s.claim || 0) + "</td><td>" + (s.feedback || 0) + "</td></tr>";
    }
    html += "</table>";
  }
  if (fb.length > 0) {
    html += "<h4>意见反馈（" + fb.length + " 条）</h4>";
    for (const f of fb.slice(-10).reverse()) {
      html += '<div class="fb-item"><div class="fb-meta">' + f.date + " " + (f.time || "") + (f.contact ? " · " + f.contact : "") + "</div>" + f.text + "</div>";
    }
  }
  html += "</div>";
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  document.querySelector(".container").appendChild(wrap);
}

// ===== 事件绑定 =====
$("drawBtn").onclick = draw;
$("againBtn").onclick = drawNew;
$("backBtn").onclick = () => {
  $("detailView").style.display = "none";
  $("drawView").style.display = "block";
  window.scrollTo({ top: 0 });
};
$("helpBtn").onclick = () => $("helpOverlay").classList.add("show");
$("helpClose").onclick = () => $("helpOverlay").classList.remove("show");
$("helpOverlay").addEventListener("click", e => {
  if (e.target === $("helpOverlay")) $("helpOverlay").classList.remove("show");
});
$("shareBtn").onclick = openShare;
document.querySelectorAll(".share-tab").forEach(t => {
  t.onclick = () => renderShare(t.dataset.fmt);
});
$("shareClose").onclick = () => $("shareOverlay").classList.remove("show");
$("shareOverlay").addEventListener("click", e => {
  if (e.target === $("shareOverlay")) $("shareOverlay").classList.remove("show");
});
$("dlBtn").onclick = () => {
  if (!shareState.canvas) return;
  const a = document.createElement("a");
  a.download = "时习·论语日课情境版_" + todayStr() + (shareState.fmt === "v" ? "_竖版" : "_方形") + ".png";
  a.href = shareState.canvas.toDataURL("image/png");
  a.click();
};
$("feedbackBtn").onclick = openFeedback;
$("fbClose").onclick = closeFeedback;
$("fbOverlay").addEventListener("click", e => {
  if (e.target === $("fbOverlay")) closeFeedback();
});
$("fbSubmit").onclick = submitFeedback;

// ===== 初始化 =====
(function init() {
  $("dateLine").textContent = fmtDateLine();
  bumpStat("pv");
  const today = getTodayDraw();
  if (today) {
    draw(); // 当日已有组，直接展示
  }
  if (location.search.indexOf("stats") >= 0) showStatsPanel();
})();
