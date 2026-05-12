(() => {
  "use strict";

  const ACCESS_KEY = "rio_supervision_access_v1";
  const ACCESS_PASS = "rio.2026.";

  function isUnlocked() {
    try {
      return sessionStorage.getItem(ACCESS_KEY) === "ok";
    } catch {
      return false;
    }
  }

  function unlock(pass) {
    if(String(pass || "") !== ACCESS_PASS) return false;
    try {
      sessionStorage.setItem(ACCESS_KEY, "ok");
    } catch {}
    return true;
  }

  function lock() {
    try {
      sessionStorage.removeItem(ACCESS_KEY);
    } catch {}
  }

  function requireSupervisionAccess() {
    if(isUnlocked()) return;
    try {
      const target = new URL("../../index.html", window.location.href);
      target.searchParams.set("access", "supervision");
      window.location.replace(target.toString());
    } catch {
      window.location.href = "../../index.html?access=supervision";
    }
  }

  window.RioAccess = {
    isUnlocked,
    unlock,
    lock,
    requireSupervisionAccess
  };

  if(document.currentScript?.dataset.requireSupervision === "true") {
    requireSupervisionAccess();
  }
})();
