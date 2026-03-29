# Manual Vendor Sync & Sync Log Feed

## Overview
Empower users to manually trigger a vendor sync from the application UI, and provide a clear, auditable, and user-friendly log of all sync operations for transparency and troubleshooting.

---

## User Stories
- **As a user**, I want to manually sync a vendor's products, so I can ensure the latest data is in the system.
- **As a user**, I want to see a clear, chronological feed of what was created or updated during a sync, so I can verify the system is working as expected.
- **As an admin/developer**, I want a persistent audit trail of all sync operations, so I can debug or review system activity.

---

## Features & Requirements

### A. Manual Sync Button
- Located on the Vendor select page.
- When clicked, triggers a sync for the selected vendor (using the exact logic as the CLI sync script).
- Button is disabled and shows a loading state while sync is running.

### B. Sync Log Feed
- After each sync, a new record is written to the `sync_logs` table.
- Each sync log record MUST populate the following columns, matching the Neon schema:
  - `vendor_name` (text, not null): The vendor synced.
  - `run_at` (timestamp with time zone, nullable, default now()): Timestamp when the sync *finished*.
  - `status` (text, not null): Overall status (e.g., 'SUCCESS', 'FAILURE', 'PARTIAL', 'STARTED'). Initial implementation might just use 'SUCCESS' or 'FAILURE'.
  - `summary` (text, nullable): Concise summary (e.g., "6 new products, 0 updated, 1 new pages, 1 new queues").
  - `details` (jsonb, not null): **Structured JSON containing detailed results.**
    - **Required Structure:**
      ```json
      {
        "counts": {
          "products_created": 0,
          "products_updated": 0,
          "products_failed": 0,
          "pages_created": 0,
          "pages_updated": 0,
          "pages_failed": 0,
          "queues_created": 0,
          "queues_updated": 0,
          "queues_failed": 0
        },
        "messages": [
          // Array of key events and errors encountered during the sync
          // { "timestamp": "ISO8601_string", "level": "info|warn|error", "message": "Human-readable message", "entityId": "optional_product/page/queue_id", "entityType": "product|page|queue|general" }
        ]
      }
      ```
    - **Example (Success):** `{"counts": {"products_created": 5, ...}, "messages": [{"timestamp": "...", "level": "info", "message": "Created product: XYZ", "entityId": 123, "entityType": "product"}, ...]}`
    - **Example (Partial Failure):** `{"counts": {"products_created": 4, "products_failed": 1, ...}, "messages": [..., {"timestamp": "...", "level": "error", "message": "Failed to create product ABC: Invalid data", "entityId": null, "entityType": "product"}, ...]}`
    - The exact structure needs definition during implementation but MUST be valid JSONB.
- The UI displays the sync log feed below the sync button:
  - Shows the most recent syncs for the selected vendor.
  - Each log is expandable to show all operation messages.
  - Optionally, a global feed can show all vendors' syncs.

### C. Database Schema
- Uses the `sync_logs` table as defined in `docs/DATABASE.md`.
- **Neon is the source of truth.** The table structure (columns, types, nullability) MUST NOT deviate from the schema documented in `docs/DATABASE.md`, which reflects the live database.
- The `details` column is JSONB and must store valid JSON. Its internal structure should be consistently applied by the sync script.

### D. Sync Logic
- **CRITICAL: DO NOT MODIFY THE ORIGINAL SCRIPT.** The logic for the web application's manual sync MUST be implemented by **duplicating** the existing, production CLI script (`scripts/sync-vendor-pages.js`) into a new file (e.g., `scripts/sync-vendor-pages-webapp.js`).
- The **core synchronization logic** within this new file must remain **identical** to the battle-tested original.
- Modifications in the new file (`...-webapp.js`) are limited to:
    - Adapting it for invocation from the web server (e.g., as a function export).
    - Removing all console/file logging.
    - Adding logging exclusively to the `sync_logs` database table (populating all relevant columns).
