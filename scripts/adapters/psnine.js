(function(global) {
  var core = global.AutoSignCore;

  function findSignUrl(html) {
    var links = core.parser.links(html, "https://www.psnine.com");
    for (var i = 0; i < links.length; i++) {
      var text = links[i].text || "";
      var href = links[i].href || "";
      if (/签到|簽到/i.test(text) && /\/(sign|qiandao|check|daily|ajax|user)/i.test(href) && !/\/(sign\/(?:out|in)|logout)/i.test(href)) {
        return href;
      }
    }
    return core.parser.firstMatch(html, /["']([^"']*(?:qiandao|checkin|daily)[^"']*)["']/i);
  }

  var site = {
    id: "psnine",
    name: "PSNINE",
    hosts: ["www.psnine.com", "psnine.com"],
    capture: function(ctx) {
      var cookie = ctx.getCookieFromRequest();
      if (!cookie) return { updated: false };
      var saved = ctx.saveCookie(cookie);
      return { updated: saved, message: saved ? "PSNINE Cookie 已保存" : "PSNINE Cookie 未变化" };
    },
    checkAuth: function(ctx) {
      return ctx.http.get(ctx.env, "https://www.psnine.com/", ctx.headers(ctx.getCookie()), 1)
        .then(function(resp) {
          var html = resp.body || "";
          if (resp.statusCode >= 400) return { ok: false, message: "首页状态码 " + resp.statusCode };
          if (/登录|登入|注册|加入PSNINE/i.test(html) && !/退出|消息|个人|铜币|金币|我的/i.test(html)) {
            return { ok: false, message: "Cookie 可能已失效" };
          }
          return { ok: true, html: html };
        });
    },
    sign: function(ctx, auth) {
      var html = auth.html || "";
      if (/已签到|已簽到|今日.*已.*签|今天.*签/i.test(html)) {
        return { ok: true, already: true, message: "今日已签到" };
      }

      var signUrl = findSignUrl(html);
      var formhash = ctx.parser.formhash(html);
      if (!signUrl) {
        return { ok: false, message: "未找到签到入口，可能需要更新 PSNINE adapter" };
      }
      if (signUrl.indexOf("http") !== 0) signUrl = "https://www.psnine.com" + (signUrl.charAt(0) === "/" ? "" : "/") + signUrl;

      var headers = ctx.headers(ctx.getCookie(), {
        "Referer": "https://www.psnine.com/",
        "X-Requested-With": "XMLHttpRequest"
      });
      var method = /formhash|token|ajax|sign/i.test(signUrl) ? "POST" : "GET";
      var body = formhash ? "formhash=" + encodeURIComponent(formhash) : "";
      var req = method === "POST"
        ? ctx.http.post(ctx.env, signUrl, headers, body, 1)
        : ctx.http.get(ctx.env, signUrl, headers, 1);
      return req.then(function(resp) {
        var text = resp.body || "";
        if (resp.statusCode >= 400) return { ok: false, message: "签到请求状态码 " + resp.statusCode };
        if (/失败|错误|error|未登录|請先|请先/i.test(text)) {
          return { ok: false, message: ctx.parser.firstMatch(text, /(?:msg|message)["']?\s*[:=]\s*["']([^"']+)/i, "签到返回失败") };
        }
        var coin = ctx.parser.firstMatch(text + html, /(\d+)\s*(?:铜币|銅幣|金币|積分|积分)/i);
        return { ok: true, message: coin ? "签到完成，当前数值 " + coin : "签到请求完成" };
      });
    },
    summarize: function(ctx, result) {
      var sign = result.sign || {};
      ctx.notify(sign.ok === false ? "PSNINE 签到未确认" : "PSNINE 签到完成", "", sign.message || "任务结束");
    }
  };

  core.registerSite(site);
})(typeof globalThis !== "undefined" ? globalThis : this);
