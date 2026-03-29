import { query } from './lib/neon-script-client.js';

async function checkSamples() {
  try {
    // Check oldest records
    console.log('Checking oldest records:');
    const oldestResult = await query(`
      SELECT id, card_ids
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
      ORDER BY created_at ASC
      LIMIT 3;
    `);
    console.log(oldestResult.rows);

    // Check newest records
    console.log('\nChecking newest records:');
    const newestResult = await query(`
      SELECT id, card_ids
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
      ORDER BY created_at DESC
      LIMIT 3;
    `);
    console.log(newestResult.rows);

    // Check records with longest arrays
    console.log('\nChecking records with longest arrays:');
    const longestResult = await query(`
      SELECT id, card_ids, jsonb_array_length(card_ids::jsonb) as array_length
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
      ORDER BY jsonb_array_length(card_ids::jsonb) DESC
      LIMIT 3;
    `);
    console.log(longestResult.rows);

    // Verify all records are valid JSON arrays
    console.log('\nVerifying all records are valid JSON arrays:');
    const invalidResult = await query(`
      SELECT COUNT(*) as invalid_count
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
        AND NOT (
          card_ids::jsonb IS NOT NULL
          AND jsonb_typeof(card_ids::jsonb) = 'array'
          AND card_ids LIKE '[%]'
        );
    `);
    console.log('Invalid records found:', invalidResult.rows[0].invalid_count);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSamples();
