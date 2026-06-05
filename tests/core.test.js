const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = {
  console,
  setTimeout,
  Promise,
  Math,
  Date,
  String,
  Number,
  JSON,
  Object,
  Array,
  RegExp
};
context.globalThis = context;
vm.createContext(context);

for (const file of ["scripts/core/safety.js", "scripts/core/parser.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const { parser, safety } = context.AutoSignCore;

assert.equal(parser.formhash('<input type="hidden" name="formhash" value="abc123">'), "abc123");
const link = parser.links('<a href="/daily"> 签到 </a>', "https://example.com")[0];
assert.equal(link.href, "https://example.com/daily");
assert.equal(link.text, "签到");
assert.equal(parser.decodeEntities("a&amp;b&lt;c&gt;"), "a&b<c>");

const mem = {};
const store = {
  readJSON(name, fallback) {
    return mem[name] || fallback;
  },
  writeJSON(name, value) {
    mem[name] = value;
  }
};
const counter = safety.dailyCounter(store, "like", 2);
assert.equal(counter.canRun(), true);
counter.commit();
counter.commit();
assert.equal(counter.canRun(), false);

console.log("core tests passed");
