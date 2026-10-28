/**
 * Route Exposure Weighting Engine
 *
 * Classifies HTTP endpoint ingress exposure into distinct operational risk tiers:
 * - PUBLIC (100x traffic weight): Unauthenticated top-level routes exposed to anonymous surges & bots.
 * - AUTHENTICATED (10x traffic weight): Session-gated user dashboards and APIs.
 * - INTERNAL_ADMIN (1x traffic weight): Admin backoffice and batch processing routes.
 */

import type { RouteExposureInfo, RouteExposureTier } from './types';

/**
 * Classifies an endpoint route and source file into an operational exposure tier.
 */
export function classifyRouteExposure(
  route: string,
  file: string = '',
  contextSnippet: string = ''
): RouteExposureInfo {
  const normRoute = (route || '/').toLowerCase().trim();
  const normFile = (file || '').toLowerCase().trim();
  const normContext = (contextSnippet || '').toLowerCase();

  // 1. Internal / Admin Routes (1x Traffic Weight)
  const isAdminPath = 
    /^\/(?:admin|superadmin|internal|system|jobs|cron|batch|export|debug|metrics|healthcheck|backoffice|dev|migrate)\b/i.test(normRoute) ||
    /\b(?:admin|superadmin|internal|backoffice)\b/i.test(normRoute);

  const isAdminFile = 
    /\b(?:admin|internal|console|commands?|cron|jobs?|exports?)\b/i.test(normFile) ||
    /AdminController|InternalController|ExportController/i.test(file);

  const isAdminContext =
    /\b(?:is_admin|is_superuser|role:admin|has_role\(['"]admin['"]\)|can:manage|Gate::allows\(['"]admin['"]\)|middleware\(['"]admin['"]\))\b/i.test(normContext);

  if (isAdminPath || isAdminFile || isAdminContext) {
    return {
      tier: 'INTERNAL_ADMIN',
      weight: 1,
      label: 'INTERNAL / ADMIN · 1× TRAFFIC WEIGHT',
      reason: 'Restricted to administrative personnel or scheduled batch workers with low concurrent ingress'
    };
  }

  // 2. Authenticated Dashboard Routes (10x Traffic Weight)
  const isAuthPath = 
    /^\/(?:dashboard|creator|settings|account|profile|billing|workspaces?|calendar|bookings?|team|preferences|me|my-)\b/i.test(normRoute) ||
    /\b(?:dashboard|creator|settings|account|profile)\b/i.test(normRoute);

  const isAuthContext = 
    /\b(?:auth:sanctum|auth:api|middleware\(['"]auth|ensureauth|isauthenticated|@login_required|depends\(get_current_user\)|requireauth|protectroute)\b/i.test(normContext) ||
    /\b(?:current_user|req\.user|session\.user|\$request->user\(\))\b/i.test(normContext);

  if (isAuthPath || isAuthContext) {
    return {
      tier: 'AUTHENTICATED',
      weight: 10,
      label: 'AUTHENTICATED · 10× TRAFFIC WEIGHT',
      reason: 'Gated behind active user session; concurrent load is strictly bounded by logged-in users'
    };
  }

  // 3. Public / Unauthenticated Browse Routes (100x Traffic Weight - Default for web endpoints)
  let publicReason = 'Unauthenticated public route exposed to internet surges, anonymous traffic, and web crawlers';
  if (normRoute === '/' || normRoute === '/home' || normRoute === '') {
    publicReason = 'Landing page & root traffic gateway exposed to 100% of unauthenticated visitor traffic';
  } else if (/discover|explore|search|feed|catalog|products?|posts?|items?|channels?/.test(normRoute)) {
    publicReason = 'Public discovery/browse route subjected to high-frequency anonymous reads and search spikes';
  } else if (normRoute.includes('@') || /users?\/[^\/]+$/.test(normRoute)) {
    publicReason = 'Public vanity handle or profile permalink vulnerable to unauthenticated traffic spikes';
  }

  return {
    tier: 'PUBLIC',
    weight: 100,
    label: 'PUBLIC EXPOSURE · 100× TRAFFIC WEIGHT',
    reason: publicReason
  };
}

/**
 * Computes the blast radius score:
 * Normalizes exposure weight against the physical saturation knee (failsAtConcurrency).
 */
export function computeBlastRadiusScore(weight: number, failsAtConcurrency: number): number {
  if (failsAtConcurrency <= 0) return 0;
  return Math.round((weight / Math.max(1, failsAtConcurrency)) * 100) / 10;
}

/**
 * Ranks code findings by exposure weight (PUBLIC 100 > AUTH 10 > INTERNAL 1),
 * defect type severity, and criticality.
 */
export function rankFindingsByExposureAndSeverity<T extends { exposure?: RouteExposureInfo; type?: string; severity?: string }>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    const weightA = a.exposure?.weight ?? 10;
    const weightB = b.exposure?.weight ?? 10;

    // 1. Primary sort: Route Exposure Weight
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 2. Secondary sort: Defect Category Rank
    const typeRank = (t?: string) => {
      if (t === 'UNINDEXED_QUERY') return 4;
      if (t === 'N_PLUS_ONE_LOOP') return 3;
      if (t === 'CPU_CRYPTOGRAPHIC_BOTTLENECK') return 2;
      return 1;
    };
    const tA = typeRank(a.type);
    const tB = typeRank(b.type);
    if (tA !== tB) {
      return tB - tA;
    }

    // 3. Tertiary sort: Severity (CRITICAL > HIGH > MEDIUM)
    const sevRank = (s?: string) => (s === 'CRITICAL' ? 3 : s === 'HIGH' ? 2 : 1);
    return sevRank(b.severity) - sevRank(a.severity);
  });
}
