import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  classifyRouteExposure,
  computeBlastRadiusScore,
  rankFindingsByExposureAndSeverity
} from '../src/core/route_exposure';
import { parseSourceCode } from '../src/core/parsers/code';
import { analyzeVirtualFiles } from '../src/core/analyzer';
import { renderTerminalCard } from '../src/core/culprit';

describe('Route Exposure Weighting Engine', () => {
  describe('classifyRouteExposure()', () => {
    it('classifies root and public browse routes as PUBLIC (100x traffic weight)', () => {
      const rootExp = classifyRouteExposure('/', 'src/pages/index.ts');
      assert.strictEqual(rootExp.tier, 'PUBLIC');
      assert.strictEqual(rootExp.weight, 100);
      assert.match(rootExp.label, /100×/);

      const searchExp = classifyRouteExposure('/search', 'src/controllers/SearchController.ts');
      assert.strictEqual(searchExp.tier, 'PUBLIC');
      assert.strictEqual(searchExp.weight, 100);

      const vanityExp = classifyRouteExposure('/@johndoe', 'src/pages/[handle].tsx');
      assert.strictEqual(vanityExp.tier, 'PUBLIC');
      assert.strictEqual(vanityExp.weight, 100);
    });

    it('classifies user dashboard routes as AUTHENTICATED (10x traffic weight)', () => {
      const dashExp = classifyRouteExposure('/dashboard', 'src/pages/dashboard.tsx');
      assert.strictEqual(dashExp.tier, 'AUTHENTICATED');
      assert.strictEqual(dashExp.weight, 10);
      assert.match(dashExp.label, /10×/);

      const settingsExp = classifyRouteExposure('/settings/billing', 'src/controllers/BillingController.ts');
      assert.strictEqual(settingsExp.tier, 'AUTHENTICATED');
      assert.strictEqual(settingsExp.weight, 10);
    });

    it('classifies routes with auth decorators or middleware as AUTHENTICATED', () => {
      const snippet = `@app.get("/items")\n@login_required\ndef get_items(current_user = Depends(get_current_user)):\n    pass`;
      const authExp = classifyRouteExposure('/items', 'api/items.py', snippet);
      assert.strictEqual(authExp.tier, 'AUTHENTICATED');
      assert.strictEqual(authExp.weight, 10);

      const sanctumSnippet = `Route::middleware(['auth:sanctum'])->get('/events', [EventController::class, 'index']);`;
      const sanctumExp = classifyRouteExposure('/events', 'routes/api.php', sanctumSnippet);
      assert.strictEqual(sanctumExp.tier, 'AUTHENTICATED');
      assert.strictEqual(sanctumExp.weight, 10);
    });

    it('classifies admin, internal, and cron routes as INTERNAL_ADMIN (1x traffic weight)', () => {
      const adminExp = classifyRouteExposure('/admin/users/export', 'src/admin/ExportController.ts');
      assert.strictEqual(adminExp.tier, 'INTERNAL_ADMIN');
      assert.strictEqual(adminExp.weight, 1);
      assert.match(adminExp.label, /1×/);

      const cronExp = classifyRouteExposure('/cron/cleanup', 'src/jobs/cleanup.ts');
      assert.strictEqual(cronExp.tier, 'INTERNAL_ADMIN');
      assert.strictEqual(cronExp.weight, 1);

      const adminCtx = `if (!auth()->user()->is_admin) abort(403);`;
      const gatedExp = classifyRouteExposure('/data/audit', 'controllers/AuditController.php', adminCtx);
      assert.strictEqual(gatedExp.tier, 'INTERNAL_ADMIN');
      assert.strictEqual(gatedExp.weight, 1);
    });
  });

  describe('computeBlastRadiusScore()', () => {
    it('computes blast radius based on exposure weight and saturation knee', () => {
      // 100 weight (PUBLIC) failing at 26 -> (100 / 26) * 10 = 38.5
      const publicBlast = computeBlastRadiusScore(100, 26);
      assert.strictEqual(publicBlast, 38.5);

      // 10 weight (AUTHENTICATED) failing at 26 -> (10 / 26) * 10 = 3.8
      const authBlast = computeBlastRadiusScore(10, 26);
      assert.strictEqual(authBlast, 3.8);

      // 1 weight (INTERNAL_ADMIN) failing at 26 -> (1 / 26) * 10 = 0.4
      const adminBlast = computeBlastRadiusScore(1, 26);
      assert.strictEqual(adminBlast, 0.4);

      // Edge case 0 concurrency
      assert.strictEqual(computeBlastRadiusScore(100, 0), 0);
    });
  });

  describe('rankFindingsByExposureAndSeverity()', () => {
    it('ranks public-facing routes above internal admin routes regardless of file order', () => {
      const adminFinding = {
        type: 'UNINDEXED_QUERY' as const,
        severity: 'CRITICAL' as const,
        symbol: 'AdminReport.query',
        route: '/admin/reports',
        exposure: {
          tier: 'INTERNAL_ADMIN' as const,
          weight: 1,
          label: 'INTERNAL / ADMIN',
          reason: 'Internal route'
        }
      };

      const publicFinding = {
        type: 'UNINDEXED_QUERY' as const,
        severity: 'HIGH' as const,
        symbol: 'PublicFeed.query',
        route: '/feed',
        exposure: {
          tier: 'PUBLIC' as const,
          weight: 100,
          label: 'PUBLIC EXPOSURE',
          reason: 'Public route'
        }
      };

      const authFinding = {
        type: 'UNINDEXED_QUERY' as const,
        severity: 'HIGH' as const,
        symbol: 'Dashboard.query',
        route: '/dashboard',
        exposure: {
          tier: 'AUTHENTICATED' as const,
          weight: 10,
          label: 'AUTHENTICATED',
          reason: 'Auth route'
        }
      };

      // Input admin first, then auth, then public
      const ranked = rankFindingsByExposureAndSeverity([adminFinding, authFinding, publicFinding]);

      assert.strictEqual(ranked[0].symbol, 'PublicFeed.query');
      assert.strictEqual(ranked[1].symbol, 'Dashboard.query');
      assert.strictEqual(ranked[2].symbol, 'AdminReport.query');
    });
  });

  describe('End-to-End Analysis with Route Exposure', () => {
    it('attaches route exposure and blast radius to GitStressReport culprit and evidence tiers', () => {
      const files = [
        {
          path: 'docker-compose.yml',
          content: `
services:
  app:
    environment:
      DB_POOL: 10
  db:
    image: postgres:15
`
        },
        {
          path: 'prisma/schema.prisma',
          content: `
model User {
  id Int @id @default(autoincrement())
}
model Post {
  id Int @id @default(autoincrement())
  authorId Int
  content String
}
`
        },
        {
          path: 'app/api/feed/route.ts',
          content: `
import prisma from '@/lib/prisma';
export async function GET(req: Request) {
  // Public feed unindexed lookup
  const posts = await prisma.post.findMany({
    where: { authorId: 42 }
  });
  return Response.json(posts);
}
`
        }
      ];

      const report = analyzeVirtualFiles(files, { name: 'feed-app', owner: 'test-org' });

      assert.ok(report.culprit);
      assert.ok(report.culprit.exposure);
      assert.strictEqual(report.culprit.exposure.tier, 'PUBLIC');
      assert.strictEqual(report.culprit.exposure.weight, 100);
      assert.ok(report.culprit.exposure.blastRadiusScore! > 0);

      // Verify Tier 1 Evidence metrics contain exposure
      assert.ok(report.culprit.evidenceTiers);
      assert.ok(report.culprit.evidenceTiers!.tier1.metrics?.routeExposure);
      assert.ok(report.culprit.evidenceTiers!.tier1.metrics?.blastRadius);

      // Verify terminal card output includes EXPOSURE badge
      const terminalCard = renderTerminalCard(report);
      assert.match(terminalCard, /EXPOSURE/);
      assert.match(terminalCard, /BLAST RADIUS/);
      assert.match(terminalCard, /PUBLIC EXPOSURE · 100× TRAFFIC WEIGHT/);
    });
  });
});
