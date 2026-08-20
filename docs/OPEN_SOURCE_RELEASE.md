# Open-source and SignPath release checklist

This checklist prepares Flac Cast for a public GPL release and an application to SignPath Foundation. It is operational guidance, not legal advice.

## 1. Confirm copyright authority

Before publishing, each person who contributed project-owned code or artwork must agree that their contribution may be released under `GPL-3.0-or-later`. Contributions taken from another source must retain their compatible license and attribution. Do not publish company, school, client, or employer code unless the contributor has the authority to do so.

The repository uses an inbound-equals-outbound model: new contributions are accepted under the project license as described in [CONTRIBUTING.md](../CONTRIBUTING.md). No commercial dual license is offered.

## 2. Make the GitHub project public

The repository must be public before a SignPath Foundation application can be evaluated. In GitHub:

1. Open **Settings → General → Danger Zone → Change repository visibility**.
2. Change the repository to **Public** and confirm the repository name.
3. Check the public page in a private browser window.
4. Confirm that `LICENSE`, `PRIVACY.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, this documentation, source files, build scripts, and package lock are visible.
5. Confirm that no secrets, music files, local paths, certificates, private names, or generated installers exist anywhere in the visible Git history.

Changing visibility is irreversible from the perspective of disclosure: even if the repository is made private later, assume every published commit has been copied.

## 3. Configure repository security

- Enable two-factor authentication on every GitHub account with write access.
- Enable **Private vulnerability reporting** under **Settings → Security → Code security**.
- Protect `main` with pull requests, required CI, blocked force pushes, and code-owner review where the GitHub plan permits it.
- Keep GitHub Actions permissions at read-only by default and grant write permissions only to the specific release job that needs them.
- Never upload a signing certificate or private key to GitHub. SignPath keeps the certificate key in its service.

## 4. Publish an unsigned release first

SignPath requires the project to be already released in the form that will be signed. Publish one clearly marked unsigned prerelease from an immutable tag and include:

- Windows x64 installer and SHA-256 file;
- macOS arm64 DMG and SHA-256 file;
- Linux x86_64 AppImage and SHA-256 file;
- a link titled **Code signing policy** to `docs/CODE_SIGNING_POLICY.md`;
- a link to `PRIVACY.md`, `LICENSE`, source for the exact tag, and `THIRD_PARTY_NOTICES.md`;
- a warning that Windows and macOS artifacts are not yet signed/notarized.

Do not move an existing tag. If source or packaging changed after `v1.0.1`, create a new patch version and tag.

## 5. Apply to SignPath Foundation

Read the current [SignPath Foundation conditions](https://signpath.org/terms.html), then open the [application page](https://signpath.org/apply). Provide concise, verifiable links:

- **Project:** Flac Cast
- **Repository/homepage:** `https://github.com/vicemora97/flac-cast`
- **License:** `https://github.com/vicemora97/flac-cast/blob/main/LICENSE`
- **Download/release:** the published GitHub release containing the unsigned Windows installer
- **Documentation:** the README and `docs/USER_GUIDE.md`
- **Code signing policy:** `docs/CODE_SIGNING_POLICY.md`
- **Privacy policy:** `PRIVACY.md`
- **Security policy:** `SECURITY.md`
- **Team:** the handles and roles listed in `GOVERNANCE.md`
- **Build system:** GitHub Actions on GitHub-hosted Windows runners
- **Artifact to sign:** the Windows x64 application/installer produced by `npm run make:win`

Explain that Flac Cast is a local-first Electron music player; it reads user-selected audio folders, can stream to a user-selected Google Cast receiver, queries LRCLIB only after the user presses Lyrics, has no telemetry, and invokes the upstream open-source FFmpeg executable for compatibility conversion.

Do not claim that acceptance is guaranteed. SignPath Foundation evaluates project reputation, activity, documentation, ownership, security, and policy compliance at its discretion.

## 6. Configure signing after acceptance

SignPath will provide the organization ID, project slug, signing-policy slug, artifact configuration, and account/API setup. Then:

1. Install and authorize the SignPath GitHub App for this repository.
2. Add the SignPath organization and project to the predefined GitHub.com trusted build system.
3. Store the submitter token as the encrypted `SIGNPATH_API_TOKEN` GitHub Actions secret.
4. Add the approved `.signpath/policies/<project>/<policy>.yml` file using the exact slugs issued by SignPath.
5. Update the Windows release workflow to upload the unsigned artifact and submit its GitHub artifact ID with `signpath/github-action-submit-signing-request@v2`.
6. Require origin verification and manual approval for every release request.
7. Configure artifact metadata restrictions so product names are **Flac Cast** and every file version matches the release version.
8. Publish only the returned signed artifact, generate a checksum after signing, and verify the Authenticode signature on a clean Windows machine.

Placeholders for SignPath identifiers should not be committed as a live signing job because they would create a broken or misleading release pipeline.

## 7. Ongoing obligations

- Keep the project public, actively maintained, documented, and entirely under OSI-approved licenses.
- Review dependency and build-script changes, including external downloads.
- Keep the privacy and code-signing policy linked from the README and every signed release.
- Keep source for every distributed GPL binary available next to or clearly linked from its download.
- Investigate reports about a signed release and cooperate with SignPath Foundation.
- Stop signing immediately if the repository, workflow, or account trust chain is uncertain.
