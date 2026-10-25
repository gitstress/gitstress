import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });

try {
  esbuild.buildSync({
    entryPoints: [path.join(rootDir, 'bin', 'gitstress.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: path.join(rootDir, 'dist', 'gitstress.js'),
  });
  console.log('Successfully built oss/dist/gitstress.js');
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
}
