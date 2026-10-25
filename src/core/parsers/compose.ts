/**
 * Docker Compose Parser (TypeScript)
 * Extracts services, database connection limits, pool sizes, and worker configuration.
 */

export interface ComposeParsedData {
  hasCompose: boolean;
  services: string[];
  database: { type: string; serviceName: string } | null;
  cache: { type: string; serviceName: string } | null;
  appServices: string[];
  dbPoolSize: number;
  maxConnections: number;
  workerCount: number;
  rawVariables: Record<string, string>;
}

export function parseDockerCompose(content?: string): ComposeParsedData {
  const result: ComposeParsedData = {
    hasCompose: true,
    services: [],
    database: null,
    cache: null,
    appServices: [],
    dbPoolSize: 10, // default if not overridden
    maxConnections: 100,
    workerCount: 2,
    rawVariables: {}
  };

  if (!content || typeof content !== 'string') {
    result.hasCompose = false;
    return result;
  }

  const lines = content.split('\n');
  let currentService: string | null = null;
  let inEnvironment = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Check service header under services:
    const serviceMatch = rawLine.match(/^ {2}([a-zA-Z0-9_-]+):$/);
    if (serviceMatch && !rawLine.startsWith('version') && !rawLine.startsWith('services')) {
      currentService = serviceMatch[1];
      result.services.push(currentService);
      inEnvironment = false;
    }

    // Detect image or service type
    if (currentService) {
      if (line.includes('postgres') || currentService.includes('postgres') || currentService === 'db') {
        result.database = {
          type: 'postgres',
          serviceName: currentService
        };
      } else if (line.includes('redis') || currentService.includes('redis')) {
        result.cache = {
          type: 'redis',
          serviceName: currentService
        };
      } else if (currentService.includes('web') || currentService.includes('api') || currentService.includes('app') || currentService.includes('server')) {
        if (!result.appServices.includes(currentService)) {
          result.appServices.push(currentService);
        }
      }

      // Check environment variables
      if (line.startsWith('environment:')) {
        inEnvironment = true;
        continue;
      }

      if (inEnvironment) {
        if (line.startsWith('- ') || line.includes(':') || line.includes('=')) {
          const clean = line.replace(/^- /, '');
          const parts = clean.split(/[=:]/);
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/['"]/g, '');
            result.rawVariables[key] = val;

            // Extract pool / connection parameters
            if (/POSTGRES_MAX_CONNECTIONS|MAX_CONNECTIONS/i.test(key)) {
              const num = parseInt(val, 10);
              if (!isNaN(num)) result.maxConnections = num;
            }
            if (/DB_POOL_SIZE|POOL_SIZE|DATABASE_POOL_SIZE|SQLALCHEMY_POOL_SIZE/i.test(key)) {
              const num = parseInt(val, 10);
              if (!isNaN(num)) result.dbPoolSize = num;
            }
            if (/WORKERS|WEB_CONCURRENCY|UVICORN_WORKERS|GUNICORN_WORKERS/i.test(key)) {
              const num = parseInt(val, 10);
              if (!isNaN(num)) result.workerCount = num;
            }
          }
        } else if (!rawLine.startsWith('    ') && !rawLine.startsWith('\t')) {
          inEnvironment = false;
        }
      }

      // Check command flags (e.g. uvicorn --workers 4)
      if (line.includes('--workers') || line.includes('-w ')) {
        const workerMatch = line.match(/(?:--workers|-w)\s+(\d+)/);
        if (workerMatch) {
          result.workerCount = parseInt(workerMatch[1], 10);
        }
      }
    }
  }

  // Fallback defaults
  if (result.appServices.length === 0 && result.services.length > 0) {
    result.appServices.push(result.services[0]);
  }

  return result;
}
