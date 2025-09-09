PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS floors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  idx INTEGER NOT NULL DEFAULT 1,
  unlocked INTEGER NOT NULL DEFAULT 1,
  trap_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  pot_id INTEGER,
  pot_type TEXT,
  seed_id INTEGER,
  class TEXT,
  stage TEXT NOT NULL DEFAULT 'empty',
  planted_at INTEGER,
  mature_at INTEGER,
  mutation TEXT DEFAULT NULL,              -- NEW: mutation tier cho seed đang trồng (green/blue/gold...)
  FOREIGN KEY(floor_id) REFERENCES floors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_pots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  speed_mult REAL NOT NULL,
  yield_mult REAL NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  class TEXT NOT NULL,
  base_price INTEGER NOT NULL,
  is_mature INTEGER NOT NULL DEFAULT 0, 
  mutation TEXT DEFAULT NULL,              -- NEW: mutation tier cho seed (green/blue/gold...)
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seed_catalog (
  class TEXT PRIMARY KEY,
  base_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,   -- 'seed'
  item_id INTEGER NOT NULL,  -- escrow id in inventory (deleted from inv until sold)
  class TEXT NOT NULL,
  base_price INTEGER NOT NULL,
  ask_price INTEGER NOT NULL,
  status TEXT NOT NULL,      -- 'open' | 'sold'
  created_at INTEGER NOT NULL,
  mutation TEXT DEFAULT NULL,              -- NEW: mutation tier cho seed rao bán (giữ màu/multiplier)
  FOREIGN KEY(seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  payload TEXT,
  at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS floors_user_idx_unique ON floors(user_id, idx);
CREATE UNIQUE INDEX IF NOT EXISTS plots_floor_slot_unique ON plots(floor_id, slot);
