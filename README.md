# VitalDiary

VitalDiary is a full-stack personal health tracking platform that enables users to securely record, monitor, and analyze key health metrics over time. It combines health logging, analytics, reporting, and historical record management within a modern web application.

## Features

### Secure User Accounts
- User registration and login
- JWT-based authentication
- Password hashing using bcrypt

### Vital Signs Tracking
- Systolic & diastolic blood pressure
- Heart rate
- Blood oxygen saturation (SpO₂)

### Blood Glucose Monitoring
- Fasting, pre-meal, and post-meal readings

### Weight Tracking
- Log measurements and monitor long-term trends

### User Profile Management
- Demographics (age, gender, height)
- Blood group, allergies, emergency contacts

### Medication Tracking & Reminders
- Active medication list with Morning / Afternoon / Night / SOS schedules
- Custom dosing instructions
- Automated reminders via background `node-cron` jobs

### Caregiver View (Telehealth Support)
- **RBAC**: Separate dashboards for patients, caregivers, and admins
- **Consent System**: Caregivers invite patients via email; patients must explicitly approve before data is shared
- **Patient Switching**: Caregivers switch context via the `X-Patient-Id` header
- **Read-only access** to comprehensive patient health data

### Admin Dashboard
- Platform-wide user management and oversight
- Audit log inspection
- Restricted to accounts with `role = 'admin'`

### Medical Reports
- Blood test, urine test, and custom reports
- AES-256-GCM encrypted report data at rest

### Analytics & Visualization
- Interactive charts with dynamic clinical reference bands (normal physiological ranges)
- Intelligent fuzzy-matching for unstructured medical report parameters
- Calendar-based record navigation and dashboard summaries

### Security & Compliance (HIPAA/GDPR Principles)
- **RBAC** via JWTs with roles: `patient`, `caregiver`, `admin`
- **Encryption at Rest**: AES-256-GCM on sensitive fields (allergies, emergency contacts, report data)
- **Audit Logging**: All write operations logged to a dedicated `audit_log` table
- **Rate Limiting**: Brute-force protection on `/api/auth`; cost protection on `/api/ai`
- **Input Validation**: Strict physiological bounds via Zod schemas

### AI Health Assistant
- **RAG-Powered Chat**: Local `@xenova/transformers` embeddings + `sqlite-vec` retrieves semantically similar logs, injected into Groq (Llama 3.3) context
- **Trend Detection**: Real-time identification of hypertension stages, tachycardia, bradycardia
- **Automated Weekly Summaries**: `node-cron` generates AI-written weekly health summaries

### Reporting, Export & Import
- CSV bulk import from wearable devices
- XLSX spreadsheet export
- PDF health report generation
- Full JSON backup and restore (logs, medications, profile)

---

## Technology Stack

### Frontend
| Library | Purpose |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite | Build tool & dev server |
| Chart.js + react-chartjs-2 | Health charts |
| Lucide React | Icons |
| jsPDF | PDF export |
| xlsx-js-style | XLSX export |

### Backend
| Library | Purpose |
|---|---|
| Node.js ≥ 20.19.0 | Runtime |
| Express.js | REST API |
| better-sqlite3 | SQLite / vector store |
| pg | PostgreSQL |
| @upstash/redis | Caching layer |
| jsonwebtoken + bcryptjs | Auth |
| zod | Schema validation |
| express-rate-limit | Rate limiting |
| node-cron | Background jobs |
| multer + csv-parse | File upload & CSV import |
| @xenova/transformers | Local embeddings |
| sqlite-vec | Vector similarity search |

### Infrastructure
| Tool | Purpose |
|---|---|
| Docker + docker-compose | Containerization |
| GitHub Actions | CI |
| Jest + Supertest | API testing |

---

## Architecture

```
Client (React/Vite)
        │  REST API (JSON)
        ▼
Express Server (Node.js)
  ├── Rate Limiter
  ├── JWT Auth Middleware
  └── Zod Validation
        │
        ├── GET  → Upstash Redis (cache) → PostgreSQL/SQLite
        ├── POST/PUT/DELETE → PostgreSQL/SQLite + invalidate cache
        │                         └── @xenova/transformers → sqlite-vec
        └── /api/ai  → embed prompt → sqlite-vec top-K → Groq (Llama 3.3)
```

See [docs/architecture.md](docs/architecture.md) for the full Mermaid flow diagram.

---

## Role-Based Dashboard Routing

```
Auth / Role
    │
    ├── admin    → AdminDashboard
    ├── caregiver → CaregiverDashboard → PatientSelector → CaregiverPatientView
    └── patient   → PatientDashboard   → PatientHealthView
```

**`App.tsx` routing logic:**
```tsx
if (user?.role === 'admin')     return <AdminDashboard />;
if (user?.role === 'caregiver') return <CaregiverDashboard />;
return <PatientDashboard />;
```

---

## Project Structure

