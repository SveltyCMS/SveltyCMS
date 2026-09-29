# Security Policy

SveltyCMS is built with defense in depth: a fail-closed API permission map, a linear WAF scan (not a WASM module), Argon2id passwords, AES-256-GCM, a SHA-256 audit chain, and session, API-key, magic-link, SSO, and WebAuthn sign-in. The unwired Policy-as-Code engine has been removed.

| Dimension             | Weight | Score | Detail                                                                                                                          |
| --------------------- | :----: | :---: | ------------------------------------------------------------------------------------------------------------------------------- |
| CVE Track Record      |  25%   |  100  | This run: `bun audit` 0 findings in 718 packages; OSV.dev 0 affected of 764                                                     |
| Cryptography          |  15%   |  100  | AES-256-GCM, Argon2id, HMAC-SHA-256, SHA-256 audit chain                                                                        |
| Auth & Session        |  20%   | 99.8  | Argon2id, CSPRNG, `__Host-` cookies, 2FA, lockout, user-agent step-up, WebAuthn ceremony. Back-channel logout is process-local. |
| Input Validation      |  15%   | 99.8  | Linear WAF scan, Valibot, DOMPurify, private-field redaction on read                                                            |
| Disclosure & Response |  10%   |  100  | security.txt (RFC 9116), staged disclosure, incident runbook, secrets inventory                                                 |
| Dependency Hygiene    |  15%   |  100  | `bun audit` and OSV.dev in `bun run risk:audit`                                                                                 |

**Weighted: 99.93/100 (~99.9%)** — self-assessed on 2026-09-29 with `bun run risk:audit` (5/5) and `bun run test:security` (19 files, 343 tests). This is not a penetration test. A dated third-party test is still open. Method and residuals: [docs/reference/security/index.mdx](./docs/reference/security/index.mdx).

📖 **Full Security Docs**: [docs/reference/security/index.mdx](./docs/reference/security/index.mdx)  
🛡️ **WAF and middleware**: [docs/reference/security/policy-as-code-and-wasm.mdx](./docs/reference/security/policy-as-code-and-wasm.mdx)  
🔑 **Secrets Inventory**: [docs/reference/security/secrets-inventory.mdx](./docs/reference/security/secrets-inventory.mdx)  
🛡️ **API Security**: [docs/reference/security/api-security.mdx](./docs/reference/security/api-security.mdx)  
📋 **Security.txt**: [static/.well-known/security.txt](./static/.well-known/security.txt)  
🇪🇺 **EU Directive 2006/114/EC Compliant**: All competitive comparisons use verifiable public data.

## Supported Versions

Only the latest release on the `next` branch is supported.  
Always upgrade before reporting.

| Version         | Supported          |
| --------------- | ------------------ |
| `next` (latest) | :white_check_mark: |
| Older branches  | ❌                 |

## Reporting a Vulnerability

**Preferred method (private & recommended):**

1. Go to the [Security tab](https://github.com/SveltyCMS/SveltyCMS/security/advisories) → **Report a vulnerability**
2. Use the private form (GitHub will notify only maintainers)

**Alternative:**
Email security@sveltycms.com (PGP key available on request).

**Machine-readable endpoint:** [`/.well-known/security.txt`](https://sveltycms.com/.well-known/security.txt) (RFC 9116) points to this policy.

**What to include:**

- Description and steps to reproduce
- Affected version/branch (`next`)
- Impact (e.g. unauthenticated access, data leak, RCE)
- Any PoC or screenshot

We aim to reply within **48 hours** and fix critical issues within **7 days**.

## Staged Disclosure Timeline (coordinated)

Follows the coordinated-disclosure model used by mature OSS CMS projects: reporters get credit, fixes ship before public details, and the community gets a complete advisory at patch time.

| Severity                                   | Initial reply | Fix window | Advisory publication                                      |
| ------------------------------------------ | ------------- | ---------- | --------------------------------------------------------- |
| **Critical** (RCE, auth bypass, data leak) | 48h           | 7 days     | GHSA + release notes at patch time; full details same day |
| **High** (privilege escalation, XSS, SSRF) | 48h           | 30 days    | GHSA + release notes at patch time                        |
| **Medium/Low**                             | 72h           | 90 days    | Coordinated with reporter; GHSA on patch                  |

- **Embargo**: public disclosure of a non-public report is expected to wait for the fix (or 90 days, whichever is earlier) so users can patch.
- **Credit**: reporters are credited in release notes and this file unless they prefer anonymity.
- **Scope**: `src/`, `scripts/`, `tests/`, `config/`, `static/`. Third-party dependencies are excluded unless you demonstrate exploitable integration.

## Responsible Disclosure

SveltyCMS is an open-source project. While we cannot offer monetary bounties, we recognize contributions through:

- **Credit**: Named in release notes and SECURITY.md (unless you prefer anonymity)
- **Hall of Fame**: Listed on [sveltycms.com/security/hall-of-fame](https://sveltycms.com/security/hall-of-fame)
- **Swag**: SveltyCMS stickers and merchandise for critical findings

**Rules**:

- Vulnerability must be in the `next` branch, not in dependencies or configuration
- No automated scanning without prior approval — contact security@sveltycms.com first
- Allow 90 days before public disclosure (see staged timeline above)

**Scope**: `src/`, `scripts/`, `tests/`, `config/`, `static/`. Third-party dependencies are excluded unless you demonstrate exploitable integration.

## Key Rotation

Bootstrap secrets in `config/private.ts` and DB-driven secrets managed via System Settings UI should be rotated periodically. See [secrets-inventory.mdx](./docs/reference/security/secrets-inventory.mdx) for the full inventory.

| Secret              | Rotation       | Procedure                                            |
| ------------------- | -------------- | ---------------------------------------------------- |
| `JWT_SECRET_KEY`    | Every 90 days  | Generate new CSPRNG key → all sessions invalidated   |
| `ENCRYPTION_KEY`    | Every 180 days | Re-encrypt sensitive data with new key               |
| `RATE_LIMIT_SECRET` | Every 90 days  | Update key → existing rate limit states remain valid |
| `TEST_API_SECRET`   | Every 30 days  | Rotate in CI environment variables                   |
| SAML signing keys   | Every 180 days | Regenerate -> update IdP metadata                    |
| **API Keys**        | Every 90 days  | Create new key → update service → revoke old key     |

```bash
# Generate a new CSPRNG secret (Bun / Node.js)
bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

After rotation, verify: `bun run check && bun run test:unit`

Thank you for helping keep SveltyCMS safe! ❤️
