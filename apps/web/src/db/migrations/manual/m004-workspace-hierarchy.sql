-- M004: Workspace Hierarchy & Joint Opportunities
-- Run this against production BEFORE deploying the new code.
-- All statements are idempotent (safe to run multiple times).
-- 
-- What this does:
--   1. Creates workspace_type enum (agency/company/business_unit)
--   2. Adds 'type' and 'parent_workspace_id' columns to workspaces
--   3. Sets all existing workspaces to type='company' (no parent)
--   4. Adds 'is_joint' column to records
--   5. Creates deal_participations table
--   6. Adds indexes
--
-- Estimated time: <1 second on typical production data
-- Downtime required: NONE — all changes are additive, backward-compatible
-- Rollback: DROP the new columns/table/enum (see bottom of file)

BEGIN;

-- 1. Create workspace_type enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspace_type') THEN
    CREATE TYPE workspace_type AS ENUM ('agency', 'company', 'business_unit');
  END IF;
END
$$;

-- 2. Add 'type' column to workspaces (default='company' means existing rows auto-fill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'type'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN "type" workspace_type NOT NULL DEFAULT 'company';
  END IF;
END
$$;

-- 3. Add 'parent_workspace_id' self-referential FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'parent_workspace_id'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN parent_workspace_id text
      REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- 4. Add 'is_joint' column to records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'records' AND column_name = 'is_joint'
  ) THEN
    ALTER TABLE records ADD COLUMN is_joint boolean NOT NULL DEFAULT false;
  END IF;
END
$$;

-- 5. Create deal_participations table
CREATE TABLE IF NOT EXISTS deal_participations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  record_id text NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'participant',
  notes text,
  added_at timestamp NOT NULL DEFAULT now(),
  added_by text REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Indexes (CREATE INDEX IF NOT EXISTS is idempotent)
CREATE INDEX IF NOT EXISTS workspaces_parent ON workspaces (parent_workspace_id);
CREATE INDEX IF NOT EXISTS workspaces_type ON workspaces (type);
CREATE UNIQUE INDEX IF NOT EXISTS deal_participations_record_workspace
  ON deal_participations (record_id, workspace_id);
CREATE INDEX IF NOT EXISTS deal_participations_record ON deal_participations (record_id);
CREATE INDEX IF NOT EXISTS deal_participations_workspace ON deal_participations (workspace_id);

COMMIT;

-- Verify (run these SELECT queries to confirm):
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_name = 'workspaces' AND column_name IN ('type', 'parent_workspace_id');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'deal_participations';
-- SELECT count(*) FROM workspaces WHERE type = 'company'; -- should equal total workspaces


-- ============================================================
-- ROLLBACK (only if you need to undo — drops all M004 changes)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS deal_participations;
-- ALTER TABLE records DROP COLUMN IF EXISTS is_joint;
-- ALTER TABLE workspaces DROP COLUMN IF EXISTS parent_workspace_id;
-- ALTER TABLE workspaces DROP COLUMN IF EXISTS type;
-- DROP TYPE IF EXISTS workspace_type;
-- COMMIT;
