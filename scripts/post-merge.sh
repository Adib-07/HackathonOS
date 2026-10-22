#!/bin/bash
# Replit post-merge hook.
#
# Applies database schema changes through the reviewed migration system.
#
# This script deliberately does NOT run `drizzle-kit push`. `push` is
# authoritative over the schema: it diffs the live database against the
# TypeScript schema and applies the difference, which means it can DROP
# columns and tables that are not in the schema. That is acceptable for a
# throwaway local database and unacceptable for a deployed one.
#
# `drizzle-kit migrate` instead applies the reviewed SQL files in
# `lib/db/drizzle/` in order, and only ever adds. The difference is
# documented in replit.md.
#
# The baseline step is idempotent and safe on every kind of database:
#   - a database with no application tables  -> nothing is recorded, and
#     `migrate` creates the schema from the migrations
#   - a database created with `drizzle-kit push` -> the baseline is recorded
#     without executing its SQL, so `migrate` applies only what comes after
#   - a database whose schema has drifted    -> the baseline is NOT recorded
#     and the script fails, because recording it would skip a needed change
#
# Assumptions, verified against the repository:
#   - the hook runs from the repository root (the paths below are root-relative)
#   - `pnpm` and the workspace dependencies are installed for the run
#   - DATABASE_URL points at the deployed database
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile

# Record the baseline if (and only if) the live schema already contains it.
pnpm --filter @workspace/db run migrate:baseline

# Apply the reviewed migrations in order.
pnpm --filter @workspace/db run migrate
