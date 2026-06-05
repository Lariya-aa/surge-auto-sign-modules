(function(global) {
  var core = global.AutoSignCore || (global.AutoSignCore = {});

  function key(siteId, name) {
    return "AutoSign." + siteId + "." + name;
  }

  function createStore(env, siteId) {
    return {
      read: function(name) {
        return env.storageRead(key(siteId, name));
      },
      write: function(name, value) {
        return env.storageWrite(value, key(siteId, name));
      },
      readJSON: function(name, fallback) {
        var raw = env.storageRead(key(siteId, name));
        if (!raw) return fallback;
        try { return JSON.parse(raw); } catch (e) { return fallback; }
      },
      writeJSON: function(name, value) {
        return env.storageWrite(JSON.stringify(value), key(siteId, name));
      }
    };
  }

  core.createStore = createStore;
})(typeof globalThis !== "undefined" ? globalThis : this);
