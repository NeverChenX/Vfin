export function createCacheService({ now = () => Date.now() } = {}) {
  const entries = new Map();

  function get(key) {
    const entry = entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  function set(key, value, ttlMs = 1000) {
    entries.set(key, {
      value,
      expiresAt: now() + ttlMs
    });

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
