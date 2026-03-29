# Safe, Incremental Feature Delivery in Production

## Guiding Principles
- **No disruption to current production app.**
- **All new features are additive, not refactors.**
- **Work in small, testable, and reviewable increments.**
- **Use feature branches and frequent, descriptive commits.**
- **Manual QA after each step before merging.**
- **Only merge to main when 100% confident in stability.**

---

## Step-by-Step Plan

### 1. Foundation: Isolate All New Work
- **Create a new feature branch** for each major step (e.g., `feature/today-sync-log-ui`).
- **Copy, don't refactor:**
  - Any new UI (e.g., today.html, sync_log component) is a copy or new file, not a change to existing files.
- **No changes to index.html or existing components** until new features are fully tested and approved.

### 2. Backend: Ensure Sync Log Data is Ready
- [x] **sync_logs table** is already in place and being written by the sync script.
- [x] **Sync script** is writing detailed, user-friendly log messages.
- [ ] **(Optional)**: Add a read-only API endpoint to fetch sync logs for today (all vendors or by vendor).
  - This can be a simple endpoint, e.g., `/api/sync-logs?date=YYYY-MM-DD&vendor=...`

### 3. Frontend: Build the Sync Log UI in Isolation
- **Create a new reusable sync_log component** (e.g., `SyncLogFeed.js`).
- **Create today.html** as a copy of index.html, but:
  - Remove vendor select.
  - Add the new sync_log UI at the top.
  - Add a "Sync All" button at the top.
  - Wire up the sync_log UI to fetch and display all logs for today.
- **Add the sync_log UI to a test/dev copy of index.html** (e.g., `index-synclog-test.html`), but **do not touch the production index.html**.

### 4. Manual QA and Review
- **Test today.html and the new sync_log UI** in isolation.
- **Verify**:
  - Sync logs display correctly for all vendors (today.html) and per vendor (test index.html).
  - Manual sync buttons work and logs appear as expected.
  - No impact on current production index.html or workflows.

### 5. Gradual Integration
- **After full QA and sign-off:**
  - Merge today.html and the new sync_log component to main.
  - Optionally, after further QA, add the sync_log UI to the real index.html (with a feature flag or behind a config toggle for instant rollback if needed).

### 6. Ongoing
- **Continue to work in small, isolated branches.**
- **Never refactor or touch existing production code unless absolutely necessary, and only after full QA.**
- **Document every change and test thoroughly.**

---

## Recommendations
- **Err on the side of duplication over refactoring** for now—copy-paste is safer than "improving" shared code in a live event context.
- **Use feature flags or config toggles** for any new UI that might eventually touch production pages.
- **Keep all new features "opt-in" until you're 100% confident.**
- **Communicate with your team** about the incremental rollout plan and the importance of not touching production code.
- **Automate as much QA as possible, but always do manual checks before merging.**

---

## Example Feature Branches
- `feature/today-sync-log-ui`
- `feature/sync-log-api-endpoint`
- `feature/vendor-sync-log-ui`
- `feature/manual-sync-button-today`
- `feature/manual-sync-button-vendor`

---

## Summary
- **Additive, not refactor.**
- **Isolated, not shared.**
- **Small, not big.**
- **Manual QA, not just automated.**
- **Never break production.**

## Appendix A: Pre-Commit Database Interaction Checklist (MANDATORY)

**Purpose:** Prevent schema mismatch errors before committing code, especially for hotfixes or changes touching database interaction logic (e.g., in adapted scripts like `sync-vendor-pages-webapp.js`).

**Checklist (Perform BEFORE `git commit`):**

1.  **Verify Live Schema (`psql \d`):**
    *   For **every table** the changed code reads from or writes to (`product_cards`, `pages`, `queues`, `sync_logs`, etc.):
    *   Run `psql '<CONNECTION_STRING>' -c '\d <table_name>' | cat` against the **target database** (staging for testing, production for final merge prep).
    *   Confirm the exact column names, types, and constraints.

2.  **Side-by-Side Code Review (Original vs. Adapted Script, if applicable):**
    *   If adapting an existing script (like `sync-vendor-pages.js` -> `sync-vendor-pages-webapp.js`), perform a meticulous diff.
    *   Compare **every SQL query** (SELECT, INSERT, UPDATE).
    *   Compare **every line accessing database results** (`result.rows[0].<property>`).
    *   Ensure column names in SQL **exactly match** the `psql \d` output from Step 1.
    *   Ensure property access (`.<property>`) **exactly matches** the column names confirmed in Step 1.

3.  **Cross-Reference `DATABASE.md`:**
    *   Check the column names used in the code against the schemas documented in `docs/DATABASE.md`.
    *   If `DATABASE.md` is inaccurate compared to the `psql \d` output from Step 1, **IMMEDIATELY UPDATE `DATABASE.md`** to reflect the live schema after verifying the code matches the live schema.

