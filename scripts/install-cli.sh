#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "■ Building CLI..."
pnpm --filter @my-agent/cli build

echo "■ Registering global command..."
cd packages/cli && npm link && cd "$OLDPWD"

echo "■ Done. Run 'mycode' to start."
