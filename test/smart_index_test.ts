import { synthesizeSmartIndex } from '../src/core/smart_index';
import { parseSourceCode } from '../src/core/parsers/code';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

console.log('=== Running Smart Composite & Partial Index Tests ===\n');

// Test 1: ESR Rule (Equality -> Sort -> Range) Ordering
{
  const rec = synthesizeSmartIndex({
    table: 'orders',
    fields: [
      { name: 'expires_at', op: 'range' },
      { name: 'created_at', op: 'sort', sort: 'desc' },
      { name: 'account_id', op: 'eq' },
      { name: 'tenant_id', op: 'eq' }
    ],
    dialect: 'postgresql'
  });

  assert(rec.type === 'composite', 'Correctly identified composite index');
  assert(rec.fields[0].name === 'account_id', 'Equality field account_id is ordered first');
  assert(rec.fields[1].name === 'tenant_id', 'Equality field tenant_id is ordered second');
  assert(rec.fields[2].name === 'created_at', 'Sort field created_at is ordered after equality fields');
  assert(rec.fields[2].sort === 'desc', 'Sort direction DESC preserved');
  assert(rec.fields[3].name === 'expires_at', 'Range field expires_at is ordered last');
  assert(rec.sql.includes('ON orders (account_id, tenant_id, created_at DESC, expires_at)'), 'PostgreSQL SQL contains ESR tuple');
  assert(rec.esrOrderExplanation!.includes('ESR Rule Optimization'), 'Explanation describes ESR rule rationale');
  assert(rec.ramFootprintReduction!.includes('work_mem'), 'Footprint reduction notes work_mem protection');
}

// Test 2: Partial Index with Redundant Equality Column Pruning
{
  const rec = synthesizeSmartIndex({
    table: 'claims',
    fields: [
      { name: 'user_id', op: 'eq' },
      { name: 'status', op: 'eq' },
      { name: 'created_at', op: 'sort', sort: 'desc' }
    ],
    partialCondition: "status = 'pending'",
    dialect: 'postgresql'
  });

  assert(rec.type === 'partial', 'Identified as partial index');
  assert(rec.partialCondition === "status = 'pending'", 'Preserved partial condition');
  assert(!rec.fields.some(f => f.name === 'status'), 'Redundant status column omitted from index tuple when covered by partial condition');
  assert(rec.fields[0].name === 'user_id', 'user_id is the primary seek column');
  assert(rec.fields[1].name === 'created_at', 'created_at is the pre-sorted column');
  assert(rec.sql.includes("WHERE status = 'pending'"), 'PostgreSQL SQL includes WHERE predicate');
  assert(rec.sql.includes('CONCURRENTLY IF NOT EXISTS'), 'PostgreSQL SQL specifies CONCURRENTLY');
  assert(rec.ramFootprintReduction!.includes('90%–95%'), 'Calculates 90%-95% RAM savings for partial index');
}

// Test 3: Dialect Differentiation (MySQL vs SQLite vs PostgreSQL)
{
  const mysqlRec = synthesizeSmartIndex({
    table: 'tickets',
    fields: [
      { name: 'event_id', op: 'eq' },
      { name: 'status', op: 'eq' },
      { name: 'created_at', op: 'sort', sort: 'desc' }
    ],
    partialCondition: "status = 'open'",
    dialect: 'mysql'
  });

  // MySQL InnoDB does not support WHERE in standard B-Tree index DDL
  assert(mysqlRec.sql.startsWith('ALTER TABLE `tickets` ADD INDEX'), 'MySQL uses ALTER TABLE syntax');
  assert(mysqlRec.fields.some(f => f.name === 'status'), 'MySQL retains status in composite index tuple');
  assert(!mysqlRec.sql.includes('WHERE'), 'MySQL avoids WHERE in standard ALTER TABLE ADD INDEX');

  const sqliteRec = synthesizeSmartIndex({
    table: 'items',
    fields: [
      { name: 'folder_id', op: 'eq' },
      { name: 'status', op: 'eq' }
    ],
    partialCondition: "status = 'active'",
    dialect: 'sqlite'
  });

  assert(sqliteRec.sql.startsWith('CREATE INDEX IF NOT EXISTS'), 'SQLite uses standard CREATE INDEX syntax');
  assert(sqliteRec.sql.includes("WHERE status = 'active'"), 'SQLite supports partial index WHERE clause');
}

// Test 4: Multi-ORM Migration & Schema Syntax
{
  const rec = synthesizeSmartIndex({
    table: 'messages',
    fields: [
      { name: 'thread_id', op: 'eq' },
      { name: 'created_at', op: 'sort', sort: 'desc' }
    ],
    partialCondition: "status = 'unread'",
    dialect: 'postgresql'
  });

  assert(Boolean(rec.ormFix?.prisma?.includes('@@index([threadId, createdAt(sort: Desc)]')), 'Prisma schema @@index syntax formatted');
  assert(Boolean(rec.ormFix?.laravel?.includes("$table->index(['thread_id', 'created_at']")), 'Laravel migration $table->index formatted');
  assert(Boolean(rec.ormFix?.django?.includes("models.Index(fields=['thread_id', '-created_at']")), 'Django Meta.indexes formatted with desc prefix');
  assert(Boolean(rec.ormFix?.django?.includes("condition=Q(status = 'unread')")), 'Django Meta.indexes contains Q condition for partial index');
  assert(Boolean(rec.ormFix?.rails?.includes("add_index :messages, [:thread_id, :created_at]")), 'Rails add_index formatted');
  assert(Boolean(rec.ormFix?.rails?.includes("algorithm: :concurrently")), 'Rails add_index uses concurrent algorithm');
}

// Test 5: End-to-End Parser AST Extraction
{
  const files = [
    {
      name: 'app/Http/Controllers/OrderController.php',
      content: `
        class OrderController extends Controller {
          public function pendingOrders(Request $request) {
            $orders = Order::where('customer_id', $request->user()->id)
              ->where('status', 'pending')
              ->orderBy('created_at', 'desc')
              ->get();
            return response()->json($orders);
          }
        }
      `
    }
  ];

  const findings = parseSourceCode(files, {
    dialectInfo: { dialect: 'postgresql', autoIndexesForeignKeys: false, notes: '' }
  });

  assert(findings.length > 0, 'Found unindexed query in OrderController');
  const finding = findings.find(f => f.table === 'order' || f.table === 'orders');
  assert(Boolean(finding), 'Identified Order model query');
  assert(Boolean(finding?.smartIndex), 'Synthesized smartIndex recommendation');
  assert(finding?.smartIndex?.type === 'partial', 'Synthesized partial index for status = pending');
  assert(finding?.smartIndex?.partialCondition === "status = 'pending'", 'Extracted partial condition');
  assert(finding?.smartIndex?.fields[0].name === 'customer_id', 'Primary seek column is customer_id');
}

console.log('\nAll Smart Composite & Partial Index tests passed successfully.');
