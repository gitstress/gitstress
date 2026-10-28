import { buildMultiTierEvidence } from '../src/core/evidence_tiers';
import { solveCompleteQueuingNetwork } from '../src/core/queuing_network';
import { analyzeVirtualFiles } from '../src/core/analyzer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

console.log('=== Running Multi-Tier Evidence Framing Tests ===\n');

// Test 1: Generate 3 tiers with correct epistemic badges and certainty
{
  const mockFinding = {
    type: 'UNINDEXED_QUERY' as const,
    severity: 'CRITICAL' as const,
    symbol: 'Claim.where',
    file: 'app/Http/Controllers/ChannelController.php',
    line: 55,
    querySnippet: 'Claim::where("user_id", $u)->get()',
    fixSql: 'CREATE INDEX CONCURRENTLY ON claims (user_id);',
    reproExplain: 'autocannon -c 26 -d 10 http://localhost:3000/creator/channels',
    scanType: 'Seq Scan',
    cost: 450,
    rawWhy: 'Unindexed foreign key lookup on PostgreSQL',
    route: '/creator/channels',
    table: 'claims',
    column: 'user_id',
    dialect: 'postgresql' as const
  };

  const solved = solveCompleteQueuingNetwork({
    codeFindings: [mockFinding],
    repoInfo: { name: 'buildr', owner: 'mikaelendale' }
  });

  const evidence = buildMultiTierEvidence({
    finding: mockFinding,
    solvedNetwork: solved,
    symbol: 'Claim.where',
    file: 'app/Http/Controllers/ChannelController.php',
    line: 55,
    failsAtNum: 26,
    improvedFailsAtNum: 320,
    improvedHeadroom: '+12.3×',
    poolSize: 20,
    workers: 4,
    dbEngine: 'PostgreSQL',
    dialect: 'postgresql',
    reproCommand: 'autocannon -c 26 -d 10 "http://localhost:3000/creator/channels"',
    route: '/creator/channels',
    repoInfo: { name: 'buildr', owner: 'mikaelendale' }
  });

  // Verify Tier 1: Deterministic AST & Migration Schema Proof
  assert(evidence.tier1.tier === 1, 'Tier 1 has tier index 1');
  assert(evidence.tier1.badge === 'TIER 1 · VERIFIED STATIC DEFECT', 'Tier 1 has verified static defect badge');
  assert(evidence.tier1.confidenceScore === 1.0, 'Tier 1 confidence is 1.0 (100% deterministic)');
  assert(evidence.tier1.veracity === 'deterministic-ast-schema', 'Tier 1 veracity is deterministic-ast-schema');
  assert(evidence.tier1.summary.includes('claims.user_id'), 'Tier 1 summary cites table.column');
  assert(evidence.tier1.details.includes('ChannelController.php:55'), 'Tier 1 details cite exact file:line');

  // Verify Tier 2: Mathematical Queuing Network Projection (MVA)
  assert(evidence.tier2.tier === 2, 'Tier 2 has tier index 2');
  assert(evidence.tier2.badge === 'TIER 2 · MVA QUEUING PROJECTION', 'Tier 2 has MVA queuing projection badge');
  assert(evidence.tier2.confidenceScore === 0.85, 'Tier 2 confidence is 0.85 (calibrated queuing model)');
  assert(evidence.tier2.veracity === 'mathematical-queuing-model', 'Tier 2 veracity is mathematical-queuing-model');
  assert(evidence.tier2.summary.includes('N=26'), 'Tier 2 summary includes saturation knee N=26');
  assert(evidence.tier2.details.includes("Little's Law"), "Tier 2 details cite Little's Law");

  // Verify Tier 3: Turnkey Physical Load-Testing Bridge
  assert(evidence.tier3.tier === 3, 'Tier 3 has tier index 3');
  assert(evidence.tier3.badge === 'TIER 3 · EMPIRICAL REPRO COMMAND', 'Tier 3 has empirical repro command badge');
  assert(evidence.tier3.confidenceScore === 1.0, 'Tier 3 confidence is 1.0 upon physical execution');
  assert(evidence.tier3.veracity === 'empirical-hardware-test', 'Tier 3 veracity is empirical-hardware-test');
  assert(Boolean(evidence.tier3.command && evidence.tier3.command.includes('autocannon -c 26')), 'Tier 3 command specifies concurrency 26');

  // Verify Synthesis
  assert(evidence.synthesis.includes('Tier 1 proves') && evidence.synthesis.includes('Tier 2 mathematically') && evidence.synthesis.includes('Tier 3 gives you'), 'Synthesis harmonizes all 3 tiers');
}

// Test 2: Full End-to-End Analysis pipeline attaches evidenceTiers to culprit
{
  const files = [
    {
      path: 'database/migrations/2026_10_26_000001_enable_postgres_extensions.php',
      content: 'DB::statement("CREATE EXTENSION IF NOT EXISTS citext;");'
    },
    {
      path: 'database/migrations/2026_10_26_000005_create_claims_table.php',
      content: `Schema::create('claims', function (Blueprint $table) {
        $table->id();
        $table->foreignId('user_id')->constrained()->cascadeOnDelete();
      });`
    },
    {
      path: 'app/Http/Controllers/ChannelController.php',
      content: `class ChannelController extends Controller {
        public function getClaims($u) {
          return Claim::where('user_id', $u)->get();
        }
      }`
    }
  ];

  const report = analyzeVirtualFiles(files, { name: 'buildr', owner: 'mikaelendale' });
  assert(!report.isRefusal, 'Report is not refused for valid Laravel codebase');
  assert(Boolean(report.culprit.evidenceTiers), 'Culprit report includes evidenceTiers');
  assert(report.culprit.evidenceTiers!.tier1.badge === 'TIER 1 · VERIFIED STATIC DEFECT', 'Tier 1 badge attached in full report');
  assert(report.culprit.evidenceTiers!.tier2.badge === 'TIER 2 · MVA QUEUING PROJECTION', 'Tier 2 badge attached in full report');
  assert(report.culprit.evidenceTiers!.tier3.badge === 'TIER 3 · EMPIRICAL REPRO COMMAND', 'Tier 3 badge attached in full report');
}

console.log('\nAll 11 Multi-Tier Evidence Framing assertions passed!\n');
