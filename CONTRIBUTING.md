# Contributing to Flac Cast

Thank you for helping improve Flac Cast. Bug reports, documentation, translations, tests, and code changes are welcome.

## Before contributing

- Search existing issues and pull requests before opening a duplicate.
- Use the security process in [SECURITY.md](SECURITY.md) for vulnerabilities.
- Do not attach copyrighted music, private NAS paths, credentials, access tokens, or personal data.
- Keep changes focused. Large features should start with an issue so design and platform impact can be discussed first.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Install the locked dependencies with `npm ci`.
3. Make the change and update English documentation and both English/Spanish interface strings when applicable.
4. Run `npm run licenses:check`, `npm run check`, and `npm run build`.
5. Open a pull request using the repository template.

Native installers must be tested on their target operating system. Do not commit `node_modules`, `dist`, `out`, user libraries, caches, certificates, signing tokens, or locally built installers.

Public forks and modified distributions must follow [TRADEMARKS.md](TRADEMARKS.md), including using a distinct product name and icon where retaining the official branding could confuse users about the publisher.

## Licensing of contributions

Flac Cast is licensed under the GNU General Public License version 3 or later. By submitting a contribution, you confirm that you have the right to provide it and agree that it will be distributed under `GPL-3.0-or-later`. Do not submit proprietary code or content copied from a source whose license is incompatible with the project.

New dependencies require a short justification in the pull request and must use an OSI-approved license compatible with GPL-3.0-or-later. Update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) when a runtime component or service changes.

## Review and release authority

The current project roles and release responsibilities are listed in [GOVERNANCE.md](GOVERNANCE.md). A contribution may require changes before merge, and maintainers may decline changes that increase privacy, security, maintenance, or platform risk beyond what the project can support.
