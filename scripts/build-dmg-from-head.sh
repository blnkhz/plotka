#!/bin/sh
# Builds the macOS .dmg from the latest commit (not the working tree) in a separate checkout,
# then copies it to apps/desktop/release/. Run by the post-commit hook in the background, or by
# hand: `pnpm build:mac:commit`. If a build is already running, it asks that build to run once
# more when it finishes, so quick successive commits produce one up-to-date .dmg.
set -u
repo=$(git rev-parse --show-toplevel)
cache="${XDG_CACHE_HOME:-$HOME/Library/Caches}/plotter-studio-dmg-build"
wt="$cache/checkout"
lock="$cache/lock"
again="$cache/again"
log="$cache/build.log"
mkdir -p "$cache"

notify() {
  osascript -e "display notification \"$1\" with title \"Plotter Studio\"" >/dev/null 2>&1 || true
}

# Another build running? Ask it to go again with the newest commit, and stop here.
if [ -e "$lock" ] && kill -0 "$(cat "$lock")" 2>/dev/null; then
  touch "$again"
  exit 0
fi
echo $$ >"$lock"
trap 'rm -f "$lock"' EXIT

while :; do
  rm -f "$again"
  sha=$(git -C "$repo" rev-parse --short HEAD)
  # One persistent checkout outside the repo, so installs are fast and the dev tools, tests and
  # `pnpm dev` (which use apps/desktop/out) are never disturbed.
  if [ ! -e "$wt/.git" ]; then
    git -C "$repo" worktree prune
    git -C "$repo" worktree add --detach "$wt" HEAD >"$log" 2>&1
  fi
  if (
    cd "$wt" &&
      git checkout --force --detach "$sha" &&
      git clean -fdx -e node_modules -e '**/node_modules' &&
      pnpm install --frozen-lockfile &&
      pnpm build:mac
  ) >"$log" 2>&1; then
    mkdir -p "$repo/apps/desktop/release"
    cp "$wt"/apps/desktop/release/*.dmg "$repo/apps/desktop/release/"
    notify "New .dmg ready (commit $sha)."
  else
    notify "The .dmg build for commit $sha failed. Log: $log"
  fi
  [ -e "$again" ] || break
done
