// 问津 · 三词论语 —— 检索层 + 页面逻辑
// 架构说明（静态原型）：
//   检索 = 口语词 → 激活规范「锚点」→ 与每章 tags 多级打分（直接命中 / 锚点命中 / 子串 / 文本）
//   生产环境可将此层替换为 embedding 语义检索（召回 top-K）+ LLM 精选与讲解生成，接口不变。

/* ============ 锚点变体表：口语词 → 激活锚点（单向，不互联） ============ */
const ANCHOR_VARS = {
  "学习": ["读书", "上学", "上课", "考证", "备考", "考试", "自学", "进修", "充电", "学东西", "看书"],
  "复习": ["温习", "学了就忘", "记不住", "巩固", "做笔记"],
  "思考": ["想太多", "胡思乱想", "琢磨", "想不清", "想不明白", "静下来想"],
  "内耗": ["精神内耗", "心累", "自我消耗", "消耗自己", "emo", "内耗严重"],
  "空想": ["光想不做", "想得多做得少", "只想不做", "空谈", "白日梦", "准备过度", "想东想西"],
  "焦虑": ["压力大", "压力", "紧张", "不安", "心慌", "崩溃", "烦躁", "担忧", "忧虑", "心烦", "忧郁", "丧", "失眠", "睡不着", "焦躁", "心神不宁", "心悸气短"],
  "迷茫": ["没有方向", "没方向", "找不到方向", "迷失", "困惑", "不知道怎么办", "不知道该干什么", "浑浑噩噩", "茫然", "没头绪", "前途"],
  "困境": ["窘境", "走投无路", "卡住", "瓶颈", "陷入"],
  "逆境": ["低谷期", "下坡", "寒冬", "水逆", "倒霉", "不顺", "难关", "煎熬", "坎", "碰壁", "坎坷"],
  "天赋": ["天分", "聪明", "资质", "悟性"],
  "努力": ["用功", "下功夫", "勤奋", "刻苦"],
  "年龄": ["年纪", "三十岁", "30岁", "35岁", "中年", "岁数", "变老", "老了", "年龄焦虑", "快三十", "奔三", "奔四", "50岁何去何从", "50岁再就业", "退休"],
  "意义": ["价值感", "存在感", "为什么活着", "活着为了什么", "虚无", "没意思", "无意义", "没有意义"],
  "行动": ["行动力", "执行力", "去做", "动手", "落地", "迈出", "干起来", "先做起来"],
  "勇气": ["害怕", "恐惧", "胆怯", "不敢", "畏缩", "怕", "怂", "退缩", "畏惧", "胆量", "畏难"],
  "后悔": ["懊悔", "悔恨", "悔不当初", "早知道", "追悔"],
  "过去": ["往事", "旧事", "从前", "以前", "回头看", "过去的事"],
  "放下": ["放不下", "放不开", "走不出来", "释怀", "放不下过去"],
  "选择": ["选择困难", "拿不定", "不知道怎么选", "选哪个", "抉择", "怎么选", "迷茫自己的选择"],
  "翻篇": ["翻不了篇", "重新开始", "过去式"],
  "攀比": ["比较", "同龄人", "别人家", "眼红", "同辈压力", "见不得别人好", "心理不平衡", "羡慕嫉妒", "互相比"],
  "贫穷": ["没钱", "穷", "缺钱", "手头紧", "拮据", "很穷"],
  "金钱": ["钱", "收入", "工资", "存款", "负债", "房贷", "车贷", "财务", "收费"],
  "物欲": ["物质欲望", "消费主义", "买买买", "剁手", "购物欲"],
  "转行": ["换工作", "跳槽", "换赛道", "换行业", "改行", "换方向"],
  "职业": ["工作", "事业", "饭碗", "行当", "本职"],
  "职场": ["上班", "打工", "办公室", "同事关系", "职业发展", "单位", "公司"],
  "失业": ["被裁", "裁员", "找工作", "待业", "被优化", "下岗", "降薪", "裸辞", "待岗", "失业了"],
  "拖延": ["拖延症", "懒", "不想动", "不想干", "懒得动", "明日复明日", "拖来拖去", "一拖再拖"],
  "放弃": ["想放弃", "撑不下去", "坚持不下去", "放弃吧", "放弃了", "撑不住"],
  "半途而废": ["有始无终", "烂尾", "三分钟热度", "三天打鱼"],
  "开始": ["第一步", "迈出第一步", "开头", "起步", "开个头", "迟迟不开始"],
  "自律": ["自控", "自我管理", "管不住自己", "自控力", "管不住"],
  "上瘾": ["沉迷", "戒不掉", "停不下来", "刷手机", "短视频", "游戏", "刷剧", "熬夜", "晚睡", "上头", "成瘾"],
  "孤独": ["孤单", "没朋友", "不合群", "独处", "寂寞", "一个人", "孤身", "落单"],
  "社交": ["社恐", "社交恐惧", "应酬", "聚会", "人脉", "饭局", "社交障碍", "破冰", "认识人"],
  "圈子": ["破圈", "融不进去", "圈子小", "圈子文化", "阶层"],
  "无效社交": ["泛泛之交", "酒肉朋友", "无效聚会", "吃喝局"],
  "情绪": ["脾气", "心情", "情绪化", "情绪管理", "心情不好", "上头", "失控"],
  "冲动": ["一时冲动", "脑子一热", "气头上", "怒"],
  "纠结": ["犹豫不决", "摇摆", "左右为难", "拿不定主意", "两难", "为难"],
  "犹豫": ["迟疑", "下不了决心", "优柔寡断", "想太多再想想", "迟迟不决"],
  "决策": ["决定", "拍板", "做决定", "怎么决定", "抉择"],
  "心态": ["想开", "看开", "心境", "平常心", "心理素质"],
  "抱怨": ["发牢骚", "怨天尤人", "怨气", "吐槽", "怨"],
  "内疚": ["愧疚", "亏欠", "过意不去", "对不起", "于心不安"],
  "自责": ["自我攻击", "自我否定", "怪自己", "自怨自艾"],
  "自省": ["自我反省", "反省", "检讨", "复盘"],
  "完美主义": ["较真", "细节控", "强迫", "吹毛求疵", "洁癖", "钻牛角尖"],
  "出身": ["起点", "家世", "原生家庭", "草根", "小镇做题家", "起点低"],
  "自卑": ["不配得感", "低自尊", "自惭形秽", "看不起自己", "不自信"],
  "自信": ["底气", "自信心", "自信不起来", "信心"],
  "面子": ["脸皮薄", "爱面子", "要面子", "不好意思", "抹不开面"],
  "讨好": ["老好人", "讨好型", "迎合", "委屈自己", "讨好型人格", "讨好别人"],
  "拒绝": ["不会拒绝", "说不", "开不了口", "拒绝别人", "不好意思拒绝"],
  "边界": ["分寸", "越界", "干涉", "多管闲事", "越俎代庖"],
  "比较": ["攀比心", "对比", "比较心", "比来比去"],
  "嫉妒": ["眼红", "羡慕嫉妒", "见不得别人好", "酸"],
  "记仇": ["记恨", "怀恨", "翻旧账", "记一辈子"],
  "原谅": ["宽恕", "和解", "不计前嫌", "谅解"],
  "沟通": ["说话", "表达", "聊天", "开口", "讲道理", "谈话", "谈心"],
  "被误解": ["委屈", "冤枉", "不被理解", "背锅", "被冤枉", "说不清", "没人理解", "被冷落", "被否定"],
  "失败": ["搞砸", "翻车", "输", "失利", "踩坑", "栽跟头", "失败感"],
  "挫折": ["打击", "磨难", "挫败"],
  "失望": ["灰心", "泄气", "寒心", "心凉", "白费"],
  "低谷": ["谷底", "下坡路", "低潮", "失意"],
  "急躁": ["着急", "急于求成", "心急", "浮躁", "求快", "走捷径", "速成", "暴富", "求快"],
  "耐心": ["沉住气", "稳住", "静待", "急不来"],
  "安逸": ["舒适", "躺平", "安于现状", "温水"],
  "舒适区": ["安全区", "温水煮青蛙", "待在舒适区"],
  "摆烂": ["破罐破摔", "烂泥", "摆了", "躺了"],
  "空虚": ["无聊", "闲得慌", "空心", "没劲", "提不起劲", "百无聊赖"],
  "坚持": ["毅力", "恒心", "撑住", "扛住", "长期"],
  "长期主义": ["慢慢来", "复利", "长期视角"],
  "远见": ["眼光", "前瞻", "看得远", "未雨绸缪", "深谋远虑"],
  "规划": ["计划", "布局", "安排", "人生规划", "做打算"],
  "风险": ["隐患", "危机", "不确定性", "突发"],
  "环境": ["氛围", "平台", "出身环境", "小城市", "大城市", "水土不服"],
  "习惯": ["习性", "惯性", "日常", "戒不掉的习惯"],
  "健康": ["身体", "体检", "养生", "锻炼", "健身", "熬夜伤身", "长寿"],
  "父母": ["爸妈", "家长", "母亲", "父亲", "家人", "双亲", "家里", "父母养老"],
  "家庭": ["家里", "家里人", "家人", "家人关系", "家庭关系", "母子关系"],
  "婚姻": ["结婚", "恐婚", "催婚", "逼婚", "相亲", "离婚", "分手", "感情", "恋爱", "夫妻", "伴侣", "对象", "脱单", "婆媳", "彩礼", "婚事", "另一半", "领证", "订婚", "感情问题", "结婚焦虑", "离异", "婚姻焦虑", "夫妻关系"],
  "独立": ["女性", "女人", "独立女性", "女性独立", "依附", "依靠男人", "靠男人", "自强", "自立", "大女主", "经济独立", "单身", "大龄", "剩女", "不婚", "不结婚", "一个人过", "靠自己", "嫁人", "婚育压力", "重男轻女"],
  "愧疚": ["愧对", "亏欠感", "不安"],
  "陪伴": ["相伴", "在一起", "常回家", "陪"],
  "远行": ["离家", "漂泊", "异乡", "北漂", "沪漂", "在外地", "远方"],
  "财富": ["财务", "财产", "有钱", "暴富", "发家"],
  "理想": ["梦想", "抱负", "初衷", "初心", "远方"],
  "朋友": ["友情", "挚友", "伙伴", "知己", "闺蜜", "兄弟", "好友"],
  "择友": ["交朋友", "交友", "怎么选朋友"],
  "信任": ["信不过", "可信", "信人", "托付"],
  "诚信": ["信用", "守信", "说话算话", "靠谱", "守约"],
  "承诺": ["答应", "许诺", "保证", "答应的事", "口头答应"],
  "兑现": ["履行", "说到做到", "办到"],
  "团队": ["集体", "队伍", "协作", "搭伙", "一起干"],
  "合作": ["共事", "联手", "合伙", "配合"],
  "分歧": ["不同意见", "意见不合", "争辩", "争论", "吵"],
  "冲突": ["吵架", "闹掰", "对立", "撕"],
  "识人": ["看人", "辨人", "判断人", "看走眼", "怎么看人"],
  "判断": ["鉴别", "分辨", "拿不准"],
  "从众": ["随大流", "跟风", "盲从", "跟别人一样"],
  "舆论": ["流言", "闲话", "舆论压力", "别人怎么说", "网暴"],
  "欲望": ["贪", "贪心", "贪念", "野心", "渴望", "想要的太多"],
  "诱惑": ["抵挡不住", "把持不住", "勾住"],
  "错误": ["过错", "失误", "做错", "犯错的"],
  "认错": ["道歉", "承认错误", "低头", "认栽"],
  "领导": ["当领导", "带人", "带团队", "管人", "管理者"],
  "管理": ["管人", "带新人", "带队"],
  "虚伪": ["虚假", "装", "两面派", "表面一套", "心口不一"],
  "识人2": [],
  "机会": ["机遇", "风口", "贵人", "机会来了"],
  "争取": ["抢", "主动争取", "要", "申请"],
  "得失": ["得失心", "输赢"],
  "改变": ["改变自己", "变", "求变", "转型", "突破自己"],
  "成长": ["进步", "变强", "提升", "精进", "自我提升", "突破", "长本事"],
  "时间": ["时间不够", "来不及", "浪费", "虚度", "光阴", "岁月", "时间管理", "没时间"],
  "珍惜": ["感恩", "宝贵", "宝贵的东西"],
  "当下": ["现在", "此刻", "眼前", "活在当下"],
  "快乐": ["开心", "幸福", "愉悦", "高兴", "乐趣", "快乐不起来"],
  "意义感2": [],
  "热爱": ["挚爱", "真爱", "喜欢"],
  "兴趣": ["爱好", "喜欢的事", "感兴趣"],
  "意义": ["有价值", "价值感", "没价值"],
  "接纳": ["接受", "认了", "既来之", "面对现实", "臣服"],
  "执念": ["钻进去", "想不开", "一根筋", "放不开", "我执"],
  "固执": ["顽固", "死板", "不听劝", "犟"],
  "开放": ["开放心态", "包容", "听得进", "听劝"],
  "成功": ["成就", "成绩", "赢", "成功人士"],
  "顺利": [],
  "努力2": [],
  "忍耐": ["忍耐一下"],
  "教育": ["子女教育"]
};
for (const k of Object.keys(ANCHOR_VARS)) if (ANCHOR_VARS[k].length === 0) delete ANCHOR_VARS[k];

