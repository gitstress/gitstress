/**
 * Smart Composite & Partial Index Generator
 *
 * Synthesizes query-tuned B-Tree indexes adhering to the database ESR Rule
 * (Equality -> Sort -> Range) and partial/filtered index conditions to eliminate
 * both in-memory sort spills and buffer pool bloat under concurrent load.
 */

import type { SmartIndexRecommendation } from './types';
export type { SmartIndexRecommendation };

export interface IndexFieldInput {
  name: string;
  op: 'eq' | 'range' | 'sort';
  sort?: 'asc' | 'desc';
}

export interface SmartIndexInput {
  table: string;
  fields: IndexFieldInput[];
  partialCondition?: string;
  dialect?: 'postgresql' | 'mysql' | 'sqlite' | 'generic';
  modelName?: string;
}

/**
 * Normalizes field names (camelCase <-> snake_case)
 */
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Synthesizes optimal composite and partial indexes based on query filter and sort patterns.
 */
export function synthesizeSmartIndex(input: SmartIndexInput): SmartIndexRecommendation {
  const {
    table,
    fields,
    partialCondition,
    dialect = 'postgresql',
    modelName = table
  } = input;

  const cleanTable = table.replace(/["`]/g, '').toLowerCase();

  // Deduplicate fields preserving first occurrence
  const seen = new Set<string>();
  const uniqueFields: IndexFieldInput[] = [];
  for (const f of fields) {
    const key = f.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFields.push(f);
    }
  }

  // Database Indexing ESR Rule: Equality -> Sort -> Range
  const eqFields = uniqueFields.filter(f => f.op === 'eq');
  const sortFields = uniqueFields.filter(f => f.op === 'sort');
  const rangeFields = uniqueFields.filter(f => f.op === 'range');

  // If a field is part of a partial index condition (e.g. status = 'pending'),
  // it is redundant to include it in the indexed columns for PostgreSQL/SQLite partial indexes.
  const isPartial = Boolean(partialCondition && partialCondition.trim().length > 0 && dialect !== 'mysql');
  
  const filteredEqFields = isPartial
    ? eqFields.filter(f => !partialCondition!.toLowerCase().includes(f.name.toLowerCase()))
    : eqFields;

  // Ordered fields: Equality first, Sort second, Range third
  const orderedFields: IndexFieldInput[] = [
    ...(filteredEqFields.length > 0 ? filteredEqFields : eqFields.slice(0, 1)),
    ...sortFields,
    ...rangeFields
  ];

  // If ordering left no fields (e.g. only partial field), keep at least one field
  if (orderedFields.length === 0 && uniqueFields.length > 0) {
    orderedFields.push(uniqueFields[0]);
  }

  const indexType: 'composite' | 'partial' | 'single' = isPartial
    ? 'partial'
    : orderedFields.length > 1
      ? 'composite'
      : 'single';

  // Construct index column specifications
  const sqlColDefs: string[] = [];
  const colNamesForId: string[] = [];
  const prismaFieldDefs: string[] = [];
  const laravelFieldDefs: string[] = [];
  const djangoFieldDefs: string[] = [];
  const railsFieldDefs: string[] = [];

  for (const f of orderedFields) {
    const colName = toSnakeCase(f.name);
    colNamesForId.push(colName);

    if (f.op === 'sort' && f.sort === 'desc') {
      sqlColDefs.push(`${colName} DESC`);
      prismaFieldDefs.push(`${toCamelCase(f.name)}(sort: Desc)`);
      laravelFieldDefs.push(`'${colName}'`);
      djangoFieldDefs.push(`'-${colName}'`);
      railsFieldDefs.push(`:${colName}`);
    } else {
      sqlColDefs.push(colName);
      prismaFieldDefs.push(toCamelCase(f.name));
      laravelFieldDefs.push(`'${colName}'`);
      djangoFieldDefs.push(`'${colName}'`);
      railsFieldDefs.push(`:${colName}`);
    }
  }

  // Construct standard index name (capped at 60 chars to respect DB identifier limits)
  const baseName = `idx_${cleanTable}_${colNamesForId.join('_')}${isPartial ? '_partial' : ''}`;
  const indexName = baseName.length > 60 ? baseName.slice(0, 60) : baseName;

  // Construct SQL Remediation
  let sql = '';
  if (dialect === 'mysql') {
    // MySQL InnoDB syntax
    sql = `ALTER TABLE \`${cleanTable}\` ADD INDEX \`${indexName}\` (${sqlColDefs.join(', ')});`;
  } else if (dialect === 'sqlite') {
    // SQLite syntax
    sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${cleanTable} (${sqlColDefs.join(', ')})${isPartial ? ` WHERE ${partialCondition}` : ''};`;
  } else {
    // PostgreSQL syntax (default)
    sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON ${cleanTable} (${sqlColDefs.join(', ')})${isPartial ? ` WHERE ${partialCondition}` : ''};`;
  }

  // Construct ORM migration/schema fixes
  const ormFix = {
    prisma: `// In schema.prisma:\n@@index([${prismaFieldDefs.join(', ')}], map: "${indexName}")`,
    laravel: `// In database migration:\n$table->index([${laravelFieldDefs.join(', ')}], '${indexName}');`,
    django: `// In models.py Meta.indexes:\nmodels.Index(fields=[${djangoFieldDefs.join(', ')}], name='${indexName}'${isPartial ? `, condition=Q(${partialCondition})` : ''})`,
    rails: `// In Rails db/migrate:\nadd_index :${cleanTable}, [${railsFieldDefs.join(', ')}], name: '${indexName}', algorithm: :concurrently`
  };

  // Construct ESR Explanation
  let esrExplanation = '';
  if (indexType === 'composite') {
    const parts: string[] = [];
    if (eqFields.length > 0) parts.push(`Equality (${eqFields.map(f => f.name).join(', ')})`);
    if (sortFields.length > 0) parts.push(`Sort (${sortFields.map(f => `${f.name} ${f.sort || 'asc'}`.toUpperCase()).join(', ')})`);
    if (rangeFields.length > 0) parts.push(`Range (${rangeFields.map(f => f.name).join(', ')})`);
    esrExplanation = `ESR Rule Optimization: ${parts.join(' -> ')}. Positions equality filters first to narrow index seek, then orders pre-sorted rows to eliminate in-memory sort spills under concurrency.`;
  } else if (indexType === 'partial') {
    esrExplanation = `Partial Index Optimization: Restricts B-Tree entries strictly to rows satisfying '${partialCondition}'. Reduces index write overhead on updates and keeps hot tuples cached in RAM.`;
  } else {
    esrExplanation = `Covering B-Tree Index: Replaces sequential table scan with direct logarithmic index seek (O(log N)).`;
  }

  // Memory footprint impact
  const ramFootprintReduction = isPartial
    ? 'Estimated 90%–95% smaller RAM buffer footprint by indexing only active rows'
    : indexType === 'composite'
      ? 'Eliminates secondary sort step (Sort: 0ms) and prevents work_mem exhaustion across concurrent connections'
      : 'Eliminates sequential page cache thrashing';

  const reason = isPartial
    ? `Filtered partial index targeting '${partialCondition}' eliminates table scan on ${cleanTable} with 90%+ RAM savings`
    : indexType === 'composite'
      ? `Multi-column ESR composite index eliminates both table scan and sort overhead on ${cleanTable} (${sqlColDefs.join(', ')})`
      : `Single-column B-Tree index on ${cleanTable} (${sqlColDefs.join(', ')}) eliminates full table scan`;

  return {
    type: indexType,
    table: cleanTable,
    fields: orderedFields,
    partialCondition: isPartial ? partialCondition : undefined,
    reason,
    sql,
    ormFix,
    ramFootprintReduction,
    esrOrderExplanation: esrExplanation
  };
}
