// H9: bounded LRU. Map preserves insertion order, so re-inserting a key
// (delete + set) moves it to the most-recent slot. When over-cap we evict
// the oldest entry. Default 5000 keys ~= a few MB depending on values.
const DEFAULT_MAX_ENTRIES = 5000;

export function createCacheService({
  now = () => Date.now(),
  maxEntries = DEFAULT_MAX_ENTRIES,
} = {}) {
  const entries = new Map();

  function evictIfFull() {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  function get(key) {
    const entry = entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }

    // LRU touch — move the key to most-recent position so it survives
    // eviction.
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }

  function set(key, value, ttlMs = 1000) {
    // delete-then-set preserves "most recently inserted" semantics.
    entries.delete(key);
    entries.set(key, {
      value,
      expiresAt: now() + ttlMs
    });
    evictIfFull();

    return value;
  }

  async function getOrSet(key, loadValue, { ttlMs = 1000 } = {}) {
    const cachedValue = get(key);

    if (cachedValue !== undefined) {
      return cachedValue;
    }

    const value = await loadValue();
    return set(key, value, ttlMs);
  }

  return {
    get,
    set,
    delete: (key) => entries.delete(key),
    clear: () => entries.clear(),
    getOrSet
  };
}
