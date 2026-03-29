# Today Page & Global Sync Log Feed - Product Requirements Document (PRD)

## 1. Executive Summary

The Today page provides a global, real-time view of all sync operations and queue/page activity across all vendors for the current day. It is designed for live event operations, enabling non-technical users to monitor, verify, and trigger syncs with maximum transparency and zero disruption to existing workflows.

---

## 2. Goals & Intended Purpose
- **Add a Today page (`today.html`) as a copy of the current index.html.**
- **Remove vendor select from today.html; auto-initialize with all data for the day.**
- **Add a reusable sync log UI component to both today.html (global feed) and index.html (vendor feed).**
- **Prominently display a 'Sync All' button at the top of today.html.**
- **Show all sync logs for the day (midnight to now), grouped by time, with full details/messages shown by default.**
- **All changes are additive, isolated, and must not disrupt the current production app.**

---

## 3. Features & Requirements

### A. Today Page (`today.html`)
- **Boilerplate:** Copy of index.html for layout/UI consistency.
- **Vendor select:** Removed; page auto-loads all data for the day.
- **Sync Log Feed:**
  - Reusable component at the top of the page.
  - Shows all sync logs for all vendors for the current day (midnight to now), queried from the `sync_logs` table.
  - Displays data from columns like `vendor_name`, `run_at`, `status`, `summary`, and the content within `details` (jsonb).
  - Logs are grouped by time (based on `run_at`).
- **Sync All Button:**
  - Prominent at the top, grouped with the sync log UI.
  - Runs the node sync script for all vendors.
- **Queues, Pages, Preview:**
  - Reuse existing UI/components from index.html.
  - No changes to queue/page/preview logic for now.
- **No vendor filtering for now.**
- **No pagination; all logs for the day are shown with scroll.**

### B. Vendor Page (`index.html`)
- **Sync Log Feed:**
  - Add the same reusable sync log UI component.
  - Shows sync logs for the selected vendor for the current day, queried from `sync_logs` table where `vendor_name` matches.
  - Displays `run_at`, `status`, `summary`, and `details` content.
- **No changes to existing vendor select, queue, page, or preview UI.**
- **All changes are additive and isolated.**

### C. Sync Log UI Component
- **Reusable across both pages.**
- **Displays logs grouped by time (using `run_at`), showing `vendor_name` (on Today page), `status`, `summary`, and the formatted content from the `details` (jsonb) field by default.**
- **No auto-refresh for now; users can scroll to see new logs.**

### D. Sync Logic & Data
- **CRITICAL: SCRIPT DUPLICATION REQUIRED.** The sync logic invoked by the web application (both single-vendor and sync-all) MUST use a **duplicated and adapted** version of the production CLI script (`scripts/sync-vendor-pages.js`). Create a new file (e.g., `scripts/sync-vendor-pages-webapp.js`).
- **DO NOT MODIFY** the original `scripts/sync-vendor-pages.js` file. It must remain untouched for CLI use.
- The **core sync logic** in the new file must be **identical** to the original.
- Modifications in the new file (`...-webapp.js`) are limited to adapting for web server invocation, removing console/file logging, and adding logging exclusively to the `sync_logs` database table.
- **Uses the `sync_logs` table as defined in `docs/DATABASE.md` (Neon source of truth).**
- **The adapted sync script populates all relevant `sync_logs` columns (`vendor_name`, `run_at`, `status`, `summary`, `details`, `created_by`, `duration_ms`) per vendor per run.**
- **UI fetches logs for the day (using `run_at >= midnight`) and displays them.**
- **Interface Definition:**
  - The adapted script (`scripts/sync-vendor-pages-webapp.js`) MUST export an async function: `async function runSync(options)`.
  - `options` is an object: `{ vendorName: string | null, triggeredBy: string }`. `vendorName` is the target vendor or `null`/`'all'` for full sync. `triggeredBy` identifies the source (e.g., `'manual_sync_user_X'`, `'today_sync_all'`).
  - **Return:** The function MUST return a Promise resolving on completion (even if partial failures occurred and were logged to DB). Reject *only* on catastrophic failure preventing DB logging.
- **Logging Translation (Script Output -> `sync_logs` Row):**
  - **Overall:** One `sync_logs` entry per vendor per run.
  - **`status` (text, not null):** Set at end: 'SUCCESS' (no errors), 'FAILURE' (critical errors prevented completion), 'PARTIAL' (some item-level errors occurred).
  - **`summary` (text, nullable):** Generated at end: Concise counts.
  - **`details` (jsonb, not null):** Structured JSON object (per schema in `manual-sync-feature.md` Section B/4) capturing key operational messages and item-level errors. Omit verbose logs.
  - **`run_at` (timestamptz):** Set at the *end* of the sync operation.
  - **`duration_ms` (integer):** Calculated: `end_time - start_time`.
  - **`created_by` (text):** Populated directly from `options.triggeredBy`.
  - **`vendor_name` (text, not null):** Populated from `options.vendorName` (or iterated vendor in 'all' case).
- **DB Client:** Use existing `scripts/lib/neon-script-client.js` if possible.

### E. Implementation & Safety
- **All new work is done in feature branches.**
- **No changes to existing index.html or components until fully tested and approved.**
- **Manual QA after each step.**
- **No disruption to current production workflows.**
- **Reference:** See `docs/safe-incremental-feature-delivery.md` for process.

---

## 4. UI/UX
- **Sync Log Feed:**
  - At the top of today.html and index.html.
  - Grouped by time, showing relevant fields (`vendor_name` on global, `run_at`, `status`, `summary`) and formatted `details` content.
  - Example data displayed might come from:
    - `run_at`: Formatted timestamp.
    - `vendor_name`: e.g., "Emily Merritt"
    - `status`: e.g., "SUCCESS" / "PARTIAL" / "FAILURE"
    - `summary`: e.g., "6 new products, 1 new page"
    - `details`: Formatted messages extracted from the **structured JSONB data** (e.g., "INFO: Created product: T4...", "ERROR: Failed page update...") according to the schema defined in `manual-sync-feature.md`.
- **Sync All Button:**
  - Prominent, grouped with sync log feed.
- **No changes to queue/page/preview UI for now.**

---

## 5. Out of Scope
- No changes to the underlying Neon DB schema beyond `sync_logs`.
- No additional business logic or validation.
- No error surfacing to end users (for now).
- No auto-refresh/live updates for now.
- No vendor filtering or pagination for now.

---

## 6. Next Steps
- Create feature branch for today.html and sync log UI.
- Build and test sync log UI in isolation.
- Add to today.html and test with live data.
- After QA, add to index.html (vendor page) as a new section.
- Merge only after full manual QA and sign-off.

---

## 7. References
- [Manual Sync Feature Spec](./manual-sync-feature.md)
- [Safe Incremental Feature Delivery Plan](./safe-incremental-feature-delivery.md)
