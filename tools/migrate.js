// migrate.js — run schema safely (prefers tools/schema.sql)
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'game.db');

// Prefer tools/schema.sql (the server also uses this path), fallback to root schema.sql
const SCHEMA_CANDIDATES = [
  path.join(__dirname, 'tools', 'schema.sql'),
  path.join(__dirname, 'schema.sql'),
];

function pickSchemaPath() {
  for (const p of SCHEMA_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`schema.sql not found. Tried: \n- ${SCHEMA_CANDIDATES.join('\n- ')}`);
}

try {
  const schemaPath = pickSchemaPath();
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const db = new Database(DB_PATH);
  try {
    db.pragma('foreign_keys = ON');
    // Optional, keeps DB responsive & safe:
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    db.exec(sql);

    // sanity check
    const r = db.prepare('PRAGMA integrity_check').get();
    if (r?.integrity_check !== 'ok') {
      throw new Error('PRAGMA integrity_check failed after migration');
    }

    console.log(`[migrate] OK -> ${path.relative(__dirname, DB_PATH)} using ${path.relative(__dirname, schemaPath)}`);
  } finally {
    db.close();
  }
} catch (e) {
  console.error('[migrate] FAILED:', e?.message || e);
  process.exit(1);
}
