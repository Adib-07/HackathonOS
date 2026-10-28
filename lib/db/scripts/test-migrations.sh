#!/usr/bin/env bash
# Disposable-database migration test for HackathonOS.
#
# Creates a throwaway PostgreSQL database, seeds it with the pre-migration
# schema and representative rows, then runs the real migration files against
# it and asserts the records survive.
#
# This NEVER touches the development or production database. The database name
# is prefixed with "hackathon_os_migtest_" and dropped at the end.
set -euo pipefail

DB_ROOT="hackathon_os_migtest_$$"
DB_NAME="${DB_ROOT}"
export PGPASSWORD=""
PSQL=(psql -h localhost -U "${PGUSER:-$(whoami)}" -v ON_ERROR_STOP=1 -q)

cleanup() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" >/dev/null 2>&1 || true
  echo "dropped ${DB_NAME}"
}
trap cleanup EXIT

echo "== creating disposable database ${DB_NAME}"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE \"${DB_NAME}\";"

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../drizzle" && pwd)"

echo "== seeding pre-migration schema and representative rows"
"${PSQL[@]}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/0000_baseline_existing_schema.sql"

"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competitions (id, owner_id, name, deadline, mandatory_deliverables, team_skills, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner-a', 'Migration Test Alpha', now() + interval '7 days', ARRAY['Demo','Repo'], ARRAY['TS'], 'preparing'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b', 'Migration Test Beta', now() + interval '3 days', ARRAY['Video'], ARRAY['Go'], 'active');

INSERT INTO workflow_plans (id, competition_id, version, deadline, available_minutes, buffer_minutes, status, trigger)
VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 1, now() + interval '7 days', 600, 60, 'feasible', 'manual'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 3, now() + interval '3 days', 240, 30, 'at_risk', 'manual');

INSERT INTO workflow_tasks (id, competition_id, plan_id, task_key, title, description, phase, priority, estimated_minutes, planned_start_at, planned_end_at, status, acceptance_criteria, verification_method, risk_if_skipped, mandatory)
VALUES
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'build-product', 'Build it', 'Build the product', 'implementation', 'critical', 120, now(), now() + interval '2 hours', 'done', ARRAY['It runs'], 'Run the app', 'Nothing to demo', true),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'test-product', 'Test it', 'Test the product', 'testing', 'critical', 60, now() + interval '2 hours', now() + interval '3 hours', 'todo', ARRAY['Checks pass'], 'Run the tests', 'Untested', false),
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'build-product', 'Build it too', 'Build the product', 'implementation', 'critical', 90, now(), now() + interval '90 minutes', 'done', ARRAY['It runs'], 'Run the app', 'Nothing to demo', true);
SQL

count_rows() {
  local table="$1"
  "${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM ${table};"
}

row_snapshot() {
  printf '%s:%s:%s' \
    "$(count_rows competitions)" \
    "$(count_rows workflow_plans)" \
    "$(count_rows workflow_tasks)"
}

BEFORE="$(row_snapshot)"
echo "== rows before migration: ${BEFORE}"

echo "== applying migration 0001 (the additive evidence migration)"
"${PSQL[@]}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/0001_add_workflow_evidence.sql"

echo "== applying migration 0002 (the additive intel engine migration)"
"${PSQL[@]}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/0002_add_intel_engine_tables.sql"

AFTER="$(row_snapshot)"
echo "== rows after migration:  ${AFTER}"

if [ "${BEFORE}" != "${AFTER}" ]; then
  echo "FAIL: row counts changed by the migration (${BEFORE} -> ${AFTER})"
  exit 1
fi
echo "PASS: all pre-existing rows survived the migration"

echo "== verifying the evidence table exists with the expected shape"
COLS=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_name='workflow_evidence';")
if [ "${COLS}" != "16" ]; then
  echo "FAIL: expected 16 columns on workflow_evidence, found ${COLS}"
  exit 1
fi
echo "PASS: workflow_evidence created with 16 columns"

echo "== verifying the evidence foreign keys cascade and null correctly"
"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO workflow_evidence (competition_id, task_id, task_key, type, summary, result, observed_at, phase_snapshot, verification_method_snapshot)
VALUES ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'build-product', 'TEST_RESULT', 'seeded', 'passed', now(), 'implementation', 'Run the app');
SQL
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM workflow_tasks WHERE id='55555555-5555-5555-5555-555555555555';"
ORPHAN=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM workflow_evidence WHERE task_id IS NULL;")
if [ "${ORPHAN}" != "1" ]; then
  echo "FAIL: expected the evidence task_id to be nulled on task delete, found ${ORPHAN}"
  exit 1
