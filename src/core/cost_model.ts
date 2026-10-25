/**
 * PostgreSQL & Queuing Theory Cost Model (TypeScript)
 * Implements PostgreSQL planner cost estimation & M/M/c queue saturation models.
 */

import type { QueryCostEstimate, ConcurrencyThreshold, SweepRow, StatusLevel } from './types';

export const PG_DEFAULTS = {
  seq_page_cost: 1.0,
  random_page_cost: 4.0,
  cpu_tuple_cost: 0.01,
  cpu_index_tuple_cost: 0.005,
  cpu_operator_cost: 0.0025,
  default_rows_per_page: 50,
  default_pool_size: 10,
  default_max_connections: 100,
  default_client_timeout_ms: 2000
};

export function estimateQueryCost({
  rowCount = 50000,
  hasIndex = false,
  returnedRows = 1
}: {
  rowCount?: number;
  hasIndex?: boolean;
  isUnique?: boolean;
  returnedRows?: number;
}): QueryCostEstimate {
  const pages = Math.ceil(rowCount / PG_DEFAULTS.default_rows_per_page);

  if (!hasIndex) {
    const ioCost = pages * PG_DEFAULTS.seq_page_cost;
    const cpuCost = rowCount * (PG_DEFAULTS.cpu_tuple_cost + PG_DEFAULTS.cpu_operator_cost);
    const totalCost = Math.round((ioCost + cpuCost) * 100) / 100;
    const latencyMs = Math.max(12, Math.round(totalCost * 0.028));

    return {
      scanType: 'Seq Scan',
      cost: totalCost,
      latencyMs,
      unindexed: true,
      explanation: `Seq scan on ${rowCount.toLocaleString()} rows (cost ${totalCost.toFixed(2)})`
    };
  } else {
    const treeHeight = Math.max(2, Math.ceil(Math.log2(rowCount) / 7));
    const ioCost = (treeHeight + returnedRows) * PG_DEFAULTS.random_page_cost;
    const cpuCost = returnedRows * (PG_DEFAULTS.cpu_index_tuple_cost + PG_DEFAULTS.cpu_tuple_cost);
    const totalCost = Math.round((ioCost + cpuCost) * 100) / 100;
    const latencyMs = Math.max(0.6, Math.round(totalCost * 0.06 * 10) / 10);

    return {
      scanType: 'Index Scan',
      cost: totalCost,
      latencyMs,
      unindexed: false,
      explanation: `Index scan via B-Tree (cost ${totalCost.toFixed(2)})`
    };
  }
}

export function calculateConcurrencyThreshold({
  poolSize = 10,
  queryLatencyMs = 45,
  appOverheadMs = 15,
  timeoutMs = 1500
}: {
  poolSize?: number;
  queryLatencyMs?: number;
  appOverheadMs?: number;
  timeoutMs?: number;
}): ConcurrencyThreshold {
  const baseLatency = appOverheadMs + queryLatencyMs;
  const poolThroughputReqPerSec = poolSize / (queryLatencyMs / 1000);
  const headroomMs = Math.max(0, timeoutMs - baseLatency);
  const queueMultiplier = (headroomMs * poolSize) / queryLatencyMs;
  
  let failAt = Math.round(poolSize + (queueMultiplier * 0.165));
  failAt = Math.max(4, failAt);

  return {
    failConcurrency: failAt,
    poolThroughputReqPerSec: Math.round(poolThroughputReqPerSec),
    baseLatencyMs: Math.round(baseLatency),
    p99AtFailMs: timeoutMs
  };
}

export function simulateConcurrencyTier(
  concurrency: number,
  {
    poolSize = 10,
    queryLatencyMs = 45,
    appOverheadMs = 15
  }: {
    poolSize?: number;
    queryLatencyMs?: number;
    appOverheadMs?: number;
  }
) {
  const baseLatency = appOverheadMs + queryLatencyMs;
  const activeDbSessions = Math.min(concurrency, poolSize);
  const waitingInQueue = Math.max(0, concurrency - poolSize);
  
  const queueDelayMs = waitingInQueue === 0 
    ? 0 
    : Math.round((waitingInQueue * queryLatencyMs) / poolSize * 1.3);

  const p99LatencyMs = Math.min(30000, baseLatency + queueDelayMs);
  const poolUtilizationPct = Math.min(100, Math.round((concurrency / poolSize) * 100));

  let status: StatusLevel = 'HEALTHY';
  if (p99LatencyMs > 2000 || poolUtilizationPct >= 300) {
    status = 'FATAL';
  } else if (p99LatencyMs > 1000 || poolUtilizationPct >= 150) {
    status = 'SATURATED';
  } else if (p99LatencyMs > 300 || poolUtilizationPct >= 80) {
    status = 'DEGRADED';
  }

  return {
    concurrency,
    p99LatencyMs,
    poolUtilizationPct,
    activeDbSessions,
    waitingInQueue,
    status
  };
}
