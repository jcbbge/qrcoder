-- Generate 100 test pages
WITH RECURSIVE numbers AS (
  SELECT 1 as n
  UNION ALL
  SELECT n + 1 FROM numbers WHERE n < 100
),
page_data AS (
  SELECT
    n,
    floor(random() * 10 + 1)::int as card_count,
    CASE WHEN n <= 50
      THEN NOW() - (random() * interval '7 days')
      ELSE NULL
    END as downloaded_at
  FROM numbers
)
INSERT INTO pages (
  name,
  type,
  status,
  card_ids,
  custom_data,
  metrics,
  downloaded_at,
  created_at,
  updated_at
)
SELECT
  'Test Page ' || n as name,
  'auto' as type,
  'ready' as status,
  (
    SELECT json_agg(id)
    FROM generate_series(((n-1) * 10 + 1), ((n-1) * 10 + card_count)) as id
  ) as card_ids,
  '{}' as custom_data,
  json_build_object(
    'totalScans', 0,
    'printCount', 0,
    'downloadCount', CASE WHEN downloaded_at IS NOT NULL THEN 1 ELSE 0 END
  ) as metrics,
  downloaded_at,
  NOW() as created_at,
  NOW() as updated_at
FROM page_data;
