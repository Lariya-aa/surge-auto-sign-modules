const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "scripts/dist/linuxdo.js"), "utf8");

async function runCapture(store, slot, cookie) {
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
        url: `https://linux.do/?autosign_account=${slot}`,
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
        post() {}
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
  return doneValue;
}

(async () => {
  const store = {};

  await runCapture(store, "A", "_t=token-a; _forum_session=session-a");
  await runCapture(store, "B", "_t=token-b; _forum_session=session-b");

  const accounts = JSON.parse(store["AutoSign.linuxdo.accounts"]);
  assert.equal(accounts.A.id, "A");
  assert.equal(accounts.A.label, "A");
  assert.equal(accounts.A.cookie, "_t=token-a; _forum_session=session-a");
  assert.equal(accounts.A.source, "forced-url-slot");

  assert.equal(accounts.B.id, "B");
  assert.equal(accounts.B.label, "B");
  assert.equal(accounts.B.cookie, "_t=token-b; _forum_session=session-b");
  assert.equal(accounts.B.source, "forced-url-slot");

  assert.equal(store["AutoSign.linuxdo.cookie"], "_t=token-b; _forum_session=session-b");

  console.log("linuxdo capture tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
