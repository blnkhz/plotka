# Releasing

Releases are built on your Mac: `pnpm release:publish` checks the code, builds the universal
`.dmg`, signs and notarizes it with the Apple Developer account, builds the Windows installer
(unsigned), and attaches both to a **draft** GitHub release. Nothing is public until you publish
the draft.

## Steps

1. Make sure `main` is in the state you want to ship and CI is green.
2. Bump the version, commit and tag (this doesn't push anything):

   ```sh
   pnpm release 0.5.0
   ```

3. Push the commit, then build, sign, notarize and upload (about 10 minutes, most of it waiting
   for Apple's notary service):

   ```sh
   git push origin HEAD
   pnpm release:publish
   ```

   It stops with a message if the tag isn't the commit you're on, if the tree isn't clean, or if
   any check, the signature or the notarization fails. It pushes the tag if GitHub doesn't have
   it yet.

4. Open the draft it links to. Download the `.dmg` from it and open it: macOS should open
   Plotka without any warning. Connect and plot something small. If you can, do the same with
   the Windows installer on a Windows PC.
5. Edit the notes if needed and click **Publish release**.

Running `pnpm release:publish` again for the same version replaces the `.dmg` and the
installer on the draft.

## One-time setup for signing

Signing needs a **Developer ID Application** certificate, which is a different certificate
from the ones used for iOS apps or the App Store, and a notarytool profile in your keychain.

1. **Certificate.** In Xcode, go to **Settings › Accounts**, pick the team, click
   **Manage Certificates…**, then **+ › Developer ID Application**. Only the team's Account
   Holder can create one. If you're not the holder, ask them to, or create it at
   [developer.apple.com › Certificates](https://developer.apple.com/account/resources/certificates/list)
   and double-click the downloaded file. Check that it's there:

   ```sh
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```

2. **Notarization credentials.** Create an app-specific password at
   [account.apple.com](https://account.apple.com) (**Sign-In and Security › App-Specific
   Passwords**), then store it in the keychain under a profile name:

   ```sh
   xcrun notarytool store-credentials plotka-notary \
     --apple-id <your Apple ID email> --team-id <TEAMID>
   ```

   It asks for the password. (An App Store Connect API key works too: pass `--key`, `--key-id`
   and `--issuer` instead.) The Team ID is in the certificate's name and on
   [developer.apple.com › Membership](https://developer.apple.com/account#MembershipDetailsCard).

3. **`.env.release`** at the repo root (git-ignored, no secrets in it):

   ```sh
   PLOTKA_SIGN_IDENTITY="Your Team Name (TEAMID)"
   APPLE_KEYCHAIN_PROFILE=plotka-notary
   ```

   `PLOTKA_SIGN_IDENTITY` is the certificate's name from step 1 without the
   `Developer ID Application: ` prefix.

## Things to know

- The tag must match `apps/desktop/package.json`'s version (`pnpm release` takes care of it).
- The name macOS shows as the developer is the certificate's team name.
- `pnpm release:publish --unsigned` makes an unsigned release without any Apple setup. People
  then see macOS's "unidentified developer" warning the first time they open the app.
- `pnpm build:mac` builds an unsigned `.dmg` into `apps/desktop/release/` for your own use,
  and `pnpm build:win` the Windows installer. The Windows build works on a Mac without Wine.
- The **Release** workflow on GitHub (**Actions › Release › Run workflow**, with a tag) builds
  unsigned apps on GitHub-hosted runners: pick **windows**, **mac** or **both**. It's a
  fallback for when you're away from your Mac. It only runs by hand, so pushing a tag never
  replaces a signed `.dmg`; picking **mac** or **both** does, so only do that when there isn't
  a signed one. GitHub's macOS runners are sometimes busy and the job can time out waiting for
  one; run it again later.

## Windows signing

The Windows installer isn't signed, so Windows SmartScreen shows "Windows protected your PC"
the first time someone runs it (they click **More info › Run anyway**). The warning goes away
with a code signing certificate. Two ways, both supported by electron-builder:

- **Azure Trusted Signing**: a monthly subscription, signs in the cloud, no hardware token.
  It needs identity verification for the publisher name, which can take a few days.
- **An OV or EV certificate** from a certificate authority: paid yearly, and the key has to
  live on a hardware token or a cloud HSM.

Either way, signing happens when the installer is built, with the settings under `win:` in
`apps/desktop/electron-builder.yml`.

- While the repository is private, only people with access to it can download releases.
