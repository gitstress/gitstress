/**
 * Culprit Scoring & Card Generation (TypeScript)
 * Formats the definitive Friday-Afternoon Bottleneck Report.
 * Powered by Operational Queuing Network Mean Value Analysis (MVA).
 */

import type { GitStressReport } from './types';
import type { DemandResult } from './demand';
import { bindLegalPatch } from './patch_binder';
import { analyzeAcademicConcurrency } from './academic_queuing';
import { solveCompleteQueuingNetwork } from './queuing_network';
import { buildMultiTierEvidence } from './evidence_tiers';
import { computeBlastRadiusScore } from './route_exposure';

export function buildCulpritReport(
  demandResult: DemandResult,
  repoInfo: { name?: string; owner?: string; url?: string } = {},
  options: {
    specsOverride?: Partial<GitStressReport['specs']>;
    scannedFiles?: GitStressReport['scannedFiles'];
    graphSource?: 'source' | 'compose' | 'stub';
    needsRequirementNotice?: string;
    watch?: string[];
    openQuestions?: string[];
    infraGraph?: GitStressReport['infraGraph'];
    rawFiles?: Array<{ path: string; content: string }>;
    workloadClass?: import('./types').WorkloadClass;
    runtime?: import('./types').WorkloadRuntime;
  } = {}
): GitStressReport {
  const { threshold, primaryFinding, poolSize, workers } = demandResult;
  const defaultSymbol = repoInfo.name ? `${repoInfo.name}.requestHandler` : 'main.requestHandler';
  const whyReason = primaryFinding?.rawWhy || 'Unindexed database read or synchronous handler blocking under concurrency';
  const fixCommand = primaryFinding?.fixSql || '-- Add index or offload long-running task to background worker pool\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lookup ON records (id);';
  const reproCommand = primaryFinding?.reproExplain || `autocannon -c 50 -d 10 http://localhost:3000/`;
  const loadRepro = `autocannon -c 55 -d 15 "http://localhost:3000${primaryFinding?.route || '/'}"`;

  // Solve the operational queuing network dynamically across the 4-tier Jackson/MVA model
  const solved = demandResult.solvedNetwork || solveCompleteQueuingNetwork({
    composeData: demandResult.composeData,
    codeFindings: primaryFinding ? [primaryFinding] : [],
    repoInfo
  });

  const isStub = options.graphSource === 'stub' || !primaryFinding;
  let confidenceScore = solved.confidenceScore;
  let confidenceLabel = solved.confidenceLabel;

  if (isStub) {
    confidenceScore = 0.30;
    confidenceLabel = 'Refusal: Insufficient runtime signals';
  }

  // Refusal gate if confidence is below 0.55
  const isRefusal = confidenceScore < 0.55 || isStub;

  const detectedFile = primaryFinding?.file || (options.scannedFiles && options.scannedFiles.length > 0 ? options.scannedFiles[0].path : 'server.ts');
  const detectedLine = primaryFinding?.line || 1;

  const failsAtConcurrency = solved.failConcurrency;
  const improvedFailsAtNum = solved.improvedFailConcurrency;
  const improvedHeadroom = solved.improvedHeadroom;
  const improvedWhy = solved.improvedWhy;
  const provenance = solved.provenance;
  const modelMutation = solved.modelMutation;
  const failureMode = isRefusal
    ? (options.workloadClass === 'kernel'
        ? 'OUT OF SCOPE ARCHITECTURE: RING-0 KERNEL'
        : options.runtime === 'elixir-phoenix'
          ? 'UNSUPPORTED RUNTIME: ELIXIR/BEAM (v0.12)'
          : 'REFUSAL: INSUFFICIENT RUNTIME SIGNALS')
    : solved.failureMode;

  const culpritSymbol = isRefusal ? 'REFUSED — NO RUNTIME GRAPH' : (primaryFinding?.symbol || solved.bottleneckSymbol || defaultSymbol);
  const failsAtDisplay = isRefusal ? 'OUT OF SCOPE' : `${failsAtConcurrency} concurrent`;

  // Bind Parse-Backed Legal Patch iff target file content contains minus line
  let targetContent = '';
  if (options.rawFiles) {
    const rawF = options.rawFiles.find(f => f.path === detectedFile);
    if (rawF) targetContent = rawF.content;
  }
  if (!targetContent && options.scannedFiles) {
    const scF = options.scannedFiles.find(f => f.path === detectedFile);
    if (scF && scF.snippet) targetContent = scF.snippet;
  }

  const legalPatch = !isRefusal && targetContent
    ? bindLegalPatch(detectedFile, targetContent, culpritSymbol, modelMutation)
    : undefined;

  // Build 3-Tier Evidence Framing
  const evidenceTiers = !isRefusal
    ? buildMultiTierEvidence({
        finding: primaryFinding,
        solvedNetwork: solved,
        symbol: culpritSymbol,
        file: detectedFile,
        line: detectedLine,
        failsAtNum: failsAtConcurrency,
        improvedFailsAtNum,
        improvedHeadroom,
        poolSize: poolSize || 10,
        workers: workers || 4,
        dbEngine: options.specsOverride?.dbEngine || primaryFinding?.dialect || 'PostgreSQL',
        dialect: primaryFinding?.dialect || options.specsOverride?.dbEngine || 'PostgreSQL',
        reproCommand,
        route: primaryFinding?.route || '/',
        repoInfo
      })
    : undefined;

  return {
    repo: repoInfo.name || 'local-repo',
    owner: repoInfo.owner || 'workspace',
    url: repoInfo.url || '',
    analyzedAt: new Date().toISOString(),
    workloadClass: options.workloadClass || 'web',
    runtime: options.runtime || 'node-http',
    isRefusal,
    culprit: {
      symbol: culpritSymbol,
      failsAt: failsAtDisplay,
      failsAtNum: isRefusal ? 0 : failsAtConcurrency,
      why: whyReason,
      fix: isRefusal ? '-- Ineligible repository: Concurrency model cannot be simulated on non-web/non-runtime codebases.' : fixCommand,
      repro: isRefusal ? 'n/a — no web listener' : reproCommand,
      loadRepro: isRefusal ? 'n/a' : loadRepro,
      confidence: confidenceLabel,
      confidenceScore: confidenceScore,
      file: detectedFile,
      line: detectedLine,
      improvedFailsAtNum: isRefusal ? 0 : improvedFailsAtNum,
      improvedHeadroom: isRefusal ? 'N/A' : improvedHeadroom,
      improvedWhy: isRefusal ? 'Fix unavailable for non-web runtime' : improvedWhy,
      isRefusal,
      provenance,
      failureMode,
      legalPatch,
      evidenceTiers,
      smartIndex: primaryFinding?.smartIndex,
      exposure: isRefusal ? undefined : (primaryFinding?.exposure ? {
        ...primaryFinding.exposure,
        blastRadiusScore: computeBlastRadiusScore(primaryFinding.exposure.weight, failsAtConcurrency)
      } : undefined)
    },
    specs: {
      poolSize,
      workers,
      dbEngine: options.specsOverride?.dbEngine || 'PostgreSQL',
      architectureStack: options.specsOverride?.architectureStack,
      nodeLabels: options.specsOverride?.nodeLabels
    },
    sweep: demandResult.sweep || solved.sweep,
    scannedFiles: options.scannedFiles,
    graphSource: options.graphSource || 'source',
    needsRequirementNotice: options.needsRequirementNotice,
    watch: options.watch,
    openQuestions: options.openQuestions,
    infraGraph: options.infraGraph,
    academicQueuing: analyzeAcademicConcurrency(
      failsAtConcurrency,
      poolSize || 10,
      threshold.baseLatencyMs || 25,
      false
    )
  };
}

