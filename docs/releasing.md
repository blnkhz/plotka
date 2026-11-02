# Releasing

Downloadable builds are made by GitHub, not on a laptop: pushing a version tag runs the
**Release** workflow (`.github/workflows/release.yml`) on a GitHub-hosted Mac. It checks the code,
builds the universal `.dmg`, and attaches it to a **draft** release. Nothing is public until you
publish the draft.

## Steps

1. Make sure `main` is in the state you want to ship and CI is green.
2. Bump the version, commit and tag (this doesn't push anything):

   ```sh
   pnpm release 0.2.0
   ```

3. Push the commit and the tag. This starts the Release workflow:

   ```sh
   git push origin HEAD v0.2.0
   ```

4. Watch it under the repo's **Actions** tab (about 10 minutes). When it's done, open
   **Releases**: there's a draft "Plotter Studio v0.2.0" with the `.dmg` attached and notes
   generated from the commits since the last release.
5. Download the `.dmg` from the draft and try it (connect, plot something small).
6. Edit the notes if needed and click **Publish release**.

To rebuild an existing tag (for example after a failed run), use **Actions → Release → Run
workflow** and enter the tag. The files on the draft are replaced.

## Things to know

- The tag must match `apps/desktop/package.json`'s version (`pnpm release` takes care of it);
  otherwise the workflow stops with a message.
- Builds are **unsigned** until there's an Apple Developer account (LATER-5). People who download
  the app will see macOS's "unidentified developer" warning the first time; the README explains
  how to open it anyway. Signing and notarization plug into the same workflow (see the comment in
  `apps/desktop/electron-builder.yml`).
- While the repository is private, only people with access to it can download releases.
- `pnpm build:mac` still builds a `.dmg` locally (into `apps/desktop/release/`) for your own use.
