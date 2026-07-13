CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('advertiser', 'operator', 'institutional', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  institution_id TEXT,
  operator_limit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  operator TEXT NOT NULL,
  format TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  address TEXT NOT NULL,
  price INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  traffic INTEGER NOT NULL,
  income INTEGER NOT NULL,
  audience TEXT NOT NULL,
  competitor TEXT NOT NULL,
  occupancy INTEGER NOT NULL,
  image_interval INTEGER NOT NULL DEFAULT 6,
  max_loop_seconds INTEGER NOT NULL DEFAULT 120,
  available_from TEXT NOT NULL,
  available_to TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'approved',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  display_template TEXT NOT NULL DEFAULT 'fullscreen',
  comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  institution_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  advertiser TEXT NOT NULL,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  campaign TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  ad_slots INTEGER NOT NULL DEFAULT 1,
  creative_status TEXT NOT NULL,
  status TEXT NOT NULL,
  spend INTEGER NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  pop INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_resources (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  advertiser TEXT NOT NULL,
  amount INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  operator_payout INTEGER NOT NULL,
  status TEXT NOT NULL,
  method TEXT NOT NULL,
  gateway_ref TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS pop_logs (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  plays INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  played_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creatives (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'template',
  template TEXT NOT NULL,
  format TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  safe_zone INTEGER NOT NULL,
  distortion INTEGER NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  public_url TEXT,
  storage_path TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_comments (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_booking ON transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_pop_logs_booking ON pop_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_creatives_booking ON creatives(booking_id);
CREATE INDEX IF NOT EXISTS idx_approval_events_actor ON approval_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_comments_inventory ON inventory_comments(inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_institution ON inventory(institution_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings(created_by);
