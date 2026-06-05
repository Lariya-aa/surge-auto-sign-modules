(function(global) {
  var core = global.AutoSignCore || (global.AutoSignCore = {});

  function normalizeResponse(resp, body) {
    resp = resp || {};
    return {
      statusCode: resp.statusCode || resp.status || 0,
      headers: resp.headers || {},
      body: typeof body === "string" ? body : (resp.body || "")
    };
  }

  function send(env, opts) {
    opts = opts || {};
    opts.method = (opts.method || "GET").toUpperCase();

    if (env.isQuanX && typeof $task !== "undefined") {
      return $task.fetch(opts).then(function(resp) {
        return normalizeResponse(resp, resp.body);
      });
    }

    if ((env.isSurge || env.isLoon) && typeof $httpClient !== "undefined") {
      return new Promise(function(resolve, reject) {
        var fn = opts.method === "POST" ? $httpClient.post : $httpClient.get;
        fn(opts, function(err, resp, body) {
          if (err) reject(err);
          else resolve(normalizeResponse(resp, body));
        });
      });
    }

    if (typeof global.fetch !== "undefined") {
      return global.fetch(opts.url, {
        method: opts.method,
        headers: opts.headers || {},
        body: opts.body
      }).then(function(resp) {
        return resp.text().then(function(body) {
          var headers = {};
          resp.headers.forEach(function(value, key) { headers[key] = value; });
          return { statusCode: resp.status, headers: headers, body: body };
        });
      });
    }

    return Promise.reject(new Error("No HTTP client available"));
  }

  function request(env, opts, retries) {
    retries = retries == null ? 2 : retries;
    return send(env, opts).then(function(resp) {
      env.log(opts.method || "GET", opts.url, "->", resp.statusCode, "(" + (resp.body || "").length + " bytes)");
      return resp;
    }).catch(function(err) {
      if (retries <= 0) throw err;
      return core.sleep(1200).then(function() {
        return request(env, opts, retries - 1);
      });
    });
  }

  core.http = {
    fetch: send,
    request: request,
    get: function(env, url, headers, retries) {
      return request(env, { url: url, method: "GET", headers: headers || {} }, retries);
    },
    post: function(env, url, headers, body, retries) {
      return request(env, { url: url, method: "POST", headers: headers || {}, body: body || "" }, retries);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
