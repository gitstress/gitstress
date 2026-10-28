import { detectDatabaseDialect, parseDatabaseSchema } from '../src/core/parsers/schema';
import { parseSourceCode } from '../src/core/parsers/code';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

console.log('=== Running Database-Dialect Intelligence Tests ===\n');

// Test 1: Detect PostgreSQL via migration extension
{
  const files = [
    {
      path: 'database/migrations/2026_10_26_000001_enable_postgres_extensions.php',
      content: 'DB::statement("CREATE EXTENSION IF NOT EXISTS citext;");'
    }
  ];
  const dialect = detectDatabaseDialect(files);
  assert(dialect.dialect === 'postgresql', 'Detects PostgreSQL from enable_postgres_extensions.php');
  assert(dialect.autoIndexesForeignKeys === false, 'PostgreSQL correctly marks autoIndexesForeignKeys as false');
}

// Test 2: Detect MySQL via docker-compose
{
  const files = [
    {
      path: 'docker-compose.yml',
      content: 'services:\n  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_DATABASE: test_db'
    }
  ];
  const dialect = detectDatabaseDialect(files);
  assert(dialect.dialect === 'mysql', 'Detects MySQL from docker-compose.yml');
  assert(dialect.autoIndexesForeignKeys === true, 'MySQL correctly marks autoIndexesForeignKeys as true');
}

// Test 3: PostgreSQL foreignId without ->index() remains unindexed
{
  const files = [
    {
      path: 'database/migrations/2026_10_26_000001_enable_postgres_extensions.php',
      content: 'DB::statement("CREATE EXTENSION IF NOT EXISTS citext;");'
    },
    {
      path: 'database/migrations/2026_10_26_000005_create_claims_table.php',
      content: `Schema::create('claims', function (Blueprint $table) {
        $table->id();
        $table->foreignId('user_id')->constrained()->cascadeOnDelete();
        $table->string('status')->index();
      });`
    }
  ];
  const schemaData = parseDatabaseSchema(files);
  assert(schemaData.dialectInfo.dialect === 'postgresql', 'Schema parser carries PostgreSQL dialect');
  assert(!schemaData.indexedFields.has('claims.user_id'), 'claims.user_id is NOT indexed in PostgreSQL');
  assert(schemaData.indexedFields.has('claims.status'), 'claims.status is indexed via explicit ->index()');

  // Now verify code parser flags it with dialect awareness
  const codeFiles = [
    {
      path: 'app/Http/Controllers/ChannelController.php',
      content: `$claims = Claim::where('user_id', $user->id)->get();`
    }
  ];
  const findings = parseSourceCode(codeFiles, schemaData);
  assert(findings.length === 1, 'Flags Claim.where(user_id) as unindexed in PostgreSQL');
  assert(findings[0].dialect === 'postgresql', 'Finding carries dialect: postgresql');
  assert(findings[0].rawWhy.includes('PostgreSQL'), 'Finding rawWhy mentions PostgreSQL foreign key rule');
}

// Test 4: MySQL foreignId is automatically indexed by InnoDB
{
  const files = [
    {
      path: 'docker-compose.yml',
      content: 'services:\n  db:\n    image: mysql:8.0\n'
    },
    {
      path: 'database/migrations/2026_10_26_000005_create_claims_table.php',
      content: `Schema::create('claims', function (Blueprint $table) {
        $table->id();
        $table->foreignId('user_id')->constrained()->cascadeOnDelete();
      });`
    }
  ];
  const schemaData = parseDatabaseSchema(files);
  assert(schemaData.dialectInfo.dialect === 'mysql', 'Schema parser carries MySQL dialect');
  assert(schemaData.indexedFields.has('claims.user_id'), 'claims.user_id IS indexed in MySQL via InnoDB foreign key constraint');

  // Verify code parser does NOT flag Claim.where(user_id) in MySQL
  const codeFiles = [
    {
      path: 'app/Http/Controllers/ChannelController.php',
      content: `$claims = Claim::where('user_id', $user->id)->get();`
    }
  ];
  const findings = parseSourceCode(codeFiles, schemaData);
  assert(findings.length === 0, 'Does NOT falsely flag Claim.where(user_id) in MySQL');
}

console.log('\nAll Database-Dialect Intelligence tests passed successfully!');
