/**
 * Database Schema Parser & Dialect Engine (TypeScript)
 * Identifies database engine dialect, models, columns, existing indexes,
 * and dialect-specific missing index vulnerabilities.
 */

export type DatabaseDialect = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'generic';

export interface DialectInfo {
  dialect: DatabaseDialect;
  sourceFile?: string;
  autoIndexesForeignKeys: boolean; // MySQL InnoDB = true, PostgreSQL = false, SQLite = false
  notes: string;
}

export interface UnindexedField {
  model: string;
  field: string;
  type: string;
  file: string;
  reason: string;
}

export interface SchemaParsedData {
  models: Record<string, { fields: any[]; indexed: string[] }>;
  unindexedFields: UnindexedField[];
  indexedFields: Set<string>;
  rawSchemasFound: Array<{ file: string; type: string }>;
  dialectInfo: DialectInfo;
}

/**
 * Detect underlying database dialect from repository configuration,
 * docker-compose manifests, prisma datasources, or migration files.
 */
export function detectDatabaseDialect(fileList: Array<{ name?: string; path?: string; content?: string }>): DialectInfo {
  for (const file of fileList) {
    const filename = (file.name || file.path || '').toLowerCase();
    const content = (file.content || '').toLowerCase();

    // 1. Prisma schema datasource provider
    if (filename.endsWith('.prisma') || filename.includes('schema.prisma')) {
      if (content.includes('provider = "postgresql"') || content.includes("provider = 'postgresql'")) {
        return {
          dialect: 'postgresql',
          sourceFile: filename,
          autoIndexesForeignKeys: false,
          notes: 'PostgreSQL: Foreign key constraints do NOT automatically create B-Tree indexes. Explicit @@index is required.'
        };
      }
      if (content.includes('provider = "mysql"') || content.includes("provider = 'mysql'")) {
        return {
          dialect: 'mysql',
          sourceFile: filename,
          autoIndexesForeignKeys: true,
          notes: 'MySQL (InnoDB): Foreign key constraints automatically construct and maintain a B-Tree index.'
        };
      }
      if (content.includes('provider = "sqlite"') || content.includes("provider = 'sqlite'")) {
        return {
          dialect: 'sqlite',
          sourceFile: filename,
          autoIndexesForeignKeys: false,
          notes: 'SQLite: Foreign keys do NOT automatically create indexes.'
        };
      }
    }

    // 2. Docker Compose / Dockerfile DB images & env vars
    if (filename.includes('docker-compose') || filename.includes('compose.yml') || filename.includes('compose.yaml')) {
      if (content.includes('image: postgres') || content.includes('image: timescale') || content.includes('postgres_db') || content.includes('postgresql://')) {
        return {
          dialect: 'postgresql',
          sourceFile: filename,
          autoIndexesForeignKeys: false,
          notes: 'PostgreSQL: Detected via container service. Foreign key constraints do NOT automatically create B-Tree indexes.'
        };
      }
      if (content.includes('image: mysql') || content.includes('image: mariadb') || content.includes('mysql_database') || content.includes('mysql://')) {
        return {
          dialect: 'mysql',
          sourceFile: filename,
          autoIndexesForeignKeys: true,
          notes: 'MySQL (InnoDB): Foreign key constraints automatically construct and maintain a B-Tree index.'
        };
      }
    }

    // 3. PostgreSQL extension migration (e.g. enable_postgres_extensions.php in buildr)
    if (filename.includes('postgres') || content.includes('enable_postgres') || content.includes('create extension if not exists')) {
      return {
        dialect: 'postgresql',
        sourceFile: filename,
        autoIndexesForeignKeys: false,
        notes: 'PostgreSQL: Extensions detected in migrations. Foreign key constraints do NOT automatically create B-Tree indexes.'
      };
    }

    // 4. Rails database.yml or Gemfile
    if (filename.includes('database.yml')) {
      if (content.includes('adapter: postgresql') || content.includes('adapter: postgis')) {
        return {
          dialect: 'postgresql',
          sourceFile: filename,
          autoIndexesForeignKeys: false,
          notes: 'PostgreSQL (ActiveRecord): Foreign keys do NOT automatically create indexes in PostgreSQL without explicit index.'
        };
      }
      if (content.includes('adapter: mysql') || content.includes('adapter: mysql2')) {
        return {
          dialect: 'mysql',
          sourceFile: filename,
          autoIndexesForeignKeys: true,
          notes: 'MySQL (ActiveRecord): InnoDB maintains internal indexes for foreign keys.'
        };
      }
    }

    // 5. Django settings.py
    if (filename.endsWith('settings.py') || filename.includes('settings/')) {
      if (content.includes('django.db.backends.postgresql')) {
        return {
          dialect: 'postgresql',
          sourceFile: filename,
          autoIndexesForeignKeys: false,
          notes: 'PostgreSQL (Django): Foreign keys without explicit db_index or compound indexes trigger sequential scans.'
        };
      }
      if (content.includes('django.db.backends.mysql')) {
        return {
          dialect: 'mysql',
          sourceFile: filename,
          autoIndexesForeignKeys: true,
          notes: 'MySQL (Django): InnoDB automatically creates indexes for foreign keys.'
        };
      }
    }

    // 6. Laravel config/database.php or .env.example
    if (filename.includes('config/database.php') || filename.includes('.env.example')) {
      if (content.includes("db_connection', 'pgsql'") || content.includes('db_connection=pgsql')) {
        return {
          dialect: 'postgresql',
          sourceFile: filename,
          autoIndexesForeignKeys: false,
          notes: 'PostgreSQL (Laravel): Foreign keys ($table->foreignId) do NOT automatically build indexes.'
        };
      }
      if (content.includes("db_connection', 'mysql'") || content.includes('db_connection=mysql')) {
        return {
          dialect: 'mysql',
          sourceFile: filename,
          autoIndexesForeignKeys: true,
          notes: 'MySQL (Laravel): InnoDB automatically maintains indexes for foreign key constraints.'
        };
      }
    }
  }

  // Default fallback
  return {
    dialect: 'generic',
    autoIndexesForeignKeys: false,
    notes: 'Generic SQL: Treating unindexed foreign keys as potential table scan risks.'
  };
}