/* ============ 匹配算法 ============ */
const DATA = [...window.LUNYU_PART_1, ...window.LUNYU_PART_2, ...window.LUNYU_PART_3];
const TAGSET = new Set();
DATA.forEach(c => c.tags.forEach(t => TAGSET.add(t)));

function anchorsOf(word) {
  const w = word.trim();
  const set = new Set();
  if (TAGSET.has(w)) set.add(w);
  for (const [anchor, vars] of Object.entries(ANCHOR_VARS)) {
    if (vars.includes(w)) set.add(anchor);
  }
  return set;
}

// 单个关键词对某章的得分与命中 tag 集
function keywordInfo(word, ch) {
  const w = word.trim();
  const as = anchorsOf(w);
  let score = 0;
  const hitTags = new Set();

  // 1) 直接命中 tag（输入词本身即规范词）
  if (ch.tags.includes(w)) { score = 12; hitTags.add(w); }

  // 2) 锚点命中
  for (const a of as) {
    if (ch.tags.includes(a)) {
      if (score < 8) score = 8;
      hitTags.add(a);
    }
  }

  // 3) 子串匹配（口语常为规范词的超串，如「想放弃」含「放弃」）
  if (score < 7 && w.length >= 2) {
    for (const t of ch.tags) {
      if (t.includes(w) || w.includes(t)) { score = 7; hitTags.add(t); }
    }
  }

  // 4) 原文 / 译文 / 场景包含
  if (score < 5 && w.length >= 2 &&
      (ch.text.includes(w) || ch.translation.includes(w) || ch.scene.includes(w))) {
    score = 5;
  }

  return { score, hitTags };
}

