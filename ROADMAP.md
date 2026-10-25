# GitStress OSS Public Roadmap

> **One URL, one card, one command.** Find which line dies first under concurrency before you deploy on Friday.

GitStress is dedicated to eliminating synthetic load testing flakiness by using **static demand propagation, PostgreSQL query cost modeling, and Little's Law ($M/M/c$) queue saturation equations** to predict catastrophic concurrency failures in `<100ms`.

This roadmap outlines the milestones, architectural deliverables, and open-source priorities for `@gitstress/oss`.

---

## Architectural Philosophy

1. **Deterministic Over Heuristic**: Predict failure points using mathematical queue saturation models ($L = \lambda W$) and database cost models, not guessing or LLM hallucinations.
2. **Instant Developer Feedback**: Sub-100ms analysis locally and on the web. No waiting 45 minutes for a k6 or Locust cluster to warm up.
3. **Actionable Incident Dockets**: Output real code symbols, exact failure concurrency thresholds, mechanical root causes, and copy-pasteable SQL index mitigations.
4. **Clean Architectural Craft**: Strictly adhering to high-contrast, zero-glassmorphism engineering design with CAD drafting precision.

---

## Milestone Trajectory

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             GITSTRESS OSS TIMELINE                          │
├──────────────────┬─────────────────┬──────────────────┬─────────────────────┤
│ v0.11.0 (Current)│ Phase 1 (Q4 26) │ Phase 2 (Q1 27)  │ Phase 3 & 4 (Q2-Q3) │
│ Product Clarity  │ Tree-sitter AST │ GitHub Action CI │ Trace Ingestion &   │
│ Top 200k+ Stacks │ Deep ORM Scans  │ PR Comment Bot   │ Client-Side WASM    │
└──────────────────┴─────────────────┴──────────────────┴─────────────────────┘
```

---

### Shipped in v0.11.0 (Current)

- [x] **Product-First Clarity & 4-Tab View**: Streamlined to four core views: Culprit, Graph, Files, and Sweep.
- [x] **Top 200k+ Star Projects Support**: Real AST and concurrency profiling for Linux Kernel, Bitcoin Core, OpenClaw, React 19, Cal.com, and GitReverse.
- [x] **Animated Mechanical Tape Counter**: Live numeric rolling odometer showing before and after headroom (+29× ROI).
- [x] **Vercel Labs Agent Skills Integration**: Standard Agent Skills (`agentskills.io`) for Claude Code, Cursor, Codex, and Antigravity.
- [x] **Native Go Static Engine (`engine-go/`)**: High-performance compiled CLI running repository audits in `<3ms`.
- [x] **Next.js 15 App Router**: Dynamic `/[owner]/[repo]` routing with server-side diagnostic route handlers (`/api/diagnose`).
- [x] **20-Repo Validation Gauntlet**: Automated benchmark across 20 real public stacks with a 100% pass rate.
- [x] **Standard Open Source Tooling**: Apache-2.0 License, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, and GitHub Actions CI.

---

### Phase 1: Multi-Language Tree-Sitter AST Analyzers (Q4 2026)

Moving beyond regex pattern recognition to full abstract syntax tree (AST) traversal using Tree-Sitter grammars:

- **Deep ORM Query Call Site Analysis**:
  - **TypeScript/JavaScript**: Prisma, Drizzle, TypeORM, Kysely.
  - **Python**: SQLAlchemy Core/ORM, Django ORM, Tortoise-ORM.
  - **Go**: GORM, sqlx, ent, pgx pool configurations.
  - **Rust**: Diesel, SeaORM, sqlx compile-time query verification.
- **Advanced Concurrency Failure Patterns**:
  - Detecting `SELECT ... FOR UPDATE` row-level lock contention in high-throughput endpoints.
  - Identifying unindexed foreign keys causing table-level shared locks during cascade deletes.
  - Detecting unbounded in-memory collection mapping (`Promise.all(items.map(...))` without chunking).
- **Multi-Service Compose Topology**:
  - Automatic dependency graph mapping between API gateways (Nginx/Traefik/Envoy), background queues (Celery/BullMQ/Sidekiq), and storage backends.

---

### Phase 2: Official GitHub Action & CI/CD PR Gates (Q1 2027)

Seamless automation directly inside pull requests before Friday deploys:

- **Official GitHub Action (`gitstress/action@v1`)**:
  ```yaml
  name: Friday Deploy Bottleneck Check
  on: [pull_request]
  jobs:
    bottleneck-audit:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: gitstress/action@v1
          with:
            fail-on-fatal: true
            concurrency-threshold: 100
  ```
- **Sticky PR Bot Comments**: Automatically posts the verified Culprit Card directly onto pull requests, highlighting if a commit dropped the repository's fail threshold.
- **SARIF & GitHub Security Integration**: Emit standard Static Analysis Results Format (SARIF) to display warnings in GitHub Code Scanning alerts.
- **GitLab CI & Bitbucket Pipelines**: Packaged pre-built Docker container (`ghcr.io/gitstress/gitstress-cli:latest`).

---

### Phase 3: Distributed Tracing & Queue Cascades (Q2 2027)

Modeling distributed downstream latency cascades across complex microservices:

- **OpenTelemetry (OTEL) Trace Graph Synthesis**:
  - Ingest standard OTEL trace files or Jaeger schemas to calibrate baseline p50/p90/p99 execution latencies against actual service topology.
- **Thundering Herd & Cache Eviction Waterfalls**:
  - Model Redis/Memcached cache hit ratios and simulate cache stampedes when TTL expires under 10k+ concurrent requests.
- **Connection Pool Exhaustion Propagation**:
  - Model connection timeouts propagating backwards through upstream reverse proxies as HTTP 502/504 errors.

---

### Phase 4: Client-Side WebAssembly (WASM) Offline Engine (Q3 2027)

100% private, zero-upload code analysis for air-gapped and enterprise environments:

- **Go/Rust compiled to WebAssembly (`gitstress.wasm`)**:
  - Analyze codebases entirely in the developer's browser using the HTML5 File System Access API.
  - Zero code leaves the user's laptop or internal network.
  - Instant pre-commit git hooks via WASM runtime (`wasmer` / `wasmtime`).

---

### Phase 5: Community Rules Engine & Datastore Expansion (Q4 2027)

Extending GitStress to specialized datastores and custom architectural requirements:

- **Custom Rule Declarations (`.gitstress/rules.yml`)**:
  - Allow teams to define custom cost penalties for internal microservices, RPC interfaces (gRPC/tRPC), or proprietary data layers.
- **Expanded Datastores**:
  - MySQL / MariaDB (InnoDB buffer pool contention and mutex locking).
  - MongoDB (wiredTiger cache pressure and unindexed `$lookup` operations).
  - ClickHouse / CockroachDB (distributed range lease splits and merge tree contention).
- **Interactive Visual Architecture Graph**:
  - Render an interactive demand flow canvas visualizing the exact saturation wave moving from client to disk.

---

## Community & Contributing

We welcome contributions from systems engineers, database administrators, and developers who care about deploy confidence.

### How to Contribute:
1. **Add to the 20-Repo Gauntlet**: If you maintain or use a popular open-source stack, submit a PR adding its profile to `oss/gauntlet/manifest.json`.
2. **Improve Parser Rules**: Add AST patterns in `oss/src/core/parsers/` or Go engine rules in `oss/engine-go/`.
3. **Design Adherence**: All UI contributions must adhere strictly to `.agents/AGENTS.md` (no glassmorphism, no neon glowing, crisp 3px–6px CAD radiuses).

---

## License & Distribution

GitStress OSS is open-source software licensed under the [MIT License].
For commercial runners, hosted sandbox execution, and webhook infrastructure, see `@gitstress/com`.
