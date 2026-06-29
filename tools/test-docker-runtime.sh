#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing file: $path"
}

assert_path_absent() {
  local path="$1"
  [[ ! -e "$path" ]] || fail "legacy path still exists: $path"
}

assert_contains() {
  local path="$1"
  local expected="$2"
  grep -Fq "$expected" "$path" || fail "missing expected text in $path: $expected"
}

assert_not_contains() {
  local path="$1"
  local unexpected="$2"
  ! grep -Fq "$unexpected" "$path" || fail "unexpected text in $path: $unexpected"
}

assert_file Dockerfile
assert_file docker-entrypoint.sh
assert_file package.json
assert_file tools/run-migrations.mjs
assert_file deploy/database/migrations/001_init_core_tables.sql
assert_file dist/apps/mist/main.js
assert_file dist/apps/chan/main.js
assert_path_absent .github/workflows/windows-appliance.yml
assert_path_absent deploy/windows

assert_contains package.json '"build:docker": "nest build mist && nest build chan"'
assert_contains package.json '"db:migrate": "node tools/run-migrations.mjs"'
assert_contains Dockerfile 'RUN pnpm run build:docker'
assert_contains Dockerfile 'COPY --from=builder /app/dist ./dist'
assert_contains Dockerfile 'COPY --from=builder /app/tools ./tools'
assert_contains Dockerfile 'COPY --from=builder /app/deploy/database ./deploy/database'
assert_not_contains Dockerfile 'deploy/windows'
assert_contains Dockerfile 'CMD ["node", "dist/apps/mist/main.js"]'
assert_contains docker-entrypoint.sh 'exec "$@"'

echo "Docker runtime contract checks passed."
