#!/bin/sh
# Builds the release for the version tag at HEAD on this Mac, signs and notarizes it, and
# attaches it to a DRAFT GitHub release. Nothing is public until you publish the draft.
#
# Usage: pnpm release:publish            (signed and notarized; needs .env.release, see below)
#        pnpm release:publish --unsigned (no Apple Developer account needed)
#
# Signing reads .env.release at the repo root (git-ignored), with:
#   PLOTKA_SIGN_IDENTITY="Team Name (TEAMID)"   the "Developer ID Application" certificate in
#                                               your keychain, without that prefix
#   APPLE_KEYCHAIN_PROFILE=plotka-notary        a notarytool profile (xcrun notarytool
#                                               store-credentials). See docs/releasing.md.
set -eu

unsigned=false
case "${1:-}" in
  --unsigned) unsigned=true ;;
  '') ;;
  *) echo "Usage: pnpm release:publish [--unsigned]" >&2; exit 1 ;;
esac

root="$(git rev-parse --show-toplevel)"
cd "$root"
fail() { echo "✗ $*" >&2; exit 1; }
step() { printf '\n▸ %s\n' "$*"; }

version=$(node -p "require('./apps/desktop/package.json').version")
tag="v$version"

step "Checking $tag"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "Commit or stash your changes first."
git rev-parse -q --verify "refs/tags/$tag" >/dev/null ||
  fail "There's no tag $tag. Run: pnpm release $version"
[ "$(git rev-parse "$tag^{commit}")" = "$(git rev-parse HEAD)" ] ||
  fail "$tag isn't the commit you're on. Check it out first: git checkout $tag"
command -v gh >/dev/null || fail "Install the GitHub CLI (brew install gh) and run: gh auth login"

if ! $unsigned; then
  [ -f .env.release ] || fail "No .env.release. See docs/releasing.md, or pass --unsigned."
  # shellcheck disable=SC1091
  set -a; . ./.env.release; set +a
  [ -n "${PLOTKA_SIGN_IDENTITY:-}" ] || fail "Set PLOTKA_SIGN_IDENTITY in .env.release."
  [ -n "${APPLE_KEYCHAIN_PROFILE:-}" ] || fail "Set APPLE_KEYCHAIN_PROFILE in .env.release."
  security find-identity -v -p codesigning | grep -qF "Developer ID Application: $PLOTKA_SIGN_IDENTITY" ||
    fail "No \"Developer ID Application: $PLOTKA_SIGN_IDENTITY\" certificate in your keychain."
  xcrun notarytool history --keychain-profile "$APPLE_KEYCHAIN_PROFILE" >/dev/null 2>&1 ||
    fail "The notarytool profile \"$APPLE_KEYCHAIN_PROFILE\" doesn't work. See docs/releasing.md."
fi

step "Lint, typecheck, tests"
pnpm lint
pnpm typecheck
pnpm test

step "Building the universal app"
rm -rf apps/desktop/release
cd apps/desktop
pnpm exec electron-vite build
if $unsigned; then
  pnpm exec electron-builder --mac --universal --publish never
else
  # The config keeps `identity: null` so everyday builds stay unsigned; this turns signing on.
  # Notarization runs because APPLE_KEYCHAIN_PROFILE is set.
  pnpm exec electron-builder --mac --universal --publish never \
    "-c.mac.identity=$PLOTKA_SIGN_IDENTITY"
fi
cd "$root"

dmg="apps/desktop/release/Plotka-$version-universal.dmg"
app="apps/desktop/release/mac-universal/Plotka.app"
[ -f "$dmg" ] || fail "No $dmg was built."

if ! $unsigned; then
  step "Checking the app's signature and notarization"
  codesign --verify --deep --strict "$app" || fail "The app's signature isn't valid."
  xcrun stapler validate "$app" || fail "The app wasn't notarized."
  spctl --assess --type execute "$app" || fail "Gatekeeper rejects the app."

  step "Signing and notarizing the .dmg"
  codesign --sign "Developer ID Application: $PLOTKA_SIGN_IDENTITY" --timestamp "$dmg"
  xcrun notarytool submit "$dmg" --keychain-profile "$APPLE_KEYCHAIN_PROFILE" --wait
  xcrun stapler staple "$dmg"
  spctl --assess --type open --context context:primary-signature "$dmg" ||
    fail "Gatekeeper rejects the .dmg."
fi

step "Uploading to the draft release"
git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1 ||
  git push origin "$tag"
if gh release view "$tag" >/dev/null 2>&1; then
  gh release upload "$tag" "$dmg" --clobber
else
  gh release create "$tag" "$dmg" --draft --verify-tag --title "Plotka $tag" --generate-notes
fi

step "Done"
$unsigned && echo "This build is NOT signed: macOS will warn people the first time they open it."
echo "Review the draft, try the .dmg, then publish it:"
gh release view "$tag" --json url -q .url
