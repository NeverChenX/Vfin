import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations'
);
const ENSURE_MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export function getDefaultDatabasePath(env = process.env) {
  return env.VFIN_GATEWAY_DB_PATH ?? path.resolve(process.cwd(), 'data', 'vfin-gateway.sqlite');
}

export function createDatabaseConnection({ dbPath = getDefaultDatabasePath() } = {}) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}

export function runMigrations(db) {
  db.exec(ENSURE_MIGRATIONS_TABLE_SQL);

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const appliedMigrationIds = new Set(
    db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC')
      .all()
      .map((row) => row.id)
  );
  const recordMigration = db.prepare(`
    INSERT INTO schema_migrations (id)
    VALUES (?)
  `);

  for (const file of migrationFiles) {
    if (appliedMigrationIds.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      recordMigration.run(file);
    });

    applyMigration();
  }
}