fi
echo "PASS: deleting a task nulls the evidence task_id instead of destroying the record"

echo "== verifying deleting a competition cascades to its evidence"
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM competitions WHERE id='11111111-1111-1111-1111-111111111111';"
CASCADE=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM workflow_evidence WHERE competition_id='11111111-1111-1111-1111-111111111111';")
if [ "${CASCADE}" != "0" ]; then
  echo "FAIL: expected evidence to cascade on competition delete, found ${CASCADE}"
  exit 1
fi
echo "PASS: deleting a competition cascades to its evidence"

echo "== verifying the other owner's records are untouched"
REMAIN=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competitions WHERE owner_id='owner-b';")
if [ "${REMAIN}" != "1" ]; then
  echo "FAIL: expected owner-b competition to survive, found ${REMAIN}"
  exit 1
fi
echo "PASS: unrelated records survived"

echo "== verifying the intel engine tables exist with the expected shape"
for table in competition_analyses analysis_requirements research_findings research_gaps idea_candidates idea_evaluations idea_rubrics build_briefs; do
  count=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_name='${table}';")
  if [ "${count}" != "1" ]; then
    echo "FAIL: expected table ${table} to exist"
    exit 1
  fi
done
echo "PASS: all 8 intel engine tables created"

echo "== verifying the intel engine tables are scoped to a competition"
FK=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM pg_constraint WHERE conname='research_findings_competition_id_competitions_id_fk';")
if [ "${FK}" != "1" ]; then
  echo "FAIL: research_findings is not scoped to a competition"
  exit 1
fi
echo "PASS: research findings are scoped to a competition"

echo "== verifying a competition delete cascades through the intel tables"
"${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO research_findings (competition_id, title, provider, summary) VALUES ('22222222-2222-2222-2222-222222222222', 'seeded finding', 'manual', 'seeded');" >/dev/null
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM competitions WHERE id='22222222-2222-2222-2222-222222222222';" >/dev/null
CASCADE2=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM research_findings WHERE competition_id='22222222-2222-2222-2222-222222222222';")
if [ "${CASCADE2}" != "0" ]; then
  echo "FAIL: expected research findings to cascade on competition delete, found ${CASCADE2}"
  exit 1
fi
echo "PASS: deleting a competition cascades to its research findings"

# ============================================================
# Migration 0003: teams, roles, invites, share links, task assignment
# ============================================================

# Re-seed the database with the pre-migration state for testing 0003
echo
echo "== Re-seeding for migration 0003 test"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE \"${DB_NAME}\";"
"${PSQL[@]}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/0000_baseline_existing_schema.sql"
"${PSQL[@]}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/0001_add_workflow_evidence.sql"
"${PSQL[@]}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/0002_add_intel_engine_tables.sql"

"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competitions (id, owner_id, name, deadline, mandatory_deliverables, team_skills, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner-a', 'Migration Test Alpha', now() + interval '7 days', ARRAY['Demo','Repo'], ARRAY['TS'], 'preparing'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b', 'Migration Test Beta', now() + interval '3 days', ARRAY['Video'], ARRAY['Go'], 'active');

INSERT INTO workflow_plans (id, competition_id, version, deadline, available_minutes, buffer_minutes, status, trigger)
VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 1, now() + interval '7 days', 600, 60, 'feasible', 'manual'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 3, now() + interval '3 days', 240, 30, 'at_risk', 'manual');

INSERT INTO workflow_tasks (id, competition_id, plan_id, task_key, title, description, phase, priority, estimated_minutes, planned_start_at, planned_end_at, status, acceptance_criteria, verification_method, risk_if_skipped, mandatory)
VALUES
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'build-product', 'Build it', 'Build the product', 'implementation', 'critical', 120, now(), now() + interval '2 hours', 'done', ARRAY['It runs'], 'Run the app', 'Nothing to demo', true),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'test-product', 'Test it', 'Test the product', 'testing', 'critical', 60, now() + interval '2 hours', now() + interval '3 hours', 'todo', ARRAY['Checks pass'], 'Run the tests', 'Untested', false),
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'build-product', 'Build it too', 'Build the product', 'implementation', 'critical', 90, now(), now() + interval '90 minutes', 'done', ARRAY['It runs'], 'Run the app', 'Nothing to demo', true);
SQL

echo "== applying migration 0003 (teams, roles, invites, share links, task assignment)"
"${PSQL[@]}" -d "${DB_NAME}" -f "${MIGRATIONS_DIR}/0003_add_teams_roles_sharing.sql"

