(function(global) {
  var core = global.AutoSignCore || (global.AutoSignCore = {});
  core.sites = core.sites || {};

  function getCookieFromRequest(env) {
    var headers = (env.request && env.request.headers) || {};
    return headers.Cookie || headers.cookie || "";
  }

  function baseHeaders(cookie, extra) {
    var headers = {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    };
    if (cookie) headers.Cookie = cookie;
    for (var k in (extra || {})) headers[k] = extra[k];
    return headers;
  }

  function buildContext(site) {
    var env = core.createEnv(site.name);
    var store = core.createStore(env, site.id);
    return {
      env: env,
      site: site,
      store: store,
      http: core.http,
      parser: core.parser,
      safety: core.safety,
      sleep: core.sleep,
      getCookieFromRequest: function() { return getCookieFromRequest(env); },
      getCookie: function() {
        if (typeof store.readJSON === "function") {
          var accounts = store.readJSON("accounts", {});
          var keys = Object.keys(accounts || {});
          if (keys.length) return accounts[keys[0]].cookie || "";
        }
        return store.read("cookie") || "";
      },
      saveCookie: function(cookie) {
        if (!cookie) return false;
        var old = store.read("cookie") || "";
        if (old !== cookie) {
          store.write("cookie", cookie);
          return true;
        }
        return false;
      },
      headers: baseHeaders,
      notify: function(title, subtitle, body) { env.notify(title, subtitle, body); },
      finish: function(value) { env.done(value || {}); }
    };
  }

  function registerSite(site) {
    core.sites[site.id] = site;
  }

  function run(site) {
    var ctx = buildContext(site);
    var env = ctx.env;

    function fail(title, err) {
      var msg = err && (err.message || err.error || String(err));
      env.log("failed:", msg || "unknown");
      ctx.notify(site.name + " 任务失败", title || "", msg || "未知错误");
      ctx.finish({});
    }

    if (env.isRequest) {
      Promise.resolve(site.capture ? site.capture(ctx) : null)
        .then(function(result) {
          if (result && result.updated) ctx.notify(site.name, "Cookie 已更新", result.message || "后续将用于自动任务");
          ctx.finish({});
        })
        .catch(function(err) { fail("抓包失败", err); });
      return;
    }

    Promise.resolve()
      .then(function() {
        if (!ctx.getCookie() && !site.usesCredentials) {
          throw new Error("未获取到 Cookie，请先访问 " + site.name + " 触发抓包");
        }
      })
      .then(function() { return site.checkAuth ? site.checkAuth(ctx) : { ok: true }; })
      .then(function(auth) {
        if (auth && auth.ok === false) throw new Error(auth.message || "登录态失效");
        return site.sign ? site.sign(ctx, auth || {}) : { ok: true, message: "无签到步骤" };
      })
      .then(function(signResult) {
        if (site.browse) return site.browse(ctx, signResult || {}).then(function(browseResult) {
          return { sign: signResult, browse: browseResult };
        });
        return { sign: signResult };
      })
      .then(function(result) {
        if (site.summarize) return site.summarize(ctx, result);
        var sign = result.sign || {};
        ctx.notify(site.name + " 完成", "", sign.message || "任务执行完成");
      })
      .then(function() { ctx.finish({}); })
      .catch(function(err) { fail("", err); });
  }

  core.registerSite = registerSite;
  core.run = run;
  core.runRegistered = function(id) {
    var keys = Object.keys(core.sites);
    var site = id ? core.sites[id] : core.sites[keys[0]];
    if (!site) throw new Error("No site registered");
    run(site);
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
