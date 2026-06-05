(function(global) {
  var core = global.AutoSignCore || (global.AutoSignCore = {});

  function createEnv(name) {
    var isQuanX = typeof $task !== "undefined";
    var isLoon = typeof $loon !== "undefined";
    var isSurge = typeof $httpClient !== "undefined" && !isLoon;
    var isNode = typeof module !== "undefined" && !!module.exports;

    function log() {
      var args = Array.prototype.slice.call(arguments);
      console.log("[" + name + "] " + args.join(" "));
    }

    function done(value) {
      if (typeof $done !== "undefined") $done(value || {});
    }

    function notify(title, subtitle, body, opts) {
      subtitle = subtitle || "";
      body = body || "";
      if (isQuanX && typeof $notify !== "undefined") {
        $notify(title, subtitle, body, opts);
      } else if ((isSurge || isLoon) && typeof $notification !== "undefined") {
        $notification.post(title, subtitle, body, opts || {});
      } else {
        log("notify:", title, subtitle, body);
      }
    }

    function storageRead(key) {
      if (isQuanX && typeof $prefs !== "undefined") return $prefs.valueForKey(key);
      if ((isSurge || isLoon) && typeof $persistentStore !== "undefined") return $persistentStore.read(key);
      if (isNode) {
        try {
          var fs = require("fs");
          var file = ".autosign-store.json";
          if (!fs.existsSync(file)) return null;
          var data = JSON.parse(fs.readFileSync(file, "utf8"));
          return data[key] || null;
        } catch (e) {
          return null;
        }
      }
      return null;
    }

    function storageWrite(value, key) {
      if (isQuanX && typeof $prefs !== "undefined") return $prefs.setValueForKey(value, key);
      if ((isSurge || isLoon) && typeof $persistentStore !== "undefined") return $persistentStore.write(value, key);
      if (isNode) {
        try {
          var fs = require("fs");
          var file = ".autosign-store.json";
          var data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
          data[key] = value;
          fs.writeFileSync(file, JSON.stringify(data, null, 2));
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    }

    return {
      name: name,
      isQuanX: isQuanX,
      isLoon: isLoon,
      isSurge: isSurge,
      isNode: isNode,
      isRequest: typeof $request !== "undefined",
      request: typeof $request !== "undefined" ? $request : null,
      log: log,
      notify: notify,
      done: done,
      storageRead: storageRead,
      storageWrite: storageWrite
    };
  }

  core.createEnv = createEnv;
})(typeof globalThis !== "undefined" ? globalThis : this);
