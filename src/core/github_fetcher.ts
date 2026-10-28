/**
 * Real GitHub Repository Fetcher & Scraper
 * Dynamically retrieves repository file trees, schemas, manifests, and route handlers.
 */

export interface GitHubRepoMeta {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  description: string;
  language: string;
  url: string;
}

export interface FetchedFile {
  path: string;
  content: string;
}

export interface LiveRepoData {
  meta: GitHubRepoMeta;
  files: FetchedFile[];
  totalFileCount: number;
  fromLiveGitHub: boolean;
  repoExists?: boolean;
  authError?: {
    status: number;
    message: string;
    isPrivate: boolean;
  };
}

// In-memory cache to prevent hitting rate limits and provide instant responses
const REPO_CACHE = new Map<string, { data: LiveRepoData; cachedAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

const GITHUB_SLUG_REGEX = /^[a-zA-Z0-9_\-\.]+$/;

export function isValidSlug(slug: string): boolean {
  return Boolean(slug && GITHUB_SLUG_REGEX.test(slug) && !slug.includes('..') && slug.length <= 100);
}

export function sanitizeGitHubToken(token?: string): string | undefined {
  if (!token) return undefined;
  let clean = token.replace(/[\r\n\t\0]/g, '').trim();
  // Strip optional 'Bearer ' or 'token ' prefix if user pasted header value
  clean = clean.replace(/^(bearer|token)\s+/i, '').trim();
  // Strip surrounding quotes
  clean = clean.replace(/^["']|["']$/g, '').trim();
  // Validate token characters (alphanumeric, underscores, hyphens, dots) and valid length
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(clean) || clean.length < 10 || clean.length > 255) {
    return undefined;
  }
  return clean;
}

let activeTokenIndex = 0;

/**
 * Returns an active GitHub token.
 * Rotates round-robin across comma-separated GITHUB_PATS / GITHUB_TOKENS if provided,
 * falling back to single GITHUB_TOKEN or custom user token.
 */
export function getActiveGitHubToken(customToken?: string): string | undefined {
  if (customToken) {
    const clean = sanitizeGitHubToken(customToken);
    if (clean) return clean;
  }

  const rawPool = process.env.GITHUB_PATS || process.env.GITHUB_TOKENS || '';
  const pool = rawPool
    .split(',')
    .map(t => sanitizeGitHubToken(t))
    .filter((t): t is string => Boolean(t));

  if (pool.length > 0) {
    const selected = pool[activeTokenIndex % pool.length];
    activeTokenIndex = (activeTokenIndex + 1) % pool.length;
    return selected;
  }

  return sanitizeGitHubToken(process.env.GITHUB_TOKEN);
}

function parseAbbreviatedNumber(str: string): number {
  const clean = str.replace(/,/g, '').trim().toLowerCase();
  if (clean.endsWith('k')) {
    return Math.round(parseFloat(clean) * 1000);
  }
  if (clean.endsWith('m')) {
    return Math.round(parseFloat(clean) * 1000000);
  }
  const n = parseInt(clean, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Fetch a repository's metadata and architecture files from public or private GitHub.
 */
export async function fetchLiveGitHubRepo(
  owner: string, 
  repo: string, 
  customToken?: string
): Promise<LiveRepoData | null> {
  if (!isValidSlug(owner) || !isValidSlug(repo)) {
    return null;
  }

  const token = getActiveGitHubToken(customToken);
  const tokenHash = token ? token.slice(-6) : 'anon';
  const cacheKey = `${owner.toLowerCase()}/${repo.toLowerCase()}#${tokenHash}`;

  const cached = REPO_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const headers: Record<string, string> = {
    'User-Agent': 'GitStress-Diagnostic/1.0 (https://gitstress.com)',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    let repoRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });

    // Fallback: If Bearer returned 404/401 and token is present, try with classic "token" scheme
    if (!repoRes.ok && repoRes.status !== 304 && token) {
      const altHeaders = { ...headers, 'Authorization': `token ${token}` };
      const altRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        headers: altHeaders,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      }).catch(() => null);
      if (altRes && altRes.ok) {
        repoRes = altRes;
        headers['Authorization'] = `token ${token}`;
      }
    }

    // Smart recovery: If repository returned 404 with a token, query user/repos to inspect granted scopes and case differences
    let resolvedRepoJson: any = null;
    let customDiagnosticReason: string | undefined = undefined;

    if (!repoRes.ok && repoRes.status !== 304) {
      if (token) {
        try {
          const userReposRes = await fetch('https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member', {
            headers,
            cache: 'no-store',
            signal: AbortSignal.timeout(10000)
          });

          if (userReposRes.ok) {
            const userRepos = await userReposRes.json();
            if (Array.isArray(userRepos) && userRepos.length > 0) {
              const matched = userRepos.find((r: any) => 
                r.full_name?.toLowerCase() === `${owner.toLowerCase()}/${repo.toLowerCase()}` ||
                r.name?.toLowerCase() === repo.toLowerCase()
              );

              if (matched) {
                console.log(`[GitHubFetcher] Recovered repository via token scope: ${matched.full_name}`);
                resolvedRepoJson = matched;
              } else {
                const accessibleNames = userRepos.map((r: any) => r.name).slice(0, 5);
                const tokenOwner = userRepos[0]?.owner?.login || owner;
                customDiagnosticReason = `Private Repository Inaccessible: Token for @${tokenOwner} is valid, but only has access to: [${accessibleNames.join(', ')}]. Under GitHub Settings > Personal Access Tokens, edit this token and add '${repo}' to 'Repository access' with Contents: Read-only.`;
              }
            }
          }
        } catch (e: any) {
          console.warn(`[GitHubFetcher] Scope inspection fallback skipped:`, e.message);
        }
      }

      if (!resolvedRepoJson) {
        console.warn(`[GitHubFetcher] Failed to fetch repo metadata for ${owner}/${repo}: HTTP ${repoRes.status}`);
        const rawFallback = await fetchViaRawProbing(owner, repo, token);
        if (rawFallback && rawFallback.files.length > 0) {
          REPO_CACHE.set(cacheKey, { data: rawFallback, cachedAt: Date.now() });
          return rawFallback;
        }

        const authError = {
          status: repoRes.status,
          message: customDiagnosticReason || (repoRes.status === 401
            ? 'GitHub Authentication Failed: The token provided was rejected by GitHub with Bad Credentials. Please click "Private Repo" to update your token.'
            : repoRes.status === 404
            ? (token 
                ? `Private Repository Inaccessible: Token does not have read access to ${owner}/${repo}. Ensure your Fine-Grained Token includes permission for this repo, or create a Classic Token with the 'repo' scope.`
                : `Repository ${owner}/${repo} is private or does not exist. Click "Private Repo" in the top bar to authenticate with a GitHub Personal Access Token.`)
            : `GitHub API returned HTTP ${repoRes.status}`),
          isPrivate: true
        };

        return {
          meta: {
            owner,
            name: repo,
            fullName: `${owner}/${repo}`,
            defaultBranch: 'main',
            stars: 0,
            forks: 0,
            description: `Repository ${owner}/${repo}`,
            language: 'Auto-detected',
            url: `https://github.com/${owner}/${repo}`
          },
          files: [],
          totalFileCount: 0,
          fromLiveGitHub: true,
          authError
        };
      }
    }

    const repoJson = resolvedRepoJson || (await repoRes.json());
    const defaultBranch = repoJson.default_branch || 'main';

    const meta: GitHubRepoMeta = {
      owner: repoJson.owner?.login || owner,
      name: repoJson.name || repo,
      fullName: repoJson.full_name || `${owner}/${repo}`,
      defaultBranch,
      stars: repoJson.stargazers_count ?? 0,
      forks: repoJson.forks_count ?? 0,
      description: repoJson.description || (repoJson.private ? 'Private GitHub Repository' : 'Public GitHub Repository'),
      language: repoJson.language || 'TypeScript',
      url: repoJson.html_url || `https://github.com/${owner}/${repo}`
    };

    // 2. Fetch Recursive Git Tree with 12s timeout
    let allPaths: string[] = [];
    try {
      const treeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
        { headers, cache: 'no-store', signal: AbortSignal.timeout(3500) }
      );

      if (treeRes.ok) {
        const treeJson = await treeRes.json();
        if (Array.isArray(treeJson.tree)) {
          allPaths = treeJson.tree
            .filter((node: any) => node.type === 'blob')
            .map((node: any) => node.path);
        }
      }
    } catch (e: any) {
      console.warn(`[GitHubFetcher] Recursive tree fetch skipped or timed out for ${owner}/${repo}: ${e.message}`);
    }

    // If tree API failed or was rate limited, probe standard paths
    if (allPaths.length === 0) {
      allPaths = getStandardProbePaths();
    }

    // 3. Filter for High-Signal Architecture Files (Top 6 files max for instant response)
    const candidatePaths = selectPriorityFiles(allPaths);

    // 4. Download content of candidate files in parallel with fast timeout
    let files: FetchedFile[] = await downloadRawFiles(owner, repo, defaultBranch, candidatePaths, token);

    // If candidate paths failed on default branch, probe other common branches (main, master, develop, dev)
    if (files.length === 0) {
      console.warn(`[GitHubFetcher] Candidate paths yielded 0 files on ${defaultBranch} for ${owner}/${repo}, trying multi-branch raw probe`);
      const fallbackData = await fetchViaRawProbing(owner, repo, token, defaultBranch);
      if (fallbackData && fallbackData.files.length > 0) {
        files = fallbackData.files;
        meta.description = meta.description || fallbackData.meta.description;
        meta.language = meta.language || fallbackData.meta.language;
        meta.defaultBranch = fallbackData.meta.defaultBranch || defaultBranch;
      }
    }

    // 5. Dynamic Route Link Walker: If route definitions reference sub-routes or controllers, resolve them dynamically
    const dynamicProbePaths: string[] = [];
    for (const f of files) {
      if (/routes?\/[a-zA-Z0-9_\-]+\.php$/i.test(f.path)) {
        // A. Sub-routes required like require __DIR__.'/creator.php' or require 'auth.php'
        const reqMatches = [...f.content.matchAll(/require(?:_once)?\s+(?:__DIR__\s*\.\s*['"]\/|['"])([a-zA-Z0-9_\-]+(?:\.php)?)/g)];
        for (const rm of reqMatches) {
          const subFile = rm[1].endsWith('.php') ? `routes/${rm[1]}` : `routes/${rm[1]}.php`;
          if (!files.some(e => e.path === subFile) && !dynamicProbePaths.includes(subFile)) {
            dynamicProbePaths.push(subFile);
          }
        }
        // B. Controllers imported like use App\Http\Controllers\Auth\CreatorLoginController;
        const ctrlMatches = [...f.content.matchAll(/use\s+(App\\Http\\Controllers\\[a-zA-Z0-9_\\]+);/g)];
        for (const cm of ctrlMatches) {
          const ctrlPath = cm[1].replace(/\\/g, '/').replace(/^App\//, 'app/') + '.php';
          if (!files.some(e => e.path === ctrlPath) && !dynamicProbePaths.includes(ctrlPath)) {
            dynamicProbePaths.push(ctrlPath);
          }
        }
      } else if (/config\/routes\.rb$/i.test(f.path)) {
        // Rails controller references: to: 'sessions#create'
        const rbMatches = [...f.content.matchAll(/to:\s*['"]([a-zA-Z0-9_]+)#/g)];
        for (const rm of rbMatches) {
          const ctrlPath = `app/controllers/${rm[1]}_controller.rb`;
          if (!files.some(e => e.path === ctrlPath) && !dynamicProbePaths.includes(ctrlPath)) {
            dynamicProbePaths.push(ctrlPath);
          }
        }
      }
    }

    if (dynamicProbePaths.length > 0) {
      const linkedFiles = await downloadRawFiles(owner, repo, defaultBranch, dynamicProbePaths.slice(0, 6), token);
      files.push(...linkedFiles);

      // If any sub-routes were fetched (e.g. routes/creator.php), extract their controllers as well
      const secondaryControllers: string[] = [];
      for (const lf of linkedFiles) {
        if (/routes?\/[a-zA-Z0-9_\-]+\.php$/i.test(lf.path)) {
          const subCtrlMatches = [...lf.content.matchAll(/use\s+(App\\Http\\Controllers\\[a-zA-Z0-9_\\]+);/g)];
          for (const cm of subCtrlMatches) {
            const ctrlPath = cm[1].replace(/\\/g, '/').replace(/^App\//, 'app/') + '.php';
            if (!files.some(e => e.path === ctrlPath) && !secondaryControllers.includes(ctrlPath)) {
              secondaryControllers.push(ctrlPath);
            }
          }
        }
      }
      if (secondaryControllers.length > 0) {
        const ctrlFiles = await downloadRawFiles(owner, repo, defaultBranch, secondaryControllers.slice(0, 4), token);
        files.push(...ctrlFiles);
      }
    }

    const result: LiveRepoData = {
      meta,
      files,
      totalFileCount: allPaths.length || files.length,
      fromLiveGitHub: true,
      repoExists: true
    };

    REPO_CACHE.set(cacheKey, { data: result, cachedAt: Date.now() });
    return result;
  } catch (err: any) {
    console.warn(`[GitHubFetcher] Live fetch fallback for ${owner}/${repo}: ${err.message}`);
    const fallback = await fetchViaRawProbing(owner, repo, token);
    if (fallback) {
      REPO_CACHE.set(cacheKey, { data: fallback, cachedAt: Date.now() });
    }
    return fallback;
  }
}

/**
 * Resilient multi-branch fallback: probe standard manifests directly across branches via raw CDN.
 * Does not invent fake synthetic code fixtures; returns actual files discovered on GitHub.
 */
async function fetchViaRawProbing(
  owner: string, 
  repo: string, 
  token?: string,
  knownBranch?: string
): Promise<LiveRepoData | null> {
  const probePaths = getStandardProbePaths();
  const branchCandidates = Array.from(new Set([
    knownBranch,
    'main',
    'master'
  ])).filter((b): b is string => Boolean(b && b.trim()));

  // Probe candidates concurrently across primary branches
  const branchProbes = await Promise.all(
    branchCandidates.map(async (branch) => {
      const files = await downloadRawFiles(owner, repo, branch, probePaths.slice(0, 24), token);
      return { branch, files };
    })
  );

  // Find the branch with the highest number of architectural files
  branchProbes.sort((a, b) => b.files.length - a.files.length);
  const bestProbe = branchProbes[0];

  // Attempt to extract live title / description / statistics from public GitHub page
  let description = `Public repository ${owner}/${repo}`;
  let language = 'TypeScript';
  let stars = 0;
  let forks = 0;

  try {
    const htmlRes = await fetch(`https://github.com/${owner}/${repo}`, {
      headers: { 'User-Agent': 'GitStress-Diagnostic/1.0 (https://gitstress.com)' },
      signal: AbortSignal.timeout(2500)
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
                        html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      if (descMatch && descMatch[1]) {
        description = descMatch[1].replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).trim();
      }

      const starMatch = html.match(/id="repo-stars-counter-star"[^>]*title="([\d,]+)"/i) ||
                        html.match(/id="repo-stars-counter-star"[^>]*>([\d,\.kKmM]+)</i);
      if (starMatch && starMatch[1]) {
        stars = parseAbbreviatedNumber(starMatch[1]);
      }

      const forkMatch = html.match(/id="repo-network-counter"[^>]*title="([\d,]+)"/i) ||
                        html.match(/id="repo-network-counter"[^>]*>([\d,\.kKmM]+)</i);
      if (forkMatch && forkMatch[1]) {
        forks = parseAbbreviatedNumber(forkMatch[1]);
      }

      if (/python/i.test(description) || /language-python/i.test(html)) language = 'Python';
      else if (/golang|go /i.test(description) || /language-go/i.test(html)) language = 'Go';
      else if (/rust/i.test(description) || /language-rust/i.test(html)) language = 'Rust';
    }
  } catch {
    // Ignore HTML probe error
  }

  if (bestProbe && bestProbe.files.length > 0) {
    return {
      meta: {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
        defaultBranch: bestProbe.branch,
        stars,
        forks,
        description,
        language,
        url: `https://github.com/${owner}/${repo}`
      },
      files: bestProbe.files,
      totalFileCount: bestProbe.files.length,
      fromLiveGitHub: true,
      repoExists: true
    };
  }

  return null;
}

/**
 * Select the highest-signal files for static demand propagation.
 * Caps at top 8 files for sub-second retrieval.
 */
function selectPriorityFiles(paths: string[]): string[] {
  const composeRegex = /(^|\/)(docker-compose|compose)\.ya?ml$/i;
  const dockerfileRegex = /(^|\/)dockerfile(\..+)?$/i;
  const schemaRegex = /(^|\/)(schema\.prisma|schema\.sql|\.prisma)$/i;
  const migrationsRegex = /(^|\/)(migrations?|supabase\/migrations)\/.*\.sql$/i;
  const manifestRegex = /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile)$/i;
  const routeRegex = /(^|\/)(api|routes?|controllers?|handlers?|services?|workers?|internal|cmd|pkg|proxy|server|app|pages)\/.*\.(ts|tsx|js|jsx|py|go|rb|rs)$/i;
  const entrypointRegex = /(^|\/)(index|main|server|app|db|__init__|pipeline)\.(ts|tsx|js|jsx|py|go|rs)$/i;
  const modelRegex = /(^|\/)(models?|entities|db|queries)\/.*\.(ts|js|py|go|rs)$/i;

  const composes: string[] = [];
  const dockerfiles: string[] = [];
  const schemas: string[] = [];
  const manifests: string[] = [];
  const routes: string[] = [];
  const entrypoints: string[] = [];
  const models: string[] = [];

  for (const p of paths) {
    if (/\.(test|spec)\.(ts|js|py|go)|__tests__|__mocks__|\.d\.ts$/i.test(p)) continue;
    if (/\.(md|png|jpg|svg|json|yaml)$/i.test(p) && !composeRegex.test(p) && !manifestRegex.test(p)) continue;

    if (composeRegex.test(p)) composes.push(p);
    else if (dockerfileRegex.test(p)) dockerfiles.push(p);
    else if (schemaRegex.test(p) || migrationsRegex.test(p)) schemas.push(p);
    else if (manifestRegex.test(p)) manifests.push(p);
    else if (entrypointRegex.test(p)) entrypoints.push(p);
    else if (modelRegex.test(p)) models.push(p);
    else if (routeRegex.test(p)) {
      if (!p.includes('/admin/') && !p.includes('test')) {
        routes.push(p);
      }
    }
  }

  // Sort routes by impact
  routes.sort((a, b) => {
    const priority = (name: string) => {
      if (/proxy|gateway|reverse/i.test(name)) return 1;
      if (/serve|server|main|app|index/i.test(name)) return 2;
      if (/limiter|budget|ledger/i.test(name)) return 3;
      if (/api|routes/i.test(name)) return 4;
      return 5;
    };
    return priority(a) - priority(b);
  });

  // Balanced high-speed selection: keep manifests across languages (pyproject, go.mod, package.json, Cargo.toml)
  const selected = [
    ...composes.slice(0, 1),
    ...dockerfiles.slice(0, 1),
    ...schemas.slice(-2),
    ...manifests.slice(0, 4),
    ...routes.slice(0, 3),
    ...entrypoints.slice(0, 3),
    ...models.slice(0, 1)
  ].slice(0, 12);

  // If repository has no backend/server architecture files, select key manifest/spec/doc files
  // so the workload classifier can inspect what the repository actually is (e.g. agent skill, documentation, client library)
  if (selected.length === 0 && paths.length > 0) {
    const skillFile = paths.find(p => /(^|\/)SKILL\.md$/i.test(p));
    const readmeFile = paths.find(p => /(^|\/)README\.md$/i.test(p));
    const anyDoc = paths.find(p => /\.md$/i.test(p));
    const anyCode = paths.find(p => /\.(cjs|js|ts|py|go|rs|json)$/i.test(p) && !p.includes('.test.'));

    if (skillFile) selected.push(skillFile);
    if (readmeFile && !selected.includes(readmeFile)) selected.push(readmeFile);
    if (anyCode && !selected.includes(anyCode)) selected.push(anyCode);
    if (selected.length === 0 && anyDoc) selected.push(anyDoc);
    if (selected.length === 0 && paths[0]) selected.push(paths[0]);
  }

  return selected;
}

/**
 * Standard probing paths when tree API is not available
 */
function getStandardProbePaths(): string[] {
  return [
    'docker-compose.yml',
    'docker-compose.yaml',
    'docker-compose.dev.yml',
    'docker-compose.local.yml',
    'compose.yaml',
    'compose.yml',
    'deploy/docker-compose.yml',
    // Laravel / PHP (Framework Standards)
    'composer.json',
    'routes/web.php',
    'routes/api.php',
    'config/database.php',
    'artisan',
    'app/Http/Controllers/Controller.php',
    'app/Http/Controllers/UserController.php',
    'app/Models/User.php',
    'database/migrations/0001_01_01_000000_create_users_table.php',
    'database/migrations/2014_10_12_000000_create_users_table.php',
    // Ruby on Rails
    'Gemfile',
    'config/routes.rb',
    'config/database.yml',
    'db/schema.rb',
    'config.ru',
    'app/controllers/application_controller.rb',
    'app/controllers/sessions_controller.rb',
    'app/controllers/users_controller.rb',
    'app/models/user.rb',
    // Python / Django / FastAPI
    'manage.py',
    'app/views.py',
    'users/views.py',
    'users/models.py',
    // Perl / PSGI
    'cpanfile',
    'Makefile.PL',
    'app.psgi',
    'app.pl',
    // Java / Spring
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    // C# / .NET
    'Program.cs',
    'Startup.cs',
    'package.json',
    'pnpm-workspace.yaml',
    'packages/medusa/package.json',
    'packages/cli/package.json',
    'packages/core/package.json',
    'packages/server/package.json',
    'packages/backend/package.json',
    'apps/web/package.json',
    'apps/api/package.json',
    'apps/server/package.json',
    'backend/package.json',
    'server/package.json',
    'api/package.json',
    'schema.prisma',
    'prisma/schema.prisma',
    'packages/prisma/schema.prisma',
    'drizzle.config.ts',
    'src/db/schema.ts',
    'pyproject.toml',
    'requirements.txt',
    'setup.py',
    'Pipfile',
    'haystack/__init__.py',
    'haystack/pipeline.py',
    'go.mod',
    'Cargo.toml',
    'Makefile',
    'src/index.ts',
    'src/server.ts',
    'src/app.ts',
    'src/main.ts',
    'src/main.rs',
    'src/lib.rs',
    'src/app.py',
    'server.ts',
    'server.py',
    'main.py',
    'app.py',
    'app/main.py',
    'main.go',
    'cmd/server/main.go',
    'cmd/main.go',
    'SKILL.md',
    'README.md',
    'readme.md',
    'docs/index.md',
    'wrangler.toml',
    'wrangler.json',
    'fly.toml',
    'vercel.json'
  ];
}

/**
 * Download raw content in parallel with resilient 10.0s per-file timeout.
 * Zero-quota Fastly CDN (raw.githubusercontent.com) streamed FIRST to preserve REST API limits.
 * Authenticates against private repositories using GitHub Contents API (raw + base64) as fallback.
 */
async function downloadRawFiles(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  token?: string
): Promise<FetchedFile[]> {
  const safeBranch = branch.replace(/[^a-zA-Z0-9_\-\.\/]/g, '').replace(/\.\./g, '');
  if (!safeBranch) return [];

  const tasks = paths.map(async (p): Promise<FetchedFile | null> => {
    // Security: reject path traversal, absolute paths, and sensitive secret files
    if (!p || p.includes('..') || p.startsWith('/') || /\.(env|pem|key|crt|p12|id_rsa|id_ed25519|secrets?|shadow|passwd)/i.test(p)) {
      return null;
    }

    const safePath = p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const cleanToken = sanitizeGitHubToken(token);

    // 1. FAST UNMETERED CDN FIRST (raw.githubusercontent.com)
    // raw.githubusercontent.com is served via Fastly CDN and does NOT evaluate against GitHub REST rate limits
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(safeBranch)}/${safePath}`;
    const rawHeaders: Record<string, string> = { 'User-Agent': 'GitStress-Diagnostic/1.0 (https://gitstress.com)' };
    if (cleanToken) {
      rawHeaders['Authorization'] = `token ${cleanToken}`;
    }

    try {
      const res = await fetch(rawUrl, {
        headers: rawHeaders,
        cache: 'no-store',
        signal: AbortSignal.timeout(2500)
      });
      if (res.ok) {
        const content = await res.text();
        if (content && content.length > 0) {
          return { path: p, content };
        }
      }
    } catch {
      // Ignore CDN timeout / fetch failure, try API fallback if token present
    }

    // 2. Fallback to GitHub Contents API only if CDN missed and token is available (e.g. private repo)
    if (cleanToken) {
      try {
        const apiContentsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safePath}?ref=${encodeURIComponent(safeBranch)}`;
        let apiRes = await fetch(apiContentsUrl, {
          headers: {
            'User-Agent': 'GitStress-Diagnostic/1.0 (https://gitstress.com)',
            'Authorization': `Bearer ${cleanToken}`,
            'Accept': 'application/vnd.github.raw',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(2500)
        });

        if (!apiRes.ok && (apiRes.status === 401 || apiRes.status === 404)) {
          const altRes = await fetch(apiContentsUrl, {
            headers: {
              'User-Agent': 'GitStress-Diagnostic/1.0 (https://gitstress.com)',
              'Authorization': `token ${cleanToken}`,
              'Accept': 'application/vnd.github.raw',
              'X-GitHub-Api-Version': '2022-11-28'
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(2500)
          }).catch(() => null);
          if (altRes && altRes.ok) {
            apiRes = altRes;
          }
        }

        if (apiRes && apiRes.ok) {
          const contentType = apiRes.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const json = await apiRes.json();
            if (json && json.content && json.encoding === 'base64') {
              const decoded = Buffer.from(json.content.replace(/\n/g, ''), 'base64').toString('utf8');
              if (decoded.length > 0) return { path: p, content: decoded };
            }
          } else {
            const content = await apiRes.text();
            if (content && content.length > 0) {
              return { path: p, content };
            }
          }
        }
      } catch {
        // Fallback failed
      }
    }

    return null;
  });

  const results = await Promise.all(tasks);
  return results.filter((r): r is FetchedFile => r !== null && r.content.length > 0);
}
