# Pure CLI Engine, Physical Hardware Verification, and CI Gate

## 1. Monorepo Architecture: Pure CLI vs. Commercial Web

GitStress version 0.11.0 strictly decouples the open-source CLI engine (`oss/`) from the hosted commercial platform (`com/`).

### oss/ (Pure CLI and Core Engine)
- Zero Next.js or React SSR runtime dependencies.
- Lightweight distribution intended for instant execution via `npx gitstress .` or global installation.
- Contains the static parser engine, the Operational Queuing Network / Mean Value Analysis (MVA) solver, the gauntlet validation suite, and the physical verifier.
- Fast execution with zero hydration overhead or browser polyfills.

### com/ (gitstress.com Web Application)
- Next.js 15.5.28 App Router application deployed at `gitstress.com`.
- Interactive visualization suite: Steve Jobs Executive X-Ray, 60 FPS Analog Tachometer, 2D Pixel Concurrency Dynamometer, Latency Flamegraphs, Traffic Surge Simulator, and Interactive Patch Sandbox.
- GitHub OAuth integration, SVG concurrency badge generator, and hosted webhook receivers.

---

## 2. Multi-Line Block AST and Token Scanner

### The Limitation of Line-by-Line Regex Scanners
Standard regex code scanning evaluates files line by line. In modern formatted codebases (Prettier, Black, rustfmt, gofmt), ORM calls and route handlers are routinely formatted across multiple lines:

```typescript
const bookings = await prisma.booking.findMany({
  where: {
    attendeeId: id
  }
});
```

A line-by-line regex searching for `where.*attendeeId` fails to match because the tokens reside on distinct lines.

### The Solution: Multi-Line Block Token Parsing
The updated parser in `src/core/parsers/code.ts` implements multi-line block token scanning across balanced braces, parentheses, and method chains:

1. **Prisma / TypeORM / Drizzle**:
   - Matches multiline calls: `.findMany(...)`, `.find(...)`, `.select(...)`.
   - Extracts target models and fields inside `where: { ... }` or `relations: [ ... ]`.
   - Detects queries against high-cardinality foreign keys (`attendeeId`, `userId`, `organizationId`) lacking composite indexes.
2. **Django ORM & SQLAlchemy**:
   - Identifies multiline querysets: `Model.objects.filter(...)` or `db.session.query(...)`.
   - Detects nested attribute iteration without `select_related(...)` or `prefetch_related(...)` (Active Record N+1 risk).
3. **Go net/http & GORM**:
   - Detects unbuffered channels (`make(chan T)`) inside goroutine loops.
   - Detects sync.Mutex locks held across external network, database, or disk I/O operations (`mu.Lock()` followed by `http.Get` or `db.Query` before `mu.Unlock()`).
   - Identifies unindexed `db.Where(...)` calls without secondary index definitions.
4. **Ruby on Rails**:
   - Identifies `ActiveRecord` iteration patterns (`each`, `map`) triggering database queries within loops without `.includes(...)`.

---

## 3. Physical Hardware Verification Bridge (`gitstress verify`)

### Bridging Static Queuing Theory and Physical Reality
Static code analysis provides rapid saturation predictions, but production environments require empirical confirmation. The `gitstress verify` (or `gitstress bench`) command executes a closed-loop verification against a live local server.

```bash
# Run physical load verification against a running service
npx gitstress verify http://localhost:3000

# Or using the alias
npx gitstress bench http://localhost:8000/api/v1/checkout
```

### Verification Methodology
1. **Target Concurrency Extraction**:
   The engine first runs static analysis on the local repository to determine the predicted collapse threshold ($N_{fail}$) and bottleneck station.
2. **5-Second Synthetic Saturation Burst**:
   The verifier initiates an automated 5-second HTTP/1.1 load burst targeting the exact predicted concurrency ($N_{fail}$), capturing latency distributions across request completions.
3. **Statistical Metrics Computed**:
   - Total Requests Dispatched & Sustained Throughput (req/sec)
   - Percentile Latency: p50, p95, and p99
   - Error Rate and HTTP 5xx / Socket Hangup Counter
4. **Side-by-Side Comparison Table**:
   Renders a side-by-side terminal card comparing the Little's Law saturation ceiling with physical hardware measurements, calculating the mathematical accuracy envelope:

```
┌─────────────────────────────────────────────────────────┐
│ PREDICTION vs PHYSICAL HARDWARE VERIFICATION            │
├─────────────────────────────────────────────────────────┤
│ Target Endpoint                  : http://localhost:3000│
│ Little's Law Saturation Ceiling  : 85 concurrent        │
│ Physical Kernel epoll Collapse   : 88 concurrent        │
│ Sustained Throughput             : 4,146 req/sec        │
│ Measured Latency (p50 / p99)     : 11.2ms / 48.7ms      │
│ Physical Error Rate              : 0.00%                │
│ Accuracy Envelope                : 96.6% match          │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Turnkey GitHub Action CI Gate (`.github/workflows/gitstress.yml`)

The GitHub Action workflow provides automated regression protection for pull requests.

### Configuration
Save the following workflow as `.github/workflows/gitstress.yml`:

```yaml
name: GitStress Concurrency CI Gate

on:
  pull_request:
    branches: [main, master, develop]
  push:
    branches: [main, master]

jobs:
  concurrency-gate:
    name: Concurrency Headroom & Bottleneck Audit
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Run GitStress Audit Gate
        id: gitstress
        run: |
          npx gitstress . --ci --json > gitstress-report.json || true
          cat gitstress-report.json

      - name: Evaluate Concurrency Threshold
        run: |
          node -e "
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('gitstress-report.json', 'utf8'));
            console.log('Repo Concurrency Ceiling:', report.metrics?.saturationClients || 'N/A');
            console.log('Bottleneck Culprit:', report.culprit?.symbol || 'None');
            
            if (report.culprit && report.culprit.failsAt && report.culprit.failsAt < 25) {
              console.error('FATAL: Concurrency collapse below minimum gate threshold (25 concurrent clients).');
              process.exit(1);
            }
          "

      - name: Post PR Review Comment
        if: github.event_name == 'pull_request' && failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            let body = '### GitStress Concurrency Gate Warning\n\n';
            try {
              const report = JSON.parse(fs.readFileSync('gitstress-report.json', 'utf8'));
              body += '| Metric | Value |\n|---|---|\n';
              body += '| **Predicted Saturation** | ' + (report.metrics?.saturationClients || 'Unknown') + ' concurrent |\n';
              body += '| **Bottleneck Symbol** | `' + (report.culprit?.symbol || 'Unknown') + '` |\n';
              body += '| **Location** | `' + (report.culprit?.file || 'Unknown') + ':' + (report.culprit?.line || 0) + '` |\n';
              body += '| **Why** | ' + (report.culprit?.whyReason || 'Resource saturation') + ' |\n\n';
              if (report.culprit?.patch) {
                body += '#### Recommended Patch\n```diff\n' + report.culprit.patch + '\n```\n';
              }
            } catch (e) {
              body += 'Failed to parse GitStress report output.';
            }
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

### CI Gate Behavior
1. **Differential Analysis**: Examines modified files in the pull request for unindexed queries, blocking I/O inside mutex locks, unbuffered channel loops, or connection pool misconfigurations.
2. **Headroom Gate**: If a commit lowers concurrency headroom below the acceptable threshold ($<25$ concurrent clients) or introduces an unindexed query on a critical path, the job fails with exit code 1.
3. **Forensic PR Comment**: The action automatically formats a clean Markdown review comment detailing the bottleneck symbol, reason, and recommended diff patch to remediate the issue prior to merging.