- The original `scripts/sync-vendor-pages.js` MUST remain untouched to ensure the stability of existing CLI operations.
- This duplicated script (`...-webapp.js`) will handle both single-vendor syncs (triggered from the vendor page) and sync-all operations (triggered from the Today page).
- **Interface Definition:**
  - The adapted script (`scripts/sync-vendor-pages-webapp.js`) MUST export an async function: `async function runSync(options)`.
  - `options` is an object: `{ vendorName: string | null, triggeredBy: string }`. `vendorName` is the target vendor or `null`/`'all'` for full sync. `triggeredBy` identifies the source (e.g., `'manual_sync_user_X'`, `'today_sync_all'`).
  - **Return:** The function MUST return a Promise resolving on completion (even if partial failures occurred and were logged to DB). Reject *only* on catastrophic failure preventing DB logging (e.g., DB connection impossible).
- **Logging Translation (Script Output -> `sync_logs` Row):**
  - **Overall:** One `sync_logs` entry per vendor per run.
  - **`status` (text, not null):** Set at end: 'SUCCESS' (no errors), 'FAILURE' (critical errors prevented completion), 'PARTIAL' (some item-level errors occurred).
  - **`summary` (text, nullable):** Generated at end: Concise counts (e.g., "6 new products, 0 updated, 1 new pages, 1 new queues").
  - **`details` (jsonb, not null):** Structured JSON object (Schema defined in Section B/4) capturing key operational messages and item-level errors previously logged to console/file. Omit verbose/debug messages.
  - **`run_at` (timestamptz):** Set at the *end* of the sync operation.
  - **`duration_ms` (integer):** Calculated: `end_time - start_time`.
  - **`created_by` (text):** Populated directly from `options.triggeredBy`.
  - **`vendor_name` (text, not null):** Populated from `options.vendorName` (or iterated vendor in 'all' case).
- **DB Client:** The adapted script (`...-webapp.js`) SHOULD use the existing `scripts/lib/neon-script-client.js` via direct import for all database write operations to `sync_logs`, assuming it functions correctly when called from the web server context.

### E. Error Handling
- Errors are not shown to users (assume sync is always successful for UI/UX).
- All errors are logged for developer review.

### F. Security
- No authentication required for manual sync (for now).

---

## UI/UX
- **Sync Button:** "Sync Vendor Products" button on Vendor select page.
- **Sync Log Feed:**
  - List of recent syncs for the selected vendor.
  - Each entry shows timestamp, status, summary, and expandable details/messages.
  - Example log message (UI display derived from `sync_logs` fields, including parsing `details`):
    - Timestamp (`run_at`)
    - Status (`status`)
    - Summary (`summary`)
    - Details (`details.messages` formatted for display):
      - "INFO: Created product: T4 inperson && commision (Shopify ID: 8377655492758, Price: 8000.0)"
      - "INFO: Created page: Emily Merritt_20250502153137 (ID: 1340)"
      - "ERROR: Failed to update queue XYZ: Timeout"

---

## Technical Notes
- The sync script now writes a sync log per vendor, with all operation messages.
- The UI queries `sync_logs` by `vendor_name` for the feed.
- The system is fully auditable and user-friendly.

---

## Implementation Note: Neon Client Scope
- **Script Adaptation:** As noted in Section D, the web-triggered sync will use a *duplicated and adapted* version of the CLI script (`sync-vendor-pages.js`) and potentially its client (`scripts/lib/neon-script-client.js`) if needed. **The original files must not be altered.**
- **Current implementation uses the node script neon client** for all sync operations and DB writes.
- This is a deliberate, scoped decision for this feature.
- All sync logic, DB access, and logging are performed using the same client and code as the CLI script, ensuring exact parity and no code drift.
- Any future migration to the application's API layer or a shared DB client will be a separate, explicitly scoped project.

---

## Out of Scope
- No changes to the underlying Neon DB schema beyond `sync_logs`.
- No additional business logic or validation.
- No error surfacing to end users (for now).

---

## Next Steps
- Implement or update the UI to display the sync log feed.
- Optionally, add a global sync log feed for all vendors.
- Continue to test and refine log message clarity as needed.
