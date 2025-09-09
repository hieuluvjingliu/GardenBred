// server.js (ESM) — GardenBred: Express + WS + SQLite + safe backup/restore
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

// ==== Paths / constants ====
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BREED_PATH = path.join(__dirname, 'tools', 'breed_map.json');       // <- root
const DB_PATH    = process.env.DB_PATH || path.join(__dirname, 'game.db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(cookieParser());
// ⚠️ ĐỪNG serve cả project root để tránh lộ game.db
// app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// ==== BACKUP (download) ====
app.get('/admin/download-db', (req, res) => {
  if ((req.query.token || '') !== (process.env.ADMIN_TOKEN || '')) {
    return res.sendStatus(403);
  }
  res.download(DB_PATH, 'game.db');
});

// ==== DB open + migrations (safe) ====
let db;
function openDb() { db = new Database(DB_PATH); }
function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, 'tools', 'schema.sql'), 'utf8');
  db.exec(sql);
}
function integrityOk(dbFilePath) {
  const t = new Database(dbFilePath);
  try {
    const r = t.prepare('PRAGMA integrity_check').get();
    return r?.integrity_check === 'ok';
  } finally { t.close(); }
}

try {
  openDb();
  if (!integrityOk(DB_PATH)) throw new Error('Integrity check failed on boot');
  runMigrations();
  console.log('[DB] ready');
} catch (e) {
  console.error('[DB] startup failed:', e);
  process.exit(1);
}

// ==== Logging (file + table) ====
const LOG_DIR = path.join(__dirname, 'log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function logLine(level, msg, extra = {}) {
  const line = JSON.stringify({ t: Date.now(), level, msg, ...extra });
  console.log(line);
  const f = path.join(LOG_DIR, new Date().toISOString().slice(0, 10) + '.log');
  fs.appendFile(f, line + '\n', () => {});
}

