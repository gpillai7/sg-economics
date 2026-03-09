/**
 * js/core/cache.js
 * Shared in-session cache with TTL + sessionStorage persistence.
 * Import before any module that fetches data.
 */
const SGEcoCache = (function () {
  const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  const PREFIX = 'sgeco_';
  const _mem = {};

  function _storeKey(key) { return PREFIX + key; }

  function get(key) {
    // 1. Check memory first
    if (_mem[key] && Date.now() - _mem[key].ts < TTL_MS) return _mem[key].data;
    // 2. Fall back to sessionStorage
    try {
      const raw = sessionStorage.getItem(_storeKey(key));
      if (raw) {
        const entry = JSON.parse(raw);
        if (Date.now() - entry.ts < TTL_MS) {
          _mem[key] = entry; // warm memory cache
          return entry.data;
        }
      }
    } catch (e) {}
    return null;
  }

  function set(key, data) {
    const entry = { data, ts: Date.now() };
    _mem[key] = entry;
    try { sessionStorage.setItem(_storeKey(key), JSON.stringify(entry)); } catch (e) {}
  }

  function invalidate(key) {
    delete _mem[key];
    try { sessionStorage.removeItem(_storeKey(key)); } catch (e) {}
  }

  return { get, set, invalidate };
})();
