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
  display_language TEXT NOT NULL DEFAULT 'en' CHECK (display_language IN ('en', 'fr')),
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
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending review', 'approved', 'rejected')),
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE media_resources
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved';

CREATE TABLE IF NOT EXISTS device_alerts (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('amber', 'weather', 'evacuation', 'public-safety')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  target_device_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  issued_by TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT
);

-- Add severe-weather alerts to existing installations as well as fresh databases.
ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS image JSONB;
ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS image_storage_path TEXT;
ALTER TABLE device_alerts DROP CONSTRAINT IF EXISTS device_alerts_alert_type_check;
ALTER TABLE device_alerts ADD CONSTRAINT device_alerts_alert_type_check
  CHECK (alert_type IN ('amber', 'weather', 'evacuation', 'public-safety'));

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

-- Authenticated player control (P1). Inventory/user ownership stays canonical.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  institution_id TEXT,
  credential_hash TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  expected_revision INTEGER NOT NULL DEFAULT 0,
  received_revision INTEGER NOT NULL DEFAULT 0,
  validated_revision INTEGER NOT NULL DEFAULT 0,
  applied_revision INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_active_inventory ON players(inventory_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS player_pairing_codes (
  inventory_id TEXT PRIMARY KEY REFERENCES inventory(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS player_manifests (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  manifest JSONB NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, revision)
);
CREATE TABLE IF NOT EXISTS player_pairing_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Phase 1: additive organization and inventory foundations. Legacy users.role,
-- inventory.format/x/y, and institution ownership remain compatibility inputs.
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('advertiser', 'agency', 'media_owner', 'institution', 'production_vendor', 'installation_vendor', 'platform')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  default_currency TEXT NOT NULL DEFAULT 'CAD',
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL CHECK (membership_role IN ('owner', 'admin', 'planner', 'account_manager', 'designer', 'reviewer', 'operations', 'finance', 'viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS owner_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS production_lead_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS installation_lead_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS measurement_source TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS measurement_updated_at TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS display_language TEXT NOT NULL DEFAULT 'en';

CREATE TABLE IF NOT EXISTS inventory_specifications (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  trim_width_mm INTEGER,
  trim_height_mm INTEGER,
  visible_width_mm INTEGER,
  visible_height_mm INTEGER,
  bleed_mm INTEGER,
  safe_area_mm INTEGER,
  scale_ratio TEXT,
  minimum_dpi INTEGER,
  colour_space TEXT,
  accepted_file_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  maximum_file_bytes BIGINT,
  substrate TEXT,
  finishing TEXT,
  template_url TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (inventory_id, version)
);

-- Phases 2–6: campaign, agency, creative and mode-specific fulfillment.
CREATE TABLE IF NOT EXISTS agency_clients (
  id TEXT PRIMARY KEY, agency_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL, default_language TEXT NOT NULL DEFAULT 'en', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS client_authorizations (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, capability TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  client_id TEXT REFERENCES agency_clients(id) ON DELETE SET NULL, brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL, objective TEXT NOT NULL, geography TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  budget_min INTEGER, budget_max INTEGER, target_audience TEXT, message TEXT, required_languages JSONB NOT NULL DEFAULT '["en"]'::jsonb,
  creative_path TEXT NOT NULL DEFAULT 'later', status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS placements (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT, delivery_mode TEXT NOT NULL,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested',
  estimated_media_cost INTEGER NOT NULL DEFAULT 0, estimated_production_cost INTEGER NOT NULL DEFAULT 0,
  estimated_installation_cost INTEGER NOT NULL DEFAULT 0, price_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  specification_snapshot JSONB, creative_due_at TEXT, version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(campaign_id, inventory_id, start_date, end_date)
);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', currency TEXT NOT NULL DEFAULT 'CAD',
  operator_confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL, operator_confirmed_at TEXT,
  created_at TEXT NOT NULL, UNIQUE(campaign_id, version)
);
CREATE TABLE IF NOT EXISTS quote_line_items (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  placement_id TEXT REFERENCES placements(id) ON DELETE CASCADE, category TEXT NOT NULL,
  description TEXT NOT NULL, amount INTEGER NOT NULL, is_estimate BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS commercial_acceptances (
  id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  accepted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, accepted_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'offline', note TEXT, UNIQUE(quote_id)
);
CREATE TABLE IF NOT EXISTS design_requests (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft', priority TEXT NOT NULL DEFAULT 'normal', assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_at TEXT, brief JSONB NOT NULL DEFAULT '{}'::jsonb, version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS creative_assets (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE, name TEXT NOT NULL, retention_until TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS creative_versions (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES creative_assets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted', preflight JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL, UNIQUE(asset_id, version)
);
CREATE TABLE IF NOT EXISTS creative_reviews (
  id TEXT PRIMARY KEY, creative_version_id TEXT NOT NULL REFERENCES creative_versions(id) ON DELETE RESTRICT,
  review_type TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT, actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  authorization_id TEXT REFERENCES client_authorizations(id) ON DELETE SET NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS creative_assignments (
  placement_id TEXT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  creative_version_id TEXT NOT NULL REFERENCES creative_versions(id) ON DELETE RESTRICT,
  assigned_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL,
  PRIMARY KEY(placement_id, creative_version_id)
);
CREATE TABLE IF NOT EXISTS production_jobs (
  id TEXT PRIMARY KEY, placement_id TEXT NOT NULL UNIQUE REFERENCES placements(id) ON DELETE CASCADE,
  vendor_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL, creative_version_id TEXT REFERENCES creative_versions(id) ON DELETE RESTRICT,
  substrate TEXT, quantity INTEGER NOT NULL DEFAULT 1, finishing TEXT, target_completion TEXT,
  status TEXT NOT NULL DEFAULT 'not_ready', version INTEGER NOT NULL DEFAULT 1, private_notes TEXT, retention_until TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS installation_work_orders (
  id TEXT PRIMARY KEY, placement_id TEXT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  work_type TEXT NOT NULL DEFAULT 'install', status TEXT NOT NULL DEFAULT 'not_ready', planned_at TEXT,
  assigned_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL, assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  access_notes TEXT, removal_at TEXT, completed_at TEXT, result TEXT, issue_code TEXT,
  version INTEGER NOT NULL DEFAULT 1, retention_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS proof_records (
  id TEXT PRIMARY KEY, placement_id TEXT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  work_order_id TEXT REFERENCES installation_work_orders(id) ON DELETE SET NULL, proof_type TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb, client_shareable BOOLEAN NOT NULL DEFAULT FALSE, public_shareable BOOLEAN NOT NULL DEFAULT FALSE,
  certified_by TEXT REFERENCES users(id) ON DELETE SET NULL, certified_at TEXT, retention_until TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_order_evidence (
  id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES installation_work_orders(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL, checksum TEXT NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS digital_delivery_events (
  id TEXT PRIMARY KEY, placement_id TEXT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE, creative_version_id TEXT REFERENCES creative_versions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, player_id TEXT, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS placement_issues (
  id TEXT PRIMARY KEY, placement_id TEXT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', detail TEXT, created_at TEXT NOT NULL, resolved_at TEXT
);
ALTER TABLE placements ADD COLUMN IF NOT EXISTS schedule_snapshot JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS schedule_snapshot JSONB;
-- Time-of-day slots in Toronto time (morning, midday, afternoon, evening, overnight). Empty means all day.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dayparts TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE digital_delivery_events ALTER COLUMN placement_id DROP NOT NULL;
ALTER TABLE digital_delivery_events ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'legacy_ingest';
ALTER TABLE digital_delivery_events ADD COLUMN IF NOT EXISTS manifest_revision INTEGER;
ALTER TABLE digital_delivery_events ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE digital_delivery_events ADD COLUMN IF NOT EXISTS sequence BIGINT;
ALTER TABLE digital_delivery_events ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE digital_delivery_events ADD COLUMN IF NOT EXISTS late BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE digital_delivery_events ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_player_sequence ON digital_delivery_events(player_id,session_id,sequence) WHERE provenance='authenticated_player';
CREATE INDEX IF NOT EXISTS idx_delivery_last_play ON digital_delivery_events(player_id,occurred_at DESC) WHERE provenance='authenticated_player' AND event_type='delivered';
ALTER TABLE placement_issues ADD COLUMN IF NOT EXISTS delivery_event_id TEXT REFERENCES digital_delivery_events(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_delivery_event ON placement_issues(delivery_event_id) WHERE delivery_event_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL,
  action TEXT NOT NULL, previous_state TEXT, next_state TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_until TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  subject_type TEXT, subject_id TEXT, read_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_records (
  scope TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(scope, idempotency_key)
);

INSERT INTO organizations (id, name, type, status, created_at, updated_at)
SELECT 'ORG-' || id, name,
  CASE role WHEN 'advertiser' THEN 'advertiser' WHEN 'institutional' THEN 'institution' WHEN 'admin' THEN 'platform' ELSE 'media_owner' END,
  'active', created_at, created_at
FROM users
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_memberships (organization_id, user_id, membership_role, created_at)
SELECT
  CASE WHEN role = 'operator' AND institution_id IS NOT NULL THEN 'ORG-' || institution_id ELSE 'ORG-' || id END,
  id,
  CASE role WHEN 'admin' THEN 'admin' WHEN 'operator' THEN 'operations' ELSE 'owner' END,
  created_at
FROM users
ON CONFLICT (organization_id, user_id) DO NOTHING;

UPDATE inventory SET owner_organization_id = 'ORG-' || institution_id
WHERE owner_organization_id IS NULL AND institution_id IS NOT NULL;
UPDATE inventory SET owner_organization_id = 'ORG-' || created_by
WHERE owner_organization_id IS NULL AND created_by IS NOT NULL AND EXISTS (SELECT 1 FROM organizations WHERE id = 'ORG-' || inventory.created_by);
UPDATE inventory SET delivery_mode = CASE format WHEN 'digital' THEN 'digital' WHEN 'static' THEN 'static' ELSE 'unknown' END
WHERE delivery_mode = 'unknown' AND format IN ('digital', 'static');
UPDATE inventory SET product_type = format WHERE product_type IS NULL;

-- Stable compatibility bridge for legacy single-placement bookings. This runs on
-- every migration and never mutates the legacy source rows.
INSERT INTO campaigns
  (id, organization_id, name, objective, geography, start_date, end_date,
   creative_path, status, created_by, created_at, updated_at)
SELECT 'CMP-LEGACY-' || bookings.id, 'ORG-' || bookings.created_by,
  bookings.campaign, 'Legacy booking migration', inventory.address,
  bookings.start_date, bookings.end_date, 'upload',
  CASE WHEN bookings.status = 'approved' THEN 'confirmed' ELSE 'planning' END,
  bookings.created_by, bookings.created_at, bookings.updated_at
FROM bookings JOIN inventory ON inventory.id = bookings.inventory_id
WHERE bookings.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM organizations WHERE id = 'ORG-' || bookings.created_by)
ON CONFLICT (id) DO NOTHING;

INSERT INTO placements
  (id, campaign_id, inventory_id, delivery_mode, start_date, end_date, status,
   estimated_media_cost, price_snapshot, created_at, updated_at)
SELECT 'PLC-LEGACY-' || bookings.id, 'CMP-LEGACY-' || bookings.id,
  bookings.inventory_id, COALESCE(inventory.delivery_mode, 'digital'),
  bookings.start_date, bookings.end_date,
  CASE WHEN bookings.status = 'approved' THEN 'confirmed' ELSE 'requested' END,
  bookings.spend,
  jsonb_build_object('legacyBookingId', bookings.id, 'amount', bookings.spend,
    'currency', 'CAD', 'capturedAt', bookings.created_at),
  bookings.created_at, bookings.updated_at
FROM bookings
JOIN inventory ON inventory.id = bookings.inventory_id
JOIN campaigns ON campaigns.id = 'CMP-LEGACY-' || bookings.id
ON CONFLICT (id) DO NOTHING;

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
CREATE INDEX IF NOT EXISTS idx_device_alerts_institution ON device_alerts(institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_active ON device_alerts(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_device_alerts_targets ON device_alerts USING GIN (target_device_ids);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_owner_org ON inventory(owner_organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_delivery_mode ON inventory(delivery_mode);
CREATE INDEX IF NOT EXISTS idx_inventory_specs_active ON inventory_specifications(inventory_id, status, version DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_placements_campaign ON placements(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_design_requests_queue ON design_requests(status, due_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_queue ON installation_work_orders(status, planned_at);
CREATE INDEX IF NOT EXISTS idx_work_order_evidence_order ON work_order_evidence(work_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_subject ON activity_events(subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

-- P4: additive fleet controls. Legacy content stays public; marketplace participation is explicit.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS building TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS content_visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS advertising_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS restricted_categories JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reserved_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS fleet_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS screen_scope JSONB;
ALTER TABLE media_resources ADD COLUMN IF NOT EXISTS starts_at TEXT;
ALTER TABLE media_resources ADD COLUMN IF NOT EXISTS ends_at TEXT;
ALTER TABLE media_resources ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_category TEXT NOT NULL DEFAULT 'general';
CREATE TABLE IF NOT EXISTS fleet_audit (
 id TEXT PRIMARY KEY, actor_id TEXT, institution_id TEXT, target_id TEXT NOT NULL,
 action TEXT NOT NULL, revision INTEGER, priority TEXT NOT NULL DEFAULT 'ordinary',
 result TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fleet_audit_scope ON fleet_audit(institution_id,created_at DESC);
CREATE TABLE IF NOT EXISTS fleet_announcements (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 media_id TEXT NOT NULL REFERENCES media_resources(id) ON DELETE CASCADE, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS player_alert_state (
 player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 alert_id TEXT NOT NULL REFERENCES device_alerts(id) ON DELETE CASCADE,
 received_at TIMESTAMPTZ, applied_at TIMESTAMPTZ, rendered_at TIMESTAMPTZ, restored_at TIMESTAMPTZ,
 revision INTEGER NOT NULL, PRIMARY KEY(player_id,alert_id)
);
-- Non-institution inventory preserves marketplace compatibility. Run this migration only once.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_metadata WHERE key='p4_advertising_defaults') THEN
  UPDATE inventory SET advertising_opt_in=TRUE WHERE institution_id IS NULL;
  INSERT INTO app_metadata(key,value) VALUES('p4_advertising_defaults','1');
 END IF;
END $$;
ALTER TABLE fleet_audit ADD COLUMN IF NOT EXISTS target_scope JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE fleet_audit ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE fleet_audit ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '7 years');
ALTER TABLE player_alert_state ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '90 days');

-- Alert Ready relay (ADR 0010). Official CAP-CP alerts from the NAAD System,
-- which screens they cover, and how each institution wants them shown.
CREATE TABLE IF NOT EXISTS official_alerts (
  key TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  sender TEXT NOT NULL,
  sent TEXT NOT NULL,
  status TEXT NOT NULL,
  msg_type TEXT NOT NULL,
  reference_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  event TEXT NOT NULL DEFAULT '',
  broadcast_immediately BOOLEAN NOT NULL DEFAULT FALSE,
  signature TEXT NOT NULL CHECK (signature IN ('verified', 'unverified', 'unsigned', 'no-trusted-certificate')),
  expires_at TEXT,
  infos JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_xml TEXT,
  received_via TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_official_alerts_received ON official_alerts(received_at DESC);

CREATE TABLE IF NOT EXISTS official_alert_matches (
  alert_key TEXT NOT NULL REFERENCES official_alerts(key) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inventory_id TEXT NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  area_match TEXT NOT NULL,
  PRIMARY KEY (alert_key, inventory_id)
);
CREATE INDEX IF NOT EXISTS idx_official_alert_matches_institution ON official_alert_matches(institution_id, alert_key);

CREATE TABLE IF NOT EXISTS alert_ready_settings (
  institution_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'review' CHECK (mode IN ('off', 'review', 'automatic')),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_ready_feed (
  id TEXT PRIMARY KEY,
  last_heartbeat_at TEXT,
  last_alert_at TEXT,
  updated_at TEXT NOT NULL
);

ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'institution';
ALTER TABLE device_alerts ADD COLUMN IF NOT EXISTS official_alert_key TEXT;
CREATE INDEX IF NOT EXISTS idx_device_alerts_official ON device_alerts(official_alert_key) WHERE official_alert_key IS NOT NULL;

-- Response tracking (QR code and short link per booking). No personal data:
-- a response event stores only its time. See docs/RESULTS_REPORTING.md.
CREATE TABLE IF NOT EXISTS response_links (
  code TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,
  on_ad BOOLEAN NOT NULL DEFAULT FALSE,
  promo_code TEXT,
  promo_redemptions INTEGER NOT NULL DEFAULT 0 CHECK (promo_redemptions >= 0),
  promo_updated_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS response_events (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL REFERENCES response_links(code) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_response_events_code ON response_events(code, occurred_at);
