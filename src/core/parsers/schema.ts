/**
 * Database Schema Parser (TypeScript)
 * Identifies models, columns, existing indexes, and missing index vulnerabilities.
 */

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
}

export function parseDatabaseSchema(fileList: Array<{ name?: string; path?: string; content?: string }>): SchemaParsedData {
  const result: SchemaParsedData = {
    models: {},
    unindexedFields: [],
    indexedFields: new Set<string>(),
    rawSchemasFound: []
  };

  for (const file of fileList) {
    const filename = file.name || file.path || '';
    const content = file.content || '';

    if (filename.endsWith('.prisma') || filename.includes('schema.prisma')) {
      parsePrismaSchema(content, result, filename);
    } else if (filename.endsWith('.sql') || filename.includes('migration')) {
      parseSqlSchema(content, result, filename);
    } else if (filename.endsWith('models.py') || filename.endsWith('models.ts')) {
      parseOrmModels(content, result, filename);
    }
  }

  return result;
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
