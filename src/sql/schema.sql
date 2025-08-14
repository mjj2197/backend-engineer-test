CREATE TABLE IF NOT EXISTS blocks (
  height INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  height INTEGER NOT NULL REFERENCES blocks(height) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outputs (
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  address TEXT NOT NULL,
  value NUMERIC NOT NULL CHECK (value >= 0),
  spent BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (tx_id, idx)
);

CREATE TABLE IF NOT EXISTS inputs (
  tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  in_idx INTEGER NOT NULL,
  ref_tx_id TEXT NOT NULL,
  ref_index INTEGER NOT NULL,
  PRIMARY KEY (tx_id, in_idx),
  FOREIGN KEY (ref_tx_id, ref_index) REFERENCES outputs(tx_id, idx) ON DELETE RESTRICT
);

-- helpful indexes
CREATE INDEX IF NOT EXISTS outputs_address_spent_idx ON outputs (address, spent);
CREATE INDEX IF NOT EXISTS transactions_height_idx ON transactions (height);
