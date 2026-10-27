-- ============================================================
-- MIGRATION: Add teams, roles, invites, share links, task assignment
-- ============================================================
-- Apply this migration in Neon SQL Editor BEFORE deploying new code.
-- This migration is non-destructive and backfills existing data.
-- ============================================================

-- 1. Create competition_members table
CREATE TABLE competition_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id TEXT,  -- nullable until invite accepted
    invited_email TEXT,  -- nullable, for pending invites
    role TEXT NOT NULL CHECK (role IN ('owner', 'lead', 'backend', 'frontend', 'designer', 'pitch', 'member')),
    status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'removed')) DEFAULT 'invited',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (competition_id, user_id)
);

-- Index for common queries
CREATE INDEX competition_members_competition_idx ON competition_members(competition_id);
CREATE INDEX competition_members_user_idx ON competition_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX competition_members_email_idx ON competition_members(invited_email) WHERE invited_email IS NOT NULL;

-- 2. Create competition_invites table
CREATE TABLE competition_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,  -- SHA-256 hash only, never store raw token
    role TEXT NOT NULL CHECK (role IN ('lead', 'backend', 'frontend', 'designer', 'pitch', 'member')),
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses INTEGER NOT NULL DEFAULT 0,
    revoked_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX competition_invites_competition_idx ON competition_invites(competition_id);
CREATE INDEX competition_invites_token_hash_idx ON competition_invites(token_hash);

-- 3. Create share_links table
CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,  -- SHA-256 hash only
    scope TEXT NOT NULL CHECK (scope IN ('read_only_plan', 'my_tasks')),
    member_id UUID REFERENCES competition_members(id) ON DELETE SET NULL,  -- nullable for plan scope
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX share_links_competition_idx ON share_links(competition_id);
CREATE INDEX share_links_token_hash_idx ON share_links(token_hash);
CREATE INDEX share_links_member_idx ON share_links(member_id) WHERE member_id IS NOT NULL;

-- 4. Add assignee_member_id and blocked_reason to workflow_tasks
ALTER TABLE workflow_tasks
    ADD COLUMN assignee_member_id UUID REFERENCES competition_members(id) ON DELETE SET NULL,
    ADD COLUMN blocked_reason TEXT;

CREATE INDEX workflow_tasks_assignee_idx ON workflow_tasks(assignee_member_id) WHERE assignee_member_id IS NOT NULL;

-- 5. Backfill: Create owner member row for each existing competition
-- This ensures every existing competition has an owner in the new system
INSERT INTO competition_members (competition_id, user_id, role, status)
SELECT c.id, c.owner_id, 'owner', 'active'
FROM competitions c
WHERE NOT EXISTS (
    SELECT 1 FROM competition_members cm
    WHERE cm.competition_id = c.id AND cm.user_id = c.owner_id
)
ON CONFLICT (competition_id, user_id) DO NOTHING;

-- 6. Add updated_at trigger for competition_members (if not exists)
-- Note: competitions table already has updated_at with $onUpdate
-- We'll add a similar pattern for consistency if needed, but it's not strictly necessary

-- ============================================================
-- VERIFICATION QUERIES (run after migration to verify)
-- ============================================================

-- Check competition_members count matches competitions
-- SELECT COUNT(*) FROM competitions;
-- SELECT COUNT(*) FROM competition_members WHERE status = 'active' AND role = 'owner';

-- Check indexes created
-- \di competition_members_*
-- \di competition_invites_*
-- \di share_links_*
-- \di workflow_tasks_assignee_idx

-- ============================================================
-- ROLLBACK SQL (if needed)
-- ============================================================
/*
-- ROLLBACK - Run in reverse order
-- WARNING: This will DELETE all member, invite, and share link data!

DROP INDEX IF EXISTS workflow_tasks_assignee_idx;
ALTER TABLE workflow_tasks DROP COLUMN IF EXISTS assignee_member_id;
ALTER TABLE workflow_tasks DROP COLUMN IF EXISTS blocked_reason;

DROP TABLE IF EXISTS share_links;
DROP TABLE IF EXISTS competition_invites;
DROP TABLE IF EXISTS competition_members;
*/