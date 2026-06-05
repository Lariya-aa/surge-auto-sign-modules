(function(global) {
  var core = global.AutoSignCore || (global.AutoSignCore = {});

  function firstMatch(text, regex, fallback) {
    var match = String(text || "").match(regex);
    return match ? (match[1] || match[0]) : (fallback || "");
  }

  function decodeEntities(text) {
    return String(text || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'");
  }

  function links(html, baseUrl) {
    var out = [];
    var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = re.exec(html || ""))) {
      var href = decodeEntities(match[1]);
      if (baseUrl && href.indexOf("/") === 0) href = baseUrl.replace(/\/$/, "") + href;
      out.push({ href: href, text: decodeEntities(match[2].replace(/<[^>]+>/g, "").trim()) });
    }
    return out;
  }

  function formhash(html) {
    return firstMatch(html, /name=["']formhash["']\s+value=["']([^"']+)["']/i) ||
      firstMatch(html, /formhash=([a-zA-Z0-9]+)/i);
  }

  core.parser = {
    firstMatch: firstMatch,
    decodeEntities: decodeEntities,
    links: links,
    formhash: formhash,
    hasLoginWall: function(html) {
      return /登录|登入|login|sign in|尚未登入|需要先登录/i.test(html || "");
    },
    textIncludesAny: function(text, words) {
      text = String(text || "");
      for (var i = 0; i < words.length; i++) {
        if (text.indexOf(words[i]) >= 0) return true;
      }
      return false;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
