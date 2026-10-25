/**
 * Dockerfile Parser (TypeScript)
 * Identifies server runtime, thread/worker counts, and concurrency flags.
 */

export interface DockerfileParsedData {
  hasDockerfile: boolean;
  runtime: 'python' | 'node' | 'go' | 'rust' | 'unknown';
  workers: number;
  port: number;
  entrypoint: string;
  cmd: string;
}

export function parseDockerfile(content?: string): DockerfileParsedData {
  const result: DockerfileParsedData = {
    hasDockerfile: true,
    runtime: 'unknown',
    workers: 1,
    port: 8000,
    entrypoint: '',
    cmd: ''
  };

  if (!content || typeof content !== 'string') {
    result.hasDockerfile = false;
    return result;
  }

  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('FROM')) {
      if (/python/i.test(line)) result.runtime = 'python';
      else if (/node/i.test(line)) result.runtime = 'node';
      else if (/golang|golang/i.test(line)) result.runtime = 'go';
      else if (/rust/i.test(line)) result.runtime = 'rust';
    }

    if (line.startsWith('EXPOSE')) {
      const p = parseInt(line.replace('EXPOSE', '').trim(), 10);
      if (!isNaN(p)) result.port = p;
    }

    if (line.startsWith('CMD') || line.startsWith('ENTRYPOINT')) {
      if (line.includes('--workers') || line.includes('-w ')) {
        const match = line.match(/(?:--workers|-w)\s+([0-9]+)/);
        if (match) result.workers = parseInt(match[1], 10);
      }
      if (line.includes('uvicorn') || line.includes('gunicorn')) {
        result.runtime = 'python';
      }
      result.cmd = line;
    }
  }

  return result;
}
