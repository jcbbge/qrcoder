-- First create backup of pages table
CREATE TABLE pages_backup AS SELECT * FROM pages;

-- Verify and log the current state of data
DO $$
DECLARE
    total_rows INTEGER;
    null_arrays INTEGER;
    empty_arrays INTEGER;
    populated_arrays INTEGER;
    sample_record RECORD;
BEGIN
    -- Count total rows
    SELECT COUNT(*) INTO total_rows FROM pages;
    RAISE NOTICE 'Total rows before conversion: %', total_rows;

    -- Count NULL arrays
    SELECT COUNT(*) INTO null_arrays FROM pages WHERE card_ids IS NULL;
    RAISE NOTICE 'Rows with NULL card_ids: %', null_arrays;

    -- Count empty arrays
    SELECT COUNT(*) INTO empty_arrays FROM pages WHERE card_ids = '[]';
    RAISE NOTICE 'Rows with empty arrays: %', empty_arrays;

    -- Count populated arrays
    SELECT COUNT(*) INTO populated_arrays FROM pages WHERE card_ids != '[]' AND card_ids IS NOT NULL;
    RAISE NOTICE 'Rows with populated arrays: %', populated_arrays;

    -- Sample a record for logging
    SELECT * INTO sample_record FROM pages WHERE card_ids != '[]' AND card_ids IS NOT NULL LIMIT 1;
    IF FOUND THEN
        RAISE NOTICE 'Sample record before conversion - ID: %, card_ids: %',
                     sample_record.id,
                     sample_record.card_ids;
    END IF;
END $$;

-- Convert card_ids to ensure proper JSON array format
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

-- Add constraint to ensure JSON array validity
ALTER TABLE pages ADD CONSTRAINT ensure_card_ids_json
  CHECK (card_ids IS NULL OR (card_ids::jsonb IS NOT NULL AND jsonb_typeof(card_ids::jsonb) = 'array'));

-- Verify data integrity after conversion
DO $$
DECLARE
    invalid_rows INTEGER;
    total_rows INTEGER;
    empty_arrays INTEGER;
    populated_arrays INTEGER;
    sample_record RECORD;
BEGIN
    -- Check for invalid data
    SELECT COUNT(*) INTO invalid_rows
    FROM pages
    WHERE card_ids IS NULL
       OR card_ids = ''
       OR card_ids = 'null'
       OR NOT (card_ids::jsonb IS NOT NULL AND jsonb_typeof(card_ids::jsonb) = 'array');

    IF invalid_rows > 0 THEN
        RAISE EXCEPTION 'Data integrity check failed: % rows have invalid card_ids', invalid_rows;
    END IF;

    -- Count total rows after conversion
    SELECT COUNT(*) INTO total_rows FROM pages;
    RAISE NOTICE 'Total rows after conversion: %', total_rows;

    -- Count empty arrays after conversion
    SELECT COUNT(*) INTO empty_arrays
    FROM pages
    WHERE card_ids::jsonb = '[]'::jsonb;
    RAISE NOTICE 'Rows with empty arrays after conversion: %', empty_arrays;

    -- Count populated arrays after conversion
    SELECT COUNT(*) INTO populated_arrays
    FROM pages
    WHERE jsonb_array_length(card_ids::jsonb) > 0;
    RAISE NOTICE 'Rows with populated arrays after conversion: %', populated_arrays;

    -- Log a sample of the conversion
    SELECT * INTO sample_record
    FROM pages
    WHERE jsonb_array_length(card_ids::jsonb) > 0
    LIMIT 1;

    IF FOUND THEN
        RAISE NOTICE 'Sample conversion - Page ID %:', sample_record.id;
        RAISE NOTICE 'Converted card_ids: %', sample_record.card_ids;
    END IF;

    RAISE NOTICE 'Data conversion completed successfully with data integrity verified';
END $$;
