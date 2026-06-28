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
assert_file dist/apps/mist/main.js
assert_file dist/apps/chan/main.js

assert_contains package.json '"build:docker": "nest build mist && nest build chan"'
assert_contains Dockerfile 'RUN pnpm run build:docker'
assert_contains Dockerfile 'COPY --from=builder /app/dist ./dist'
assert_contains Dockerfile 'CMD ["node", "dist/apps/mist/main.js"]'
assert_contains docker-entrypoint.sh 'exec "$@"'

echo "Docker runtime contract checks passed."
