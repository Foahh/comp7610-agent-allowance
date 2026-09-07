CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX conversations_scope_idx ON conversations(scope);

CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_scope_idx ON messages(scope);

CREATE TABLE allowances (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX allowances_scope_idx ON allowances(scope);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX quotes_scope_idx ON quotes(scope);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX purchases_scope_idx ON purchases(scope);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX jobs_scope_idx ON jobs(scope);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX challenges_scope_idx ON challenges(scope);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_scope_idx ON sessions(scope);