export function parseDatabaseSchema(fileList: Array<{ name?: string; path?: string; content?: string }>): SchemaParsedData {
  const dialectInfo = detectDatabaseDialect(fileList);

  const result: SchemaParsedData = {
    models: {},
    unindexedFields: [],
    indexedFields: new Set<string>(),
    rawSchemasFound: [],
    dialectInfo
  };

  for (const file of fileList) {
    const filename = file.name || file.path || '';
    const content = file.content || '';

    if (filename.endsWith('.prisma') || filename.includes('schema.prisma')) {
      parsePrismaSchema(content, result, filename);
    } else if (filename.endsWith('.php') && (filename.includes('migration') || content.includes('Schema::create'))) {
      parseLaravelMigration(content, result, filename);
    } else if (filename.endsWith('schema.rb') || (filename.endsWith('.rb') && content.includes('create_table'))) {
      parseRailsSchema(content, result, filename);
    } else if (filename.endsWith('.sql') || filename.includes('migration')) {
      parseSqlSchema(content, result, filename);
    } else if (filename.endsWith('models.py') || filename.endsWith('models.ts')) {
      parseOrmModels(content, result, filename);
    }
  }

  return result;
}

export function parseRailsSchema(content: string, result: SchemaParsedData, filename: string): void {
  result.rawSchemasFound.push({ file: filename, type: 'rails-schema' });

  // create_table "table_name", ... do |t| ... end
  const tableRegex = /create_table\s+['"]([a-zA-Z0-9_]+)['"][^d]*\s+do\s+\|t\|([\s\S]*?)end/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const table = match[1];
    const body = match[2];
    const lines = body.split('\n');

    const fields: any[] = [];
    const indexed = new Set<string>();

    // Pass 1: explicit index declarations: t.index ["col"] or t.index ["col1", "col2"]
    const idxRegex = /t\.index\s+\[([^\]]+)\]/g;
    let idxMatch;
    while ((idxMatch = idxRegex.exec(body)) !== null) {
      idxMatch[1].split(',').forEach(col => {
        const clean = col.replace(/['"\s:]/g, '');
        if (clean) {
          indexed.add(clean);
          result.indexedFields.add(`${table}.${clean}`);
        }
      });
    }

    // Pass 2: column definitions: t.string "email", t.bigint "user_id"
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('t.index')) continue;

      const colMatch = line.match(/t\.(?:string|text|integer|bigint|datetime|boolean|json|uuid)\s+['"]([a-zA-Z0-9_]+)['"]/);
      if (colMatch) {
        const colName = colMatch[1];
        const isIndexed = indexed.has(colName);

        fields.push({
          name: colName,
          type: 'Column',
          isIndexed
        });

        const isCommonLookup = /^(?:user_id|account_id|status|email|slug|tenant_id|token)$/i.test(colName);
        if (isCommonLookup && !isIndexed) {
          result.unindexedFields.push({
            model: table,
            field: colName,
            type: 'Column',
            file: filename,
            reason: `Column '${colName}' on table '${table}' has no index in db/schema.rb`
          });
        }
      }
    }

    result.models[table] = { fields, indexed: Array.from(indexed) };
  }
}

export function parseLaravelMigration(content: string, result: SchemaParsedData, filename: string): void {
  result.rawSchemasFound.push({ file: filename, type: 'laravel-migration' });

  // Schema::create('table_name', function (Blueprint $table) { ... })
  const schemaRegex = /Schema::create\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\);/g;
  let match;
  while ((match = schemaRegex.exec(content)) !== null) {
    const table = match[1];
    const body = match[2];
    const lines = body.split('\n');

    const fields: any[] = [];
    const indexed = new Set<string>();

    // Pass 1: explicit multi-column or single-column indexes: $table->index('col'), $table->index(['col1', 'col2'])
    const explicitIdxRegex = /\$table->index\s*\(\s*(?:['"]([a-zA-Z0-9_]+)['"]|\[([^\]]+)\])\s*\)/g;
    let idxMatch;
    while ((idxMatch = explicitIdxRegex.exec(body)) !== null) {
      if (idxMatch[1]) {
        indexed.add(idxMatch[1]);
        result.indexedFields.add(`${table}.${idxMatch[1]}`);
      } else if (idxMatch[2]) {
        idxMatch[2].split(',').forEach(col => {
          const clean = col.replace(/['"\s]/g, '');
          if (clean) {
            indexed.add(clean);
            result.indexedFields.add(`${table}.${clean}`);
          }
        });
      }
    }

    // Pass 2: Column definitions with inline constraints: $table->string('slug')->unique();
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

      const colMatch = line.match(/\$table->(?:string|text|integer|unsignedInteger|bigInteger|unsignedBigInteger|foreignId|boolean|timestamp|enum|char)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/);
      if (colMatch) {
        const colName = colMatch[1];
        const hasChainIndex = line.includes('->index(') || line.includes('->index()');
        const hasChainUnique = line.includes('->unique(') || line.includes('->unique()') || line.includes('->primary(');
        const isForeignKey = line.includes('foreignId(') || line.includes('->constrained(') || line.includes('->constrained()') || line.includes('->references(');

        // In MySQL (InnoDB), foreign keys are automatically indexed by the storage engine.
        // In PostgreSQL, foreign keys do NOT automatically create an index unless explicitly indexed.
        const isAutoIndexedByDialect = isForeignKey && result.dialectInfo?.autoIndexesForeignKeys;

        if (hasChainIndex || hasChainUnique || isAutoIndexedByDialect) {
          indexed.add(colName);
          result.indexedFields.add(`${table}.${colName}`);
        }

        fields.push({
          name: colName,
          type: 'Column',
          isUnique: hasChainUnique,
          isIndexed: indexed.has(colName) || hasChainIndex || isAutoIndexedByDialect
        });

        // Common high-traffic lookup / filter keys that degrade under concurrency if unindexed
        const isCommonLookup = /^(?:user_id|creator_id|channel_id|post_id|status|scrape_status|type|subscribers|category|slug|code|token)$/i.test(colName);
        if (isCommonLookup && !indexed.has(colName) && !hasChainUnique) {
          const dialectReason = result.dialectInfo?.dialect === 'postgresql' && isForeignKey
            ? `Column '${colName}' on table '${table}' has foreign key constraint in PostgreSQL without an explicit B-Tree index (unlike MySQL, Postgres does not auto-index foreign keys)`
            : `Column '${colName}' on table '${table}' lacks an index, creating table scan queues under concurrent load`;

          result.unindexedFields.push({
            model: table,
            field: colName,
            type: 'Column',
            file: filename,
            reason: dialectReason
          });
        }
      }
    }

    result.models[table] = { fields, indexed: Array.from(indexed) };
  }
}

function parsePrismaSchema(content: string, result: SchemaParsedData, filename: string): void {
  result.rawSchemasFound.push({ file: filename, type: 'prisma' });
  const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const body = match[2];
    const fields: any[] = [];
    const indexed = new Set<string>();

    const modelIndexRegex = /@@index\(\[([^\]]+)\]\)/g;
    let idxMatch;
    while ((idxMatch = modelIndexRegex.exec(body)) !== null) {
      idxMatch[1].split(',').forEach(col => indexed.add(col.trim()));
    }

    const lines = body.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const fieldName = parts[0];
        const fieldType = parts[1];
        const isUnique = line.includes('@unique') || line.includes('@id');
        const hasDirectIndex = line.includes('@index');

        if (isUnique || hasDirectIndex) {
          indexed.add(fieldName);
          result.indexedFields.add(`${modelName}.${fieldName}`);
        }

        fields.push({
          name: fieldName,
          type: fieldType,
          isUnique,
          isIndexed: indexed.has(fieldName)
        });

        const isCommonLookup = /email|username|tenant_id|user_id|status|slug|token|created_at/i.test(fieldName);
        if (isCommonLookup && !indexed.has(fieldName) && !isUnique) {
          result.unindexedFields.push({
            model: modelName,
            field: fieldName,
            type: fieldType,
            file: filename,
            reason: `Field '${fieldName}' is a frequent lookup key but lacks an index on model '${modelName}'`
          });
        }
      }
    }

    result.models[modelName] = { fields, indexed: Array.from(indexed) };
  }
}

