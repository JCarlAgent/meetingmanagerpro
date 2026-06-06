**Stable Mailings — Phase 1**

Purpose
-
- **Purpose:** Create a stable checkpoint for the mailing-list import pipeline after implementing a unified post-processing flow for purchased-list imports.

Major Architectural Changes
-
- **Centralized Postprocess Helper:** Added a shared server-side helper to consolidate recipient upsert, mailings ledger insertion, `campaign_mailed_list_records.recipient_id` linkage, and `job_mailing_lists` creation.
- **Unified Import Paths:** Both the chunked `CampaignCard` importer and the storage-based ingest handler now call the same postprocess helper.
- **Defensive Parsing:** Client-provided chunk metadata is coerced to numeric types to avoid missed final-chunk detection.
- **Diagnostics Cleanup:** Temporary instrumentation used during debugging has been removed.

Tables Involved
-
- **campaign_mailed_list_records:** imported rows for each mailed recipient.
- **recipients:** deduped via address fingerprint; upserted by the helper.
- **mailings:** ledger rows created for each resolved recipient.
- **job_mailing_lists:** per-job mailed-list summary row (created/updated automatically).
- **jobs, responders:** referenced by the import flow and helper logic.

Import Workflow — Before vs After
-
- **Before:**
  - Chunked UI flow (`CampaignCard`) wrote `campaign_mailed_list_records` rows but did not reliably create `recipients`, `mailings`, or link `recipient_id`.
  - A separate storage-based ingest path maintained its own (duplicate) logic for recipients and mailings.
- **After:**
  - Both import paths call the same `mailedListPostprocess` helper which:
    - computes an address fingerprint, upserts `recipients` (deduped on `org_id,fingerprint`),
    - inserts `mailings` ledger rows for the resolved recipients,
    - updates `campaign_mailed_list_records.recipient_id` in batches,
    - creates/updates `job_mailing_lists` and sets `row_count`.

Validation Performed
-
- **Build & Types:** `npm run build` and `npx tsc --noEmit` — succeeded.
- **Functional Test (UI):** Live chunked import (3-row test) via `CampaignCard` confirmed recipients upserted, `mailings` created, `recipient_id` populated, and `job_mailing_lists` row present.
- **Duplication Test:** Duplicate recipient scenario validated — recipients deduped by fingerprint; mailings ledger created appropriately.
- **Code Review:** Temporary instrumentation removed and relevant commits pushed.

Known Limitations
-
- **Idempotency Guard:** No explicit `processed_at` or similar flag on `job_mailing_lists` to prevent double-processing if the helper runs twice; recommended for next phase.
- **Large Imports:** Very large lists may hit performance limits; consider moving heavy work to a background worker or batching strategy beyond the current upsert/insert batching.
- **Other Importers:** TeleDirect and other non-purchased importers were not modified; review if they should share the same helper.
- **RLS & Permissions:** No schema or RLS changes were made; assume admin/server role usage remains required for the helper.

Recommended Next Phase
-
- **Add Idempotency:** Add a `processed_at` or `processed_hash` guard on `job_mailing_lists` to prevent accidental duplicate mailings on re-run.
- **Background Processing:** For very large lists, implement an async worker and progress tracking to avoid serverless timeouts and improve observability.
- **Automated Tests:** Add integration tests (small-list and large-list) to exercise both chunked and storage-based import paths against a test DB.
- **Extend Coverage:** Apply the helper to other importers (TeleDirect) where appropriate to ensure consistent behavior.

Notes
-
- Tag: `stable-mailings-phase-1` created and pushed as a stable checkpoint for this milestone.
