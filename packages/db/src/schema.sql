CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  scenario TEXT NOT NULL CHECK (scenario IN ('success', 'insufficient')),
  allowance_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_lookup_idx ON conversations (owner, created_at);
CREATE TABLE IF NOT EXISTS allowances (
  allowance_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id)
);
CREATE INDEX IF NOT EXISTS allowances_lookup_idx ON allowances (conversation_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_lookup_idx ON messages (conversation_id, created_at);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT REFERENCES conversations(id),
  allowance_id TEXT NOT NULL,
  service TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  signature TEXT NOT NULL,
  task_service TEXT NOT NULL CHECK (task_service IN ('analysis', 'writing')),
  brief TEXT NOT NULL,
  evidence TEXT NOT NULL,
  deliverable TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quotes_lookup_idx ON quotes (conversation_id);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY NOT NULL REFERENCES quotes(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('prepared', 'pending', 'confirmed', 'reverted', 'rejected')),
  tx_hash TEXT,
  raw_transaction TEXT,
  gas_used TEXT,
  gas_wei TEXT,
  error TEXT,
  nonce INTEGER,
  payment_ms REAL,
  broadcast_ms REAL,
  confirmation_ms REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS purchases_lookup_idx ON purchases (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS purchases_payment_status_idx ON purchases (payment_status);
CREATE TABLE IF NOT EXISTS deliveries (
  purchase_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  content TEXT NOT NULL,
  model_ms REAL NOT NULL,
  delivery_ms REAL NOT NULL,
  error TEXT
);
CREATE TABLE IF NOT EXISTS delivery_references (
  purchase_id TEXT NOT NULL REFERENCES deliveries(purchase_id),
  position INTEGER NOT NULL,
  reference TEXT NOT NULL,
  PRIMARY KEY (purchase_id, position)
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  accepted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_lookup_idx ON runs (conversation_id);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS challenges_lookup_idx ON challenges (expires_at);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_lookup_idx ON sessions (expires_at);