echo "== verifying competition_members table exists with expected columns"
MEMBER_COLS=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_name='competition_members';")
if [ "${MEMBER_COLS}" != "7" ]; then
  echo "FAIL: expected 7 columns on competition_members, found ${MEMBER_COLS}"
  exit 1
fi
echo "PASS: competition_members created with 7 columns"

echo "== verifying competition_invites table exists with expected columns"
INVITE_COLS=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_name='competition_invites';")
if [ "${INVITE_COLS}" != "10" ]; then
  echo "FAIL: expected 10 columns on competition_invites, found ${INVITE_COLS}"
  exit 1
fi
echo "PASS: competition_invites created with 10 columns"

echo "== verifying share_links table exists with expected columns"
SHARE_COLS=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_name='share_links';")
if [ "${SHARE_COLS}" != "9" ]; then
  echo "FAIL: expected 9 columns on share_links, found ${SHARE_COLS}"
  exit 1
fi
echo "PASS: share_links created with 9 columns"

echo "== verifying workflow_tasks has assignee_member_id and blocked_reason columns"
TASK_COLS=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_name='workflow_tasks' AND column_name IN ('assignee_member_id', 'blocked_reason');")
if [ "${TASK_COLS}" != "2" ]; then
  echo "FAIL: expected 2 new columns on workflow_tasks, found ${TASK_COLS}"
  exit 1
fi
echo "PASS: workflow_tasks has assignee_member_id and blocked_reason columns"

echo "== verifying backfill created owner membership for each competition"
OWNER_COUNT=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competition_members WHERE role='owner' AND status='active';")
if [ "${OWNER_COUNT}" != "2" ]; then
  echo "FAIL: expected 2 owner memberships (one per competition), found ${OWNER_COUNT}"
  exit 1
fi
echo "PASS: owner membership backfill created 2 records"

echo "== verifying owner membership references correct competition and user"
OWNER_A=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competition_members WHERE competition_id='11111111-1111-1111-1111-111111111111' AND user_id='owner-a' AND role='owner' AND status='active';")
OWNER_B=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competition_members WHERE competition_id='22222222-2222-2222-2222-222222222222' AND user_id='owner-b' AND role='owner' AND status='active';")
if [ "${OWNER_A}" != "1" ] || [ "${OWNER_B}" != "1" ]; then
  echo "FAIL: owner memberships don't match expected competition/user pairs"
  exit 1
fi
echo "PASS: owner memberships correctly reference competitions and owners"

echo "== verifying competition_members foreign key cascades on competition delete"
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM competitions WHERE id='11111111-1111-1111-1111-111111111111';"
CASCADE_MEMBERS=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competition_members WHERE competition_id='11111111-1111-1111-1111-111111111111';")
if [ "${CASCADE_MEMBERS}" != "0" ]; then
  echo "FAIL: expected competition_members to cascade on competition delete, found ${CASCADE_MEMBERS}"
  exit 1
fi
echo "PASS: competition_members cascade on competition delete"

