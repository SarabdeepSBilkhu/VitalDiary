# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-10-06

### Added
- **Admin Dashboard**: New `AdminDashboard.tsx` component and `/api/admin` route giving admin-role accounts platform-wide user management and audit log inspection.
- **`.env.example`**: Added template environment file documenting all required and optional variables (`PORT`, `JWT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL`, `UPSTASH_*`, `GROQ_API_KEY`).
- **`docs/security-design.md`**: New section documenting Account Deletion & GDPR Right-to-Erasure compliance (`ON DELETE CASCADE` across all tables).

### Changed
- **README**: Full rewrite — accurate project structure, all routes/services/middleware listed, updated DB schema table (added `role`, `audit_log`, `caregiver_patients`), complete API reference, and environment variable docs.
- **`.gitignore`**: Expanded to cover `coverage/`, `.nyc_output/`, OS/editor files (`.DS_Store`, `.vscode/`, `.idea/`), `*.tsbuildinfo`, `.vite/`, and `@xenova/transformers` model cache.
- **`docs/user-testing.md`**: Removed placeholder text; added Caregiver Flow test section and a structured resolution plan table.
- **`docs/security-design.md`**: Removed draft/capstone framing; updated encryption section to reference `ENCRYPTION_KEY` env var explicitly.

---

## [2.0.0] - 2026-09-15

### Added
- **Caregiver Telehealth Portal & Consent System**: Caregivers can invite patients via email. Patients receive an in-app notification and must explicitly approve the access request before health data is shared. Approved caregivers can switch patient context via the `X-Patient-Id` header mechanism.
- **Upstash Redis Caching**: Implemented `@upstash/redis` to cache read-heavy analytics and dashboard endpoints. Writes automatically invalidate the user's cache namespace, yielding a ~73% p95 latency reduction on dashboard queries.
- **Clinical Reference Range Bands**: Analytics charts now render dynamic background bands showing physiological normal ranges (Blood Pressure, Heart Rate, SpO₂).
- **Intelligent Fuzzy-Matching for Medical Reports**: Keyword extraction engine strips noise words (e.g., "count", "level", "serum") from unstructured report parameters, enabling reference bands to render correctly across 40+ lab name variations.
- **Medication Reminders Engine**: `node-cron` scans the database multiple times daily and dispatches automated medication reminders.
- **Full Containerization**: Multi-stage `Dockerfile` and `docker-compose.yml` bundling the React client, Express server, and PostgreSQL.
- **AI Evaluation Suite**: Formalized 18-point RAG validation matrix (`docs/ai_evaluation.md`) ensuring Llama 3.3 adheres to medical safety guardrails.
- **Comprehensive Backup & Restore**: JSON backup expanded to include Profile (name, age, emergency contacts) and Medication records alongside health logs.
- **XLSX Export**: Records can be exported to spreadsheet format via `xlsx-js-style`.
- **CSV Import**: Bulk import of historical vital sign data from wearable device exports via `csv-parse`.
- **Audit Logging**: `auditLog` middleware logs all write operations (`user_id`, `route`, `action`, `ip`, `timestamp`) to a dedicated `audit_log` table.
- **AES-256-GCM Encryption at Rest**: Sensitive fields (`allergies`, `emergency_contact`, report `data`) encrypted before writing to the database via `services/encryption.js`.
- **Automated Weekly AI Summaries**: `services/weeklySummary.js` cron job aggregates weekly health data and generates readable summaries via Groq.
- **Performance Benchmarks**: `docs/performance_benchmarks.md` documenting p95 latency before/after Redis caching.

### Changed
- Refactored `Analytics.tsx` to display parameter trends in a glassmorphic modal overlay instead of a static page section.
- Rewrote `reportUtils.ts` to support both JSON array structures and legacy unstructured text formats simultaneously.
- Switched chart data lines to `fill: false` / `backgroundColor: transparent` to prevent overlap with normal-range bands.
- Upgraded database connection pool to transparently retry on cold-start Railway/Docker wakeups.

### Fixed
- Fixed UI bug where the Caregiver Panel modal was invisible due to a missing CSS active class.
- Fixed session leak where logging out of a caregiver account did not clear the in-memory `activePatientId`, causing the "Viewing Patient" indicator to persist into the next session.
- Fixed race condition where the JSON backup file was generated before asynchronously fetching the latest medication records, resulting in incomplete exports.
- Fixed account deletion to use `ON DELETE CASCADE` across all PostgreSQL tables for full GDPR compliance.

---

## [1.0.0] - 2026-08-01

### Added
- User authentication (JWT + bcrypt).
- Vital signs tracking (BP, HR, SpO₂, Weight, Glucose).
- Local-embedding AI health assistant (`@xenova/transformers` + `sqlite-vec`).
- PDF export functionality via `jsPDF`.
- Interactive dashboard and profile management.
- React 19 + Vite + Express foundation with SQLite.