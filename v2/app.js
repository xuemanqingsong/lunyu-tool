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
const K_FEEDBACK = "shixi_v2_feedback"; // [{date, time, text}]
const K_PICK = "shixi_v2_pick";   // {date, picks: {chapterId: {sceneIdx, practiceIdx}}}
const K_CHECKIN = "shixi_v2_checkin"; // {date, ids: [已打卡章节id]}
const K_HELPFUL = "shixi_v2_helpful"; // {date, result: {chapterId: "yes"|"no"}}
const K_UID = "shixi_v2_uid";     // 匿名访客标识（用于上报去重/统计 UV）

// ===== 统计上报接口 =====
// 腾讯云 CloudBase 云函数（云存储落盘），接收 POST JSON
// 事件以 {evt, uid, date, ts, extra} 形式 POST 过去
const REPORT_ENDPOINT = "https://lunyu-tool-d8g7ein3wdae230a9-1493747713.ap-shanghai.app.tcloudbase.com/report";

// ===== 匿名访客标识（本地生成一次，用于上报去重/UV）=====
function getUid() {
  let uid = loadJSON(K_UID, null);
  if (!uid) {
    uid = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    saveJSON(K_UID, uid);
  }
  return uid;
}

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
    const si = Math.floor(Math.random() * ch.scenes.length);
    return { ch: ch, scene: ch.scenes[si], sceneIdx: si, theme: th };
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
  // group: [{id, scene, sceneIdx, theme}]；记住每组卡的章 id、展示的 scene（含下标）和主题池
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
let currentSceneIdx = 0;
let currentChapter = null; // 当前详情页的章节对象
let currentScene = "";     // 当前详情页的情境文本

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
    .map(it => ({ ch: BY_ID[it.id], scene: it.scene, sceneIdx: it.sceneIdx, theme: it.theme }))
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

// 记录用户今天认领的情境下标与选中的行动下标（用于详情页回看时保持选择）
function getPicks() {
  const rec = loadJSON(K_PICK, null);
  if (rec && rec.date === todayStr() && rec.picks) return rec.picks;
  return {};
}
function savePick(chId, sceneIdx, practiceIdx) {
  const picks = getPicks();
  picks[chId] = { sceneIdx: sceneIdx, practiceIdx: practiceIdx };
  saveJSON(K_PICK, { date: todayStr(), picks: picks });
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
  currentSceneIdx = item.sceneIdx != null ? item.sceneIdx : (item.scene === ch.scenes[0] ? 0 : 0);
  $("chapterText").textContent = ch.text;
  $("chapterTranslation").textContent = ch.translation || "";
  $("chapterSource").textContent = "《论语 · " + ch.source + "》";
  $("insightText").textContent = ch.insight || "";
  renderPractices(ch, currentSceneIdx);
  currentChapter = ch;
  renderCheckin(ch.id);
  renderHelpful(ch.id);
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("detailView").scrollIntoView({ block: "start" });
}

// 今日行动：列出该章全部行动，用户自选（默认选中与认领情境同下标的那条）
function renderPractices(ch, sceneIdx) {
  const wrap = $("practiceList");
  wrap.innerHTML = "";
  const picks = getPicks();
  const prev = picks[ch.id];
  const practices = ch.practices || [];
  practices.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "practice-item";
    div.textContent = p;
    div.onclick = () => {
      // 点选即选中并记住
      wrap.querySelectorAll(".practice-item").forEach(x => x.classList.remove("selected"));
      div.classList.add("selected");
      savePick(ch.id, sceneIdx, i);
      bumpStat("pick");
    };
    // 默认选中：今天已选过则沿用，否则选中与认领情境同下标那条（若存在）
    const want = prev && prev.practiceIdx != null ? prev.practiceIdx : sceneIdx;
    if (i === want) div.classList.add("selected");
    wrap.appendChild(div);
  });
}

// ===== 打卡（今天做到了）=====
function getCheckins() {
  const rec = loadJSON(K_CHECKIN, null);
  if (rec && rec.date === todayStr()) return rec.ids || [];
  return [];
}
function renderCheckin(chId) {
  const btn = $("checkinBtn");
  const done = getCheckins().indexOf(chId) >= 0;
  btn.classList.toggle("done", done);
  btn.textContent = done ? "今天已打卡 ✓" : "今天我做到了 ✓";
}
function doCheckin() {
  const chId = currentChapter.id;
  const done = getCheckins().indexOf(chId) >= 0;
  if (done) return; // 当天一次
  const ids = getCheckins();
  ids.push(chId);
  saveJSON(K_CHECKIN, { date: todayStr(), ids: ids });
  bumpStat("checkin", { chapterId: chId });
  renderCheckin(chId);
}

