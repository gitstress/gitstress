# Live-First Dynamic GitHub Analysis & Resilient Scanner Architecture

## 1. Overview

In GitStress version 0.11.0, the diagnostic pipeline was overhauled to be strictly **live-first**:
- Synthetic mock presets in `GAUNTLET_PRESETS` have been completely removed for public repositories.
- `GAUNTLET_PRESETS` is strictly reserved as an offline unit-test fixture for the automated test runner.
- Every user query for any repository on GitHub dynamically fetches and inspects real architecture files, database schemas, and route handlers.

## 2. Dynamic Live Fetching Pipeline

When an arbitrary repository slug (e.g. `medusajs/medusa` or `organization/private-repo`) is diagnosed:

1. **Repository Metadata**:
   Queries `https://api.github.com/repos/{owner}/{repo}` to retrieve default branch, star count, language, and repository accessibility.
2. **Multi-Branch Fallback**:
   If the default branch differs from `main` (e.g. `develop` in Medusa or `master` in legacy stacks), the engine probes the active default branch first, followed by `['develop', 'main', 'master', 'dev']`.
3. **Resilient Raw CDN Probing**:
   In massive repositories (monorepos containing 20,000+ to 40,000+ files), recursive git tree REST calls can exceed timeout windows or trigger anonymous REST rate limits (60 req/hr). GitStress probes high-priority architecture manifests directly via `raw.githubusercontent.com`, which bypasses GitHub REST API rate limits for public repositories.
4. **AST & MVA Static Demand Solving**:
   Real files downloaded from GitHub are parsed by the multi-line block AST scanner (`parsers/code.ts`) and solved through the 4-station Mean Value Analysis queuing network.

## 3. GitHub Personal Access Token Configuration

To increase the GitHub API rate limit from 60 requests/hour to 5,000 requests/hour and allow auditing private repositories:

### Local Development (`com/.env.local`)
Create a `com/.env.local` file (automatically ignored by git):
```env
GITHUB_TOKEN=ghp_your_personal_access_token_here
```

### In-Browser Session Authentication
Users can click **Private Repo** in the top navigation bar to save their token in session storage and an encrypted cookie, allowing client queries to access authorized private organization repositories.

## 4. Anchored UI Scanner Architecture

The GitDiagram live scanner (`GitDiagramLiveScanner.tsx`) is anchored directly inside the diagnostic page hierarchy:
- In `com/app/components/UrlBar.tsx`, disruptive inline dropdown popups have been removed. The input card remains stable while the action button shows `Scanning...`.
- In `com/app/[owner]/[repo]/loading.tsx`, the scanner is mounted in the `.scanner-hero-wrap` container at the exact coordinates of the final view.
- When SSR completes, `com/app/[owner]/[repo]/page.tsx` takes over the exact same geometry without layout shifts, transitioning from active telemetry scanning to the completed diagnostic state with 10x headroom synthesis.
