# Security Policy

SveltyCMS is built with **defense-in-depth security** featuring 4-layer zero-trust authorization, AI bot defense, zero-bias cryptography, and cross-origin isolation.

| Dimension             | Score | Detail                                                     |
| --------------------- | ----- | ---------------------------------------------------------- |
| CVE Track Record      | 100   | 0 published CVEs — verifiable via NVD, GitHub Advisory DB  |
| Cryptography          | 98    | AES-256-GCM, SHA-256 chain, timing-safe, quantum-resistant |
| Auth & Session        | 95    | Argon2id, CSPRNG, \_\_Host- cookies, 2FA, lockout          |
| Input Validation      | 95    | Valibot + DOMPurify + Drizzle + body limit + SVG           |
| Disclosure & Response | 92    | security.txt, incident runbook, EU-compliant               |
| Dependency Hygiene    | 88    | Override-pinned (axios, lodash, semver), node-forge-free   |

**Weighted: ~95/100** — self-assessed via full-stack codebase audit against dependency stack, security architecture docs, and CVE landscape (June 2026). Score dimensions: CVE Track (25%), Auth (20%), Input Validation (15%), Cryptography (15%), Dependency Hygiene (15%), Disclosure (10%).

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

Thank you for helping keep SveltyCMS safe! ❤️
