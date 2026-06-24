(function(global) {
  var core = global.AutoSignCore;

  function parseStats(html) {
    var compact = String(html || "").replace(/\s+/g, " ");
    return {
      points: core.parser.firstMatch(compact, /积分<\/em>\s*([0-9]+)/i) || core.parser.firstMatch(compact, /积分[^0-9]{0,12}([0-9]+)/i),
      hp: core.parser.firstMatch(compact, /体力<\/em>\s*([0-9]+)/i) || core.parser.firstMatch(compact, /体力[^0-9]{0,12}([0-9]+)/i),
      steam: core.parser.firstMatch(compact, /蒸汽<\/em>\s*([0-9]+)/i) || core.parser.firstMatch(compact, /蒸汽[^0-9]{0,12}([0-9]+)/i)
    };
  }

  var site = {
    id: "keylol",
    name: "Keylol",
    hosts: ["keylol.com"],
    capture: function(ctx) {
      var cookie = ctx.getCookieFromRequest();
      if (!cookie) return { updated: false };
      var saved = ctx.saveCookie(cookie);
      return { updated: saved, message: saved ? "Keylol Cookie 已保存" : "Keylol Cookie 未变化" };
    },
    checkAuth: function(ctx) {
      return ctx.http.get(ctx.env, "https://keylol.com/", ctx.headers(ctx.getCookie()), 1)
        .then(function(resp) {
          var html = resp.body || "";
          if (resp.statusCode >= 400) return { ok: false, message: "首页状态码 " + resp.statusCode };
          var loggedIn = /退出|登出|home\.php\?mod=spacecp/i.test(html);
          return { ok: loggedIn, html: html, message: loggedIn ? "" : "Cookie 可能已失效" };
        });
    },
    sign: function(ctx, auth) {
      var html = auth.html || "";
      var formhash = ctx.parser.formhash(html);
      var headers = ctx.headers(ctx.getCookie(), { "Referer": "https://keylol.com/" });

      var visitUrls = [
        "https://keylol.com/home.php?mod=space",
        "https://keylol.com/home.php?mod=spacecp&ac=credit"
      ];

      function visit(index) {
        if (index >= visitUrls.length) return Promise.resolve(html);
        return ctx.http.get(ctx.env, visitUrls[index] + (formhash ? "&formhash=" + encodeURIComponent(formhash) : ""), headers, 1)
          .then(function(resp) {
            if (resp.body && resp.body.length > html.length) html = resp.body;
            return ctx.safety.jitter(600, 1600).then(function() { return visit(index + 1); });
          });
      }

      return visit(0).then(function(finalHtml) {
        var stats = parseStats(finalHtml);
        var parts = [];
        if (stats.points) parts.push("积分 " + stats.points);
        if (stats.hp) parts.push("体力 " + stats.hp);
        if (stats.steam) parts.push("蒸汽 " + stats.steam);
        return {
          ok: true,
          message: parts.length ? "每日访问完成：" + parts.join(" / ") : "每日访问完成，未解析到积分字段"
        };
      });
    },
    summarize: function(ctx, result) {
      ctx.notify("Keylol 每日登录完成", "", (result.sign || {}).message || "任务结束");
    }
  };

  core.registerSite(site);
})(typeof globalThis !== "undefined" ? globalThis : this);
