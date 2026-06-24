import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// H9: bounded LRU. Map preserves insertion order, so re-inserting a key
// (delete + set) moves it to the most-recent slot. When over-cap we evict
// the oldest entry. Default 5000 keys ~= a few MB depending on values.
const DEFAULT_MAX_ENTRIES = 5000;

export function createCacheService({
  now = () => Date.now(),
  maxEntries = DEFAULT_MAX_ENTRIES,
  persistDir,
} = {}) {
  const entries = new Map();

  function cachePath(key) {
    if (!persistDir) return null;
    const hash = createHash('sha256').update(key).digest('hex');
    return path.join(persistDir, `${hash}.json`);
  }

  function readDiskEntry(key) {
    const file = cachePath(key);
    if (!file) return undefined;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw || typeof raw !== 'object' || typeof raw.expiresAt !== 'number') return undefined;
      return raw;
    } catch {
      return undefined;
    }
  }

  function writeDiskEntry(key, entry) {
    const file = cachePath(key);
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(entry));
    } catch {
      // Cache persistence is best-effort; live data path remains authoritative.
    }
  }

  function touchMemory(key, entry) {
    entries.delete(key);
    entries.set(key, entry);
    evictIfFull();
  }

  function evictIfFull() {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  function get(key) {
    const entry = entries.get(key);

    if (entry) {
      if (entry.expiresAt <= now()) {
        entries.delete(key);
      } else {
        // LRU touch — move the key to most-recent position so it survives
        // eviction.
        touchMemory(key, entry);
        return entry.value;
      }
    }

    const diskEntry = readDiskEntry(key);
    if (!diskEntry || diskEntry.expiresAt <= now()) {
      return undefined;
    }

    touchMemory(key, diskEntry);
    return diskEntry.value;
  }

  function getStale(key) {
    const entry = entries.get(key) ?? readDiskEntry(key);
    if (!entry) return undefined;
    touchMemory(key, entry);
    return entry.value;
  }

  function set(key, value, ttlMs = 1000) {
    // delete-then-set preserves "most recently inserted" semantics.
    const entry = {
      value,
      expiresAt: now() + ttlMs
    };
    touchMemory(key, entry);
    writeDiskEntry(key, entry);

    return value;
  }

  async function getOrSet(key, loadValue, { ttlMs = 1000 } = {}) {
    const cachedValue = get(key);

    if (cachedValue !== undefined) {
      return cachedValue;
    }

    try {
      const value = await loadValue();
      return set(key, value, ttlMs);
    } catch (error) {
      const staleValue = getStale(key);
      if (staleValue !== undefined) return staleValue;
      throw error;
    }
  }

  return {
    get,
    getStale,
    set,
    delete: (key) => entries.delete(key),
    clear: () => entries.clear(),
    getOrSet
  };
}
