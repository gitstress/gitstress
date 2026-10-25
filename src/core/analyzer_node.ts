/**
 * Node.js Filesystem Scanner for GitStress CLI (TypeScript)
 */

import fs from 'fs';
import path from 'path';
import { analyzeVirtualFiles } from './analyzer';
import type { GitStressReport } from './types';

export async function analyzeLocalDirectory(
  dirPath: string,
  repoInfo: { name?: string; owner?: string; url?: string } = {}
): Promise<GitStressReport> {
  const files: Array<{ path: string; content: string }> = [];
  const visitedRealPaths = new Set<string>();

  let rootReal: string;
  try {
    rootReal = fs.realpathSync(dirPath);
  } catch {
    rootReal = path.resolve(dirPath);
  }

  function walk(currentDir: string, depth = 0): void {
    if (depth > 8) return;

    let realCurrent: string;
    try {
      realCurrent = fs.realpathSync(currentDir);
      // Prevent directory traversal escape via symlinks
      const isInside = realCurrent.toLowerCase().startsWith(rootReal.toLowerCase()) || realCurrent === rootReal;
      if (!isInside) return;
      if (visitedRealPaths.has(realCurrent)) return;
      visitedRealPaths.add(realCurrent);
    } catch {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      // Skip hidden folders, version control, build outputs, and vendor directories
      if (name.startsWith('.') || 
          name === 'node_modules' || 
          name === 'dist' || 
          name === 'build' ||
          name === 'coverage' ||
          name === 'target' ||
          name === 'docs' ||
          name === 'references' ||
          name === 'vendor') {
        continue;
      }

      // Security: never read environment files, keys, or credentials
      if (/^\.env/i.test(name) || /\.(env|pem|key|crt|p12|id_rsa|id_ed25519|secrets?|shadow|passwd)$/i.test(name)) {
        continue;
      }

      const fullPath = path.join(currentDir, name);
      const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (/\.(ya?ml|json|prisma|sql|py|js|ts|go|md)$/i.test(name) || 
            name.toLowerCase().includes('dockerfile')) {
          try {
            // Guard against symlink file traversal outside root
            const realFilePath = fs.realpathSync(fullPath);
            if (!realFilePath.toLowerCase().startsWith(rootReal.toLowerCase())) continue;

            // Guard against massive files (limit to 1MB)
            const stats = fs.statSync(fullPath);
            if (stats.size > 1024 * 1024) continue;

            const content = fs.readFileSync(fullPath, 'utf8');
            files.push({ path: relPath, content });
          } catch {
            // Ignore unreadable files
          }
        }
      }
    }
  }

  walk(dirPath, 0);

  const folderName = path.basename(path.resolve(dirPath));
  return analyzeVirtualFiles(files, {
    name: repoInfo.name || folderName,
    owner: repoInfo.owner || 'local',
    url: repoInfo.url || `file://${path.resolve(dirPath)}`
  });
}
