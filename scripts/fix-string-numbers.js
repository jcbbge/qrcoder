import { query } from './lib/neon-script-client.js';

async function fixStringNumbers() {
  try {
    // Show some samples before
    console.log('Sample records before fix:');
    const beforeResult = await query(`
      SELECT id, card_ids
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
      ORDER BY id ASC
      LIMIT 3;
    `);
    console.log(beforeResult.rows);

    // Convert ALL string numbers to actual numbers
    console.log('\nConverting string numbers to actual numbers...');
    await query(`
      UPDATE pages
      SET card_ids = (
        SELECT json_agg(elem::text::integer)::text
        FROM json_array_elements_text(card_ids::json) elem
      )
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]';
    `);
    console.log('✓ Conversion complete');

    // Show samples after
    console.log('\nSample records after fix:');
    const afterResult = await query(`
      SELECT id, card_ids
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
      ORDER BY id ASC
      LIMIT 3;
    `);
    console.log(afterResult.rows);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixStringNumbers();
