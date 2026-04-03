import { createDatabaseConnection } from '../db/connection.js';
import { normalizeSymbol } from './symbol-normalizer.js';

function toWatchlistItem(row) {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    market: row.market,
    symbol: row.symbol,
    updatedAt: row.updated_at
  };
}

export function createWatchlistService({ db, dbPath } = {}) {
  const database = db ?? createDatabaseConnection({ dbPath });

  const selectBySymbol = database.prepare(`
    SELECT symbol, market, display_name, created_at, updated_at
    FROM watchlist_items
    WHERE symbol = ?
  `);
  const insertItem = database.prepare(`
    INSERT INTO watchlist_items (symbol, market, display_name)
    VALUES (?, ?, ?)
  `);
  const listItemsQuery = database.prepare(`
    SELECT symbol, market, display_name, created_at, updated_at
    FROM watchlist_items
    ORDER BY created_at ASC, symbol ASC
  `);
  const deleteItem = database.prepare(`
    DELETE FROM watchlist_items
    WHERE symbol = ?
  `);

  return {
    add(symbolInput) {
      const normalized = normalizeSymbol(symbolInput);
      const existing = selectBySymbol.get(normalized.symbol);

      if (existing) {
        return toWatchlistItem(existing);
      }

      insertItem.run(normalized.symbol, normalized.market, normalized.symbol);
      return toWatchlistItem(selectBySymbol.get(normalized.symbol));
    },

    list() {
      return listItemsQuery.all().map(toWatchlistItem);
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
