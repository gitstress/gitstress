#!/usr/bin/env node

/**
 * GitStress CLI (TypeScript)
 * Friday-afternoon bottleneck diagnostic.
 * Usage:
 *   npx gitstress .
 *   gitstress verify [http://localhost:3000]
 *   gitstress bench
 *   gitstress /path/to/repo
 *   gitstress --json .
 *   gitstress --ci
 */

import fs from 'fs';
import path from 'path';
import { analyzeLocalDirectory } from '../src/core/analyzer_node';
import { getDiagnosticForRepo } from '../src/core/gauntlet_loader';
import { renderTerminalCard } from '../src/core/culprit';
import { runHardwareVerification, renderVerificationCard } from '../src/core/verifier';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
\x1b[1;36mGitStress CLI\x1b[0m — Friday-afternoon bottleneck diagnostic.
Predict which line dies first under concurrency before you deploy.

\x1b[1mUSAGE:\x1b[0m
  gitstress <directory | owner/repo | url> [options]
  gitstress verify [endpoint_url] [options]
  gitstress bench [endpoint_url] [options]

\x1b[1mEXAMPLES:\x1b[0m
  gitstress .
  gitstress verify http://localhost:3000
  gitstress tkngate/tkngate
  gitstress calcom/cal.com
  gitstress https://github.com/torvalds/linux
  gitstress . --ci
  gitstress . --json

\x1b[1mOPTIONS:\x1b[0m
  verify, bench   Run 5s synthetic load burst to verify prediction vs physical hardware
  --ci            Continuous Integration gate: exit code 1 if critical bottleneck detected
  --json          Print raw machine-readable JSON report
  --help, -h      Show this help message
  --version       Show version
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('gitstress v0.11.0');
  process.exit(0);
}

const isJson = args.includes('--json');
const isCi = args.includes('--ci');
const isVerify = args[0] === 'verify' || args[0] === 'bench';

function parseRepoSlug(arg: string): { owner: string; repo: string } | null {
  const clean = arg.trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/$/, '');
  const parts = clean.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

async function handleVerification(): Promise<void> {
  const targetUrl = args[1] && !args[1].startsWith('-') ? args[1] : 'http://localhost:3000';
  console.log(`\x1b[1;36mGitStress Hardware Verification Bridge\x1b[0m`);
  console.log(`Analyzing local architecture to calculate queuing saturation knee...`);

  const report = await analyzeLocalDirectory(process.cwd());
  const predictedN = report.culprit?.failsAtNum || 85;

  console.log(`Targeting \x1b[1m${targetUrl}\x1b[0m with \x1b[32m${predictedN} concurrent clients\x1b[0m for 5s...`);
  const result = await runHardwareVerification({
    targetUrl,
    concurrency: predictedN,
    durationSeconds: 5,
    report
  });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderVerificationCard(result));
  }

  if (result.verdict === 'DISCREPANCY (HARDWARE LIMITED)' && isCi) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (isVerify) {
    await handleVerification();
    return;
  }

  const targetArg = args.find(a => !a.startsWith('-')) || '.';
  const startTime = Date.now();
  try {
    let report;
    const resolvedPath = path.resolve(process.cwd(), targetArg);

    // If local directory exists on disk, analyze local filesystem
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      report = await analyzeLocalDirectory(resolvedPath);
    } else {
      // Check if argument is owner/repo or GitHub URL
      const repoSlug = parseRepoSlug(targetArg);
      if (repoSlug) {
        report = await getDiagnosticForRepo(repoSlug.owner, repoSlug.repo);
      } else {
        // Fall back to analyzing resolved path
        report = await analyzeLocalDirectory(resolvedPath);
      }
    }

    const duration = Date.now() - startTime;

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderTerminalCard(report));
      console.log(`\x1b[90mDiagnostic completed in ${duration}ms. Report ready for CI/CD.\x1b[0m\n`);
    }

    // CI Gate enforcement
    if (isCi) {
      const failsAtNum = report.culprit?.failsAtNum || 0;
      const isCritical = report.culprit?.failureMode?.includes('CRITICAL') || report.culprit?.why?.includes('seq scan');
      if (isCritical || (failsAtNum > 0 && failsAtNum < 25)) {
        console.error(`\x1b[1;31mCI Gate Failed:\x1b[0m Concurrency ceiling (${failsAtNum} concurrent) violates CI threshold (>= 25 concurrent required).`);
        process.exit(1);
      }
    }
  } catch (err: any) {
    console.error(`\x1b[1;31mError analyzing repo:\x1b[0m`, err?.message || err);
    process.exit(1);
  }
}

main();
