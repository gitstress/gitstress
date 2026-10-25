# Honest Concurrency Forensics & Before/After Headroom Engine

## 1. Positioning & Philosophy

> **"GitDiagram shows you the map. GitStress tells you which road collapses first."**
> 
> *Paste a GitHub URL. Get the first line that dies under load — and the fix.*

GitStress does not compete on pretty repository diagrams or LLM prompt generation. Its sole reason to exist is:
**Which symbol dies first when users show up, at how many concurrent requests, and what command fixes it.**

---

## 2. Core Pillars of Honesty

### A. Never Invent a Culprit
- If discover finds Go entrypoints (`net/http`, `gin`, `chi`, `proxy.NewProxy`, `http.DefaultTransport`), it diagnoses Go concurrency bottlenecks:
  - `http.DefaultTransport` connection starvation (`MaxIdleConnsPerHost=2` causing socket churn).
  - Global `sync.RWMutex` lock contention across goroutines.
  - SQLite single-writer lock serialization.
- If discover finds Supabase / Next.js routes:
  - Identifies un-debounced RPC mutations (`supabase.rpc`) and unindexed lookups.
- If discover finds a bare repository with no query, database, or pool:
  - Sets `graph_source: stub`.
  - Sets confidence ceiling `0.32` (`Guess from source + transport defaults, missing compose`).
  - Surfaces **"Need compose or a schema to name a line"** instead of inventing mock files.

### B. Before / After on the Same Card
A diagram cannot say *"this fix buys you 29× headroom."* GitStress does:
- Users click **`[Apply Fix in Model]`**.
- The card dynamically recalculates Little's Law throughput:
  - e.g. `62 concurrent` → `1,800 concurrent (+29× HEADROOM)`.
  - Query latency drops from `85ms` (Seq Scan) to `2.8ms` (Index Scan).
  - Connection reuse eliminates TLS renegotiation and TCP `TIME_WAIT` socket exhaustion.

### C. Human-Readable Status Language
Replaced technical alarms with clear status indicators:
- `OK at 100`
- `Dies at 62`
- `Starved at 1k`
- `Backpressure at 10k`
- `Confidence: Inferred from compose + source + cost model`

---

## 3. Real Physical InfraGraph

Displays the real execution pipeline running under the static demand propagation solver:
- Physical nodes: `proxy` / `service` / `cache` / `db` / `query`
- Explicit vs. inferred nodes: Inferred nodes are clearly flagged `[INFERRED]` with capacity estimates.
- Edges: Annotated with demand weights ($w$) and fanout ratios ($f$).

---

## 4. Three High-ROI Artifacts for Pull Requests

1. **One-Click PR Comment**:
   ```
   GitStress: users.findByEmail dies at 62 concurrent
   src/routes/auth.py:42
   Fix: CREATE INDEX CONCURRENTLY ON users (email)
   Repro: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE email = $1
   Confidence: Inferred from compose + source + cost model
   ```
2. **Copyable Remediation Command**:
   Exact DDL or configuration snippet ready to paste.
3. **README Concurrency Status Badge**:
   `[![gitstress](https://gitstress.com/owner/repo/badge.svg)](https://gitstress.com/owner/repo)`

---

## 5. Private Repository Access

Zero-OAuth friction via GitHub Personal Access Token (PAT):
- Click **"Private Repo"** in the header.
- Token is kept strictly in local browser `localStorage`.
- Evaluated entirely in memory and never stored on disk.
