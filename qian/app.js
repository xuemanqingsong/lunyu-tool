// 时习 · 论语每日一签（/qian/）
// 依赖：data-qian-1/2/3.js 定义 window.LUNYU_QIAN_1/2/3（506 章全量）
"use strict";

const QIAN = [...window.LUNYU_QIAN_1, ...window.LUNYU_QIAN_2, ...window.LUNYU_QIAN_3];
const QIAN_BY_ID = {};
for (const c of QIAN) QIAN_BY_ID[c.id] = c;

// ===== localStorage 键 =====
const K_DAY = "shixi_qian_day";        // {date:"2026-09-08", id:123, revealed:bool}
const K_WEEK = "shixi_qian_week";      // {week:"2026-W37", ids:[...]}

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
  // ISO 周：周四所属周
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7; // 周一=0
  t.setDate(t.getDate() - day + 3); // 本周四
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return t.getFullYear() + "-W" + String(wk).padStart(2, "0");
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

// ===== 当日锁定 =====
function getTodayDraw() {
  const rec = loadJSON(K_DAY, null);
  if (rec && rec.date === todayStr() && QIAN_BY_ID[rec.id]) return rec;
  return null;
}
function setTodayDraw(id) {
  saveJSON(K_DAY, { date: todayStr(), id: id, revealed: false });
}