```
vitaldiary/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── AiAssistant.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── CalendarView.tsx
│   │   │   ├── CaregiverDashboard.tsx
│   │   │   ├── CaregiverPatientView.tsx
│   │   │   ├── LogModal.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Medications.tsx
│   │   │   ├── PatientDashboard.tsx
│   │   │   ├── PatientHealthView.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Toast.tsx
│   │   ├── utils/
│   │   │   ├── api.ts
│   │   │   ├── evaluators.ts
│   │   │   └── reportUtils.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts
│
├── middleware/
│   ├── auth.js          # JWT verification
│   ├── authorize.js     # RBAC enforcement
│   ├── auditLog.js      # Write-op audit logging
│   ├── rateLimiter.js   # Route-level rate limits
│   └── validate.js      # Zod request validation
│
├── routes/
│   ├── admin.js
│   ├── ai.js
│   ├── auth.js
│   ├── caregiver.js
│   ├── glucose.js
│   ├── medications.js
│   ├── profile.js
│   ├── reports.js
│   ├── vitals.js
│   └── weight.js
│
├── schemas/
│   ├── auth.schema.js
│   └── vitals.schema.js
│
├── services/
│   ├── cache.js          # Upstash Redis helpers
│   ├── embedding.js      # Local transformer embeddings
│   ├── encryption.js     # AES-256-GCM encrypt/decrypt
│   ├── reminders.js      # Medication reminder cron jobs
│   ├── vectorStore.js    # sqlite-vec RAG pipeline
│   └── weeklySummary.js  # AI weekly summary cron job
│
├── tests/
│   ├── routes/
│   │   ├── auth.test.js
│   │   └── vitals.test.js
│   ├── latency.js         # Redis benchmark script
│   └── setup.js
│
├── docs/
│   ├── architecture.md
│   ├── ai_evaluation.md
│   ├── performance_benchmarks.md
│   ├── security-design.md
│   └── user-testing.md
│
├── database.js
├── server.js
├── Dockerfile
├── docker-compose.yml
├── jest.config.js
├── package.json
└── .env.example
```

---

## Database Schema

| Table | Key Columns |
|---|---|
| `users` | id, email, password, **role**, created_at |
| `vitals` | id, user_id, timestamp, systolic, diastolic, hr, spo2, notes |
| `glucose` | id, user_id, timestamp, value, context, notes |
| `weight` | id, user_id, timestamp, value, notes |
| `reports` | id, user_id, timestamp, report_type, title, **data (encrypted)**, notes |
| `profiles` | user_id, name, age, gender, blood_group, height, **allergies (enc.)**, **emergency_contact (enc.)**, updated_at |
| `medications` | id, user_id, name, time_of_day, instructions, created_at, updated_at |
| `audit_log` | id, user_id, route, action, ip, timestamp |
| `caregiver_patients` | id, caregiver_id, patient_id, **status** (pending/approved/rejected), created_at |

---

## Requirements

- Node.js ≥ 20.19.0
- npm

---

## Installation

```bash
git clone <repository-url>
cd vitaldiary
npm install        # also installs client deps via postinstall
cp .env.example .env   # fill in your values
```

---

## Environment Variables

```env
PORT=8080
JWT_SECRET=your-secret-key-change-in-production
ENCRYPTION_KEY=your-32-char-hex-key-change-in-production

# PostgreSQL (omit to use SQLite locally)
DATABASE_URL=
DATABASE_PRIVATE_URL=

# Upstash Redis caching (optional)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Groq AI assistant
GROQ_API_KEY=your_groq_api_key
```

---

## Development

```bash
npm run dev      # frontend + backend concurrently
npm run server   # backend only (nodemon)
npm run client   # frontend only (vite)
```

## Production

```bash
npm run build    # build React client
npm start        # serve from Express
```

## Docker

```bash
docker-compose up -d --build
# Available at http://localhost:8080
```

## Testing

```bash
npm test
```

---

## API Reference

| Route | Description |
|---|---|
| `POST /api/auth/register` | Register new account |
| `POST /api/auth/login` | Login, receive JWT |
| `GET/POST/PUT/DELETE /api/vitals` | Vital signs CRUD |
| `GET /api/vitals/trends` | Trend analysis + health alerts |
| `GET/POST/PUT/DELETE /api/glucose` | Blood glucose CRUD |
| `GET/POST/PUT/DELETE /api/weight` | Weight CRUD |
| `GET/POST/PUT/DELETE /api/medications` | Medication CRUD |
| `GET/POST/PUT/DELETE /api/reports` | Medical reports CRUD |
| `GET/PUT /api/profile` | Profile management |
| `POST /api/ai/chat` | RAG-powered AI assistant |
| `GET/POST /api/caregiver` | Caregiver–patient linking & consent |
| `GET /api/admin/users` | Admin: list all users |
| `GET /api/db-status` | Database readiness check |

---

## Evaluation & Benchmarks

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Full system flow diagram |
| [docs/ai_evaluation.md](docs/ai_evaluation.md) | 18-point RAG Q&A evaluation matrix |
| [docs/performance_benchmarks.md](docs/performance_benchmarks.md) | Redis caching latency results (~73% p95 improvement) |
| [docs/security-design.md](docs/security-design.md) | HIPAA/GDPR control rationale |

---

## License

MIT

---

## Disclaimer

VitalDiary is intended for personal health tracking and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.