import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname,'..','game.db'));
const sql = fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
db.exec(sql);
console.log('Migrated.');
