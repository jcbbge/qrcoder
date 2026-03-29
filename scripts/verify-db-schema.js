import 'dotenv/config';
import { query as dbQuery } from './lib/neon-script-client.js';

async function main() {
  console.log('\n🔍 Verifying Database Schema...\n');

  try {
    // 1. Check product_cards table
    console.log('📦 PRODUCT_CARDS TABLE:');
    console.log('====================');
    const productCardsSchema = await dbQuery(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'product_cards'
      ORDER BY ordinal_position;
    `);
    console.log(productCardsSchema.rows);

    // 2. Check pages table
    console.log('\n📄 PAGES TABLE:');
    console.log('====================');
    const pagesSchema = await dbQuery(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'pages'
      ORDER BY ordinal_position;
    `);
    console.log(pagesSchema.rows);

    // 3. Check queues table
    console.log('\n🔄 QUEUES TABLE:');
    console.log('====================');
    const queuesSchema = await dbQuery(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'queues'
      ORDER BY ordinal_position;
    `);
    console.log(queuesSchema.rows);

    // 4. Check table constraints
    console.log('\n🔒 TABLE CONSTRAINTS:');
    console.log('====================');
    const constraints = await dbQuery(`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
             kcu.column_name, cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name IN ('product_cards', 'pages', 'queues')
      ORDER BY tc.table_name, tc.constraint_name;
    `);
    console.log(constraints.rows);

  } catch (error) {
    console.error('Error verifying schema:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1].endsWith('verify-db-schema.js')) {
  main();
}
