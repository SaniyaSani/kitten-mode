#!/usr/bin/env bash
# Runs every automated check. Start the server first:  PORT=8799 node server.mjs &
set -e
cd "$(dirname "$0")/.."
node test-lib.mjs
node test.mjs
python3 e2e/make_assets.py
for t in e2e/1_main.py e2e/2_features.py e2e/3_files.py; do echo "== $t"; python3 $t; done