// ===== 一周不重复 =====
function getWeekIds() {
  const rec = loadJSON(K_WEEK, null);
  if (rec && rec.week === weekKey()) return rec.ids || [];
  return [];
}
function pushWeekId(id) {
  let ids = getWeekIds();
  ids.push(id);
  if (ids.length > 7) ids = ids.slice(ids.slice(-7)[0] === id ? 1 : 0); // 保最近7个
  saveJSON(K_WEEK, { week: weekKey(), ids: ids.slice(-7) });
}
function pickOne() {
  const weekIds = new Set(getWeekIds());
  let pool = QIAN.filter(c => !weekIds.has(c.id));
  if (!pool.length) pool = QIAN; // 一周7签对506池不可能耗尽，防御兜底
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ===== 渲染 =====
const $ = id => document.getElementById(id);
let current = null;

function showCard(id, revealed) {
  current = QIAN_BY_ID[id];
  $("card").classList.add("show");
  $("preShake").style.display = "none";
  $("chapterText").textContent = current.text;
  $("chapterTranslation").innerHTML = '<span class="t-label">现代汉语翻译</span>' + (current.translation || "");
  $("chapterSource").textContent = "《论语 · " + current.source + "》";
  $("clueText").textContent = current.clue_m;
  $("insightText").textContent = current.insight;
  $("practiceText").textContent = current.practice;
  $("reveal").classList.toggle("show", !!revealed);
  $("hintBtn").style.display = revealed ? "none" : "inline-block";
  updateWeek();
}

function markRevealed() {
  $("insightText").textContent = current.insight;
  $("practiceText").textContent = current.practice;
  $("reveal").classList.add("show");
  $("hintBtn").style.display = "none";
  const rec = loadJSON(K_DAY, null);
  if (rec && rec.date === todayStr()) { rec.revealed = true; saveJSON(K_DAY, rec); }
  setTimeout(() => $("reveal").scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

function updateWeek() {
  const ids = getWeekIds();
  const names = ids.map(id => QIAN_BY_ID[id] ? QIAN_BY_ID[id].text.slice(0, 6) : "").filter(Boolean);
  $("weekInfo").textContent = names.length ? "本周已签：" + names.join(" · ") : "";
}

// ===== 摇签 =====
function shake() {
  const btn = $("shakeBtn");
  document.body.classList.add("shaking");
  btn.textContent = "摇 签 中…";
  btn.disabled = true;
  setTimeout(() => {
    document.body.classList.remove("shaking");
    btn.textContent = "摇 一 签";
    btn.disabled = false;
    const id = pickOne();
    setTodayDraw(id);
    pushWeekId(id);
    showCard(id, false);
    if (window.__qianLog) window.__qianLog(id);
    setTimeout(() => $("card").scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, 600);
}

$("shakeBtn").onclick = shake;
$("hintBtn").onclick = markRevealed;

// ===== 分享卡（Canvas 生成，无外部依赖）=====
const shareState = { fmt: "v", canvas: null };

function drawShareCard(fmt) {
  // fmt: "v"=1080x1440 竖版, "s"=1080x1080 方形
  const W = fmt === "v" ? 1080 : 1080;
  const H = fmt === "v" ? 1440 : 1080;
  const scale = fmt === "v" ? 1 : 0.96;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 背景（渐变，与设计稿一致）
  const grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  grad.addColorStop(0, "#faf6ee");
  grad.addColorStop(0.55, "#f2ead8");
  grad.addColorStop(1, "#e8dcc4");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 细边框
  ctx.strokeStyle = "rgba(138,122,92,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, W - 88, H - 88);

  const px = v => v * scale;
  const pad = fmt === "v" ? 88 : 72;

  // 顶部品牌 + 日期
  ctx.fillStyle = "#8a3d2b";
  ctx.font = "600 " + px(30) + "px 'PingFang SC', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("时  习", pad, pad + 8);
  ctx.fillStyle = "#8a7a5c";
  ctx.font = px(26) + "px 'PingFang SC', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(fmtDateLine(), W - pad, pad + 12);
  ctx.textAlign = "left";

  // 句子（书法感：楷体，按句读断行）
  const raw = current.text.replace(/[？?！!。；;，,]\s*$/, "");
  const parts = raw.split(/[，,；;]/).filter(Boolean);
  let lines = [];
  if (parts.length >= 2) {
    // 按句读分行，行数控制在 2–4
    if (parts.length <= 4) lines = parts.map(s => s.replace(/^[、\s]+/, ""));
    else {
      // 多句合并成偶数行
      const half = Math.ceil(parts.length / 2);
      lines = [parts.slice(0, half).join("，"), parts.slice(half).join("，")];
    }
  } else {
    // 无句读：按字数切成不超过两行
    if (raw.length > 12) {
      const mid = Math.ceil(raw.length / 2);
      lines = [raw.slice(0, mid), raw.slice(mid)];
    } else lines = [raw];
  }
  const maxLineLen = Math.max(...lines.map(l => l.length));
  let fontSize = fmt === "v" ? 104 : 88;
  const maxW = W - pad * 2 - 40;
  if (maxLineLen * fontSize * 1.05 > maxW) fontSize = Math.floor(maxW / (maxLineLen * 1.05));
  fontSize = Math.max(fontSize, 40);

  ctx.fillStyle = "#2a2318";
  ctx.font = fontSize + "px 'Kaiti SC', 'STKaiti', 'KaiTi', 'Songti SC', serif";
  ctx.textAlign = "center";
  const lineH = fontSize * 1.55;
  const textBlockH = lines.length * lineH;

  // 布局：竖版居中偏上，方形更居中
  let y;
  const portraitImg = window.__kongziImg;
  const hasPortrait = portraitImg && portraitImg.complete && portraitImg.naturalWidth;
  const portraitH = hasPortrait ? px(fmt === "v" ? 220 : 185) : 0;
  const contentTop = pad + px(70) + (hasPortrait ? portraitH + px(40) : px(20));
  const contentH = textBlockH + px(70) + px(40); // 句子 + 出处 + 余量
  y = contentTop + Math.max(0, (H - pad * 2 - px(150) - contentTop - contentH) / 2);

  // 孔子像（有图才画；居中）
  if (hasPortrait) {
    const pw = portraitH * (portraitImg.naturalWidth / portraitImg.naturalHeight);
    if (pw <= W - pad * 2) {
      const px0 = (W - pw) / 2;
      ctx.save();
      _roundRect(ctx, px0, pad + px(70), pw, portraitH, px(16));
      ctx.clip();
      ctx.drawImage(portraitImg, px0, pad + px(70), pw, portraitH);
      ctx.restore();
    }
  }

  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineH;
  }

  // 出处
  y += px(14);
  ctx.fillStyle = "#8a7a5c";
  ctx.font = px(fmt === "v" ? 32 : 28) + "px 'Songti SC', serif";
  ctx.fillText("——《论语 · " + current.source + "》", W / 2, y);

  // 底部品牌区
  const by = H - pad - px(96);
  ctx.strokeStyle = "rgba(138,122,92,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad + px(60), by);
  ctx.lineTo(W - pad - px(60), by);
  ctx.stroke();
  ctx.fillStyle = "#8a7a5c";
  ctx.font = px(24) + "px 'PingFang SC', sans-serif";
  ctx.fillText("时习 · 论语每日一签", W / 2, by + px(22));
  ctx.fillStyle = "#b0a48c";
  ctx.font = px(20) + "px 'PingFang SC', sans-serif";
  ctx.fillText("一天一签 · 学而时习之", W / 2, by + px(56));

  return canvas;
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  // 让浮层先渲染再画（大 canvas 阻塞）
  setTimeout(() => {
    const canvas = drawShareCard(fmt);
    shareState.canvas = canvas;
    wrap.innerHTML = "";
    wrap.appendChild(canvas);
  }, 30);
}

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
  a.download = "时习每日一签_" + todayStr() + (shareState.fmt === "v" ? "_竖版" : "_方形") + ".png";
  a.href = shareState.canvas.toDataURL("image/png");
  a.click();
};

// ===== 使用说明 =====
$("helpBtn").onclick = () => $("helpOverlay").classList.add("show");
$("helpClose").onclick = () => $("helpOverlay").classList.remove("show");
$("helpOverlay").addEventListener("click", e => {
  if (e.target === $("helpOverlay")) $("helpOverlay").classList.remove("show");
});

// ===== 后台上报（可选：服务端不可用时静默）=====
window.__qianLog = function (id) {
  try {
    fetch("/qian/api/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId: id, chapterText: QIAN_BY_ID[id].text.slice(0, 100), source: QIAN_BY_ID[id].source })
    }).catch(() => {});
  } catch (e) {}
};

// ===== 初始化 =====
(function init() {
  $("dateLine").textContent = fmtDateLine();
  // 孔子像（号主另会话生成 kongzi.png 后自动启用，包括分享卡）
  const img = new Image();
  img.onload = () => { window.__kongziImg = img; };
  img.src = "kongzi.png";

  const today = getTodayDraw();
  if (today) {
    showCard(today.id, today.revealed);
  }
  // 未摇则停留在摇签界面；当天结束前重复打开都显示同一签
})();
