# Workload Classification & Architectural Refusal Engine

## 1. Overview & Problem Definition

A recurring issue in automated performance modeling is **the illusion of universality**: tools claiming to diagnose any arbitrary GitHub repository, and then running an identical web fixture (such as a 62-user bottleneck with a +29× multiplier and a Postgres connection pool) on an operating system kernel (`torvalds/linux`) or a C++ P2P consensus node (`bitcoin/bitcoin`).

In GitStress v0.11.0, **Refusal is a First-Class Feature**.

If a repository lacks an identifiable user-space web/worker runtime, or if the confidence score is below 0.55, GitStress strictly refuses to invent a fake bottleneck. Instead, it displays the **Need-X Dossier (Architectural Refusal Card)**.

---

## 2. Workload Classification Matrix

Before running graph generation or queue demand propagation, `classifyWorkload()` tags the repository into one of six distinct classes:

| Class | Detection Criteria | Behavior | Output Status |
|---|---|---|---|
| **`web`** | HTTP routes (`api/`, `routes/`, Next.js, FastAPI, Express, Django) + (compose / schema / ORM) | Full queue simulation | Symbol + Concurrency Saturation Point |
| **`worker`** | Queue consumers (Kafka, RabbitMQ, Celery, BullMQ, Redis Streams) | Ingestion & batch throughput simulation | Queue overflow point |
| **`kernel`** | `Makefile` with kernel patchlevel, `net/core/`, `kernel/sched/`, `vmlinux` | **Refusal** | `KERNEL SUBSYSTEM (OUT OF SCOPE)` |
| **`p2p-node`** | P2P gossip, consensus daemons (`bitcoind`, `geth`, mempool) | **Refusal** | `P2P CONSENSUS NODE (NO WEB RUNTIME)` |
| **`library`** | Package manifest without server entrypoint (e.g. React, lodash) | **Refusal** | `CLIENT / UI LIBRARY (NO STANDALONE PROCESS)` |
| **`stub`** | Unresolved files, missing compose/schema, confidence < 0.55 | **Refusal** | `UNRESOLVED ARCHITECTURE (NEED-X)` |

---

## 3. The Need-X Dossier Structure

When a repository is refused, the user receives an honest, transparent breakdown:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ § HONEST REFUSAL DOSSIER                          CLASS: KERNEL SUBSYSTEM   │
├─────────────────────────────────────────────────────────────────────────────┤
│ CANNOT NAME A BOTTLENECK SAFELY                                             │
│ GitStress only diagnoses user-space web and backend services with           │
│ detectable network and storage queues.                                      │
│                                                                             │
│ § 1.0 REASON                                                                │
│ Linux is an operating system kernel executing in privileged ring-0 space.    │
│ Cannot simulate 62 HTTP users on monolithic kernel space.                   │
│                                                                             │
│ § 2.0 MISSING SIGNALS                                                       │
│ [!] No user-space HTTP/TCP network listener                                 │
│ [!] No application process runtime entrypoint                               │
│ [!] No database connection pool or ORM schema                               │
│                                                                             │
│ § 3.0 RECOMMENDED RUNTIME ACTION                                            │
│ Test a web or backend repository with an active application runtime:        │
│ [ filiksyos/gitreverse ]  [ calcom/cal.com ]  [ posthog/posthog ]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Dynamic Physics (Eliminating Hardcoded Multipliers)

Every eligible web and worker repository computes its saturation threshold and headroom from authentic engineering properties:

- **`filiksyos/gitreverse`**: Next.js 15 view counter hits Supabase RPC. Free tier connection limit: 60. Saturated at **60 concurrent users**. Fix: Atomic Redis write-behind buffer (`redis.hincrby`) -> Headroom: **1,800 concurrent (+30×)**.
- **`calcom/cal.com`**: Next.js + Prisma unindexed Booking attendee query. Pool size: 15, query latency: 140ms. Saturated at **18 concurrent users**. Fix: `CREATE INDEX CONCURRENTLY` -> Headroom: **320 concurrent (+17.8×)**.
- **`posthog/posthog`**: Ingestion socket buffer capacity: 2,400 events. Saturated at **2,400 req/s**. Fix: Kafka partitioned batch consumer -> Headroom: **18,500 req/s (+7.7×)**.
- **`supabase/realtime`**: BEAM process mailbox saturation at **450 concurrent websocket channels**. Fix: Distributed Redis PubSub adapter -> Headroom: **5,400 sockets (+12×)**.

---

## 5. Interactive Unified Git Diff Studio (§ 3.0 FIX)

Section § 3.0 FIX features an authentic GitHub-style unified diff viewer:
- File header: `--- a/file` and `+++ b/file`
- Deleted line: `-  // sequential bottleneck call` in red highlight
- Added line: `+  // non-blocking remediation` in green highlight
- **1-Click Copy**:
  - `COPY GIT APPLY PATCH`: Exports a standard unified patch that can be applied with `git apply patch.diff`.
  - `COPY CODE`: Exports the raw remediation snippet.