function rank(words) {
  const cleaned = words.map(w => (w || "").trim()).filter(Boolean);
  if (cleaned.length === 0) return [];
  return DATA.map(ch => {
    let total = 0;
    const unionTags = new Set();
    cleaned.forEach(w => {
      const { score, hitTags } = keywordInfo(w, ch);
      total += score;
      hitTags.forEach(t => unionTags.add(t));
    });
    // 唯一 tag 覆盖奖励：三个词覆盖越多样、越专精的章越优先
    return { ch, score: total + unionTags.size * 8 + Math.random() * 2 };
  })
    .filter(r => r.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

/* ============ 页面逻辑 ============ */
const $ = s => document.querySelector(s);
const exampleSets = [
  ["失业", "焦虑", "方向"],
  ["内耗", "行动", "拖延"],
  ["三十岁", "迷茫", "转行"],
  ["坚持", "想放弃", "半途而废"],
  ["没钱", "心态", "攀比"],
  ["孤独", "社交", "圈子"],
  ["被误解", "委屈", "沟通"],
  ["父母", "家庭", "愧疚"],
  ["失败", "低谷", "勇气"],
  ["选择", "犹豫", "两难"]
];

let lastRank = [];
let currentIdx = 0;
let lastQueryId = null;

function init() {
  const box = $("#examples");
  exampleSets.forEach(set => {
    const b = document.createElement("button");
    b.className = "ex-chip";
    b.textContent = set.join(" · ");
    b.onclick = () => fillAndAsk(set);
    box.appendChild(b);
  });
  $("#ask").onclick = ask;
  ["#kw1", "#kw2", "#kw3"].forEach(id => {
    $(id).addEventListener("keydown", e => { if (e.key === "Enter") ask(); });
  });
  $("#helpToggle").onclick = () => {
    const p = $("#helpPanel");
    p.hidden = !p.hidden;
    $("#helpToggle").classList.toggle("open", !p.hidden);
  };
}

function fillAndAsk(set) {
  set.forEach((w, i) => { $("#kw" + (i + 1)).value = w; });
  ask();
}

function ask() {
  const words = [$("#kw1").value, $("#kw2").value, $("#kw3").value];
  const cleaned = words.map(w => (w || "").trim()).filter(Boolean);
  if (cleaned.length === 0) {
    showToast("请至少输入一个关键词，或点一个示例");
    return;
  }
  lastRank = rank(cleaned);
  currentIdx = 0;
  if (lastRank.length === 0) {
    // 兜底：按迷茫/困境主题推荐
    lastRank = DATA.filter(ch =>
      ch.tags.includes("迷茫") || ch.tags.includes("困境") || ch.tags.includes("逆境")
    ).slice(0, 6).map(ch => ({ ch, score: 0 }));
  }
  renderResult(cleaned, true);
  // 后台记录：本次输入的词 → 摇出的章句（带 queryId 供评价关联）
  lastQueryId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queryId: lastQueryId,
      action: "ask",
      words: cleaned,
      chapterId: lastRank[0].ch.id,
      chapterText: lastRank[0].ch.text,
      source: lastRank[0].ch.source
    })
  }).catch(() => {});
  $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderResult(words, animate) {
  const entry = lastRank[currentIdx];
  if (!entry || !entry.ch) return;
  const { ch } = entry;
  const card = $("#result");
  card.hidden = false;
  const canSwap = lastRank.length > 1;
  card.innerHTML = `
    <div class="kw-recap">${words.map(w => `<span>${esc(w)}</span>`).join("")}</div>
    <div class="card main ${animate ? "pop" : ""}">
      <div class="chapter-text">${esc(ch.text)}</div>
      <div class="chapter-source">《论语 · ${esc(ch.source)}》</div>
      <div class="translation">${esc(ch.translation)}</div>
      <div class="scene">此刻的你 —— ${esc(ch.scene)}</div>
      <div class="insight">${esc(ch.insight)}</div>
      <div class="practice-title">今日一试</div>
      <div class="practices">
        ${ch.practice.map(p => `<div class="practice">${esc(p)}</div>`).join("")}
      </div>
      <div class="actions">
        <button id="swap" class="ghost">换一句${canSwap ? `（${currentIdx + 1}/${lastRank.length}）` : ""}</button>
        <button id="copy" class="ghost">复制卡片</button>
      </div>
      <div class="feedback">
        <p class="fb-q">这句帮到你了吗？请留下你的反馈</p>
        <div class="fb-btns">
          <button class="fb-btn" data-r="helpful">帮到了</button>
          <button class="fb-btn" data-r="partial">帮到了一点</button>
          <button class="fb-btn" data-r="not">没帮到</button>
        </div>
        <p class="fb-note">你的反馈能帮我们改进产品，从而帮助到更多的人。</p>
      </div>
      <div class="suggest">
        <p class="fb-q">你希望这个产品能对你有什么帮助？</p>
        <div class="sg-row">
          <input id="sg-input" type="text" maxlength="200" placeholder="写下来，我们真的会看">
          <button id="sg-send">提交</button>
        </div>
      </div>
    </div>
    ${altCards()}
  `;
  $("#swap").onclick = () => {
    if (!canSwap) {
      showToast("这句最贴你的词了，换个关键词再摇一次");
      return;
    }
    currentIdx = (currentIdx + 1) % lastRank.length;
    renderResult(words, false);
    // 后台记录：换一句操作
    const newCh = lastRank[currentIdx].ch;
    fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queryId: lastQueryId,
        action: "swap",
        words,
        chapterId: newCh.id,
        chapterText: newCh.text,
        source: newCh.source
      })
    }).catch(() => {});
  };
  $("#copy").onclick = () => copyCard(ch, words);
  card.querySelectorAll(".fb-btn").forEach(b => {
    b.onclick = () => sendFeedback(b.dataset.r, ch, words, card);
  });
  $("#sg-send").onclick = () => sendSuggestion();
  $("#sg-input").addEventListener("keydown", e => { if (e.key === "Enter") sendSuggestion(); });
  card.querySelectorAll(".alt").forEach(el => {
    el.onclick = () => {
      const id = +el.dataset.id;
      const idx = lastRank.findIndex(r => r.ch.id === id);
      if (idx >= 0) { currentIdx = idx; renderResult(words, false); }
    };
  });
}

