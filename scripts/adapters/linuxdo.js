(function(global) {
  var core = global.AutoSignCore;

  function topicUrlsFromLatest(jsonText) {
    try {
      var data = JSON.parse(jsonText);
      var topics = data.topic_list && data.topic_list.topics ? data.topic_list.topics : [];
      return topics.filter(function(t) { return t && t.id && t.slug; })
        .map(function(t) {
          return { id: String(t.id), url: "https://linux.do/t/" + t.slug + "/" + t.id };
        });
    } catch (e) {
      return [];
    }
  }

  function stableIdFromCookie(cookie) {
    var seed = (String(cookie || "").match(/(?:_t|_forum_session)=([^;]+)/) || [])[1] || String(cookie || "");
    var hash = 0;
    for (var i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    return "account-" + Math.abs(hash);
  }

  function cleanAccountId(value) {
    value = decodeURIComponent(String(value || "")).trim();
    value = value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
    return value || "";
  }

  function captureSlotFromUrl(ctx) {
    var url = (ctx.env.request && ctx.env.request.url) || "";
    var match = url.match(/[?&](?:autosign_account|autosign_slot|account|slot)=([^&#]+)/i);
    return match ? cleanAccountId(match[1]) : "";
  }

  function readAccounts(ctx) {
    var accounts = ctx.store.readJSON("accounts", {});
    if (!accounts || typeof accounts !== "object") accounts = {};
    if (!Object.keys(accounts).length && ctx.getCookie()) {
      accounts.default = { id: "default", label: "default", cookie: ctx.getCookie(), updatedAt: new Date().toISOString() };
    }
    return accounts;
  }

  function writeAccount(ctx, account) {
    var accounts = readAccounts(ctx);
    accounts[account.id] = account;
    ctx.store.writeJSON("accounts", accounts);
  }

  function identifyAccount(ctx, cookie) {
    var headers = ctx.headers(cookie, {
      "Accept": "application/json",
      "Referer": "https://linux.do/"
    });
    return ctx.http.get(ctx.env, "https://linux.do/session/current.json", headers, 0)
      .then(function(resp) {
        try {
          var data = JSON.parse(resp.body || "{}");
          var user = data.current_user || data.user || {};
          var username = user.username || user.name || "";
          if (username) return { id: username, label: username };
        } catch (e) {}
        return { id: stableIdFromCookie(cookie), label: "Linux.do " + stableIdFromCookie(cookie) };
      })
      .catch(function() {
        return { id: stableIdFromCookie(cookie), label: "Linux.do " + stableIdFromCookie(cookie) };
      });
  }

  function each(items, fn) {
    var out = [];
    function next(index) {
      if (index >= items.length) return Promise.resolve(out);
      return Promise.resolve(fn(items[index], index))
        .then(function(result) { out.push(result); })
        .then(function() { return next(index + 1); });
    }
    return next(0);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function browsingPlan(now) {
    now = now || new Date();
    var day = now.getDay();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var weekend = day === 0 || day === 6;
    var date = dateKey(now);

    if (!weekend && minutes >= 9 * 60 && minutes < 10 * 60) {
      return { active: true, id: date + ".weekday-morning", label: "工作日 09:00-10:00", count: 10, endsAt: 10 * 60 };
    }
    if (!weekend && minutes >= 13 * 60 && minutes < 15 * 60) {
      return { active: true, id: date + ".weekday-noon", label: "工作日 13:00-15:00", count: 15, endsAt: 15 * 60 };
    }
    if (!weekend && minutes >= 17 * 60 && minutes < 18 * 60) {
      return { active: true, id: date + ".weekday-evening", label: "工作日 17:00-18:00", count: 10, endsAt: 18 * 60 };
    }
    if (weekend && minutes >= 20 * 60 + 30 && minutes < 22 * 60) {
      return { active: true, id: date + ".weekend-night", label: "周末 20:30-22:00", count: 10, endsAt: 22 * 60 };
    }
    return { active: false, id: date + ".inactive", label: "非自动浏览时段", count: 0, endsAt: minutes };
  }

  function secondsUntilWindowEnd(plan) {
    var now = new Date();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var seconds = now.getSeconds();
    return Math.max(0, (plan.endsAt - minutes) * 60 - seconds);
  }

  function checkOne(ctx, account) {
    return ctx.http.get(ctx.env, "https://linux.do/", ctx.headers(account.cookie), 1)
      .then(function(resp) {
        var html = resp.body || "";
        var ok = resp.statusCode < 400 && /id=["']current-user["']|current-user|avatar|data-user-card/i.test(html);
        return {
          id: account.id,
          label: account.label || account.id,
          cookie: account.cookie,
          ok: ok,
          message: ok ? "登录态有效" : "未检测到登录态"
        };
      })
      .catch(function(err) {
        return {
          id: account.id,
          label: account.label || account.id,
          cookie: account.cookie,
          ok: false,
          message: err.message || String(err)
        };
      });
  }

  function browseAccountA(ctx, account, plan) {
    if (!plan.active) return Promise.resolve({ label: account.label, visited: 0, message: plan.label + "，不执行浏览" });

    var counter = ctx.safety.dailyCounter(ctx.store, "browse." + account.id + "." + plan.id, plan.count);
    if (!counter.canRun()) {
      return Promise.resolve({ label: account.label, visited: 0, message: plan.label + " 已完成 " + plan.count + " 次浏览" });
    }

    var remainingCount = plan.count - counter.count();
    var delayBudgetMs = Math.max(0, (secondsUntilWindowEnd(plan) - remainingCount * 8 - 30) * 1000);
    var randomDelayMs = delayBudgetMs > 0 ? ctx.safety.randomInt(0, delayBudgetMs) : 0;
    var visitedStateKey = "visited." + account.id + "." + plan.id;
    var visitedState = ctx.store.readJSON(visitedStateKey, []);
    if (!Array.isArray(visitedState)) visitedState = [];

    var headers = ctx.headers(account.cookie, {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": "https://linux.do/"
    });

    return ctx.sleep(randomDelayMs)
      .then(function() { return ctx.http.get(ctx.env, "https://linux.do/latest.json", headers, 1); })
      .then(function(resp) {
        var candidates = topicUrlsFromLatest(resp.body).filter(function(topic) {
          return visitedState.indexOf(topic.id) < 0;
        });
        var topics = ctx.safety.sample(candidates, remainingCount);
        var visited = 0;

        function visit(index) {
          if (index >= topics.length) return Promise.resolve();
          var topic = topics[index];
          return ctx.safety.jitter(1800, 5200)
            .then(function() {
              return ctx.http.get(ctx.env, topic.url, ctx.headers(account.cookie, { "Referer": "https://linux.do/" }), 0);
            })
            .then(function() {
              visited += 1;
              counter.commit(1);
              visitedState.push(topic.id);
              ctx.store.writeJSON(visitedStateKey, visitedState);
            })
            .then(function() { return visit(index + 1); });
        }

        return visit(0).then(function() {
          var delayText = randomDelayMs ? "随机延迟 " + Math.round(randomDelayMs / 1000) + " 秒后，" : "";
          return { label: account.label, visited: visited, message: plan.label + "，" + delayText + "浏览 " + visited + "/" + remainingCount + " 个不同帖子" };
        });
      })
      .catch(function(err) {
        return { label: account.label, visited: 0, message: plan.label + " 浏览失败：" + (err.message || err) };
      });
  }

  var site = {
    id: "linuxdo",
    name: "Linux.do",
    hosts: ["linux.do", "connect.linux.do"],
    usesCredentials: true,
    capture: function(ctx) {
      var cookie = ctx.getCookieFromRequest();
      if (!cookie) return { updated: false };
      var forcedSlot = captureSlotFromUrl(ctx);
      if (forcedSlot) {
        var existing = readAccounts(ctx)[forcedSlot];
        if (existing && existing.cookie === cookie) return { updated: false };
        writeAccount(ctx, {
          id: forcedSlot,
          label: forcedSlot,
          cookie: cookie,
          updatedAt: new Date().toISOString(),
          source: "forced-url-slot"
        });
        return { updated: true, message: "Linux.do Cookie 已保存到固定账号槽：" + forcedSlot };
      }
      var accounts = readAccounts(ctx);
      var accountKeys = Object.keys(accounts);
      if (accountKeys.length === 1 && accounts[accountKeys[0]].cookie === cookie) return { updated: false };
      return identifyAccount(ctx, cookie).then(function(info) {
        var existingAccount = accounts[info.id];
        if (existingAccount && existingAccount.cookie === cookie) return { updated: false };
        writeAccount(ctx, {
          id: info.id,
          label: info.label,
          cookie: cookie,
          updatedAt: new Date().toISOString()
        });
        return { updated: true, message: "Linux.do Cookie 已保存：" + info.label };
      });
    },
    checkAuth: function(ctx) {
      var accountsMap = readAccounts(ctx);
      var account = accountsMap.A || accountsMap.default;
      var accounts = account ? [account] : [];
      if (!accounts.length) return { ok: false, message: "未保存 Linux.do 账号 A Cookie。请在 Chrome A 访问 https://linux.do/?autosign_account=A" };
      return each(accounts, function(account) { return checkOne(ctx, account); })
        .then(function(results) {
          var valid = results.filter(function(r) { return r.ok; });
          return {
            ok: valid.length > 0,
            accounts: valid,
            allAccounts: results,
            cookie: valid.length ? valid[0].cookie : "",
            message: valid.length ? "账号 A 登录态有效" : "账号 A Cookie 失效"
          };
        });
    },
    sign: function(ctx, auth) {
      return {
        ok: true,
        accounts: auth.accounts || [],
        allAccounts: auth.allAccounts || [],
        cookie: auth.cookie || "",
        message: "Linux.do 账号 A 登录态检测完成；不执行点赞"
      };
    },
    browse: function(ctx, signResult) {
      var account = (signResult.accounts || [])[0];
      if (!account) return Promise.resolve({ ok: false, message: "账号 A 登录态无效，跳过浏览" });
      var plan = browsingPlan();
      return browseAccountA(ctx, account, plan).then(function(result) {
        return { ok: true, results: [result], message: result.label + "：" + result.message };
      });
    },
    summarize: function(ctx, result) {
      var sign = (result.sign && result.sign.message) || "";
      var browse = (result.browse && result.browse.message) || "";
      var invalid = ((result.sign && result.sign.allAccounts) || [])
        .filter(function(r) { return !r.ok; })
        .map(function(r) { return r.label + "：" + r.message; });
      ctx.notify("Linux.do 自动浏览完成", "", [sign, browse, invalid.length ? "失效账号\n" + invalid.join("\n") : ""].filter(Boolean).join("\n"));
    }
  };

  core.registerSite(site);
})(typeof globalThis !== "undefined" ? globalThis : this);
