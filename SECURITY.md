# Security policy

## Supported versions

Only the most recent published Flac Cast release receives security fixes. Older releases may be affected even when a fix is available on `main`.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** option in the repository's **Security** tab. This creates a private security advisory visible only to the reporter and maintainers. Do not disclose an unpatched vulnerability in a public issue, discussion, pull request, or social-media post.

Include, when possible:

- the affected version and operating system;
- a clear reproduction sequence;
- the expected and observed impact;
- logs or a minimal proof of concept with secrets, usernames, library paths, and private IP addresses removed;
- any suggested mitigation.

The maintainers will acknowledge a complete report, investigate it, coordinate a fix and release, and credit the reporter if requested. Response and release timing depends on severity and maintainer availability; no fixed service-level agreement is offered.

## Scope

Relevant issues include arbitrary file access or deletion, unsafe IPC exposure, bypass of the tokenized media server, malicious metadata handling, dependency or release-pipeline compromise, and unauthorized code signing. Availability or privacy issues in Google Cast, LRCLIB, Electron, FFmpeg, NAS firmware, or the operating system should also be reported to the affected upstream project.

## Release integrity

Release assets include SHA-256 checksum files. A checksum detects accidental or malicious modification after publication but does not replace platform code signing. The project's [code signing policy](docs/CODE_SIGNING_POLICY.md) describes the intended signed-release controls.
