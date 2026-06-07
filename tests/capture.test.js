const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

async function loadScript(filename, store, requestUrl, requestCookie) {
  const script = fs.readFileSync(path.join(root, filename), "utf8");
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
        url: requestUrl || "",
        headers: { Cookie: requestCookie || "" }
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
        resolve();
      }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(script, context, { filename });
  });
  await done;
  return { doneValue, store, notifications };
}

(async () => {
  // Test gamer.js capture: saveCookie returns false for same cookie
  console.log("Test: gamer.js capture with same cookie");
  {
    const store = {};
    const r1 = await loadScript("scripts/dist/gamer.js", store,
      "https://www.gamer.com.tw/user/profile", "BAHA_COOKIE_123");
    assert.ok(r1.notifications.length > 0, "first capture should notify");
    assert.ok(store["AutoSign.gamer.cookie"], "cookie should be saved");

    const r2 = await loadScript("scripts/dist/gamer.js", store,
      "https://www.gamer.com.tw/user/profile", "BAHA_COOKIE_123");
    assert.equal(r2.notifications.length, 0, "same cookie should NOT notify");
    console.log("  PASS: gamer.js no popup for same cookie");
  }

  // Test gamer.js capture: different cookie triggers update
  console.log("Test: gamer.js capture with different cookie");
  {
    const store = {};
    store["AutoSign.gamer.cookie"] = "OLD_COOKIE";
    const r = await loadScript("scripts/dist/gamer.js", store,
      "https://www.gamer.com.tw/user/profile", "NEW_COOKIE");
    assert.ok(r.notifications.length > 0, "different cookie should notify");
    assert.equal(store["AutoSign.gamer.cookie"], "NEW_COOKIE");
    console.log("  PASS: gamer.js updated for different cookie");
  }

  // Test gamer.js capture: empty cookie → no notification
  console.log("Test: gamer.js capture with empty cookie");
  {
    const store = {};
    const r = await loadScript("scripts/dist/gamer.js", store,
      "https://www.gamer.com.tw/user/profile", "");
    assert.equal(r.notifications.length, 0, "empty cookie should NOT notify");
    console.log("  PASS: gamer.js ignores empty cookie");
  }

  // Test keylol.js capture: same cookie returns no notification
  console.log("Test: keylol.js capture with same cookie");
  {
    const store = {};
    store["AutoSign.keylol.cookie"] = "KEYLOL_COOKIE";
    const r = await loadScript("scripts/dist/keylol.js", store,
      "https://keylol.com/member.php?mod=logging&action=login", "KEYLOL_COOKIE");
    assert.equal(r.notifications.length, 0, "same cookie should NOT notify");
    console.log("  PASS: keylol.js no popup for same cookie");
  }

  // Test keylol.js capture: different cookie triggers update
  console.log("Test: keylol.js capture with different cookie");
  {
    const store = {};
    store["AutoSign.keylol.cookie"] = "OLD";
    const r = await loadScript("scripts/dist/keylol.js", store,
      "https://keylol.com/member.php?mod=logging&action=login", "NEW");
    assert.ok(r.notifications.length > 0, "different cookie should notify");
    assert.equal(store["AutoSign.keylol.cookie"], "NEW");
    console.log("  PASS: keylol.js updated for different cookie");
  }

  // Test psnine.js capture: same cookie returns no notification
  console.log("Test: psnine.js capture with same cookie");
  {
    const store = {};
    store["AutoSign.psnine.cookie"] = "PSNINE_COOKIE";
    const r = await loadScript("scripts/dist/psnine.js", store,
      "https://www.psnine.com/psnid/test_user", "PSNINE_COOKIE");
    assert.equal(r.notifications.length, 0, "same cookie should NOT notify");
    console.log("  PASS: psnine.js no popup for same cookie");
  }

  // Test psnine.js capture: different cookie triggers update
  console.log("Test: psnine.js capture with different cookie");
  {
    const store = {};
    store["AutoSign.psnine.cookie"] = "OLD";
    const r = await loadScript("scripts/dist/psnine.js", store,
      "https://www.psnine.com/psnid/test_user", "NEW");
    assert.ok(r.notifications.length > 0, "different cookie should notify");
    assert.equal(store["AutoSign.psnine.cookie"], "NEW");
    console.log("  PASS: psnine.js updated for different cookie");
  }

  // Test getCookie reads from accounts map (via linuxdo dist)
  console.log("Test: getCookie reads from accounts map");
  {
    const store = {};
    const r = await loadScript("scripts/dist/linuxdo.js", store,
      "https://linux.do/?autosign_account=A", "ACCOUNT_A_COOKIE");
    assert.ok(r.notifications.length > 0, "should notify on first capture");
    const accounts = JSON.parse(store["AutoSign.linuxdo.accounts"] || "{}");
    assert.equal(accounts.A.cookie, "ACCOUNT_A_COOKIE");
    // Default key should NOT be written
    assert.equal(store["AutoSign.linuxdo.cookie"], undefined);
    console.log("  PASS: getCookie reads from accounts map, default key not written");
  }

  console.log("All capture tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
