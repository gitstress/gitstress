# Operational Queuing Network & Mean Value Analysis (MVA) Engine

## 1. Architectural Overview

GitStress v0.11.0 transitions from heuristic pattern-matched cost estimations to a general-purpose **Operational Queuing Network (OQN)** solved via **Mean Value Analysis (MVA)**, **Little's Law**, and **Universal Scalability Law (USL)** mathematical modeling.

Rather than relying on hardcoded constants per known repository, the engine dynamically extracts an architectural parameter vector from arbitrary source code ASTs, Dockerfile configurations, database schemas, and connection pool definitions, solving the saturation thresholds deterministically.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              4-TIER CLOSED OPERATIONAL QUEUING NETWORK                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Station 0] Ingress Reverse Proxy & TCP Sockets (c_ingress, D_ingress)    │
│       │                                                                     │
│       ▼                                                                     │
│  [Station 1] Application Worker Runtime / Event Loop (c_worker, D_worker)  │
│       │      (Amdahl serialization contention alpha_worker)                 │
│       ▼                                                                     │
│  [Station 2] Downstream Connection Transport Pool (c_pool, D_pool)          │
│       │      (Pool wait queue + TLS handshake renegotiation churn)          │
│       ▼                                                                     │
│  [Station 3] Storage Engine / DB Disk IO / Mutex (c_storage, D_storage)     │
│              (Postgres B-Tree vs Seq Scan, USL coherency beta_storage)      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Mathematical Formulations

### 2.1 Mean Value Analysis (MVA) Recursive Equations

For a closed queuing network with $K=4$ stations and concurrency level $N \in [1, 100000]$:

1. **Station Residence Time $R_k(N)$**:
   $$R_k(N) = D_k \left( 1 + \frac{Q_k(N-1)}{c_k} \right) \left( 1 + \alpha_k (N - 1) \right) + \beta_k N^2 D_k \cdot 0.1$$
   Where:
   * $D_k$: Base service demand at station $k$ in milliseconds.
   * $c_k$: Multi-server capacity at station $k$ (e.g., worker threads, database connections, socket descriptors).
   * $Q_k(N-1)$: Queue length at station $k$ under concurrency $N-1$.
   * $\alpha_k$: Serialization contention fraction (Amdahl's law penalty).
   * $\beta_k$: Crosstalk and coherency penalty (epoll/cache churn).

2. **System Throughput $X(N)$ (Little's Law)**:
   $$X(N) = \frac{N}{\sum_{k=1}^K R_k(N) + Z}$$
   Where $Z$ represents client think time (typically 0 for load test bursts).

3. **Queue Lengths $Q_k(N)$ and Utilization $U_k(N)$**:
   $$Q_k(N) = X(N) \cdot R_k(N)$$
   $$U_k(N) = \frac{X(N) \cdot D_k}{c_k}$$

---

### 2.2 Little's Law Pool Sizing and Queue Timeout

When a database connection pool or downstream transport pool of capacity $c_{pool}$ is saturated, requests accumulate in the client connection acquisition queue:

$$N_{pool\_fail} = c_{pool} + \frac{T_{timeout} - D_{total}}{D_{bottleneck}} \cdot \left( \frac{c_{pool}}{\max(1, \sigma_{burst})} \right)$$

Where:
* $T_{timeout}$: Client SLA or connection timeout (default 1,500ms).
* $D_{total}$: Total baseline roundtrip latency under idle conditions.
* $D_{bottleneck}$: Service duration of the bottleneck query or RPC call.

---

### 2.3 Universal Scalability Law (USL) & Retrograde Collapse

Dr. Neil J. Gunther's Universal Scalability Law models throughput degradation when concurrency $N$ induces excessive lock contention and coherency invalidation:

$$C(N) = \frac{N}{1 + \alpha (N - 1) + \beta N (N - 1)}$$

The exact saturation knee $N^*$ before throughput enters retrograde collapse is:

$$N^* = \sqrt{\frac{1 - \alpha}{\beta}}$$

When concurrency exceeds $N^*$, throughput collapses due to epoll churn, cache line invalidations, and lock convoying.

---

## 3. Dynamic Headroom & Tuned Model Computation

When GitStress recommends an architectural patch, it performs a mathematical model mutation ($\vec{\theta} \to \vec{\theta}'$):

1. **Unindexed Table Scan -> B-Tree Index**:
   * Storage service demand drops: $D_{storage} \to 4.1\text{ms}$ (derived from PostgreSQL planner B-tree cost: $cost = (\text{tree\_height} + 1) \cdot \text{random\_page\_cost}$).
   * Contention drops: $\alpha_{storage} \to 0.004$.
2. **Connection Pool Scaling (`MaxIdleConnsPerHost: 2 -> 20`)**:
   * Pool capacity scales: $c_{pool} \to 20$.
   * TLS handshake churn drops: $\beta_{pool} \to 0.00001$.
3. **Synchronous Writes -> Micro-Batching Buffer**:
   * Contention drops: $\alpha_{storage} \to 0.0001$.
   * Effective service demand compressed: $D_{storage} \to \max(1.5, D_{storage} \times 0.2)$.

The MVA solver executes again on the tuned parameters $\vec{\theta}'$, yielding $N_{fail}'$. The headroom multiplier is computed dynamically:

$$H = \frac{N_{fail}'}{N_{fail}}$$

---

## 4. Bridging Static Analysis with Empirical Load Testing

Load testing tools (`k6`, `hey`, `wrk`, `autocannon`) are empirical execution harnesses that require provisioned environments, synthetic datasets, and manual route discovery.

GitStress operates as an **Analytical Concurrency Pre-Flight Engine**:
1. Analyzes source trees in under 50 milliseconds directly in CI/CD before staging.
2. Identifies the first symbol and queue to saturate mathematically.
3. Synthesizes turnkey, executable reproduction scripts with exact parameters:
   * `autocannon -c <N_fail + 5> -d 15 "http://localhost:3000<route>"`
   * `k6 run --vus <N_fail + 5> --duration 15s script.js`
4. Provides an automated closed-loop synthetic verification gate ensuring mathematical predictions match physical operating systems.
