(function(global) {
  var core = global.AutoSignCore || (global.AutoSignCore = {});

  function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function sample(items, max) {
    var copy = (items || []).slice();
    var out = [];
    while (copy.length && out.length < max) {
      out.push(copy.splice(randomInt(0, copy.length - 1), 1)[0]);
    }
    return out;
  }

  function dailyCounter(store, name, limit) {
    var state = store.readJSON("safety." + name, { date: today(), count: 0 });
    if (state.date !== today()) state = { date: today(), count: 0 };
    return {
      canRun: function() { return state.count < limit; },
      count: function() { return state.count; },
      commit: function(n) {
        state.count += n || 1;
        store.writeJSON("safety." + name, state);
      }
    };
  }

  core.sleep = sleep;
  core.safety = {
    today: today,
    randomInt: randomInt,
    sample: sample,
    dailyCounter: dailyCounter,
    jitter: function(minMs, maxMs) {
      return sleep(randomInt(minMs, maxMs));
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
