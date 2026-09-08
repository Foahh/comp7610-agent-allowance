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
  snapshot TEXT NOT NULL,
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
  task_service TEXT NOT NULL,
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
  file_name TEXT,
  file_size INTEGER,
  file_media_type TEXT,
  file_hash TEXT,
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

CREATE TABLE IF NOT EXISTS deleted_conversations (
  conversation_id TEXT PRIMARY KEY NOT NULL REFERENCES conversations(id),
  deleted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  buyer_model_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_connections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  encrypted_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  hash TEXT NOT NULL,
  readable INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_versions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  preview TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'link', 'file', 'ai-service')),
  amount TEXT NOT NULL,
  content TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  instructions TEXT NOT NULL,
  required_inputs TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS listing_heads (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  published_version INTEGER,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'inactive')),
  FOREIGN KEY (id, version) REFERENCES listing_versions(id, version),
  FOREIGN KEY (id, published_version) REFERENCES listing_versions(id, version)
);

CREATE TABLE IF NOT EXISTS listing_assets (
  listing_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (listing_id, version, position),
  FOREIGN KEY (listing_id, version) REFERENCES listing_versions(id, version)
);

CREATE TABLE IF NOT EXISTS seller_connections (
  id TEXT PRIMARY KEY NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  vault TEXT NOT NULL,
  token TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'identity-changed')),
  checked_at INTEGER NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS connected_listings (
  connection_id TEXT NOT NULL REFERENCES seller_connections(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  preview TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'link', 'file', 'ai-service')),
  amount TEXT NOT NULL,
  required_inputs TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  scope TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (connection_id, id, version)
);

CREATE TABLE IF NOT EXISTS quote_requests (
  request_key TEXT PRIMARY KEY NOT NULL,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  task_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_jobs (
  purchase_id TEXT PRIMARY KEY NOT NULL REFERENCES quotes(id),
  snapshot TEXT NOT NULL,
  tx_hash TEXT,
  paid INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_destinations (
  purchase_id TEXT PRIMARY KEY NOT NULL,
  endpoint TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchased_files (
  purchase_id TEXT PRIMARY KEY NOT NULL REFERENCES purchases(id),
  path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installations (
  role TEXT PRIMARY KEY NOT NULL,
  chain TEXT NOT NULL,
  vault TEXT NOT NULL,
  signer TEXT NOT NULL
);