echo "== verifying competition_invites foreign key cascades on competition delete"
"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competitions (id, owner_id, name, deadline, mandatory_deliverables, team_skills, status)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-cascade-1', 'Cascade Test 1', now() + interval '7 days', ARRAY['Demo'], ARRAY['TS'], 'preparing');
INSERT INTO competition_invites (competition_id, token_hash, role, expires_at, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash123', 'member', now() + interval '1 day', 'owner-cascade-1');
SQL
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM competitions WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';"
CASCADE_INVITES=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competition_invites WHERE competition_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';")
if [ "${CASCADE_INVITES}" != "0" ]; then
  echo "FAIL: expected competition_invites to cascade on competition delete, found ${CASCADE_INVITES}"
  exit 1
fi
echo "PASS: competition_invites cascade on competition delete"

echo "== verifying share_links foreign key cascades on competition delete"
"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competitions (id, owner_id, name, deadline, mandatory_deliverables, team_skills, status)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner-cascade-2', 'Cascade Test 2', now() + interval '7 days', ARRAY['Demo'], ARRAY['TS'], 'preparing');
INSERT INTO share_links (competition_id, token_hash, scope, expires_at, created_by)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hash456', 'read_only_plan', now() + interval '1 day', 'owner-cascade-2');
SQL
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM competitions WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';"
CASCADE_SHARES=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM share_links WHERE competition_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';")
if [ "${CASCADE_SHARES}" != "0" ]; then
  echo "FAIL: expected share_links to cascade on competition delete, found ${CASCADE_SHARES}"
  exit 1
fi
echo "PASS: share_links cascade on competition delete"

echo "== verifying share_links member_id SET NULL on member delete"
# Re-create a competition and member for this test
"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competitions (id, owner_id, name, deadline, mandatory_deliverables, team_skills, status)
VALUES ('33333333-3333-3333-3333-333333333333', 'owner-c', 'Migration Test Gamma', now() + interval '7 days', ARRAY['Demo'], ARRAY['TS'], 'preparing');
INSERT INTO competition_members (competition_id, user_id, role, status)
VALUES ('33333333-3333-3333-3333-333333333333', 'owner-c', 'owner', 'active');
INSERT INTO share_links (competition_id, token_hash, scope, member_id, expires_at, created_by)
SELECT '33333333-3333-3333-3333-333333333333', 'hash789', 'my_tasks', id, now() + interval '1 day', 'owner-c'
FROM competition_members WHERE competition_id='33333333-3333-3333-3333-333333333333' AND user_id='owner-c';
SQL
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM competition_members WHERE competition_id='33333333-3333-3333-3333-333333333333' AND user_id='owner-c';"
NULL_SHARE=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM share_links WHERE member_id IS NULL AND token_hash='hash789';")
if [ "${NULL_SHARE}" != "1" ]; then
  echo "FAIL: expected share_links member_id to be nulled on member delete, found ${NULL_SHARE}"
  exit 1
fi
echo "PASS: share_links member_id set to NULL on member delete"

echo "== verifying workflow_tasks assignee_member_id SET NULL on member delete"
"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competitions (id, owner_id, name, deadline, mandatory_deliverables, team_skills, status)
VALUES ('44444444-4444-4444-4444-444444444444', 'owner-d', 'Migration Test Delta', now() + interval '7 days', ARRAY['Demo'], ARRAY['TS'], 'preparing');
INSERT INTO workflow_plans (id, competition_id, version, deadline, available_minutes, buffer_minutes, status, trigger)
VALUES ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 1, now() + interval '7 days', 600, 60, 'feasible', 'manual');
INSERT INTO competition_members (competition_id, user_id, role, status)
VALUES ('44444444-4444-4444-4444-444444444444', 'member-1', 'backend', 'active');
INSERT INTO workflow_tasks (id, competition_id, plan_id, task_key, title, description, phase, priority, estimated_minutes, planned_start_at, planned_end_at, status, acceptance_criteria, verification_method, risk_if_skipped, mandatory, assignee_member_id)
SELECT '88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 'backend-task', 'Backend API', 'Build the API', 'implementation', 'high', 120, now(), now() + interval '2 hours', 'todo', ARRAY['API works'], 'Test the API', 'No backend', false, id
FROM competition_members WHERE competition_id='44444444-4444-4444-4444-444444444444' AND user_id='member-1';
SQL
"${PSQL[@]}" -d "${DB_NAME}" -c "DELETE FROM competition_members WHERE competition_id='44444444-4444-4444-4444-444444444444' AND user_id='member-1';"
NULL_ASSIGNEE=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM workflow_tasks WHERE assignee_member_id IS NULL AND task_key='backend-task';")
if [ "${NULL_ASSIGNEE}" != "1" ]; then
  echo "FAIL: expected workflow_tasks assignee_member_id to be nulled on member delete, found ${NULL_ASSIGNEE}"
  exit 1
fi
echo "PASS: workflow_tasks assignee_member_id set to NULL on member delete"

echo "== verifying unique constraint on competition_members (competition_id, user_id) where user_id is not null"
# Create a fresh competition for this test to avoid interference from previous tests
"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competitions (id, owner_id, name, deadline, mandatory_deliverables, team_skills, status)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner-unique', 'Unique Test', now() + interval '7 days', ARRAY['Demo'], ARRAY['TS'], 'preparing');
SQL
# First insert should succeed
"${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO competition_members (competition_id, user_id, role, status) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner-unique', 'lead', 'active');" >/dev/null
# Second insert with same competition_id and user_id should fail
DUP_RESULT=$("${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO competition_members (competition_id, user_id, role, status) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner-unique', 'backend', 'active');" 2>&1 || true)
if echo "${DUP_RESULT}" | grep -q "duplicate key value violates unique constraint"; then
  echo "PASS: unique constraint prevents duplicate active members for same user/competition"
else
  echo "FAIL: unique constraint did not prevent duplicate (competition_id, user_id)"
  echo "Result: ${DUP_RESULT}"
  exit 1
