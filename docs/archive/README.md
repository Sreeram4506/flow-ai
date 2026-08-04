# Archived documentation

These files documented getting the original demo build running locally. They
overlapped heavily with each other and have been superseded by the root
[`README.md`](../../README.md).

They're kept for reference rather than deleted, but treat them as **stale**:

- Several reference `http://localhost:4000` for the frontend. The correct port
  is **3001** (see `frontend/package.json`). The 4000 references were the cause
  of a CORS failure on a fresh setup.
- They document a `fileUrl`-based document "upload" that no longer exists — the
  API now takes real multipart file uploads.
- They contain demo account passwords (`Admin@123` and similar). Those belong
  to the local seed script only. **Never seed them into a deployed
  environment**, and rotate them if they were ever reused anywhere real.

For current setup instructions, architecture, testing and deployment, use the
root README. For known gaps, see `PRODUCTION_READINESS.md` and
`USABILITY_NOTES.md`.
