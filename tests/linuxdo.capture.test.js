const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "scripts/dist/linuxdo.js"), "utf8");
const moduleText = fs.readFileSync(path.join(root, "modules/linuxdo.sgmodule"), "utf8");

function linuxdoCapturePattern() {
  const line = moduleText.split(/\r?\n/).find((row) => row.startsWith("Linux.do 抓包 ="));
  assert.ok(line, "Linux.do capture script line should exist");
  const match = line.match(/pattern=([^,]+),/);
  assert.ok(match, "Linux.do capture line should include a pattern");
  return new RegExp(match[1]);
}

async function runCapture(store, url, cookie) {
  let notifications = [];
  let doneValue = null;
  const done = new Promise((resolve) => {
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
      RegExp,
      $request: {
        url: url,
        headers: {
          Cookie: cookie
        }
      },
      $persistentStore: {
        read(key) {
          return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        },
        write(value, key) {
          store[key] = value;
          return true;
        }
      },
      $notification: {
        post(title, subtitle, body) {
          notifications.push({ title, subtitle, body });
        }
      },
      $httpClient: {
        get(_opts, callback) {
          callback(null, { status: 200, headers: {} }, "{}");
        },
        post(_opts, callback) {
          callback(null, { status: 200, headers: {} }, "{}");
        }
      },
      $done(value) {
        doneValue = value || {};
        resolve(doneValue);
      }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(script, context, { filename: "scripts/dist/linuxdo.js" });
  });
  await done;
  return { doneValue, notifications };
}

function parseAccounts(store) {
  return JSON.parse(store["AutoSign.linuxdo.accounts"] || "{}");
}

(async () => {
  // Test 0: Surge module pattern must route the documented slot-binding URL to the script.
  console.log("Test 0: Module pattern matches slot-binding URL");
  {
    const pattern = linuxdoCapturePattern();
    assert.equal(pattern.test("https://linux.do/?autosign_account=A"), true);
    assert.equal(pattern.test("https://linux.do/session/current.json"), true);
    assert.equal(pattern.test("https://linux.do/latest.json"), false);
    console.log("  PASS: Module routes slot binding and auth pages without capturing latest.json");
  }

  // Test 1: Forced slot capture saves to accounts map
  console.log("Test 1: Forced slot capture");
  {
    const store = {};
    const { notifications } = await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a; _forum_session=session-a");
    const accounts = parseAccounts(store);
    assert.equal(accounts.A.id, "A");
    assert.equal(accounts.A.cookie, "_t=token-a; _forum_session=session-a");
    assert.equal(accounts.A.source, "forced-url-slot");
    assert.ok(notifications.length > 0, "should notify on first capture");
    // Default key should NOT be written (multi-account protection)
    assert.equal(store["AutoSign.linuxdo.cookie"], undefined);
    console.log("  PASS: Account A saved to accounts map, notification sent");
  }

  // Test 2: Same cookie to same slot → no notification
  console.log("Test 2: Same cookie, same slot");
  {
    const store = {};
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a; _forum_session=session-a");
    const { notifications } = await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a; _forum_session=session-a");
    assert.equal(notifications.length, 0, "should NOT notify for duplicate cookie");
    console.log("  PASS: No notification for duplicate cookie");
  }

  // Test 3: Different cookie to same slot → notification
  console.log("Test 3: Different cookie, same slot");
  {
    const store = {};
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a; _forum_session=session-a");
    const { notifications } = await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a-new; _forum_session=session-a-new");
    assert.ok(notifications.length > 0, "should notify for changed cookie");
    const accounts = parseAccounts(store);
    assert.equal(accounts.A.cookie, "_t=token-a-new; _forum_session=session-a-new");
    console.log("  PASS: Updated cookie for existing slot, notification sent");
  }

  // Test 4: Two different slots are independent
  console.log("Test 4: Two independent slots");
  {
    const store = {};
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a; _forum_session=session-a");
    await runCapture(store, "https://linux.do/?autosign_account=B", "_t=token-b; _forum_session=session-b");
    const accounts = parseAccounts(store);
    assert.equal(accounts.A.cookie, "_t=token-a; _forum_session=session-a");
    assert.equal(accounts.B.cookie, "_t=token-b; _forum_session=session-b");
    console.log("  PASS: Accounts A and B stored independently");
  }

  // Test 5: Normal browsing (no slot param) doesn't overwrite named accounts
  console.log("Test 5: Normal browsing doesn't overwrite named accounts");
  {
    const store = {};
    // First capture account A via forced slot
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a; _forum_session=session-a");
    // Simulate normal browsing with account B's cookie (no slot param)
    await runCapture(store, "https://linux.do/", "_t=token-b; _forum_session=session-b");
    const accounts = parseAccounts(store);
    // Account A should still be intact
    assert.equal(accounts.A.cookie, "_t=token-a; _forum_session=session-a");
    // Default key should NOT be overwritten
    assert.equal(store["AutoSign.linuxdo.cookie"], undefined);
    console.log("  PASS: Account A preserved after normal browsing");
  }

  // Test 6: Cookie available in accounts map for sign flow
  console.log("Test 6: Cookie in accounts map");
  {
    const store = {};
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=token-a; _forum_session=session-a");
    const accounts = parseAccounts(store);
    assert.ok(accounts.A.cookie.includes("token-a"));
    console.log("  PASS: Cookie available in accounts map");
  }

  // Test 7: Empty cookie returns false
  console.log("Test 7: Empty cookie");
  {
    const store = {};
    const { notifications } = await runCapture(store, "https://linux.do/?autosign_account=A", "");
    assert.equal(notifications.length, 0, "should NOT notify for empty cookie");
    const accounts = parseAccounts(store);
    assert.deepEqual(accounts, {});
    console.log("  PASS: Empty cookie ignored");
  }

  console.log("All linuxdo capture tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
