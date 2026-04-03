import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations'
);

export function getDefaultDatabasePath(env = process.env) {
  return env.HQCHART_GATEWAY_DB_PATH ?? path.resolve(process.cwd(), 'data', 'hqchart-gateway.sqlite');
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
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
  }
}
