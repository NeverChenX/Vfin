import { createDatabaseConnection } from '../db/connection.js';
import { normalizeSymbol } from './symbol-normalizer.js';

function toWatchlistItem(row) {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    market: row.market,
    symbol: row.symbol,
    updatedAt: row.updated_at,
    category: row.category || '自选股'
  };
}

export function createWatchlistService({ db, dbPath } = {}) {
  const database = db ?? createDatabaseConnection({ dbPath });

  const selectBySymbol = database.prepare(`
    SELECT symbol, market, display_name, created_at, updated_at, category
    FROM watchlist_items
    WHERE symbol = ?
  `);
  const insertItem = database.prepare(`
    INSERT INTO watchlist_items (symbol, market, display_name, category)
    VALUES (?, ?, ?, ?)
  `);
  const updateCategory = database.prepare(`
    UPDATE watchlist_items SET category = ?, updated_at = CURRENT_TIMESTAMP
    WHERE symbol = ?
  `);
  const listItemsQuery = database.prepare(`
    SELECT symbol, market, display_name, created_at, updated_at, category
    FROM watchlist_items
    ORDER BY category ASC, created_at ASC, symbol ASC
  `);
  const listSymbolsByCategory = database.prepare(`
    SELECT symbol FROM watchlist_items WHERE category = ?
  `);
  const deleteItem = database.prepare(`
    DELETE FROM watchlist_items
    WHERE symbol = ?
  `);

  return {
    add(symbolInput, category = '自选股') {
      const normalized = normalizeSymbol(symbolInput);
      const existing = selectBySymbol.get(normalized.symbol);

      if (existing) {
        // 用户主动添加并指定了不同分类时，把分类移过去（例如把"我的持仓"里的股票挪到"自选股"自由观察）
        if (category && existing.category !== category) {
          updateCategory.run(category, normalized.symbol);
          return toWatchlistItem(selectBySymbol.get(normalized.symbol));
        }
        return toWatchlistItem(existing);
      }

      insertItem.run(normalized.symbol, normalized.market, normalized.symbol, category);
      return toWatchlistItem(selectBySymbol.get(normalized.symbol));
    },

    bulkAdd(items) {
      const addMany = database.transaction((list) => {
        const results = [];
        for (const { symbol, category } of list) {
          try {
            const normalized = normalizeSymbol(symbol);
            const existing = selectBySymbol.get(normalized.symbol);
            if (existing) {
              if (category && existing.category !== category) {
                updateCategory.run(category, normalized.symbol);
              }
              results.push(toWatchlistItem(selectBySymbol.get(normalized.symbol)));
            } else {
              insertItem.run(normalized.symbol, normalized.market, normalized.symbol, category || '自选股');
              results.push(toWatchlistItem(selectBySymbol.get(normalized.symbol)));
            }
          } catch (_err) {
            // skip invalid symbols
          }
        }
        return results;
      });
      return addMany(items);
    },

    // 把指定分类的内容与给定 symbol 列表对齐：多余删除，缺失添加。其他分类不动。
    syncCategory(symbolInputs, category) {
      const normalizedTargets = [];
      const targetSet = new Set();
      for (const raw of symbolInputs || []) {
        try {
          const n = normalizeSymbol(raw);
          if (!targetSet.has(n.symbol)) {
            targetSet.add(n.symbol);
            normalizedTargets.push(n);
          }
        } catch (_err) {
          // skip invalid symbols
        }
      }

      const sync = database.transaction(() => {
        // 删除：只动该分类下、且已不在新集合里的项
        const existingRows = listSymbolsByCategory.all(category);
        const existingSet = new Set(existingRows.map((r) => r.symbol));

        const removed = [];
        for (const sym of existingSet) {
          if (!targetSet.has(sym)) {
            deleteItem.run(sym);
            removed.push(sym);
          }
        }

        // 添加：先一次 SELECT WHERE symbol IN (...) 拿到"已存在的全集"（不限分类），
        // 内存中做差集 → 仅对新增者 INSERT。比 N+1 selectBySymbol 快很多。
        const added = [];
        if (normalizedTargets.length > 0) {
          const placeholders = normalizedTargets.map(() => '?').join(',');
          const presentRows = database
            .prepare(`SELECT symbol FROM watchlist_items WHERE symbol IN (${placeholders})`)
            .all(...normalizedTargets.map((n) => n.symbol));
          const presentSet = new Set(presentRows.map((r) => r.symbol));
          for (const n of normalizedTargets) {
            if (presentSet.has(n.symbol)) continue;
            insertItem.run(n.symbol, n.market, n.symbol, category);
            added.push(n.symbol);
          }
        }

        // 列出该分类下最终结果（同样一次性 IN 查询，避免 row × selectBySymbol N+1）
        const finalRows = listSymbolsByCategory.all(category);
        const items = finalRows.length
          ? database
              .prepare(`SELECT symbol, market, display_name, created_at, updated_at, category
                        FROM watchlist_items WHERE symbol IN (${finalRows.map(() => '?').join(',')})`)
              .all(...finalRows.map((r) => r.symbol))
              .map(toWatchlistItem)
          : [];

        return { added, removed, items };
      });

      return sync();
    },

    list() {
      // 只读：异常行跳过即可，不做删除（每 5 秒被 polling 调用，
      // 如果 normalizeSymbol 规则有回归，会无声丢失用户数据）。
      // 真正的清理用 purgeInvalid() 显式触发。
      const rows = listItemsQuery.all();
      const items = [];
      for (const row of rows) {
        try {
          normalizeSymbol(row.symbol);
          items.push(toWatchlistItem(row));
        } catch (_error) {
          // skip silently
        }
      }
      return items;
    },

    purgeInvalid() {
      const rows = listItemsQuery.all();
      const removed = [];
      for (const row of rows) {
        try { normalizeSymbol(row.symbol); }
        catch (_error) { deleteItem.run(row.symbol); removed.push(row.symbol); }
      }
      return removed;
    },

    remove(symbolInput) {
      const normalized = normalizeSymbol(symbolInput);
      deleteItem.run(normalized.symbol);
      return normalized.symbol;
    },

    close() {
      database.close();
    }
  };
}