// ===== 这章帮到你了吗 =====
function getHelpful() {
  const rec = loadJSON(K_HELPFUL, null);
  if (rec && rec.date === todayStr()) return rec.result || {};
  return {};
}
function renderHelpful(chId) {
  const result = getHelpful();
  const yes = $("helpfulYes"), no = $("helpfulNo");
  if (result[chId]) {
    // 已答过：高亮所选，隐藏"没帮到"按钮与标签（点完即消失不追问）
    yes.classList.toggle("chosen", result[chId] === "yes");
    no.classList.toggle("chosen", result[chId] === "no");
    yes.disabled = true;
    no.disabled = true;
    $("helpfulNo").style.display = result[chId] === "no" ? "inline-block" : "none";
    if (result[chId] === "yes") {
      $("helpfulYes").textContent = "已收到 ✓";
    }
  } else {
    yes.disabled = false;
    no.disabled = false;
    yes.classList.remove("chosen");
    no.classList.remove("chosen");
    yes.textContent = "帮到";
    no.style.display = "inline-block";
  }
}
function doHelpful(val) {
  const chId = currentChapter.id;
  const result = getHelpful();
  if (result[chId]) return; // 已答过
  result[chId] = val;
  saveJSON(K_HELPFUL, { date: todayStr(), result: result });
  bumpStat("helpful", { chapterId: chId, value: val });
  renderHelpful(chId);
}

function updateAgainCount() {
  const rec = getTodayDraw();
  if (rec) {
    const n = rec.remaining;
    $("againCount").textContent = n > 0 ? "还可以换 " + n + " 组" : "今天可抽选的情境已用完，明天再来";
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
      .map(it => ({ ch: BY_ID[it.id], scene: it.scene, sceneIdx: it.sceneIdx, theme: it.theme }))
      .filter(it => it.ch);
  } else {
    group = pickGroup();
    setTodayDraw(group.map(g => ({ id: g.ch.id, scene: g.scene, sceneIdx: g.sceneIdx, theme: g.theme })));
    bumpStat("draw");
  }
  showGroup(group);
}

function drawNew() {
  let rec = getTodayDraw();
  if (!rec || rec.remaining <= 0) return;
  rec.remaining -= 1;
  const group = pickGroup();
  rec.groups.push(group.map(g => ({ id: g.ch.id, scene: g.scene, sceneIdx: g.sceneIdx, theme: g.theme })));
  rec.cur = rec.groups.length - 1;
  currentGroupIdx = rec.cur;
  saveJSON(K_DAY, rec);
  bumpStat("again");
  showGroup(group);
  $("cards").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== 使用统计（本地 + 可选远程上报）=====
// extra: 可选的附加信息（如章节id、选项值），随上报透传
function bumpStat(key, extra) {
  const stats = loadJSON(K_STATS, {});
  const t = todayStr();
  if (!stats[t]) stats[t] = { pv: 0, draw: 0, again: 0, claim: 0, feedback: 0, pick: 0, checkin: 0, helpful: 0 };
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
        body: JSON.stringify({ evt: key, uid: getUid(), date: t, ts: Date.now(), extra: extra || null }),
        keepalive: true
      });
    } catch (e) {}
  }
}

// ===== 意见反馈 =====
function openFeedback() { $("fbOverlay").classList.add("show"); $("fbStatus").textContent = ""; }
function closeFeedback() { $("fbOverlay").classList.remove("show"); }
function submitFeedback() {
  const text = $("fbText").value.trim();
  if (!text) { $("fbStatus").textContent = "写点什么再提交吧。"; return; }
  const list = loadJSON(K_FEEDBACK, []);
  list.push({ date: todayStr(), time: new Date().toTimeString().slice(0, 5), text: text });
  if (list.length > 100) list.shift();
  saveJSON(K_FEEDBACK, list);
  bumpStat("feedback");
  $("fbText").value = "";
  $("fbStatus").textContent = "已收到，谢谢你的意见 🙏";
  // 可选远程上报反馈内容
  if (REPORT_ENDPOINT) {
    try {
      fetch(REPORT_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evt: "feedback", date: todayStr(), ts: Date.now(), text: text }),
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
    html += "<table><tr><th>日期</th><th>访问</th><th>抽组</th><th>换组</th><th>认领</th><th>选行动</th><th>打卡</th><th>帮到</th><th>反馈</th></tr>";
    for (const d of days) {
      const s = stats[d] || {};
      html += "<tr><td>" + d + "</td><td>" + (s.pv || 0) + "</td><td>" + (s.draw || 0) + "</td><td>" + (s.again || 0) + "</td><td>" + (s.claim || 0) + "</td><td>" + (s.pick || 0) + "</td><td>" + (s.checkin || 0) + "</td><td>" + (s.helpful || 0) + "</td><td>" + (s.feedback || 0) + "</td></tr>";
    }
    html += "</table>";
  }
  if (fb.length > 0) {
    html += "<h4>意见反馈（" + fb.length + " 条）</h4>";
    for (const f of fb.slice(-10).reverse()) {
      html += '<div class="fb-item"><div class="fb-meta">' + f.date + " " + (f.time || "") + "</div>" + f.text + "</div>";
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
$("feedbackBtn").onclick = openFeedback;
$("fbClose").onclick = closeFeedback;
$("fbOverlay").addEventListener("click", e => {
  if (e.target === $("fbOverlay")) closeFeedback();
});
$("fbSubmit").onclick = submitFeedback;
$("checkinBtn").onclick = doCheckin;
$("helpfulYes").onclick = () => doHelpful("yes");
$("helpfulNo").onclick = () => doHelpful("no");

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
