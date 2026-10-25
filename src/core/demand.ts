/**
 * Demand Propagation & Multi-Tier Concurrency Sweep Engine (TypeScript)
 * Models flow across Ingress -> Workers -> DB Pool -> Table Scans.
 * Now powered by Operational Queuing Network Mean Value Analysis (MVA).
 */

import { estimateQueryCost, calculateConcurrencyThreshold, simulateConcurrencyTier } from './cost_model';
import { SWEEP_TIERS, type SweepRow, type ConcurrencyThreshold, type StatusLevel } from './types';
import type { ComposeParsedData } from './parsers/compose';
import type { DockerfileParsedData } from './parsers/dockerfile';
import type { SchemaParsedData } from './parsers/schema';
import type { CodeFinding } from './parsers/code';
import { solveCompleteQueuingNetwork, type SolvedQueuingNetwork } from './queuing_network';

export interface DemandInput {
  composeData?: Partial<ComposeParsedData>;
  dockerData?: Partial<DockerfileParsedData>;
  schemaData?: Partial<SchemaParsedData>;
  codeFindings?: CodeFinding[];
  repoInfo?: { name?: string; owner?: string; url?: string };
}

export interface DemandResult {
  poolSize: number;
  workers: number;
  maxConnections: number;
  queryLatencyMs: number;
  threshold: ConcurrencyThreshold;
  sweep: SweepRow[];
  primaryFinding?: CodeFinding;
  composeData?: Partial<ComposeParsedData>;
  solvedNetwork?: SolvedQueuingNetwork;
}

export function runDemandPropagation({
  composeData = {},
  dockerData = {},
  schemaData = {},
  codeFindings = [],
  repoInfo = {}
}: DemandInput): DemandResult {
  const poolSize = composeData.dbPoolSize || 10;
  const maxConnections = composeData.maxConnections || 100;
  const workers = composeData.workerCount || dockerData.workers || 2;

  // Find most severe query finding
  let primaryFinding = codeFindings.find(f => f.type === 'UNINDEXED_QUERY');
  if (!primaryFinding && codeFindings.length > 0) {
    primaryFinding = codeFindings[0];
  }

  // Cost calculation for the query
  const queryCost = estimateQueryCost({
    rowCount: 50000,
    hasIndex: false,
    isUnique: true
  });

  const queryLatencyMs = primaryFinding?.type === 'N_PLUS_ONE_LOOP' 
    ? 220 
    : (queryCost.latencyMs || 45);

  // Solve exact Operational Queuing Network via MVA
  const solvedNetwork = solveCompleteQueuingNetwork({
    composeData,
    dockerData,
    schemaData,
    codeFindings,
    repoInfo
  });

  const threshold: ConcurrencyThreshold = {
    failConcurrency: solvedNetwork.failConcurrency,
    poolThroughputReqPerSec: solvedNetwork.throughputAtFail,
    baseLatencyMs: solvedNetwork.baseLatencyMs,
    p99AtFailMs: solvedNetwork.p99AtFailMs
  };

  return {
    poolSize,
    workers,
    maxConnections,
    queryLatencyMs,
    threshold,
    sweep: solvedNetwork.sweep,
    primaryFinding,
    composeData,
    solvedNetwork
  };
}
