#!/bin/sh
set -eu

repo_root="$(git rev-parse --show-toplevel)"

cd "$repo_root"
git config core.hooksPath .githooks

echo "Git hooks installed: core.hooksPath=.githooks"
echo "Bypass for exceptional local work: SKIP_GIT_HOOKS=1 git commit ... or git commit --no-verify"