function parseSqlSchema(content: string, result: SchemaParsedData, filename: string): void {
  result.rawSchemasFound.push({ file: filename, type: 'sql' });

  const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?[a-zA-Z0-9_]+\s+ON\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)/gi;
  let idxMatch;
  while ((idxMatch = indexRegex.exec(content)) !== null) {
    const table = idxMatch[1];
    const columns = idxMatch[2].split(',').map(c => c.trim().replace(/['"`]/g, ''));
    columns.forEach(col => {
      result.indexedFields.add(`${table}.${col}`);
    });
  }

  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let tblMatch;
  while ((tblMatch = tableRegex.exec(content)) !== null) {
    const tableName = tblMatch[1];
    const body = tblMatch[2];
    const lines = body.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim().toLowerCase();
      if (!line || line.startsWith('--') || line.startsWith('primary key') || line.startsWith('constraint')) continue;

      const colMatch = line.match(/^([a-z0-9_]+)\s+([a-z0-9_()]+)/);
      if (colMatch) {
        const colName = colMatch[1];
        const hasInlineUnique = line.includes('unique') || line.includes('primary key');

        if (hasInlineUnique) {
          result.indexedFields.add(`${tableName}.${colName}`);
        } else if (/email|username|tenant_id|user_id|status|slug/i.test(colName)) {
          if (!result.indexedFields.has(`${tableName}.${colName}`)) {
            result.unindexedFields.push({
              model: tableName,
              field: colName,
              type: colMatch[2],
              file: filename,
              reason: `Column '${colName}' in '${tableName}' has no index in SQL migrations`
            });
          }
        }
      }
    }
  }
}

function parseOrmModels(content: string, result: SchemaParsedData, filename: string): void {
  result.rawSchemasFound.push({ file: filename, type: 'orm' });

  const classRegex = /class\s+([A-Za-z0-9_]+)\s*(?:\([^)]*\))?:/g;
  let clsMatch;
  while ((clsMatch = classRegex.exec(content)) !== null) {
    const model = clsMatch[1];
    if (model.toLowerCase() === 'base') continue;

    const colRegex = /([a-zA-Z0-9_]+)\s*=\s*Column\(([^)]+)\)/g;
    let colMatch;
    while ((colMatch = colRegex.exec(content)) !== null) {
      const col = colMatch[1];
      const args = colMatch[2];
      const hasIndex = args.includes('index=True') || args.includes('primary_key=True') || args.includes('unique=True');

      if (hasIndex) {
        result.indexedFields.add(`${model}.${col}`);
      } else if (/email|username|tenant_id|user_id|status/i.test(col)) {
        result.unindexedFields.push({
          model,
          field: col,
          type: 'Column',
          file: filename,
          reason: `Column '${col}' in SQLAlchemy model '${model}' is missing index=True`
        });
      }
    }
  }
}
