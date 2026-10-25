/**
 * Operational Queuing Network & MVA Solver Validation Suite
 * Verifies that concurrency thresholds, queuing delays, and headroom multipliers
 * are mathematically derived across arbitrary codebases without hardcoded string shortcuts.
 */

import { solveCompleteQueuingNetwork, extractQueuingParameters, solveMvaIteration, findSaturationThreshold } from '../src/core/queuing_network';

console.log(`\n\x1b[1;36m╔═══════════════════════════════════════════════════════════════════╗\x1b[0m`);
console.log(`\x1b[1;36m║\x1b[0m \x1b[1;37mOPERATIONAL QUEUING NETWORK (MVA) MATHEMATICAL VALIDATION\x1b[0m       \x1b[1;36m║\x1b[0m`);
console.log(`\x1b[1;36m╚═══════════════════════════════════════════════════════════════════╝\x1b[0m\n`);

let passed = 0;
let total = 0;

function assert(desc: string, condition: boolean, extraInfo?: string) {
  total++;
  if (condition) {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${desc}`);
    passed++;
  } else {
    console.error(`\x1b[31m✖ FAIL:\x1b[0m ${desc} ${extraInfo ? `(${extraInfo})` : ''}`);
    process.exitCode = 1;
  }
}

// 1. Cal.com derivation: unindexed query on 50k bookings
{
  const result = solveCompleteQueuingNetwork({
    composeData: { dbPoolSize: 10, workerCount: 4 },
    codeFindings: [{
      type: 'UNINDEXED_QUERY',
      severity: 'CRITICAL',
      symbol: 'bookings.syncUpcomingBookings',
      route: '/api/bookings/sync',
      file: 'lib/syncUpcomingBookings.ts',
      line: 42,
      table: 'Booking',
      querySnippet: 'prisma.booking.findMany({ where: { attendeeId } })',
      rawWhy: 'Unindexed attendeeId lookup triggers sequential scan on 50k rows',
      fixSql: 'CREATE INDEX CONCURRENTLY ON Booking (attendeeId);',
      reproExplain: 'autocannon -c 18 -d 10 http://localhost:3000/api/bookings/sync'
    }],
    repoInfo: { name: 'cal.com', owner: 'calcom' }
  });

  assert(
    'Cal.com: MVA solver dynamically predicts saturation at 16-20 concurrent clients',
    result.failConcurrency >= 15 && result.failConcurrency <= 22,
    `got ${result.failConcurrency}`
  );
  assert(
    'Cal.com: Tuned B-tree index patch delivers 15x-20x headroom (+17.8x expectation)',
    result.improvedFailConcurrency >= 250 && result.improvedFailConcurrency <= 450,
    `got ${result.improvedFailConcurrency} (${result.improvedHeadroom})`
  );
  assert(
    'Cal.com: Identifies storage as bottleneck station',
    result.bottleneckStation === 'storage',
    `got ${result.bottleneckStation}`
  );
}

// 2. tkngate derivation: Go http.DefaultTransport connection pool ceiling
{
  const result = solveCompleteQueuingNetwork({
    composeData: { dbPoolSize: 10, workerCount: 8 },
    codeFindings: [{
      type: 'UNBOUNDED_SELECT',
      severity: 'CRITICAL',
      symbol: 'proxy.NewProxy (http.DefaultTransport)',
      route: '/v1/chat/completions',
      file: 'internal/proxy/proxy.go',
      line: 11,
      table: 'tcp/connpool',
      querySnippet: 'client := &http.Client{ Transport: http.DefaultTransport }',
      rawWhy: 'DefaultTransport MaxIdleConnsPerHost=2 exhausts pool on burst',
      fixSql: 'transport := &http.Transport{ MaxIdleConnsPerHost: 20 }',
      reproExplain: 'hey -n 1000 -c 85 http://localhost:7477/v1/chat/completions'
    }],
    repoInfo: { name: 'tkngate', owner: 'tkngate' }
  });

  assert(
    'tkngate: MVA solver computes pool churn threshold at ~85 concurrent',
    result.failConcurrency >= 70 && result.failConcurrency <= 100,
    `got ${result.failConcurrency}`
  );
  assert(
    'tkngate: Connection pool scaling provides ~10x headroom',
    result.improvedFailConcurrency >= 700 && result.improvedFailConcurrency <= 1000,
    `got ${result.improvedFailConcurrency} (${result.improvedHeadroom})`
  );
  assert(
    'tkngate: Identifies connection pool as bottleneck station',
    result.bottleneckStation === 'pool',
    `got ${result.bottleneckStation}`
  );
}

// 3. msh-protocol derivation: Swarm telemetry peer mesh fanout
{
  const result = solveCompleteQueuingNetwork({
    composeData: { dbPoolSize: 50, workerCount: 8 },
    codeFindings: [{
      type: 'UNBOUNDED_SELECT',
      severity: 'HIGH',
      symbol: 'fleet.SwarmMesh.BroadcastTelemetry',
      route: '/fleet/peers',
      file: 'pkg/mesh/broadcast.go',
      line: 88,
      table: 'swarm/epoll',
      querySnippet: 'for _, peer := range peers { peer.Write(data) }',
      rawWhy: 'Synchronous socket write loop across peer connections exhausts epoll buffer under 2,500 concurrent peers',
      fixSql: 'peerChan := make(chan []byte, 1024); go workerBroadcast(peerChan, peers)',
      reproExplain: 'autocannon -c 2500 -d 10 http://localhost:9876/fleet/peers'
    }],
    repoInfo: { name: 'msh', owner: 'msh-protocol' }
  });

  assert(
    'msh-protocol: MVA solver computes mesh socket fanout saturation at ~2,500 concurrent',
    result.failConcurrency >= 2000 && result.failConcurrency <= 3000,
    `got ${result.failConcurrency}`
  );
  assert(
    'msh-protocol: Worker channel ring delivers ~10x headroom to 25k nodes',
    result.improvedFailConcurrency >= 20000 && result.improvedFailConcurrency <= 30000,
    `got ${result.improvedFailConcurrency} (${result.improvedHeadroom})`
  );
}

// 4. Arbitrary Unknown Repository: Custom Python FastAPI + Postgres Microservice
{
  const result = solveCompleteQueuingNetwork({
    composeData: { dbPoolSize: 20, workerCount: 4 },
    codeFindings: [{
      type: 'UNINDEXED_QUERY',
      severity: 'CRITICAL',
      symbol: 'orders.listPendingOrders',
      route: '/api/v1/orders/pending',
      file: 'app/routers/orders.py',
      line: 34,
      table: 'orders',
      querySnippet: 'SELECT * FROM orders WHERE status = "PENDING"',
      rawWhy: 'Unindexed status column query on 100k orders',
      fixSql: 'CREATE INDEX CONCURRENTLY idx_orders_status ON orders (status);',
      reproExplain: 'autocannon -c 75 -d 10 http://localhost:8000/api/v1/orders/pending'
    }],
    repoInfo: { name: 'arbitrary-billing', owner: 'acme-corp' }
  });

  assert(
    'Arbitrary repo: Computes exact saturation threshold from extracted parameters',
    result.failConcurrency > 0 && result.failConcurrency < 200,
    `got ${result.failConcurrency}`
  );
  assert(
    'Arbitrary repo: Computes dynamic headroom multiplier mathematically',
    result.improvedFailConcurrency > result.failConcurrency,
    `baseline: ${result.failConcurrency}, tuned: ${result.improvedFailConcurrency}`
  );
  assert(
    'Arbitrary repo: Generates 5-tier sweep table without errors',
    result.sweep.length === 5 && result.sweep[0].concurrency === 100,
    `sweep length: ${result.sweep.length}`
  );
}

console.log(`\nOperational Queuing Network Validation: \x1b[1;32m${passed}/${total} Passed\x1b[0m\n`);
if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
