# Route Exposure Weighting & Blast Radius Classification

## 1. Architectural Motivation

In real-world web infrastructure, not all endpoint bottlenecks are created equal. A sequential table scan executing inside an administrative quarterly CSV export script (`/admin/users/export`) poses near-zero denial-of-service risk under ordinary operating conditions. In contrast, an identical unindexed table scan executed on the public root landing page (`/`), an unauthenticated search endpoint (`/search`), or a vanity profile permalink (`/@username`) exposes the entire downstream database pool to catastrophic collapse under anonymous surges, scraping bots, and marketing spikes.

Prior to v0.12.0, static analysis scanners evaluated code findings strictly in AST traversal order. If an administrative report query happened to appear first in the source file list, the diagnostic engine would incorrectly flag the admin route as the primary culprit, ignoring far more dangerous public-facing bottlenecks.

GitStress v0.12.0 introduces **Route Exposure Weighting**, an operational risk engine that classifies endpoint ingress paths into deterministic exposure tiers, computes a mathematical **Blast Radius Score**, and prioritizes public-facing saturation choke-points.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ROUTE EXPOSURE RISK STRATIFICATION                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [PUBLIC INGRESS] · 100× Traffic Weight                                     │
│  Unauthenticated browse endpoints, search, root gateway, vanity handles.    │
│  Subject to unmetered anonymous traffic spikes & web crawlers.              │
│  Blast Radius = (100 / N_fail) × 10                                         │
│       │                                                                     │
│       ▼                                                                     │
│  [AUTHENTICATED INGRESS] · 10× Traffic Weight                               │
│  Session-gated user dashboards, settings, workspaces, bookings.             │
│  Concurrency strictly bounded by active logged-in user sessions.            │
│  Blast Radius = (10 / N_fail) × 10                                          │
│       │                                                                     │
│       ▼                                                                     │
│  [INTERNAL / ADMIN INGRESS] · 1× Traffic Weight                             │
│  Backoffice admin tools, internal metrics, scheduled cron/batch jobs.       │
│  Restricted to internal staff and batch workers; minimal concurrent risk.   │
│  Blast Radius = (1 / N_fail) × 10                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ingress Classification Engine

The engine parses route strings, source filenames, AST middleware definitions, and framework security decorators to assign one of three exposure tiers:

### 2.1 Internal / Admin Routes (`INTERNAL_ADMIN`, 1× Multiplier)
Endpoints restricted to system administration or automated batch workers:
* **Path Prefix Patterns**: `/admin/*`, `/superadmin/*`, `/internal/*`, `/system/*`, `/jobs/*`, `/cron/*`, `/batch/*`, `/export/*`, `/metrics`, `/healthcheck`, `/backoffice/*`, `/dev/*`, `/migrate`.
* **File Patterns**: `AdminController`, `InternalController`, `ExportController`, `*admin*`, `*console*`, `*cron*`, `*jobs*`.
* **Security & Role Context**: `is_admin`, `is_superuser`, `role:admin`, `has_role('admin')`, `can:manage`, `Gate::allows('admin')`, `middleware('admin')`.

### 2.2 Authenticated User Routes (`AUTHENTICATED`, 10× Multiplier)
Endpoints requiring active user authentication:
* **Path Prefix Patterns**: `/dashboard/*`, `/creator/*`, `/settings/*`, `/account/*`, `/profile/*`, `/billing/*`, `/workspaces/*`, `/calendar/*`, `/bookings/*`, `/team/*`, `/preferences/*`, `/me/*`.
* **Security & Auth Context**: `auth:sanctum`, `auth:api`, `middleware('auth')`, `ensureAuth`, `isAuthenticated`, `@login_required`, `Depends(get_current_user)`, `requireAuth`, `protectRoute`, `req.user`, `$request->user()`.

### 2.3 Public Browse Routes (`PUBLIC`, 100× Multiplier)
Top-level entry points and browse routes exposed to anonymous internet traffic:
* **Root Gateway**: `/`, `/home`, index endpoints.
* **Public Discovery**: `/discover`, `/explore`, `/search`, `/feed`, `/catalog`, `/products`, `/posts`, `/items`, `/channels`.
* **Public Vanity Permalinks**: `/@:username`, `/users/:id`.

---

## 3. Blast Radius Mathematical Formulation

The operational blast radius score measures the relative risk that a bottleneck will cause systemic cluster degradation. It directly balances the route's ingress traffic weight against the physical saturation knee ($N_{fail}$) calculated by the 4-station Mean Value Analysis (MVA) queuing solver:

$$\text{Blast Radius} = \frac{W_{exposure}}{\max(1, N_{fail})} \times 10$$

Where:
* $W_{exposure} \in \{100, 10, 1\}$ represents the route exposure tier weight.
* $N_{fail}$ represents the physical concurrency threshold where database pool wait times cross the client timeout threshold ($T_{timeout} = 5000\text{ms}$).

### Blast Radius Comparison Matrix

| Route Endpoint | Exposure Tier | Weight ($W$) | Saturation Knee ($N_{fail}$) | Blast Radius Score | Operational Risk Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET /api/feed` | `PUBLIC` | 100 | 26 | **38.5** | **Critical DoS Hazard**: Single anonymous burst exhausts connection pool. |
| `GET /dashboard/stats` | `AUTHENTICATED` | 10 | 26 | **3.8** | **Moderate Risk**: Requires coordinated logged-in user surge to saturate pool. |
| `GET /admin/users/export` | `INTERNAL_ADMIN` | 1 | 26 | **0.4** | **Low Risk**: Rare backoffice query; negligible risk of cascading cluster failure. |

---

## 4. Multi-Finding Candidate Ranking

When a repository contains multiple code defects, GitStress sorts candidates according to a 3-tier tuple comparator:

1. **Exposure Weight** ($W_B - W_A$): Public routes ($W=100$) always rank above authenticated ($W=10$) and admin routes ($W=1$).
2. **Defect Severity**: `UNINDEXED_QUERY` (rank 4) > `N_PLUS_ONE_LOOP` (rank 3) > `CPU_CRYPTOGRAPHIC_BOTTLENECK` (rank 2) > `UNBOUNDED_SELECT` (rank 1).
3. **Criticality Level**: `CRITICAL` > `HIGH` > `MEDIUM`.

This guarantees that public-facing vulnerabilities receive immediate diagnostic attention and verified 10x headroom remedies.

---

## 5. UI and Terminal Integration

1. **Terminal Culprit Card**:
   ```
   ║ EXPOSURE    PUBLIC EXPOSURE · 100× TRAFFIC WEIGHT · BLAST RADIUS: 38.5    ║
   ║ INGRESS     Landing page & root traffic gateway exposed to visitor traffic║
   ```
2. **Three-Tier Evidence Framing**:
   * **Tier 1 (Static Fact)**: Includes `routeExposure`, `trafficWeight`, and `blastRadius` in deterministic static defect metrics.
   * **Tier 2 (MVA Projection)**: Correlates arrival rate $\lambda$ with route exposure multiplier.
3. **Web Cockpit UI**:
   * Renders color-coded exposure pill in § 1.0 CULPRIT (`.exposure-public` red, `.exposure-authenticated` yellow, `.exposure-internal_admin` gray).
   * Displays blast radius numerical badge and ingress reason.
   * Renders executive cockpit exposure tag next to GitHub source line citation.
