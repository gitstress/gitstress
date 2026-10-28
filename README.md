# GitStress

> Concurrency stress analysis and bottleneck triage CLI. Predict which line dies first under concurrent load.

[![CI](https://github.com/gitstress/gitstress/actions/workflows/ci.yml/badge.svg)](https://github.com/gitstress/gitstress/actions/workflows/ci.yml)
[![GitStress Concurrency](https://gitstress.com/api/badge/gitstress/gitstress)](https://gitstress.com/gitstress/gitstress)
[![Version](https://img.shields.io/badge/version-0.12.0-blue.svg)](package.json)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

GitStress analyzes GitHub repositories and local source trees to isolate the exact symbol, route handler, or database query that exhausts resources first under concurrent load. It models saturation ceilings using Little's Law and Mean Value Analysis (MVA) queuing theory, assigns a concurrency resilience grade, and outputs a ready-to-apply patch.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GITSTRESS CONCURRENCY FORENSIC DOSSIER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  CULPRIT     http.DefaultTransport                  DIES AT 85 concurrent   │
│  FILE        internal/proxy/proxy.go:11                                     │
│  WHY         DefaultTransport MaxIdleConnsPerHost=2 exhausts pool on burst  │
│  FIX         transport := &http.Transport{ MaxIdleConnsPerHost: 20, ... }   │
│  REPRO       hey -n 1000 -c 85 -m POST http://localhost:7477/...             │
│  HEADROOM    [Apply fix in model] -> 85 -> 850 concurrent (+10x)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quickstart

### 1. Web Diagnostic

Run diagnostics instantly in your browser at [gitstress.com](https://gitstress.com) by pasting any GitHub repository or swapping `github.com` with `gitstress.com` in your browser address bar:

```
https://github.com/tkngate/tkngate
           ↓↓↓
https://gitstress.com/tkngate/tkngate
```

Featured live presets:
* **[gitstress/gitstress](https://gitstress.com/gitstress/gitstress)** — Next.js 15 App Router & High-Throughput MVA Engine (12,500 c/s -> 125,000 c/s, +10x headroom, Grade A+)
* **[msh-protocol/msh](https://gitstress.com/msh-protocol/msh)** — Go Swarm Telemetry & Fleet Mesh (:9876) (2,500 c/s -> 25,000 c/s, +10x headroom)
* **[tkngate/tkngate](https://gitstress.com/tkngate/tkngate)** — Go HTTP Model Proxy (85 c/s -> 850 c/s, +10x headroom)
* **[calcom/cal.com](https://gitstress.com/calcom/cal.com)** — Next.js + Prisma unindexed attendeeId query (18 c/s -> 320 c/s, +17.8x headroom)

### 2. Terminal CLI

Run directly in your terminal without installation:

```bash
# Scan current repository
npx gitstress .

# Scan remote repository by GitHub slug
npx gitstress tkngate/tkngate
npx gitstress msh-protocol/msh
npx gitstress calcom/cal.com

# Physical hardware verification (5s load burst against local server)
npx gitstress verify http://localhost:3000
```

### Global Install

```bash
npm install -g gitstress
```

---

## Usage

```bash
gitstress [target] [options]
gitstress verify <endpoint_url> [options]
```

### Arguments

| Argument | Description |
| :--- | :--- |
| `[target]` | Local path, GitHub `owner/repo` slug, or full URL (default: `.`) |
| `<endpoint_url>` | Local or remote HTTP endpoint for physical verification |

### Options

| Flag | Description |
| :--- | :--- |
| `--ci` | Exit with code 1 if a critical concurrency bottleneck or knee < 25 is detected |
| `--json` | Output results in JSON format |
| `-v, --version` | Display version information |
| `-h, --help` | Show usage help |

---

## CI Gate Integration

Prevent concurrency regressions in pull requests:

```yaml
- name: Run GitStress Concurrency Gate
  run: npx gitstress . --ci
```

---

## Features

- **Multi-Tier Evidence Framing**: 3-tier separation across static AST defect (1.0), MVA queuing projection (0.85), and turnkey empirical repro command (1.0).
- **Database-Dialect Intelligence**: Distinguishes PostgreSQL vs MySQL InnoDB foreign key auto-index rules to eliminate false sequential scan alarms.
- **Smart Composite & Partial Index Generation**: ESR rule-compliant index synthesizer with redundant filtered column pruning, saving 90%–95% RAM buffer footprint.
- **Route Exposure Weighting**: Ingress risk stratification across PUBLIC (100x), AUTHENTICATED (10x), and INTERNAL_ADMIN (1x) with physical blast radius scoring.
- **Operational Queuing Network Solver**: 4-station closed queuing network (Ingress, Worker, Pool, Storage) computing residence times $R_k(N)$ and Little's Law saturation knees.
- **Turnkey Verification Bridge**: 5-second synthetic load burst against localhost comparing Little's Law prediction against actual physical hardware.

---

## Local Development

```bash
git clone https://github.com/gitstress/gitstress.git
cd gitstress

npm install
npm test
npm run build
```

---

## License

[Apache-2.0](LICENSE)
