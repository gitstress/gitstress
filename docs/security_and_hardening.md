# GitStress Security & Hardening Architecture

This document outlines the defensive security architecture, input validation, and vulnerability remediation across the GitStress engine, web application, and CLI.

---

## 1. Threat Model & Invariants

| Attack Vector | Potential Vulnerability | Remediation in GitStress |
| :--- | :--- | :--- |
| **SSRF (Server-Side Request Forgery)** | Malicious repository slugs targeting internal cloud metadata or local ports | Strict alphanumeric slug regex (`/^[a-zA-Z0-9_\-\.]+$/`), character length limit (100 chars), and complete prohibition of path traversal sequences (`..`). |
| **HTTP Header Injection / CRLF** | User-supplied tokens containing newline bytes injected into GitHub API headers | `sanitizeGitHubToken` strips `\r`, `\n`, `\t`, and `\0`, validating against `^[a-zA-Z0-9_]+$` before header construction. |
| **Credential & Secret Leakage** | Scanning `.env`, private keys (`.pem`, `.key`), or cloud tokens | Both Node.js recursive filesystem walks (`analyzer_node.ts`) and GitHub scrapers (`github_fetcher.ts`) explicitly ignore all `.env*`, `.pem`, `.key`, `.crt`, `.p12`, `id_rsa`, and secret manifests. |
| **Filesystem Symlink Recursion** | Circular symlinks causing infinite directory walks and stack overflow DoS | Depth is strictly bounded to max depth 8 with a realpath registry (`visitedRealPaths`) preventing re-entry. |
| **Resource Exhaustion / Memory Bomb** | Enormous virtual file arrays or multi-megabyte source submissions | `/api/diagnose` enforces a hard ceiling of 100 files maximum and 1 MB content length per file. |
| **SVG XSS / XML Injection** | Reflected user inputs or metric strings inside dynamic SVG badges | All dynamic strings in SVG generator endpoints are sanitized through `escapeXml` and served with `X-Content-Type-Options: nosniff`. |
| **Session Token Interception** | Personal access tokens in cookies transmitted over unencrypted HTTP | Cookies for `gitstress_pat` dynamically attach the `; Secure` flag when accessed on HTTPS. |

---

## 2. Calibrated Preset Isolation

To prevent malicious or malformed GitHub API responses, rate limits, or invalid PAT cookies from degrading the hero benchmark demonstrations, all registered gauntlet benchmarks (`msh-protocol/msh`, `tkngate/tkngate`, `calcom/cal.com`, `posthog/posthog`, `tokio-rs/axum`, etc.) resolve directly to deterministic, in-memory fixtures.

Client-side auto-fetch hooks in `OutputViewTabs.tsx` explicitly skip re-querying verified presets, ensuring zero latency, zero external network dependency, and immune reliability.

---

## 3. Safe Local Directory Auditing (CLI)

The CLI command `npx gitstress .` executes locally without transmitting files or code trees to external services. All AST demand propagation runs synchronously in-memory:
- Max file size evaluated: 1MB.
- Directory walk depth: 8 levels.
- Ignored paths: `node_modules/`, `.git/`, `dist/`, `build/`, `vendor/`, `coverage/`, `.env*`.
