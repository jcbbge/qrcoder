import { query } from './lib/neon-script-client.js';

async function fixCardIds() {
  try {
    // 1. First check current schema
    console.log('Checking current schema...');
    const schemaResult = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'pages' AND column_name = 'card_ids';
    `);
    console.log('Current card_ids column:', schemaResult.rows[0]);

    // 2. Check current data format
    console.log('\nChecking current data format...');
    const sampleResult = await query(`
      SELECT id, card_ids
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
      LIMIT 3;
    `);
    console.log('Sample records:', sampleResult.rows);

    // 3. Run the reversion migration
    console.log('\nRunning reversion fix...');

    // Create backup
    await query('CREATE TABLE IF NOT EXISTS pages_backup_fix AS SELECT * FROM pages;');
    console.log('✓ Backup created');

    // Fix the data format
    await query(`
      UPDATE pages
      SET card_ids = CASE
          WHEN card_ids IS NULL OR card_ids = '' THEN '[]'
          WHEN card_ids LIKE '{%}' THEN
              -- Convert Postgres array format to JSON array
              replace(
                  replace(
                      replace(card_ids, '{', '['),
                      '}', ']'
                  ),
                  '"', ''
              )
          ELSE card_ids
      END;
    `);
    console.log('✓ Data format fixed');

    // Add constraint
    await query(`
      ALTER TABLE pages DROP CONSTRAINT IF EXISTS ensure_card_ids_json;
      ALTER TABLE pages ADD CONSTRAINT ensure_card_ids_json
        CHECK (card_ids IS NULL OR (card_ids::jsonb IS NOT NULL AND jsonb_typeof(card_ids::jsonb) = 'array'));
    `);
    console.log('✓ Constraint added');

    // Verify fix
    console.log('\nVerifying fix...');
    const verifyResult = await query(`
      SELECT id, card_ids
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
      LIMIT 3;
    `);
    console.log('Fixed records:', verifyResult.rows);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixCardIds();
