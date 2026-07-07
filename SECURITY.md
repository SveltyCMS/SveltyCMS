# Security Policy

SveltyCMS is built with **defense-in-depth security** featuring 4-layer zero-trust authorization, AI bot defense, zero-bias cryptography, cross-origin isolation, and 5 authentication methods (password, API Keys, Magic Links, SAML SSO, WebAuthn/Passkeys).

| Dimension             | Score | Detail                                                                                    |
| --------------------- | ----- | ----------------------------------------------------------------------------------------- |
| CVE Track Record      | 100   | 0 published CVEs — verifiable via NVD, GitHub Advisory DB                                 |
| Cryptography          | 100   | AES-256-GCM, SHA-256 chain, timing-safe, key rotation documented, all secrets inventoried |
| Auth & Session        | 98    | Argon2id, CSPRNG, __Host- cookies, 2FA, lockout, API Keys, Magic Links, WebAuthn          |
| Input Validation      | 95    | Valibot + DOMPurify + Drizzle + body limit + SVG                                          |
| Disclosure & Response | 99    | security.txt, incident runbook, secrets inventory, runtime audit, static misuse scanner   |
| Dependency Hygiene    | 92    | Override-pinned, node-forge-free, osv-scanner/audit:deps                                  |

**Weighted: ~98/100** — self-assessed (July 2026). Improvements: secrets inventory, bootstrap slimmed, content token leak prevention, static misuse scanner, API key hardcoded detection. Remaining: WebAuthn passkey management UI, third-party penetration test, CI-integrated runtime secret audit.

📖 **Full Security Docs**: [docs/reference/security/index.mdx](./docs/reference/security/index.mdx)
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
Open a **private** issue or email security@sveltycms.com (PGP key available on request).

**What to include:**

- Description and steps to reproduce
- Affected version/branch (`next`)
- Impact (e.g. unauthenticated access, data leak, RCE)
- Any PoC or screenshot

We aim to reply within **48 hours** and fix critical issues within **7 days**.  
You will be credited in the release notes and SECURITY.md unless you prefer to stay anonymous.

## Responsible Disclosure

SveltyCMS is an open-source project. While we cannot offer monetary bounties, we recognize contributions through:

- **Credit**: Named in release notes and SECURITY.md (unless you prefer anonymity)
- **Hall of Fame**: Listed on [sveltycms.com/security/hall-of-fame](https://sveltycms.com/security/hall-of-fame)
- **Swag**: SveltyCMS stickers and merchandise for critical findings

**Rules**:

- Vulnerability must be in the `next` branch, not in dependencies or configuration
- No automated scanning without prior approval — contact security@sveltycms.com first
- Allow 90 days before public disclosure

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
