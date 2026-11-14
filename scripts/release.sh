#!/bin/sh
# Prepares a release: sets the app version, commits, and tags it. It does NOT push or build;
# `pnpm release:publish` does that (see docs/releasing.md).
# Usage: pnpm release 0.2.0
set -eu
version="${1:-}"
case "$version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "Usage: pnpm release <version>   e.g. pnpm release 0.2.0" >&2; exit 1 ;;
esac
cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  echo "Tag v$version already exists." >&2
  exit 1
fi
node -e '
  const fs = require("fs");
  for (const f of ["package.json", "apps/desktop/package.json"]) {
    const p = JSON.parse(fs.readFileSync(f, "utf8"));
    p.version = process.argv[1];
    fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
  }
' "$version"
git add package.json apps/desktop/package.json
git commit -q -m "release: v$version"
git tag -a "v$version" -m "Plotka v$version"
echo "Tagged v$version. Push the commit, then build, sign and upload the draft release:"
echo "  git push origin HEAD && pnpm release:publish"
