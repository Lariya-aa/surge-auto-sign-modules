(function(global) {
  var core = global.AutoSignCore;

  var QIDAO_URL = "https://www.psnine.com/set/qidao/ajax";

  function findSignUrl(html) {
    var links = core.parser.links(html, "https://www.psnine.com");
    for (var i = 0; i < links.length; i++) {
      var text = links[i].text || "";
      var href = links[i].href || "";
      if (/[签到簽到]{1,2}/i.test(text) && /\/(sign|qiandao|set|daily|ajax|user)/i.test(href) && !/\/(sign\/(?:out|in)|logout)/i.test(href)) {
        return href;
      }
    }
    if (/onclick=["']\s*qidao\s*\(\s*this\s*\)\s*["']/i.test(html)) {
      return QIDAO_URL;
    }
    return core.parser.firstMatch(html, /["']([^"']*qidao[^"']*)["']/i) || QIDAO_URL;
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
      var signUrl = findSignUrl(html);
      if (!signUrl) {
        return { ok: false, message: "未找到签到入口，可能需要更新 PSNINE adapter" };
      }
      if (signUrl.indexOf("http") !== 0) signUrl = "https://www.psnine.com" + (signUrl.charAt(0) === "/" ? "" : "/") + signUrl;

      var headers = ctx.headers(ctx.getCookie(), {
        "Referer": "https://www.psnine.com/",
        "X-Requested-With": "XMLHttpRequest"
      });

      return ctx.http.get(ctx.env, signUrl, headers, 1).then(function(resp) {
        var text = resp.body || "";
        if (/今天已经签过了|今天已经簽過了|已经祈祷|已經祈禱|重复|重複/i.test(text)) {
          var days = ctx.parser.firstMatch(text, /你已祈祷\s*<b[^>]*>(\d+)<\/b>\s*天了?/i) || ctx.parser.firstMatch(text, /(\d+)\s*天/);
          return { ok: true, already: true, message: days ? "今日已祈祷，累计 " + days + " 天" : "今日已祈祷" };
        }
        if (/失败|错误|error|未登录|請先|请先|登录|登入/i.test(text)) {
          return { ok: false, message: ctx.parser.firstMatch(text, /(?:msg|message)["']?\s*[:=]\s*["']([^"']+)/i, "签到返回失败") };
        }
        if (resp.statusCode >= 400) return { ok: false, message: "签到请求状态码 " + resp.statusCode };
        var coin = ctx.parser.firstMatch(text, /(\d+)\s*(?:铜币|銅幣)/i);
        var days = ctx.parser.firstMatch(text, /你已祈祷\s*<b[^>]*>(\d+)<\/b>\s*天了?/i);
        if (coin) {
          return { ok: true, message: "祈祷成功，获得 " + coin + " 铜币" + (days ? "（连续 " + days + " 天）" : "") };
        }
        if (days) {
          return { ok: true, already: true, message: "今日已祈祷，累计 " + days + " 天" };
        }
        return { ok: true, message: "签到请求完成" };
      });
    },
    summarize: function(ctx, result) {
      var sign = result.sign || {};
      ctx.notify(sign.ok === false ? "PSNINE 签到未确认" : "PSNINE 签到完成", "", sign.message || "任务结束");
    }
  };

  core.registerSite(site);
})(typeof globalThis !== "undefined" ? globalThis : this);
