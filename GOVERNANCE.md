# Project governance

Flac Cast is maintained in public through GitHub. Technical decisions favor local-first operation, transparent network behavior, lossless audio handling, maintainability, and safe release practices.

## Roles

- **Authors / committers:** [@vicemora97](https://github.com/vicemora97) and [@zebbariasn](https://github.com/zebbariasn). Authors may maintain project source and build scripts.
- **Reviewers:** [@vicemora97](https://github.com/vicemora97) and [@zebbariasn](https://github.com/zebbariasn). Contributions from users without direct commit access require review before merge.
- **Release and code-signing approver:** [@vicemora97](https://github.com/vicemora97). The approver verifies the tag, CI origin, release notes, dependency state, and signing request.

One person may hold more than one role. Everyone with repository or SignPath access must use multi-factor authentication. Signing credentials and GitHub tokens must never be committed or shared.

## Decision process

Routine fixes may be decided through pull-request review. Changes to licensing, privacy behavior, code-signing policy, release infrastructure, or destructive file operations require explicit approval from the release approver. Disagreements should be documented in the relevant issue or pull request; the release approver makes the final decision when consensus cannot be reached.

## Adding maintainers

New maintainers should have a sustained record of constructive contributions and demonstrate secure account practices. Role changes must update this file and the [code signing policy](docs/CODE_SIGNING_POLICY.md) before the person receives release or signing access.