function altCards() {
  const alts = lastRank.filter((_, i) => i !== currentIdx).slice(0, 2);
  if (alts.length === 0) return "";
  return `<div class="alts-title">另可参详</div>
    <div class="alts">${alts.map(a => `
      <div class="alt" data-id="${a.ch.id}">
        <div class="alt-text">${esc(a.ch.text)}</div>
        <div class="alt-src">《论语 · ${esc(a.ch.source)}》</div>
      </div>`).join("")}
    </div>`;
}

function sendFeedback(result, ch, words, card) {
  // 乐观更新 UI
  card.querySelectorAll(".fb-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.r === result);
    b.disabled = true;
  });
  const labels = { helpful: "帮到了", partial: "帮到了一点", not: "没帮到" };
  showToast(result === "not" ? "收到，下次换一句更准的" : "谢谢反馈，愿这句话陪你一程");

  fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queryId: lastQueryId,
      result,
      label: labels[result],
      chapterId: ch.id,
      chapterText: ch.text,
      words
    })
  }).catch(() => { /* 静态环境下静默降级 */ });
}

function sendSuggestion() {
  const input = $("#sg-input");
  const text = input.value.trim();
  if (!text) { showToast("先写点什么吧"); input.focus(); return; }

  fetch("/api/suggestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  }).catch(() => {});

  input.value = "";
  showToast("收到了，谢谢你愿意说");
}

function copyCard(ch, words) {
  const text =
`【论语锦囊摇一摇】
${words.join(" · ")}

「${ch.text}」
——《论语 · ${ch.source}》

白话：${ch.translation}

${ch.insight}

今日一试：
· ${ch.practice[0]}
· ${ch.practice[1]}`;
  navigator.clipboard.writeText(text).then(
    () => showToast("已复制，去分享吧"),
    () => showToast("复制失败，请手动选择文本")
  );
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function showToast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

if (typeof document !== "undefined") {
  init();
}
