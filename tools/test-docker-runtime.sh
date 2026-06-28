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

assert_contains() {
  local path="$1"
  local expected="$2"
  grep -Fq "$expected" "$path" || fail "missing expected text in $path: $expected"
}

assert_file Dockerfile
assert_file docker-entrypoint.sh
assert_file package.json
assert_file tools/run-migrations.mjs
assert_file deploy/windows/database/migrations/001_init_core_tables.sql
assert_file dist/apps/mist/main.js
assert_file dist/apps/chan/main.js

assert_contains package.json '"build:docker": "nest build mist && nest build chan"'
assert_contains package.json '"db:migrate": "node tools/run-migrations.mjs"'
assert_contains Dockerfile 'RUN pnpm run build:docker'
assert_contains Dockerfile 'COPY --from=builder /app/dist ./dist'
assert_contains Dockerfile 'COPY --from=builder /app/tools ./tools'
assert_contains Dockerfile 'COPY --from=builder /app/deploy/windows/database ./deploy/windows/database'
assert_contains Dockerfile 'CMD ["node", "dist/apps/mist/main.js"]'
assert_contains docker-entrypoint.sh 'exec "$@"'

echo "Docker runtime contract checks passed."
