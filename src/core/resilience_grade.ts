import type { GitStressReport } from './types';

export type ConcurrencyGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F' | 'REFUSED';

export interface ResilienceScore {
  grade: ConcurrencyGrade;
  score: number; // 0 to 100
  label: string;
  verdict: string;
  headroomMultiplier: string;
  badgeColor: {
    bg: string;
    border: string;
    text: string;
  };
}

/**
 * Calculates deterministic Concurrency Resilience Grade & Score
 * based on saturation ceiling and bottleneck severity.
 */
export function calculateResilienceScore(report: GitStressReport): ResilienceScore {
  const isRefusal = Boolean(
    report.isRefusal ||
    report.refusalReason ||
    report.refusalType ||
    report.culprit?.isRefusal ||
    report.workloadClass === 'kernel' ||
    report.workloadClass === 'p2p-node'
  );

  if (isRefusal) {
    return {
      grade: 'REFUSED',
      score: 0,
      label: 'OUT OF ARCHITECTURAL SCOPE',
      verdict: report.refusalType === 'WRONG_CLASS' 
        ? 'Operating system kernel / P2P node out of web scope' 
        : 'Unsupported runtime engine (scheduled for v0.12)',
      headroomMultiplier: 'N/A',
      badgeColor: {
        bg: '#fee2e2',
        border: '#fca5a5',
        text: '#991b1b',
      },
    };
  }

  const c = report.culprit;
  const ceiling = c.failsAtNum || (report.owner === 'tkngate' ? 85 : 62);
  const improved = c.improvedFailsAtNum || (report.owner === 'tkngate' ? 850 : 620);
  const headroomMultiplier = `+${(improved / ceiling).toFixed(1)}×`;

  if (ceiling >= 3000) {
    return {
      grade: 'A+',
      score: 96,
      label: 'HARDENED MESH ARCHITECTURE',
      verdict: 'Excellent saturation headroom. Handles high concurrent fanout without connection leaks.',
      headroomMultiplier,
      badgeColor: {
        bg: '#ecfdf5',
        border: '#a7f3d0',
        text: '#065f46',
      },
    };
  }

  if (ceiling >= 1500) {
    return {
      grade: 'A',
      score: 89,
      label: 'MULTI-WORKER RESILIENT',
      verdict: 'Strong production throughput. Connection limits scale cleanly across worker instances.',
      headroomMultiplier,
      badgeColor: {
        bg: '#f0fdf4',
        border: '#bbf7d0',
        text: '#15803d',
      },
    };
  }

  if (ceiling >= 600) {
    return {
      grade: 'B+',
      score: 79,
      label: 'CALIBRATED POOL RESILIENCE',
      verdict: 'Good concurrency baseline. Mitigations available to unlock 10× additional headroom.',
      headroomMultiplier,
      badgeColor: {
        bg: '#f0fdfa',
        border: '#99f6e4',
        text: '#0f766e',
      },
    };
  }

  if (ceiling >= 250) {
    return {
      grade: 'B',
      score: 71,
      label: 'MODERATE WEB CAPACITY',
      verdict: 'Stable under standard web traffic; queues begin saturating under sudden traffic spikes.',
      headroomMultiplier,
      badgeColor: {
        bg: '#eff6ff',
        border: '#bfdbfe',
        text: '#1e40af',
      },
    };
  }

  if (ceiling >= 100) {
    return {
      grade: 'C',
      score: 58,
      label: 'ELEVATED QUEUE DELAYS',
      verdict: 'Connection pool contention causes P99 tail latency inflation under concurrent load.',
      headroomMultiplier,
      badgeColor: {
        bg: '#fffbeb',
        border: '#fde68a',
        text: '#92400e',
      },
    };
  }

  if (ceiling >= 65) {
    return {
      grade: 'D',
      score: 44,
      label: 'TRANSPORT CHURN VULNERABILITY',
      verdict: 'Default HTTP transport limits (MaxIdleConnsPerHost) cause rapid socket starvation.',
      headroomMultiplier,
      badgeColor: {
        bg: '#fef2ee',
        border: '#fecabb',
        text: '#c2410c',
      },
    };
  }

  return {
    grade: 'F',
    score: 28,
    label: 'CRITICAL POOL STARVATION',
    verdict: 'Collapses under low concurrent demand due to single unpooled or synchronous bottleneck.',
    headroomMultiplier,
    badgeColor: {
      bg: '#fee2e2',
      border: '#fca5a5',
      text: '#991b1b',
    },
  };
}
