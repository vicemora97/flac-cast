# Code signing policy

## Status and provider

The current public release artifacts are unsigned unless their release notes explicitly state otherwise. Checksums do not constitute a code signature.

The project is preparing an application for the free SignPath Foundation program. Once the application and pipeline are approved:

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

Windows will display **SignPath Foundation** as the certificate publisher. The certificate is not issued personally to a Flac Cast maintainer and is used only under SignPath Foundation's open-source conditions.

## Team roles

- **Authors / committers:** [@vicemora97](https://github.com/vicemora97) and [@zebbariasn](https://github.com/zebbariasn)
- **Reviewers:** [@vicemora97](https://github.com/vicemora97) and [@zebbariasn](https://github.com/zebbariasn)
- **Signing approver:** [@vicemora97](https://github.com/vicemora97)

All members with repository or signing access must use multi-factor authentication for GitHub and SignPath. Role changes must be reflected here and in [GOVERNANCE.md](../GOVERNANCE.md).

## Privacy policy

The project privacy policy is published in [PRIVACY.md](../PRIVACY.md). In summary, Flac Cast has no telemetry and does not upload a music library. Network activity occurs for user-requested Cast operations, user-requested LRCLIB lyric lookups, and user-requested external project links.

## What may be signed

Only official Flac Cast Windows artifacts built from this repository may be submitted under the project signing policy. A signing request must satisfy all of the following:

1. The source commit is reachable from the protected `main` branch and has a version tag matching `v*`.
2. The artifact is built on a GitHub-hosted Windows runner from a clean checkout with `npm ci` and the committed lockfile.
3. CI passes dependency-license validation, TypeScript checking, and the production build.
4. Product name and version metadata are derived from the repository and match the tag.
5. The unsigned artifact is uploaded to GitHub Actions before SignPath receives the request, allowing origin verification.
6. The signing approver manually verifies the commit, workflow URL, dependency state, artifact name, checksum, and release notes.
7. The signed artifact and its new checksum are published without modification.

Local developer builds, pull-request artifacts, untagged commits, third-party applications, and upstream executables such as FFmpeg must not be signed with the Flac Cast policy. Unsigned upstream open-source files may be included when permitted by SignPath Foundation and their licenses.

## Pipeline protection

Build workflows, packaging scripts, dependency manifests, lockfiles, `.signpath` policies, and `CODEOWNERS` are security-sensitive. Changes require explicit maintainer review. Signing secrets are stored only as encrypted GitHub Actions secrets or in SignPath; they must never appear in source, logs, release notes, or local scripts.

The SignPath integration must enable origin verification, allow GitHub-hosted runners only, restrict release signing to the approved branch/tag flow, and require manual approval for every signing request. Rerun and branch-protection rules will follow the policy approved by SignPath.

## Revocation and incident response

If a signing token, maintainer account, workflow, dependency, or released artifact may be compromised, maintainers will stop signing, remove affected downloads when appropriate, notify SignPath, investigate the source and build history, and publish a security advisory. A replacement release receives a new version and tag; published tags are not moved.

Security reports follow [SECURITY.md](../SECURITY.md).