fi

# Verify partial index allows multiple NULL user_id (pending invites)
"${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO competition_members (competition_id, invited_email, role, status) VALUES ('33333333-3333-3333-3333-333333333333', 'invite1@example.com', 'member', 'invited');" >/dev/null
"${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO competition_members (competition_id, invited_email, role, status) VALUES ('33333333-3333-3333-3333-333333333333', 'invite2@example.com', 'member', 'invited');" >/dev/null
PENDING_COUNT=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competition_members WHERE competition_id='33333333-3333-3333-3333-333333333333' AND user_id IS NULL;")
if [ "${PENDING_COUNT}" != "2" ]; then
  echo "FAIL: expected 2 pending invites with NULL user_id, found ${PENDING_COUNT}"
  exit 1
fi
echo "PASS: multiple pending invites with NULL user_id allowed (partial unique index behavior)"

echo "== verifying role check constraint on competition_members"
BAD_ROLE=$("${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO competition_members (competition_id, user_id, role, status) VALUES ('33333333-3333-3333-3333-333333333333', 'test-user', 'invalid_role', 'active');" 2>&1 || true)
if echo "${BAD_ROLE}" | grep -q "check constraint"; then
  echo "PASS: role check constraint rejects invalid roles"
else
  echo "FAIL: role check constraint did not reject invalid role"
  exit 1
fi

echo "== verifying role check constraint on competition_invites (no owner role allowed)"
BAD_INVITE_ROLE=$("${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO competition_invites (competition_id, token_hash, role, expires_at, created_by) VALUES ('33333333-3333-3333-3333-333333333333', 'hash999', 'owner', now() + interval '1 day', 'owner-c');" 2>&1 || true)
if echo "${BAD_INVITE_ROLE}" | grep -q "check constraint"; then
  echo "PASS: invite role check constraint rejects 'owner' role"
else
  echo "FAIL: invite role check constraint did not reject 'owner' role"
  exit 1
fi

echo "== verifying share_links scope check constraint"
BAD_SCOPE=$("${PSQL[@]}" -d "${DB_NAME}" -c "INSERT INTO share_links (competition_id, token_hash, scope, expires_at, created_by) VALUES ('33333333-3333-3333-3333-333333333333', 'hash000', 'invalid_scope', now() + interval '1 day', 'owner-c');" 2>&1 || true)
if echo "${BAD_SCOPE}" | grep -q "check constraint"; then
  echo "PASS: share_links scope check constraint rejects invalid scopes"
else
  echo "FAIL: share_links scope check constraint did not reject invalid scope"
  exit 1
fi

echo "== verifying indexes exist on new tables"
for idx in competition_members_competition_idx competition_members_user_idx competition_members_email_idx competition_invites_competition_idx competition_invites_token_hash_idx share_links_competition_idx share_links_token_hash_idx share_links_member_idx workflow_tasks_assignee_idx; do
  IDX_COUNT=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM pg_indexes WHERE indexname='${idx}';")
  if [ "${IDX_COUNT}" != "1" ]; then
    echo "FAIL: expected index ${idx} to exist"
    exit 1
  fi
done
echo "PASS: all expected indexes created"

echo "== verifying re-running backfill is idempotent (ON CONFLICT DO NOTHING)"
# Re-run the backfill query - should not create duplicates for existing competitions
# Note: we added a new competition 'cccccccc-cccc-cccc-cccc-cccccccccccc' in the unique constraint test
# so the backfill will create an owner for it, bringing total to 3
"${PSQL[@]}" -d "${DB_NAME}" <<'SQL'
INSERT INTO competition_members (competition_id, user_id, role, status)
SELECT c.id, c.owner_id, 'owner', 'active'
FROM competitions c
WHERE NOT EXISTS (
    SELECT 1 FROM competition_members cm
    WHERE cm.competition_id = c.id AND cm.user_id = c.owner_id
)
ON CONFLICT (competition_id, user_id) DO NOTHING;
SQL
OWNER_COUNT_AFTER=$("${PSQL[@]}" -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM competition_members WHERE role='owner' AND status='active';")
# We have 2 original competitions + 1 from unique constraint test = 3
if [ "${OWNER_COUNT_AFTER}" != "3" ]; then
  echo "FAIL: re-running backfill changed owner count unexpectedly (expected 3, found ${OWNER_COUNT_AFTER})"
  exit 1
fi
echo "PASS: backfill is idempotent (created owner for new competition, didn't duplicate existing)"

echo
echo "ALL MIGRATION TESTS PASSED"
