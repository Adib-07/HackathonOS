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

echo
echo "ALL MIGRATION TESTS PASSED"