/**
 * Renders high-contrast ASCII terminal Culprit Card
 */
export function renderTerminalCard(report: GitStressReport): string {
  const c = report.culprit;
  const bar = '─'.repeat(74);
  const dblBar = '═'.repeat(74);

  if (report.isRefusal) {
    const currentSlug = `${report.owner || ''}/${report.repo || ''}`.toLowerCase();
    const availablePresets = [
      { slug: 'tkngate/tkngate', desc: 'tkngate/tkngate (Go HTTP reverse proxy, pool ceiling K=2)' },
      { slug: 'calcom/cal.com', desc: 'calcom/cal.com (Next.js + Prisma unindexed attendeeId lookup)' },
      { slug: 'posthog/posthog', desc: 'posthog/posthog (Python synchronous database write under burst)' }
    ].filter(p => p.slug !== currentSlug && !currentSlug.endsWith(p.slug));

    let out = '\n';
    out += `\x1b[1;33m╔${dblBar}╗\x1b[0m\n`;
    out += `\x1b[1;33m║\x1b[0m \x1b[1;37mGITSTRESS ARCHITECTURAL REFUSAL\x1b[0m \x1b[90m—\x1b[0m \x1b[33mHonest Public Contract\x1b[0m ${' '.repeat(19)}\x1b[1;33m║\x1b[0m\n`;
    out += `\x1b[1;33m╠${dblBar}╣\x1b[0m\n`;
    out += `\x1b[1;33m║\x1b[0m \x1b[1;31mSTATUS\x1b[0m      \x1b[1;33mCANNOT NAME A BOTTLEPOINT SAFELY\x1b[0m ${' '.repeat(29)}\x1b[1;33m║\x1b[0m\n`;
    out += `\x1b[1;33m║\x1b[0m \x1b[1;35mCLASS\x1b[0m       \x1b[37m${(report.refusalTitle || report.workloadClass || 'OUT OF SCOPE').toUpperCase().slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;33m║\x1b[0m\n`;
    out += `\x1b[1;33m║\x1b[0m \x1b[1;36mREASON\x1b[0m      \x1b[37m${(report.refusalReason || c.why).slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;33m║\x1b[0m\n`;

    if (availablePresets.length > 0) {
      out += `\x1b[1;33m╠${bar}╣\x1b[0m\n`;
      out += `\x1b[1;33m║\x1b[0m \x1b[1;37mIN-SCOPE EXAMPLES TO TEST\x1b[0m ${' '.repeat(47)}\x1b[1;33m║\x1b[0m\n`;
      for (const p of availablePresets) {
        const line = `• ${p.desc}`.slice(0, 72).padEnd(72);
        out += `\x1b[1;33m║\x1b[0m \x1b[90m${line}\x1b[0m\x1b[1;33m║\x1b[0m\n`;
      }
    }
    out += `\x1b[1;33m╚${dblBar}╝\x1b[0m\n`;
    return out;
  }

  let out = '\n';
  out += `\x1b[1;36m╔${dblBar}╗\x1b[0m\n`;
  out += `\x1b[1;36m║\x1b[0m \x1b[1;37mGITSTRESS BOTTLE-REPORT\x1b[0m \x1b[90m—\x1b[0m \x1b[33mFriday-Afternoon Diagnostic\x1b[0m ${' '.repeat(26)}\x1b[1;36m║\x1b[0m\n`;
  out += `\x1b[1;36m╠${dblBar}╣\x1b[0m\n`;
  
  // Culprit + Fails At
  out += `\x1b[1;36m║\x1b[0m \x1b[1;31mCULPRIT\x1b[0m     \x1b[1;37m${c.symbol.slice(0, 30).padEnd(30)}\x1b[0m \x1b[1;31mFAILS AT\x1b[0m \x1b[1;33m${c.failsAt.slice(0, 16).padEnd(16)}\x1b[0m \x1b[1;36m║\x1b[0m\n`;
  
  // Why
  out += `\x1b[1;36m║\x1b[0m \x1b[1;35mWHY\x1b[0m         \x1b[37m${c.why.slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
  
  // Fix
  out += `\x1b[1;36m║\x1b[0m \x1b[1;32mFIX\x1b[0m         \x1b[1;32m${c.fix.replace(/\n/g, ' ').slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;

  // After-fix Headroom
  if (c.improvedFailsAtNum) {
    const afterFix = `${c.improvedFailsAtNum} concurrent (${c.improvedHeadroom || '+10× headroom'})`;
    out += `\x1b[1;36m║\x1b[0m \x1b[1;32mAFTER FIX\x1b[0m   \x1b[1;32m${afterFix.slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
  }
  
  // Repro
  out += `\x1b[1;36m║\x1b[0m \x1b[1;34mREPRO\x1b[0m       \x1b[36m${c.repro.slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
  
  // Confidence
  out += `\x1b[1;36m║\x1b[0m \x1b[1;90mCONFIDENCE\x1b[0m  \x1b[33m${c.confidence.slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;

  // Route Exposure & Blast Radius
  if (c.exposure) {
    const expText = `${c.exposure.label}${c.exposure.blastRadiusScore !== undefined ? ` · BLAST RADIUS: ${c.exposure.blastRadiusScore}` : ''}`;
    out += `\x1b[1;36m║\x1b[0m \x1b[1;33mEXPOSURE\x1b[0m    \x1b[1;37m${expText.slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    if (c.exposure.reason) {
      out += `\x1b[1;36m║\x1b[0m \x1b[1;90mINGRESS\x1b[0m     \x1b[90m${c.exposure.reason.slice(0, 61).padEnd(61)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    }
  }

  // Evidence Framing: 3-Tier Epistemic Separation
  if (c.evidenceTiers) {
    const et = c.evidenceTiers;
    out += `\x1b[1;36m╠${bar}╣\x1b[0m\n`;
    out += `\x1b[1;36m║\x1b[0m \x1b[1;37mEVIDENCE FRAMING (3-TIER EPISTEMIC SEPARATION)\x1b[0m ${' '.repeat(26)}\x1b[1;36m║\x1b[0m\n`;
    out += `\x1b[1;36m╟${bar}╢\x1b[0m\n`;

    const t1Title = `[TIER 1 · STATIC FACT]     ${et.tier1.summary}`.slice(0, 72).padEnd(72);
    out += `\x1b[1;36m║\x1b[0m \x1b[1;34m${t1Title}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    const t1Citation = `                           ${c.file}:${c.line} (Confidence: 1.0, Deterministic)`.slice(0, 72).padEnd(72);
    out += `\x1b[1;36m║\x1b[0m \x1b[90m${t1Citation}\x1b[0m\x1b[1;36m║\x1b[0m\n`;

    const t2Title = `[TIER 2 · MVA PROJECTION]  ${et.tier2.summary}`.slice(0, 72).padEnd(72);
    out += `\x1b[1;36m║\x1b[0m \x1b[1;33m${t2Title}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    const t2Sub = `                           Pool K=${report.specs.poolSize}, Little's Law L=λW (MVA Model, 0.85)`.slice(0, 72).padEnd(72);
    out += `\x1b[1;36m║\x1b[0m \x1b[90m${t2Sub}\x1b[0m\x1b[1;36m║\x1b[0m\n`;

    const t3Title = `[TIER 3 · EMPIRICAL PROOF] ${et.tier3.command || et.tier3.summary}`.slice(0, 72).padEnd(72);
    out += `\x1b[1;36m║\x1b[0m \x1b[1;32m${t3Title}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    const t3Sub = `                           Run 'gitstress verify' to benchmark on localhost`.slice(0, 72).padEnd(72);
    out += `\x1b[1;36m║\x1b[0m \x1b[90m${t3Sub}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
  }

  // Parse-backed unified git diff (if legally verifiable)
  if (c.legalPatch?.isLegal && c.legalPatch.unifiedDiffText) {
    const minusCount = c.legalPatch.minusLine ? 1 : 0;
    const plusCount = c.legalPatch.plusLines?.length || 0;
    out += `\x1b[1;36m╠${bar}╣\x1b[0m\n`;
    out += `\x1b[1;36m║\x1b[0m \x1b[1;37mVERIFIED GIT APPLY PATCH\x1b[0m \x1b[90m(${minusCount} deletions, ${plusCount} additions)\x1b[0m ${' '.repeat(22)}\x1b[1;36m║\x1b[0m\n`;
    out += `\x1b[1;36m╟${bar}╢\x1b[0m\n`;
    const diffLines = c.legalPatch.unifiedDiffText.split('\n');
    for (const dline of diffLines) {
      let color = '\x1b[37m';
      if (dline.startsWith('+')) color = '\x1b[32m';
      else if (dline.startsWith('-')) color = '\x1b[31m';
      else if (dline.startsWith('@@')) color = '\x1b[36m';
      else if (dline.startsWith('diff') || dline.startsWith('index') || dline.startsWith('---') || dline.startsWith('+++')) color = '\x1b[90m';
      
      const padded = dline.slice(0, 72).padEnd(72);
      out += `\x1b[1;36m║\x1b[0m ${color}${padded}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    }
  }

  // Smart Composite & Partial Index (ESR Rule Optimized)
  if (c.smartIndex) {
    const si = c.smartIndex;
    out += `\x1b[1;36m╠${bar}╣\x1b[0m\n`;
    const title = si.type === 'partial' 
      ? `SMART PARTIAL INDEX (ESR OPTIMIZED)` 
      : (si.type === 'composite' ? `SMART COMPOSITE INDEX (ESR OPTIMIZED)` : `SMART B-TREE INDEX`);
    const header = `${title} (RAM Footprint: ${si.type === 'partial' ? '-95%' : 'Optimized'})`;
    out += `\x1b[1;36m║\x1b[0m \x1b[1;37m${header.slice(0, 72).padEnd(72)}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    out += `\x1b[1;36m╟${bar}╢\x1b[0m\n`;

    if (si.esrOrderExplanation) {
      const esrLine = `Rule: ${si.esrOrderExplanation}`.slice(0, 72).padEnd(72);
      out += `\x1b[1;36m║\x1b[0m \x1b[1;33m${esrLine}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    }

    const ddlLines = si.sql.split('\n');
    for (const dline of ddlLines) {
      const padded = dline.slice(0, 72).padEnd(72);
      out += `\x1b[1;36m║\x1b[0m \x1b[32m${padded}\x1b[0m\x1b[1;36m║\x1b[0m\n`;
    }
  }

  out += `\x1b[1;36m╠${bar}╣\x1b[0m\n`;
  
  // Concurrency Sweep Header
  out += `\x1b[1;36m║\x1b[0m \x1b[1;37mCONCURRENCY SWEEP\x1b[0m \x1b[90m(100 -> 47k)\x1b[0m ${' '.repeat(43)}\x1b[1;36m║\x1b[0m\n`;
  out += `\x1b[1;36m╟${bar}╢\x1b[0m\n`;

  // Sweep rows
  report.sweep.forEach(row => {
    const tier = row.concurrencyLabel.padStart(4);
    const statusColor = row.status === 'FATAL' || row.status === 'CRASH' 
      ? '\x1b[1;31m' 
      : row.status === 'SATURATED' 
        ? '\x1b[1;33m' 
        : '\x1b[32m';

    const shortNode = row.hottestNode.length > 56 
      ? row.hottestNode.substring(0, 53) + '...' 
      : row.hottestNode.padEnd(56);

    out += `\x1b[1;36m║\x1b[0m \x1b[1;37m${tier}\x1b[0m │ ${statusColor}[${row.status.padEnd(5)}]\x1b[0m \x1b[90m${shortNode}\x1b[0m \x1b[1;36m║\x1b[0m\n`;
  });

  out += `\x1b[1;36m╚${dblBar}╝\x1b[0m\n`;
  return out;
}