// ==== Prepared statements ====
const upsertUserStmt = db.prepare(
  `INSERT INTO users (username, coins, created_at) VALUES (?, 10000, ?)
   ON CONFLICT(username) DO NOTHING`
);
const getUserStmt = db.prepare(`SELECT * FROM users WHERE username = ?`);
const getUserByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
const insertSessionStmt = db.prepare(
  `INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)`
);
const getSessionStmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`);

const getStateStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
const getFloorsStmt = db.prepare(
  `SELECT * FROM floors WHERE user_id = ? ORDER BY idx ASC`
);
const getFloorsCountStmt = db.prepare(
  `SELECT COUNT(*) as cnt FROM floors WHERE user_id = ? AND unlocked = 1`
);
const ensureFloorStmt = db.prepare(
  `INSERT OR IGNORE INTO floors (user_id, idx, unlocked, trap_count)
   VALUES (?, ?, 1, 0)`
);

const getPlotsByFloorStmt = db.prepare(
  `SELECT * FROM plots WHERE floor_id = ? ORDER BY slot ASC`
);
const ensurePlotStmt = db.prepare(
  `INSERT OR IGNORE INTO plots (floor_id, slot, stage) VALUES (?, ?, 'empty')`
);

// seed catalog
const seedBasePriceStmt = db.prepare(
  `SELECT class as class_name, base_price FROM seed_catalog WHERE class = ?`
);
const upsertSeedCatalogStmt = db.prepare(
  `INSERT INTO seed_catalog(class, base_price) VALUES (?, ?)
   ON CONFLICT(class) DO UPDATE SET base_price = excluded.base_price`
);

// coins
const addCoinsStmt = db.prepare(`UPDATE users SET coins = coins + ? WHERE id = ?`);
const subCoinsStmt = db.prepare(`UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ?`);

// inventory seeds
const invAddSeedStmt = db.prepare(
  `INSERT INTO inventory_seeds (user_id, class, base_price, is_mature)
   VALUES (?, ?, ?, ?)`
);
const invListSeedsStmt = db.prepare(`SELECT * FROM inventory_seeds WHERE user_id = ?`);
const invGetSeedStmt = db.prepare(`SELECT * FROM inventory_seeds WHERE id = ? AND user_id = ?`);
const invDelSeedStmt = db.prepare(`DELETE FROM inventory_seeds WHERE id = ? AND user_id = ?`);

// inventory pots
const invAddPotStmt = db.prepare(
  `INSERT INTO inventory_pots (user_id, type, speed_mult, yield_mult)
   VALUES (?, ?, ?, ?)`
);
const invListPotsStmt = db.prepare(`SELECT * FROM inventory_pots WHERE user_id = ?`);
const invGetPotStmt = db.prepare(`SELECT * FROM inventory_pots WHERE id = ? AND user_id = ?`);
const invDelPotStmt = db.prepare(`DELETE FROM inventory_pots WHERE id = ? AND user_id = ?`);

// plots update
const setPlotPotStmt = db.prepare(`UPDATE plots SET pot_id=?, pot_type=? WHERE id=?`);
const setPlotAfterPlantStmt = db.prepare(
  `UPDATE plots
   SET seed_id=?, class=?, stage='planted', planted_at=?, mature_at=?
   WHERE id=?`
);
const setPlotStageStmt = db.prepare(`UPDATE plots SET stage=? WHERE id=?`);
const clearPlotSeedOnlyStmt = db.prepare(
  `UPDATE plots
   SET seed_id=NULL, class=NULL, stage='empty', planted_at=NULL, mature_at=NULL
   WHERE id=?`
);
const clearPlotAllStmt = db.prepare(
  `UPDATE plots
   SET pot_id=NULL, pot_type=NULL, seed_id=NULL, class=NULL,
       stage='empty', planted_at=NULL, mature_at=NULL
   WHERE id=?`
);

// online / floors
const listUsersOnlineStmt = db.prepare(
  `SELECT id, username FROM users ORDER BY id DESC LIMIT 50`
);
const addTrapToFloorStmt = db.prepare(`UPDATE floors SET trap_count = trap_count + 1 WHERE id = ?`);
const useTrapOnFloorStmt = db.prepare(
  `UPDATE floors SET trap_count = trap_count - 1 WHERE id = ? AND trap_count > 0`
);
const listFloorsByUserStmt = db.prepare(
  `SELECT * FROM floors WHERE user_id = ? ORDER BY idx ASC`
);
const getFloorByIdStmt = db.prepare(`SELECT * FROM floors WHERE id = ?`);

// market
const marketCreateStmt = db.prepare(
  `INSERT INTO market_listings
   (seller_id, item_type, item_id, class, base_price, ask_price, status, created_at)
   VALUES (?, 'seed', ?, ?, ?, ?, 'open', ?)`
);
const marketOpenStmt = db.prepare(
  `SELECT * FROM market_listings WHERE status = 'open'
   ORDER BY created_at DESC LIMIT 100`
);
const marketGetStmt = db.prepare(`SELECT * FROM market_listings WHERE id = ?`);
const marketCloseStmt = db.prepare(`UPDATE market_listings SET status='sold' WHERE id = ?`);

// logs
const logStmt = db.prepare(`INSERT INTO logs (user_id, action, payload, at) VALUES (?, ?, ?, ?)`);

// === log helpers (dùng sau khi đã có logStmt) ===
function logAction(userId, action, payloadObj) {
  const payload = JSON.stringify(payloadObj ?? {});
  try { logStmt.run(userId ?? null, action, payload, Date.now()); } catch {}
  logLine('action', action, { userId, ...payloadObj });
}

// ==== Helpers ====
function now() { return Date.now(); }
function floorPriceBase(className) {
  const basics = ['fire', 'water', 'wind', 'earth'];
  return basics.includes(className)
    ? 100
    : (seedBasePriceStmt.get(className)?.base_price ?? 100);
}
function calcBreedBase(aPrice, bPrice) { return Math.floor((aPrice + bPrice) * 0.8); }
function sellToShopAmount(base) { return Math.floor(base * 1.1); }
function marketMin(base) { return Math.floor(base * 0.9); }
function marketMax(base) { return Math.floor(base * 1.5); }
function userFloorsCount(userId) { return getFloorsCountStmt.get(userId).cnt; }
function trapPriceForUser(userId) { return 1000 * userFloorsCount(userId); }
function trapMaxForUser(userId) { return userFloorsCount(userId) * 5; }

// ==== Breed map from JSON (root) ====
const DEFAULT_BREED_MAP = {
  'water+fire': 'steam',
  'water+wind': 'wave',
  'water+earth': 'plant',
  'water+wave': 'tsunami',
  'wind+earth': 'dust',
  'earth+fire': 'lava',
  'steam+water': 'cloud'
};
function ensureBreedFile() {
  try {
    const dir = path.dirname(BREED_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(BREED_PATH)) {
      fs.writeFileSync(BREED_PATH, JSON.stringify(DEFAULT_BREED_MAP, null, 2));
    }
  } catch (e) { console.error('ensureBreedFile failed:', e); }
}
function loadBreedMap() {
  ensureBreedFile();
  try {
    const raw = fs.readFileSync(BREED_PATH, 'utf-8');
    const obj = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[String(k).toLowerCase()] = v;
    return out;
  } catch (e) {
    console.error('loadBreedMap failed, fallback:', e);
    return { ...DEFAULT_BREED_MAP };
  }
}
let BREED_MAP = loadBreedMap();
fs.watchFile(BREED_PATH, { interval: 1000 }, () => {
  try { BREED_MAP = loadBreedMap(); console.log('[BREED_MAP] reloaded from file'); }
  catch (e) { console.error('[BREED_MAP] reload failed:', e); }
});
function combineClass(a, b) {
  if (!a || !b) return null;
  const k1 = `${String(a).toLowerCase()}+${String(b).toLowerCase()}`;
  const k2 = `${String(b).toLowerCase()}+${String(a).toLowerCase()}`;
  return BREED_MAP[k1] || BREED_MAP[k2] || null;
}

// ==== HTTP access log ====
app.use((req, _res, next) => {
  logLine('http', `${req.method} ${req.path}`, { ip: req.ip, body: req.body || null });
  next();
});

// ==== Auth ====
app.post('/auth/login', (req, res) => {
  const { username } = req.body;
  if (!username || username.length < 2) return res.status(400).json({ error: 'Invalid username' });

  upsertUserStmt.run(username, now());
  const user = getUserStmt.get(username);

  ensureFloorStmt.run(user.id, 1);
  const floor = db.prepare(`SELECT * FROM floors WHERE user_id = ? AND idx = 1`).get(user.id);
  for (let i = 1; i <= 10; i++) ensurePlotStmt.run(floor.id, i);

  const sid = uuidv4();
  insertSessionStmt.run(sid, user.id, now());
  res.cookie('sid', sid, { httpOnly: true });

  logAction(user.id, 'auth_login', { username });
  res.json({ userId: user.id, username: user.username, coins: user.coins });
});

function auth(req, res, next) {
  const sid = req.cookies.sid;
  if (!sid) return res.status(401).json({ error: 'No session' });
  const s = getSessionStmt.get(sid);
  if (!s) return res.status(401).json({ error: 'Invalid session' });
  req.userId = s.user_id;
  next();
}

// ==== State ====
app.get('/me/state', auth, (req, res) => {
  const me = getStateStmt.get(req.userId);
  const floors = getFloorsStmt.all(req.userId);
  const plots = floors.map(f => ({
    floor: f,
    plots: getPlotsByFloorStmt.all(f.id).map(p =>
      p.class ? { ...p, base_price: floorPriceBase(p.class) } : p
    )
  }));
  const potInv = invListPotsStmt.all(req.userId);
  const seedInv = invListSeedsStmt.all(req.userId);
  const market = marketOpenStmt.all();
  logAction(req.userId, 'state_fetch', {});
  res.json({
    me, floors, plots, potInv, seedInv, market,
    trapPrice: trapPriceForUser(req.userId),
    trapMax: trapMaxForUser(req.userId)
  });
});

// ==== Shop ====
app.post('/shop/buy', auth, (req, res) => {
  const { itemType, classOrType, qty = 1 } = req.body;
  if (qty < 1 || qty > 50) return res.status(400).json({ error: 'qty out of range' });

  if (itemType === 'seed') {
    const base = floorPriceBase(classOrType);
    const cost = base * qty;
    if (getUserByIdStmt.get(req.userId).coins < cost) {
      return res.status(400).json({ error: 'Not enough coins' });
    }
    subCoinsStmt.run(cost, req.userId);
    for (let i = 0; i < qty; i++) invAddSeedStmt.run(req.userId, classOrType, base, 0);
    logAction(req.userId, 'shop_buy_seed', { class: classOrType, qty, cost });
    return res.json({ ok: true });
  }

  if (itemType === 'pot') {
    const TYPE_MAP = {
      basic: { price: 100, speed_mult: 1.0, yield_mult: 1.0 },
      gold:  { price: 300, speed_mult: 1.0, yield_mult: 1.5 },
      timeskip: { price: 300, speed_mult: 0.67, yield_mult: 1.0 }
    };
    const cfg = TYPE_MAP[classOrType];
    if (!cfg) return res.status(400).json({ error: 'invalid pot type' });
    const cost = cfg.price * qty;
    if (getUserByIdStmt.get(req.userId).coins < cost) {
      return res.status(400).json({ error: 'Not enough coins' });
    }
    subCoinsStmt.run(cost, req.userId);
    for (let i = 0; i < qty; i++) invAddPotStmt.run(req.userId, classOrType, cfg.speed_mult, cfg.yield_mult);
    logAction(req.userId, 'shop_buy_pot', { type: classOrType, qty, cost });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'invalid itemType' });
});

app.post('/shop/buy-trap', auth, (req, res) => {
  const price = trapPriceForUser(req.userId);
  const max = trapMaxForUser(req.userId);
  const floors = listFloorsByUserStmt.all(req.userId);
  const totalTrapsOwned = floors.reduce((a, f) => a + f.trap_count, 0);
  if (totalTrapsOwned >= max) return res.status(400).json({ error: 'Trap capacity reached' });
  const coins = getUserByIdStmt.get(req.userId).coins;
  if (coins < price) return res.status(400).json({ error: 'Not enough coins' });
  const target = floors.find(f => f.trap_count < 5);
  if (!target) return res.status(400).json({ error: 'No floor can hold more traps' });
  subCoinsStmt.run(price, req.userId);
  addTrapToFloorStmt.run(target.id);
  logAction(req.userId, 'shop_buy_trap', { floorId: target.id, price });
  res.json({ ok: true });
});

// ==== Plot actions ====
app.post('/plot/place-pot', auth, (req, res) => {
  try {
    const { floorId, slot, potId } = req.body || {};
    if (!floorId || !slot || !potId) return res.status(400).json({ error: 'missing params' });

    const pot = invGetPotStmt.get(potId, req.userId);
    if (!pot) return res.status(400).json({ error: 'invalid pot' });

    const floor = getFloorByIdStmt.get(floorId);
    if (!floor || floor.user_id !== req.userId) return res.status(403).json({ error: 'not your floor' });

    const plot = getPlotsByFloorStmt.all(floorId).find(p => p.slot === Number(slot));
    if (!plot) return res.status(404).json({ error: 'plot not found' });
    if (plot.pot_id) return res.status(400).json({ error: 'plot already has a pot' });

    setPlotPotStmt.run(pot.id, pot.type, plot.id);
    invDelPotStmt.run(potId, req.userId);

    logAction(req.userId, 'place_pot', { floorId, slot, potId, type: pot.type });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/plot/plant', auth, (req, res) => {
  const { floorId, slot, seedId } = req.body;
  const seed = invGetSeedStmt.get(seedId, req.userId);
  if (!seed || seed.is_mature !== 0) return res.status(400).json({ error: 'seed must be not-planted' });

  const floor = getFloorByIdStmt.get(floorId);
  if (!floor || floor.user_id !== req.userId) return res.status(403).json({ error: 'not your floor' });

  const plot = getPlotsByFloorStmt.all(floorId).find(p => p.slot === Number(slot));
  if (!plot) return res.status(404).json({ error: 'plot not found' });
  if (!plot.pot_id) return res.status(400).json({ error: 'plot has no pot' });
  if (plot.stage !== 'empty') return res.status(400).json({ error: 'plot busy' });

  const baseTimeMap = { fire: 5 * 60e3, water: 5 * 60e3, wind: 5 * 60e3, earth: 5 * 60e3 };
  const base = baseTimeMap[seed.class] ?? 10 * 60e3;
  const speed = plot.pot_type === 'timeskip' ? 0.67 : 1.0;
  const growTime = Math.floor(base * speed);
  const mAt = now() + growTime;

  setPlotAfterPlantStmt.run(seedId, seed.class, now(), mAt, plot.id);
  invDelSeedStmt.run(seedId, req.userId);

  logAction(req.userId, 'plant', { floorId, slot, seedId, class: seed.class, mature_at: mAt });
  res.json({ ok: true, mature_at: mAt });
});

// tick: planted -> growing -> mature
setInterval(() => {
  const rows = db.prepare(`SELECT * FROM plots WHERE stage IN ('planted','growing')`).all();
  const t = now();
  for (const r of rows) {
    if (r.stage === 'planted') {
      const half = r.planted_at + Math.floor((r.mature_at - r.planted_at) / 2);
      if (t >= half) setPlotStageStmt.run('growing', r.id);
    }
    if (r.stage === 'growing' && t >= r.mature_at) setPlotStageStmt.run('mature', r.id);
  }
}, 2000);

app.post('/plot/harvest', auth, (req, res) => {
  const { plotId } = req.body;
  const p = db.prepare(`SELECT * FROM plots WHERE id = ?`).get(plotId);
  if (!p) return res.status(404).json({ error: 'plot not found' });
  if (p.stage !== 'mature') return res.status(400).json({ error: 'not mature yet' });
  const base = floorPriceBase(p.class);
  invAddSeedStmt.run(req.userId, p.class, base, 1);
  clearPlotSeedOnlyStmt.run(plotId);
  logAction(req.userId, 'harvest', { plotId, class: p.class, base });
  res.json({ ok: true });
});

app.post('/plot/harvest-all', auth, (req, res) => {
  const floors = getFloorsStmt.all(req.userId);
  let count = 0;
  for (const f of floors) {
    const plots = getPlotsByFloorStmt.all(f.id);
    for (const p of plots) {
      if (p.stage === 'mature') {
        const base = floorPriceBase(p.class);
        invAddSeedStmt.run(req.userId, p.class, base, 1);
        clearPlotSeedOnlyStmt.run(p.id);
        count++;
      }
    }
  }
  logAction(req.userId, 'harvest_all', { harvested: count });
  res.json({ ok: true, harvested: count });
});

app.post('/plot/remove', auth, (req, res) => {
  const { floorId, slot } = req.body || {};
  if (!floorId || !slot) return res.status(400).json({ error: 'missing params' });

  const floor = getFloorByIdStmt.get(floorId);
  if (!floor || floor.user_id !== req.userId) return res.status(403).json({ error: 'not your floor' });
  const plot = getPlotsByFloorStmt.all(floorId).find(p => p.slot === Number(slot));
  if (!plot) return res.status(404).json({ error: 'plot not found' });

  clearPlotAllStmt.run(plot.id);
  logAction(req.userId, 'plot_remove', { floorId, slot, plotId: plot.id });
  res.json({ ok: true });
});

// ==== Breed (mature only) ====
app.post('/breed', auth, (req, res) => {
  const { seedAId, seedBId } = req.body;
  const A = invGetSeedStmt.get(seedAId, req.userId);
  const B = invGetSeedStmt.get(seedBId, req.userId);
  if (!A || !B || A.is_mature !== 1 || B.is_mature !== 1) {
    return res.status(400).json({ error: 'seeds must be mature' });
  }

  const outClass = combineClass(A.class, B.class);
  if (!outClass) return res.status(400).json({ error: 'no breed recipe' });

  const baseOut = calcBreedBase(A.base_price, B.base_price);
  upsertSeedCatalogStmt.run(outClass, baseOut);
  invAddSeedStmt.run(req.userId, outClass, baseOut, 0);
  invDelSeedStmt.run(seedAId, req.userId);
  invDelSeedStmt.run(seedBId, req.userId);

  logAction(req.userId, 'breed', { in: [A.class, B.class], out: outClass, base: baseOut });
  res.json({ ok: true, outClass, base: baseOut });
});

// ==== Sell to shop (mature only) ====
app.post('/sell/shop', auth, (req, res) => {
  const { seedId } = req.body;
  const S = invGetSeedStmt.get(seedId, req.userId);
  if (!S) return res.status(404).json({ error: 'seed not found' });
  if (S.is_mature !== 1) return res.status(400).json({ error: 'only mature seeds can be sold' });
  const pay = sellToShopAmount(S.base_price);
  invDelSeedStmt.run(seedId, req.userId);
  addCoinsStmt.run(pay, req.userId);
  logAction(req.userId, 'sell_shop', { seedId, class: S.class, paid: pay });
  res.json({ ok: true, paid: pay });
});

// ==== Market (mature only) ====
app.post('/market/list', auth, (req, res) => {
  const { seedId, askPrice } = req.body;
  const S = invGetSeedStmt.get(seedId, req.userId);
  if (!S) return res.status(404).json({ error: 'seed not found' });
  if (S.is_mature !== 1) return res.status(400).json({ error: 'only mature seeds can be listed' });
  const min = marketMin(S.base_price), max = marketMax(S.base_price);
  if (askPrice < min || askPrice > max) {
    return res.status(400).json({ error: `ask must be within ${min}-${max}` });
  }
  marketCreateStmt.run(req.userId, seedId, S.class, S.base_price, askPrice, now());
  invDelSeedStmt.run(seedId, req.userId); // escrow
  logAction(req.userId, 'market_list', { seedId, class: S.class, askPrice });
  res.json({ ok: true });
});

app.post('/market/buy', auth, (req, res) => {
  const { listingId } = req.body;
  const L = marketGetStmt.get(listingId);
  if (!L || L.status !== 'open') return res.status(404).json({ error: 'listing not found' });
  const buyer = getUserByIdStmt.get(req.userId);
  if (buyer.coins < L.ask_price) return res.status(400).json({ error: 'not enough coins' });
  subCoinsStmt.run(L.ask_price, req.userId);
  addCoinsStmt.run(L.ask_price, L.seller_id);
  invAddSeedStmt.run(req.userId, L.class, L.base_price, 1); // mua về là mature
  marketCloseStmt.run(listingId);
  logAction(req.userId, 'market_buy', {
    listingId, class: L.class, base: L.base_price, paid: L.ask_price, seller: L.seller_id
  });
  res.json({ ok: true });
});

// ==== Online / Visit ====
app.get('/online', auth, (req, res) => {
  const rows = listUsersOnlineStmt.all();
  logAction(req.userId, 'online_list', { count: rows.length });
  res.json({ users: rows });
});

app.get('/visit/floors', auth, (req, res) => {
  const uid = parseInt(req.query.userId, 10);
  if (!uid) return res.status(400).json({ error: 'missing userId' });
  const floors = listFloorsByUserStmt.all(uid);
  res.json({ floors });
});

app.get('/visit/floor', auth, (req, res) => {
  const floorId = parseInt(req.query.floorId, 10);
  if (!floorId) return res.status(400).json({ error: 'missing floorId' });
  const floor = getFloorByIdStmt.get(floorId);
  if (!floor) return res.status(404).json({ error: 'floor not found' });

  const plotsRaw = getPlotsByFloorStmt.all(floorId);
  const plots = plotsRaw.map(p =>
    p.class ? { ...p, base_price: floorPriceBase(p.class) } : p
  );

  logAction(req.userId, 'visit_floor_view', { floorId, owner: floor.user_id, plots: plots.length });
  res.json({
    floor: { id: floor.id, idx: floor.idx, trap_count: floor.trap_count, user_id: floor.user_id },
    plots
  });
});

// ==== Visit: steal ====
app.post('/visit/steal-plot', auth, (req, res) => {
  const { targetUserId, floorId, plotId } = req.body;
  if (!targetUserId || !floorId || !plotId) return res.status(400).json({ error: 'missing params' });
  if (targetUserId === req.userId) return res.status(400).json({ error: 'cannot steal yourself' });

  const floor = getFloorByIdStmt.get(floorId);
  if (!floor || floor.user_id !== targetUserId) return res.status(404).json({ error: 'floor not found' });

  const used = useTrapOnFloorStmt.run(floorId).changes;
  if (used > 0) {
    const attacker = getUserByIdStmt.get(req.userId);
    const penalty = Math.max(1, Math.floor(attacker.coins * 0.05));
    subCoinsStmt.run(penalty, req.userId);
    logAction(req.userId, 'trap_triggered', { targetUserId, floorId, penalty, plotId });
    return res.json({ ok: false, trap: true, penalty });
  }

  const p = db.prepare(`SELECT * FROM plots WHERE id = ?`).get(plotId);
  if (!p || p.floor_id !== floorId) return res.status(404).json({ error: 'plot not found' });
  if (p.stage !== 'mature') {
    logAction(req.userId, 'steal_fail', { targetUserId, floorId, plotId, reason: 'not mature' });
    return res.json({ ok: false, reason: 'not mature' });
  }

  const base = floorPriceBase(p.class);
  invAddSeedStmt.run(req.userId, p.class, base, 1);
  clearPlotSeedOnlyStmt.run(p.id);
  logAction(req.userId, 'steal_success', { targetUserId, floorId, plotId: p.id, class: p.class });
  res.json({ ok: true, class: p.class });
});

// ==== RESTORE (upload) — safe: integrity + backup + rollback ====
const upload = multer({ storage: multer.memoryStorage() });
app.post('/admin/upload-db', upload.single('db'), (req, res) => {
  if ((req.headers['x-admin-token'] || '') !== (process.env.ADMIN_TOKEN || '')) {
    return res.sendStatus(403);
  }
  if (!req.file) return res.status(400).json({ error: 'missing file field "db"' });

  const TMP = DB_PATH + '.restore';
  const BAK = DB_PATH + '.bak';

  try { fs.writeFileSync(TMP, req.file.buffer); }
  catch (e) { return res.status(500).json({ error: 'write tmp failed', detail: String(e) }); }

  // pre-check integrity
  try {
    const t = new Database(TMP);
    const r = t.prepare('PRAGMA integrity_check').get();
    t.close();
    if (!r || r.integrity_check !== 'ok') {
      fs.unlinkSync(TMP);
      return res.status(400).json({ error: 'integrity_check != ok' });
    }
  } catch (e) {
    try { fs.unlinkSync(TMP); } catch {}
    return res.status(500).json({ error: 'integrity probe failed', detail: String(e) });
  }

  try {
    try { db?.close(); } catch {}
    try { if (fs.existsSync(DB_PATH)) fs.renameSync(DB_PATH, BAK); } catch {}
    fs.renameSync(TMP, DB_PATH);

    // mở thử + chạy schema để sync code hiện tại
    const test = new Database(DB_PATH);
    try {
      const r2 = test.prepare('PRAGMA integrity_check').get();
      if (!r2 || r2.integrity_check !== 'ok') throw new Error('integrity after swap != ok');
      const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      test.exec(sql);
    } finally { test.close(); }

    // mở lại DB chính
    openDb();
    runMigrations();

    try { fs.unlinkSync(BAK); } catch {}
    logLine('restore', 'success');
    return res.json({ ok: true, restarted: false });
  } catch (e) {
    // rollback
    logLine('restore', 'failed, rollback', { err: String(e) });
    try {
      if (fs.existsSync(BAK)) {
        try { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); } catch {}
        fs.renameSync(BAK, DB_PATH);
      }
      openDb(); runMigrations();
    } catch {}
    try { if (fs.existsSync(TMP)) fs.unlinkSync(TMP); } catch {}
    return res.status(500).json({ error: 'restore failed (rolled back)', detail: String(e) });
  }
});

// ==== WebSocket push state ====
const sockets = new Map(); // userId -> ws
wss.on('connection', (ws, req) => {
  const cookies = (req.headers.cookie || '').split(';').map(v => v.trim());
  const sid = (cookies.find(c => c.startsWith('sid=')) || 'sid=').split('=')[1];
  const sess = sid ? getSessionStmt.get(sid) : null;
  if (!sess) { ws.close(); return; }
  sockets.set(sess.user_id, ws);
  ws.on('close', () => sockets.delete(sess.user_id));
  logLine('ws', 'connected', { userId: sess.user_id });
});

function pushState(userId) {
  const ws = sockets.get(userId);
  if (!ws || ws.readyState !== 1) return;

  const me = getStateStmt.get(userId);
  const floors = getFloorsStmt.all(userId);
  const plots = floors.map(f => ({
    floor: f,
    plots: getPlotsByFloorStmt.all(f.id).map(p =>
      p.class ? { ...p, base_price: floorPriceBase(p.class) } : p
    )
  }));
  const potInv = invListPotsStmt.all(userId);
  const seedInv = invListSeedsStmt.all(userId);
  const market = marketOpenStmt.all();

  ws.send(JSON.stringify({
    type: 'state:update',
    payload: {
      me, floors, plots, potInv, seedInv, market,
      trapPrice: trapPriceForUser(userId),
      trapMax: trapMaxForUser(userId)
    }
  }));
}
setInterval(() => { for (const uid of sockets.keys()) pushState(uid); }, 3000);

// ==== Start ====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Game running on port ' + PORT);
});
