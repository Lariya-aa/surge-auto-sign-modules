import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sites = ["psnine", "linuxdo", "keylol", "gamer"];
const expectedMitm = {
  psnine: ["psnine.com", "www.psnine.com"],
  linuxdo: ["linux.do", "connect.linux.do"],
  keylol: ["keylol.com"],
  gamer: ["www.gamer.com.tw", "api.gamer.com.tw", "guild.gamer.com.tw", "ani.gamer.com.tw"]
};
const surgeCliCandidates = [
  process.env.SURGE_CLI,
  "/Applications/Surge.app/Contents/Applications/surge-cli",
  "surge-cli",
  "surge"
].filter(Boolean);
let failed = false;

function fail(message) {
  failed = true;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) fail(`${rel} missing`);
  else pass(`${rel} exists`);
}

function findSurgeCli() {
  for (const candidate of surgeCliCandidates) {
    try {
      execFileSync(candidate, ["--help"], { stdio: "pipe" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return "";
}

const surgeCli = findSurgeCli();
if (surgeCli) pass(`Surge CLI found: ${surgeCli}`);
else console.log("SKIP Surge CLI runtime checks: surge-cli not found");

for (const site of sites) {
  mustExist(`modules/${site}.sgmodule`);
  mustExist(`scripts/adapters/${site}.js`);
  mustExist(`scripts/dist/${site}.js`);

  const moduleText = fs.existsSync(path.join(root, `modules/${site}.sgmodule`))
    ? fs.readFileSync(path.join(root, `modules/${site}.sgmodule`), "utf8")
    : "";
  const scriptPaths = [...moduleText.matchAll(/script-path\s*=\s*([^,\s]+)/g)].map((m) => m[1].replace(/^\.\//, ""));
  if (!scriptPaths.length) fail(`modules/${site}.sgmodule has no script-path`);
  for (const scriptPath of scriptPaths) {
    if (/^https?:\/\//.test(scriptPath)) continue;
    if (!fs.existsSync(path.join(root, scriptPath))) fail(`${site} script-path not found: ${scriptPath}`);
    else pass(`${site} script-path resolves: ${scriptPath}`);
  }

  try {
    execFileSync("node", ["--check", path.join(root, `scripts/dist/${site}.js`)], { stdio: "pipe" });
    pass(`${site} dist syntax`);
  } catch (error) {
    fail(`${site} dist syntax: ${error.stderr?.toString() || error.message}`);
  }

  const distText = fs.readFileSync(path.join(root, `scripts/dist/${site}.js`), "utf8");
  if (!/\[MITM\]\s*hostname\s*=\s*%APPEND%/i.test(distText)) fail(`${site} dist missing MITM header`);
  for (const hostname of expectedMitm[site]) {
    if (!distText.includes(hostname)) fail(`${site} dist missing MITM hostname: ${hostname}`);
  }
  pass(`${site} dist MITM header checked`);

  if (surgeCli) {
    try {
      execFileSync(surgeCli, ["script", "evaluate", path.join(root, `scripts/dist/${site}.js`), "cron", "30"], { stdio: "pipe" });
      pass(`${site} Surge script evaluate`);
    } catch (error) {
      fail(`${site} Surge script evaluate: ${error.stderr?.toString() || error.message}`);
    }
  }
}

const linuxdoDist = fs.readFileSync(path.join(root, "scripts/dist/linuxdo.js"), "utf8");
const linuxdoModule = fs.readFileSync(path.join(root, "modules/linuxdo.sgmodule"), "utf8");
const linuxdoCaptureLine = linuxdoModule.split(/\r?\n/).find((line) => line.startsWith("Linux.do 抓包 =")) || "";
const linuxdoCapturePattern = (linuxdoCaptureLine.match(/pattern=([^,]+),/) || [])[1] || "";
if (!linuxdoCapturePattern) fail("linuxdo module capture pattern missing");
else {
  const pattern = new RegExp(linuxdoCapturePattern);
  if (!pattern.test("https://linux.do/?autosign_account=A")) fail("linuxdo capture pattern does not match documented account-A binding URL");
  if (pattern.test("https://linux.do/latest.json")) fail("linuxdo capture pattern is too broad and matches latest.json browsing API");
  pass("linuxdo capture pattern checked");
}
const forbidden = [
  /\/posts(?:\.json)?\b/i,
  /\breply\b/i,
  /create_post/i,
  /composer/i,
  /discourse-reactions/i,
  /随机点赞/i
];
for (const pattern of forbidden) {
  if (pattern.test(linuxdoDist)) fail(`linuxdo dist contains forbidden Linux.do automation surface: ${pattern}`);
}
pass("linuxdo automation denylist checked");

const testFiles = fs.readdirSync(path.join(root, "tests"))
  .filter((file) => /\.test\.js$/.test(file))
  .sort();
for (const testFile of testFiles) {
  try {
    execFileSync("node", [path.join(root, "tests", testFile)], { stdio: "inherit" });
    pass(`offline test ${testFile}`);
  } catch (error) {
    fail(`offline test ${testFile} failed: ${error.message}`);
  }
}

if (failed) process.exit(1);
console.log("All checks passed.");
