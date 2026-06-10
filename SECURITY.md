# Security Policy

SveltyCMS is built with **defense-in-depth security** featuring 4-layer zero-trust authorization, AI bot defense, zero-bias cryptography, and cross-origin isolation.

| Dimension             | Score | Detail                                                           |
| --------------------- | ----- | ---------------------------------------------------------------- |
| CVE Track Record      | 100   | 0 published CVEs — verifiable via NVD, GitHub Advisory DB        |
| Cryptography          | 100   | AES-256-GCM, SHA-256 chain, timing-safe, key rotation documented |
| Auth & Session        | 95    | Argon2id, CSPRNG, \_\_Host- cookies, 2FA, lockout                |
| Input Validation      | 95    | Valibot + DOMPurify + Drizzle + body limit + SVG                 |
| Disclosure & Response | 98    | security.txt, incident runbook, bug bounty, EU-compliant         |
| Dependency Hygiene    | 92    | Override-pinned, node-forge-free, osv-scanner/audit:deps         |

**Weighted: ~97/100** — self-assessed (June 2026). Remaining: WebAuthn support, third-party penetration test.

📖 **Full Security Docs**: [docs/architecture/security/index.mdx](./docs/architecture/security/index.mdx)  
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

## Bug Bounty Program

SveltyCMS operates a **public bug bounty program** for responsible disclosure:

| Severity | Reward        | Example                                |
| -------- | ------------- | -------------------------------------- |
| Critical | $500 — $2,000 | Unauthenticated RCE, data exfiltration |
| High     | $200 — $500   | Auth bypass, stored XSS, SSRF          |
| Medium   | $50 — $200    | Information disclosure, DoS            |
| Low      | $25 — $50     | Best practice violations, hardening    |

**Rules**:

- First reporter receives the reward
- Vulnerability must be in the `next` branch, not in dependencies or configuration
- No automated scanning without prior approval — contact security@sveltycms.com first
- Allow 90 days before public disclosure

**Scope**: `src/`, `scripts/`, `tests/`, `config/`, `static/`. Third-party dependencies are excluded unless you demonstrate exploitable integration.

## Key Rotation

Secrets in `config/private.ts` should be rotated periodically:

| Secret              | Rotation       | Procedure                                            |
| ------------------- | -------------- | ---------------------------------------------------- |
| `JWT_SECRET_KEY`    | Every 90 days  | Generate new CSPRNG key → all sessions invalidated   |
| `ENCRYPTION_KEY`    | Every 180 days | Re-encrypt sensitive data with new key               |
| `RATE_LIMIT_SECRET` | Every 90 days  | Update key → existing rate limit states remain valid |
| `TEST_API_SECRET`   | Every 30 days  | Rotate in CI environment variables                   |

```bash
# Generate a new CSPRNG secret (Bun / Node.js)
bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

After rotation, verify: `bun run check && bun run test:unit`

Thank you for helping keep SveltyCMS safe! ❤️
