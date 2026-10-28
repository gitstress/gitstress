# GitStress

> Paste a GitHub URL. Get the first line that dies under load — and the fix.

[![CI](https://github.com/gitstress/gitstress/actions/workflows/ci.yml/badge.svg)](https://github.com/gitstress/gitstress/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.11.0-blue.svg)](package.json)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

GitStress analyzes GitHub repositories and local source trees to identify the precise symbol, route handler, or database query that exhausts resources first under concurrent load. It models saturation ceilings using Little's Law queuing theory, assigns an archival concurrency resilience grade, and outputs a ready-to-apply patch that delivers measurable headroom.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GITSTRESS CONCURRENCY FORENSIC DOSSIER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  CULPRIT     http.DefaultTransport                  DIES AT 85 concurrent   │
│  FILE        internal/proxy/proxy.go:11                                     │
│  WHY         DefaultTransport MaxIdleConnsPerHost=2 exhausts pool on burst  │
│  FIX         transport := &http.Transport{ MaxIdleConnsPerHost: 20, ... }   │
│  REPRO       hey -n 1000 -c 85 -m POST http://localhost:7477/...             │
│  PROVENANCE  internal/proxy/proxy.go:11 (code default, not measured)         │
│  HEADROOM    [Apply fix in model] -> 85 -> 850 concurrent (+10x)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quickstart

### 1. Instant Web Diagnostic (URL Swap)

Replace `github.com` with `gitstress.com` in your browser address bar:

```
https://github.com/tkngate/tkngate
           ↓↓↓
https://gitstress.com/tkngate/tkngate
```

Featured live presets:
* **[msh-protocol/msh](https://gitstress.com/msh-protocol/msh)** — Go Swarm Telemetry & Fleet Mesh runtime (dies at 85 c/s -> 850 c/s, +10x headroom)
* **[tkngate/tkngate](https://gitstress.com/tkngate/tkngate)** — Go HTTP model proxy (dies at 85 concurrent, +10x headroom)
* **[calcom/cal.com](https://gitstress.com/calcom/cal.com)** — Next.js + Prisma unindexed attendeeId query (dies at 18 c/s -> 320 c/s, +17.8x headroom)
* **[posthog/posthog](https://gitstress.com/posthog/posthog)** — Django + Postgres event ingestion (dies at 2,400 req/s -> 18,500 req/s, +7.7x headroom)
* **[supabase/realtime](https://gitstress.com/supabase/realtime)** — Elixir Phoenix WebSockets (in-scope refusal, scheduled for v0.12)
* **[torvalds/linux](https://gitstress.com/torvalds/linux)** — Operating system kernel (honest architectural refusal: ring-0 kernel out of scope)

### 2. Local CLI Audit

Run directly inside any repository without installation:

```bash
# Audit current repository
npx gitstress .

# Audit remote repository by owner/repo slug
npx gitstress tkngate/tkngate
npx gitstress msh-protocol/msh

# Audit via full GitHub URL
npx gitstress https://github.com/calcom/cal.com
```

### 3. CI Gate Integration

Prevent concurrency regressions in pull requests:

```bash
# Fail CI with exit code 1 if a fatal concurrency bottleneck is detected
npx gitstress . --fail-on-fatal

# Output machine-readable JSON for automated reports
npx gitstress . --json
```

## Key Features

* **Multi-Tier Evidence Framing (3-Tier Epistemic Separation)**: Separates findings into three distinct epistemological tiers: Tier 1 (Verified Static Defect, Confidence: 1.0, zero speculation linking AST syntax to schema migrations), Tier 2 (Mathematical Queuing Projection, Confidence: 0.85, modeling Little's Law saturation knees via closed 4-station MVA queuing theory), and Tier 3 (Empirical Verification Command, Confidence: 1.0 upon execution with turnkey `autocannon` / `gitstress verify` commands).
* **Database-Dialect Intelligence**: Recognizes underlying storage engine constraints (PostgreSQL vs MySQL InnoDB), preventing false positive sequential scan warnings on auto-indexed foreign keys while catching unindexed foreign keys in PostgreSQL.
* **Instant Culprit Isolation**: Highlights the exact line, AST symbol, and file location where connection pooling, thread pool exhaustion, unindexed queries, or event loop starvation occurs.
* **Little's Law Saturation Modeling ($L = \lambda W$)**: Calculates physical queue accumulation, concurrency ceilings, and queuing delay propagation across compute stations.
* **Archival Concurrency Resilience Grade**: Official benchmark rating (A+ through F) based on saturation limits, error rates under load, and recovery characteristics.
* **Framework Concurrency Duels (`/vs`)**: Compare two repositories or frameworks head-to-head (e.g. `tkngate/tkngate` vs `msh-protocol/msh`, FastAPI vs Express) with live interactive load comparators and 1px telemetry circuits.
* **Unified Git Apply Patches**: Generates verified, syntax-highlighted code patches providing 5x to 20x concurrency headroom increases.
* **Turnkey Repro Scripts**: Generates executable load-test commands for `k6`, `hey`, `autocannon`, `wrk`, and `curl`.
* **Zero Telemetry Leaks**: Static code analysis executes locally in memory. No code is transmitted to external servers.

---

## CLI Reference

```
Usage:
  gitstress [target] [options]

Arguments:
  target                Local folder path, GitHub owner/repo slug, or full URL (default: .)

Options:
  --json                Output results in JSON format
  --fail-on-fatal       Exit with non-zero code if critical concurrency bottleneck is detected
  --port <port>         Start local web UI server on specified port (default: 4199)
  --version, -v         Display version information
  --help, -h            Show usage help
```

---

## Local Development & Self-Hosting

### Prerequisites

* Node.js >= 18.0.0
* npm or pnpm

### Getting Started

```bash
# Clone the repository
git clone https://github.com/gitstress/gitstress.git
cd gitstress

# Install dependencies
npm install

# Start development server
npm run dev

# Run CLI locally
npm run cli -- .

# Run gauntlet test suite
npm test

# Build production bundle
npm run build

# Start production server
npm run start
```

The web interface will be available at `http://localhost:4199`.

---

## Project Structure

```
oss/
├── bin/                  # CLI executable entry points (bin/gitstress.ts)
├── dist/                 # Standalone compiled executable bundle (dist/gitstress.js)
├── src/core/             # Static analysis engine & AST parsers
│   ├── analyzer.ts       # Saturation limit & bottleneck triage engine
│   ├── analyzer_node.ts  # Node.js filesystem walker & boundary enforcer
│   ├── culprit.ts        # Terminal report rendering & dynamic remediation
│   ├── queuing_network.ts# Operational Queuing Network & MVA solver
│   ├── route_exposure.ts # Route exposure weighting & blast radius scoring
│   ├── smart_index.ts    # ESR-compliant composite & partial index synthesizer
│   ├── evidence_tiers.ts # 3-tier epistemic separation & verification bridge
│   ├── verifier.ts       # Physical hardware load verification bridge
│   ├── github_fetcher.ts # Zero-quota CDN raw streaming & token pooling
│   ├── types.ts          # Core TypeScript contracts & data types
│   └── parsers/          # Language parsers (Go, TS/JS, Python, Dockerfile)
├── gauntlet/             # 20-repo validation suite & benchmark fixtures
├── test/                 # Queuing network & AST unit tests
├── docs/                 # Architecture specifications & developer guides
├── package.json          # Package manifest & scripts
├── tsconfig.json         # TypeScript configuration
├── LICENSE               # Apache-2.0 License
└── README.md             # Project documentation
```

---

## Supported Stacks & Gauntlet

| Stack | Engine | Default Saturation | Tuned Saturation | Headroom |
|---|---|---|---|---|
| **Go HTTP Proxy** (`tkngate`) | `net/http` pool | 85 concurrent | 850 concurrent | +10x |
| **Go Swarm Telemetry** (`msh`) | Swarm mesh | 85 concurrent | 850 concurrent | +10x |
| **Next.js + Prisma** (`cal.com`) | Node event loop / Postgres | 18 c/s | 320 c/s | +17.8x |
| **Django + Postgres** (`posthog`) | Python WSGI / Gunicorn | 2,400 req/s | 18,500 req/s | +7.7x |
| **FastAPI + Async** (`fastapi`) | AnyIO worker pool | 450 req/s | 3,200 req/s | +7.1x |
| **Express.js** (`express`) | Single-threaded V8 loop | 210 req/s | 1,800 req/s | +8.5x |

---

## Contributing

Contributions are welcomed. Please follow these guidelines:

1. Fork the repository and create a descriptive feature branch (`feat/feature-name`).
2. Adhere to existing code formatting and architectural patterns.
3. Ensure all gauntlet tests pass via `npm test`.
4. Submit a clear pull request describing the changes and test coverage.

Please review our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License
 
GitStress is licensed under the [Apache-2.0 License](LICENSE).