4.  **Confirm Testing Plan Adherence:**
    *   Ensure the planned tests (API, Manual QA, Regression) outlined in Appendix B (formerly A) cover the changes made.
    *   Testing in a non-production environment using this checklist is the final verification step.

**Failure to perform this check risks production stability.**

## Appendix B: Detailed Testing Plan for Manual Sync & Today Page

(Formerly Appendix A) This section outlines specific test requirements for the manual sync, logging, and Today page features. Testing MUST be performed in a dedicated non-production environment connected to a non-production database.

### 1. Environment Setup
- Dedicated Staging/Development environment.
- Non-production Neon database instance, potentially seeded with realistic (but non-production) data.
- Feature branch deployed to this environment.

### 2. Adapted Script Direct Invocation Tests (Optional but Recommended)
*(Requires ability to run the exported function from a test harness)*
- Invoke `runSync({ vendorName: 'EXISTING_VENDOR', triggeredBy: 'test_harness' })` -> Verify `sync_logs` entry created with correct `vendor_name`, `status` (SUCCESS), `created_by`, and populated `details` (counts/messages).
- Invoke `runSync({ vendorName: null, triggeredBy: 'test_harness' })` -> Verify multiple `sync_logs` entries created (one per vendor) with correct details.
- Invoke `runSync({ vendorName: 'NON_EXISTENT_VENDOR', triggeredBy: 'test_harness' })` -> Verify expected outcome (e.g., FAILURE log entry, specific error message in details).
- *Simulate internal errors* within a test copy of the script (e.g., force Shopify API error) -> Invoke -> Verify `sync_logs` entry has `status`='PARTIAL'/'FAILURE' and error message in `details.messages`.

### 3. API Integration Tests (Mandatory)
*(Using curl, Postman, or equivalent)*
- **Trigger Sync:**
  - `POST /api/sync/trigger/{validVendorName}` -> Expect HTTP 200/202 Accepted. Verify `sync_logs` entry later (via DB check or GET logs API).
  - `POST /api/sync/trigger/all` -> Expect HTTP 200/202 Accepted. Verify multiple `sync_logs` entries later.
  - `POST /api/sync/trigger/{invalidVendorName}` -> Expect HTTP 400/404/500 (as appropriate). Verify specific error logged if applicable.
  - *Simulate script failure* -> `POST /api/sync/trigger/...` -> Expect HTTP 500. Verify appropriate `sync_logs` entry (status=FAILURE).
- **Fetch Logs:**
  - `GET /api/sync/logs/{validVendorName}` -> Expect HTTP 200 OK. Verify response contains logs only for that vendor, ordered by `run_at DESC`, matching expected `details` JSON structure.
  - `GET /api/sync/logs/all` -> Expect HTTP 200 OK. Verify response contains logs for all vendors, ordered by `run_at DESC`.
  - `GET /api/sync/logs/{vendorWithNoLogs}` -> Expect HTTP 200 OK with empty array/list.
  - `GET /api/sync/logs/{invalidVendorName}` -> Expect HTTP 400/404.

### 4. Manual QA Checklist (Browser - Mandatory)
- **`index.html` (Vendor Page):**
  - Load page, select vendor.
  - Verify log component loads (initially empty or shows previous logs).
  - Click "Sync Vendor".
    - Verify button enters disabled/loading state.
    - Verify sync completes (button re-enabled).
    - Verify new log entry appears at the top of the log UI.
    - Verify entry shows correct `vendor_name` (implicitly), `run_at` (recent), `status`, `summary`.
    - Expand details -> Verify messages extracted from `details.messages` are accurate and readable.
  - Test with vendor known to cause partial failures (if available) -> Verify `status`=PARTIAL/FAILURE and error shown in details.
- **`today.html` (Today Page):**
  - Load page.
  - Verify log component loads showing logs for *all* vendors today, grouped by time.
  - Verify `vendor_name` is displayed for each entry.
  - Click "Sync All Vendors".
    - Verify button enters disabled/loading state.
    - Verify sync completes (button re-enabled).
    - Verify new log entries appear for *all* synced vendors.
    - Verify details for each new entry.
- **General:**
  - Verify timestamp (`run_at`) formatting and time grouping are logical.
  - Verify UI handles empty `details.messages` gracefully.
  - Verify page remains responsive during sync (async operation).

### 5. Regression Test (Mandatory)
- Execute the *original* `scripts/sync-vendor-pages.js` from the CLI with a vendor flag.
- Verify it completes successfully using its *original* console/file logging.
- **CRITICAL:** Verify it **DOES NOT** create any new entries in the `sync_logs` database table.
