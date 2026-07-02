#!/bin/sh
set -euo pipefail

echo "Starting Mist Backend..."
echo "Connecting to MySQL at ${mysql_server_host:-unset}:${mysql_server_port:-unset}"
echo "Node.js environment: ${NODE_ENV:-development}"

# Start application (foreground)
exec "$@"
