const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "scripts/dist/linuxdo.js"), "utf8");

function createSurrogate(store) {
  return {
    read(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    write(value, key) { store[key] = value; return true; }
  };
}

async function runCapture(store, url, cookie) {
  let notifications = [];
  await new Promise((resolve) => {
    const context = {
      console, setTimeout, Promise, Math, Date, String, Number, JSON, Object, Array, RegExp,
      $request: { url, headers: { Cookie: cookie } },
      $persistentStore: createSurrogate(store),
      $notification: { post(t, s, b) { notifications.push({ t, s, b }); } },
      $httpClient: {
        get(opts, callback) {
          callback(null, { status: 200, headers: {} }, JSON.stringify({ current_user: { username: "UserA" } }));
        },
        post(opts, callback) { callback(null, { status: 200, headers: {} }, ""); }
      },
      $done() { resolve(); }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(script, context, { filename: "dist/linuxdo.js" });
  });
  return notifications;
}

async function runCron(store, httpMocks) {
  let notifications = [];
  await new Promise((resolve) => {
    const context = {
      console, setTimeout, Promise, Math, Date, String, Number, JSON, Object, Array, RegExp,
      $persistentStore: createSurrogate(store),
      $notification: { post(t, s, b) { notifications.push({ t, s, b }); } },
      $httpClient: httpMocks || {
        get(opts, callback) { callback(null, { status: 200, headers: {} }, ""); },
        post(opts, callback) { callback(null, { status: 200, headers: {} }, ""); }
      },
      $done() { resolve(); }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(script, context, { filename: "dist/linuxdo.js" });
  });
  return notifications;
}

(async () => {
  // ============================================================
  // Scenario 1: Full sign flow — capture then cron
  // ============================================================
  console.log("=== Scenario 1: Full sign flow ===");
  {
    const store = {};

    // Capture account A
    const n1 = await runCapture(store, "https://linux.do/?autosign_account=A", "_t=tok-a; _forum_session=sess-a");
    assert.ok(n1.length > 0, "should notify on first capture");
    const accounts = JSON.parse(store["AutoSign.linuxdo.accounts"]);
    assert.equal(accounts.A.cookie, "_t=tok-a; _forum_session=sess-a");
    assert.equal(store["AutoSign.linuxdo.cookie"], undefined, "default key NOT written");
    console.log("  PASS: Account A captured to accounts map");

    // Cron runs with mock HTTP
    const httpMocks = {
      get(opts, callback) {
        const url = opts.url || "";
        const cookie = (opts.headers || {}).Cookie || "";
        if (url === "https://linux.do/") {
          // checkAuth: return valid login page
          callback(null, { status: 200, headers: {} },
            '<div id="current-user" data-user-card="UserA">avatar</div>');
        } else if (url.includes("latest.json")) {
          callback(null, { status: 200, headers: {} },
            JSON.stringify({ topic_list: { topics: [
              { id: 101, slug: "topic-1" },
              { id: 102, slug: "topic-2" },
              { id: 103, slug: "topic-3" }
            ] } }));
        } else if (url.includes("/t/")) {
          callback(null, { status: 200, headers: {} }, "<html>topic</html>");
        } else {
          callback(null, { status: 200, headers: {} }, "");
        }
      },
      post(opts, callback) { callback(null, { status: 200, headers: {} }, ""); }
    };
    const n2 = await runCron(store, httpMocks);
    const failMsg = n2.find(n => n.t.includes("失败") || (n.b && n.b.includes("未获取到")));
    assert.ok(!failMsg, "cron should NOT fail with missing cookie");
    console.log("  PASS: Cron found cookie from accounts map");
  }

  // ============================================================
  // Scenario 2: Chrome B browsing doesn't break Chrome A
  // ============================================================
  console.log("=== Scenario 2: Chrome B doesn't break A ===");
  {
    const store = {};

    // Chrome A captures with forced slot
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=tok-a; _forum_session=sess-a");

    // Chrome B browses normally (different cookie, no slot param)
    await runCapture(store, "https://linux.do/", "_t=tok-b; _forum_session=sess-b");

    // Account A should be intact
    const accounts = JSON.parse(store["AutoSign.linuxdo.accounts"]);
    assert.equal(accounts.A.cookie, "_t=tok-a; _forum_session=sess-a");
    assert.equal(store["AutoSign.linuxdo.cookie"], undefined);
    console.log("  PASS: Account A preserved after Chrome B browsing");

    // Cron should still use A's cookie
    let usedCookie = null;
    const httpMocks = {
      get(opts, callback) {
        if (opts.url === "https://linux.do/") {
          usedCookie = (opts.headers || {}).Cookie;
          callback(null, { status: 200, headers: {} },
            '<div id="current-user">ok</div>');
        } else if (opts.url.includes("latest.json")) {
          callback(null, { status: 200, headers: {} },
            JSON.stringify({ topic_list: { topics: [] } }));
        } else {
          callback(null, { status: 200, headers: {} }, "");
        }
      },
      post(opts, callback) { callback(null, { status: 200, headers: {} }, ""); }
    };
    await runCron(store, httpMocks);
    assert.equal(usedCookie, "_t=tok-a; _forum_session=sess-a", "cron uses A's cookie");
    console.log("  PASS: Cron uses Account A cookie, not B");
  }

  // ============================================================
  // Scenario 3: Duplicate cookie → no notification
  // ============================================================
  console.log("=== Scenario 3: Duplicate cookie ===");
  {
    const store = {};
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=tok-a");
    const n = await runCapture(store, "https://linux.do/?autosign_account=A", "_t=tok-a");
    assert.equal(n.length, 0, "no notification for same cookie");
    console.log("  PASS: No popup for duplicate capture");
  }

  // ============================================================
  // Scenario 4: Changed cookie → notification
  // ============================================================
  console.log("=== Scenario 4: Changed cookie ===");
  {
    const store = {};
    await runCapture(store, "https://linux.do/?autosign_account=A", "_t=old");
    const n = await runCapture(store, "https://linux.do/?autosign_account=A", "_t=new");
    assert.ok(n.length > 0, "should notify for changed cookie");
    const accounts = JSON.parse(store["AutoSign.linuxdo.accounts"]);
    assert.equal(accounts.A.cookie, "_t=new");
    console.log("  PASS: Cookie updated and notification sent");
  }

  // ============================================================
  // Scenario 5: Empty cookie → ignored
  // ============================================================
  console.log("=== Scenario 5: Empty cookie ===");
  {
    const store = {};
    const n = await runCapture(store, "https://linux.do/?autosign_account=A", "");
    assert.equal(n.length, 0);
    const accounts = JSON.parse(store["AutoSign.linuxdo.accounts"] || "{}");
    assert.deepEqual(accounts, {});
    console.log("  PASS: Empty cookie ignored");
  }

  console.log("\nAll end-to-end scenarios passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
