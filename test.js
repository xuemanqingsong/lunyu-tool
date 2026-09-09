// 测试脚本：拼接数据与算法，验证匹配质量
const fs = require("fs");
global.window = {};

const code = [
  fs.readFileSync("data-1.js", "utf8"),
  fs.readFileSync("data-2.js", "utf8"),
  fs.readFileSync("data-3.js", "utf8"),
  fs.readFileSync("app.js", "utf8"),
  "module.exports = { SYNONYMS, DATA, rank };"
].join("\n");
fs.writeFileSync("_bundle.js", code);

const { DATA, rank } = require("./_bundle.js");

console.log("章节数:", DATA.length);

const cases = [
  { words: ["失业", "焦虑", "方向"], expect: [66, 50, 67] },
  { words: ["内耗", "行动", "拖延"], expect: [36, 3, 32] },
  { words: ["三十岁", "迷茫", "转行"], expect: [15, 95, 28] },
  { words: ["没钱", "心态", "攀比"], expect: [48, 49, 59] },
  { words: ["孤独", "社交", "圈子"], expect: [69, 71, 70] },
  { words: ["父母", "家庭", "愧疚"], expect: [93, 92, 94] },
  { words: ["失败", "低谷", "勇气"], expect: [46, 37, 21] },
  { words: ["选择", "犹豫", "两难"], expect: [102, 26, 91] },
  { words: ["坚持", "想放弃", "半途而废"], expect: [31, 32, 13] },
  { words: ["熬夜", "自律", "刷手机"], expect: [79, 80, 30] },
  { words: ["讨好", "不会拒绝", "老好人"], expect: [84, 68, 61] },
  { words: ["后悔", "过去", "放不下"], expect: [23, 24, 74] },
];

let pass = 0;
for (const c of cases) {
  const r = rank(c.words);
  const top = r[0] ? r[0].ch.id : null;
  const top3 = r.slice(0, 3).map(x => x.ch.id);
  const hit = c.expect.includes(top);
  const inTop3 = top3.some(t => c.expect.includes(t));
  if (hit) pass++;
  console.log(
    (hit ? "✓" : (inTop3 ? "△" : "✗")) + " [" + c.words.join(" ") + "] → top3:",
    top3.join(","),
    r[0] ? "(主推:" + r[0].ch.text.slice(0, 14) + "…)" : "(无命中)"
  );
}
console.log("主推命中:", pass + "/" + cases.length);

// 边界测试
console.log("空输入:", JSON.stringify(rank(["", "", ""])));
console.log("单词「学习」命中数:", rank(["学习"]).length);
console.log("乱词「量子速读霓虹」:", rank(["量子", "速读", "霓虹"]).length === 0 ? "兜底触发✓" : "有误命中");

// 数据完整性：每章字段齐全
let bad = 0;
for (const ch of DATA) {
  for (const k of ["id", "text", "source", "translation", "tags", "scene", "insight", "practice"]) {
    if (!ch[k] || (Array.isArray(ch[k]) && ch[k].length === 0)) { console.log("缺失字段:", ch.id, k); bad++; }
  }
  if (ch.practice.length !== 2) { console.log("实践条数异常:", ch.id); bad++; }
  if (ch.insight.length < 60) { console.log("讲解过短:", ch.id); bad++; }
}
const ids = DATA.map(c => c.id);
console.log("ID唯一:", new Set(ids).size === ids.length ? "✓" : "✗ 有重复");
console.log("数据完整性:", bad === 0 ? "✓ 全部通过" : "存在 " + bad + " 处问题");
