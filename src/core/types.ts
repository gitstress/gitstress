/**
 * GitStress Core Engine - Strongly Typed Interfaces
 * Friday-Afternoon Bottleneck Diagnostic
 */

export type NodeType = 
  | 'ingress'
  | 'load_balancer'
  | 'app_worker'
  | 'event_loop'
  | 'db_pool'
  | 'database'
  | 'table_scan'
  | 'cache'
  | 'external_api';

export type FailureMode = 
  | 'seq_scan_saturation'
  | 'pool_exhaustion'
  | 'n_plus_one_explosion'
  | 'event_loop_blocked'
  | 'worker_starvation'
  | 'memory_oom'
  | 'fd_exhaustion';

export type StatusLevel = 'HEALTHY' | 'DEGRADED' | 'SATURATED' | 'FATAL' | 'CRASH';

export const SWEEP_TIERS = [100, 1000, 10000, 25000, 47000] as const;

export interface SweepRow {
  concurrency: number;
  concurrencyLabel: string;
  hottestNode: string;
  failureMode: string;
  p99LatencyMs: number;
  poolUtilizationPct: number;
  status: StatusLevel;
  humanStatus?: string; // e.g. "OK at 100", "Dies at 62", "Saturated"
}

export type RefusalType = 'WRONG_CLASS' | 'UNSUPPORTED_RUNTIME' | 'MISSING_SIGNALS' | 'LOW_CONFIDENCE';
export type WorkloadRuntime = 'go-http' | 'node-http' | 'python-http' | 'rust-tokio' | 'elixir-phoenix' | 'unsupported';

export interface LegalPatch {
  isLegal: boolean;
  header: string;
  minusLine: string;
  plusLines: string[];
  unifiedDiffText: string;
  modelMutation: string;
}

export interface CulpritInfo {
  symbol: string;
  failsAt: string;
  failsAtNum: number;
  why: string;
  fix: string;
  repro: string;
  loadRepro: string;
  confidence: string;
  confidenceScore: number;
  provenance?: string;
  file: string;
  line: number;
  improvedFailsAtNum?: number;
  improvedHeadroom?: string;
  improvedWhy?: string;
  isRefusal?: boolean;
  failureMode?: string;
  legalPatch?: LegalPatch;
}

export interface InfraNode {
  id: string;
  label: string;
  type: 'proxy' | 'service' | 'cache' | 'db' | 'function' | 'query';
  inferred: boolean;
  capacity: string;
}

export interface InfraEdge {
  from: string;
  to: string;
  weight: number;
  fanout: number;
}

export interface VirtualFile {
  path: string;
  content: string;
}

export interface ScannedFileInfo {
  path: string;
  size: number;
  category: 'schema' | 'route' | 'compose' | 'docker' | 'manifest' | 'code' | 'docs' | 'skill';
  snippet?: string;
}

export type WorkloadClass = 'web' | 'worker' | 'p2p-node' | 'kernel' | 'library' | 'stub' | 'agent-skill' | 'docs';

export interface GitStressReport {
  repo: string;
  owner: string;
  url: string;
  analyzedAt: string;
  workloadClass?: WorkloadClass;
  runtime?: WorkloadRuntime;
  isRefusal?: boolean;
  isNotFound?: boolean;
  notFoundReason?: string;
  refusalType?: RefusalType;
  refusalTitle?: string;
  refusalReason?: string;
  missingSignals?: string[];
  suggestedAction?: string;
  culprit: CulpritInfo;
  specs: {
    poolSize: number;
    workers: number;
    dbEngine: string;
    architectureStack?: string;
    nodeLabels?: [string, string, string, string];
  };
  sweep: SweepRow[];
  scannedFiles?: ScannedFileInfo[];
  fromLiveGitHub?: boolean;
  scannedFilesCount?: number;
  liveMeta?: {
    stars: number;
    forks: number;
    description: string;
    language: string;
    defaultBranch: string;
  };
  graphSource?: 'source' | 'compose' | 'stub';
  needsRequirementNotice?: string; // "Need compose or a schema to name a line"
  watch?: string[];
  openQuestions?: string[];
  infraGraph?: {
    nodes: InfraNode[];
    edges: InfraEdge[];
  };
  academicQueuing?: import('./academic_queuing').AcademicQueuingResult;
}

export interface QueryCostEstimate {
  scanType: 'Seq Scan' | 'Index Scan';
  cost: number;
  latencyMs: number;
  unindexed: boolean;
  explanation: string;
}

export interface ConcurrencyThreshold {
  failConcurrency: number;
  poolThroughputReqPerSec: number;
  baseLatencyMs: number;
  p99AtFailMs: number;
}
