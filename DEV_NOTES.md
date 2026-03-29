# Developer Notes

## Shopify ID Formats

### Current State (as of May 2025)
The database contains product records with two different Shopify ID formats:

1. GID Format: `gid://shopify/Product/8388549017750`
2. Numeric Format: `8388549017750`

This appears to be the result of a batch import that created duplicate records. Analysis shows:
- ~5,200 pairs of duplicate records
- Same product data, just different ID format
- Frontend handles both formats correctly
- Pages reference both formats (even mixed within the same page)
- Both formats are actively used in production

### Decision
After analysis (see `scripts/analyze-product-duplicates.js`), we decided to:
1. Leave the duplicate records as-is since:
   - Frontend already handles both formats
   - Pages are working with both formats
   - Risk of breaking > benefit of fixing
2. Ensure sync script always uses GID format for new records
3. Document this for future reference

### Technical Details
- Product cards table has `shopify_id` as TEXT
- Pages store product card IDs as JSON array in `card_ids` column
- Frontend extracts numeric ID when needed by stripping GID prefix
- Sync script uses GID format for all new/updated records
