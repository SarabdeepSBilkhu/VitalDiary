# VitalDiary

VitalDiary is a full-stack personal health tracking platform that enables users to securely record, monitor, and analyze key health metrics over time. It combines health logging, analytics, reporting, and historical record management within a modern web application.

## Features

### Secure User Accounts

* User registration and login
* JWT-based authentication
* Password hashing using bcrypt

### Vital Signs Tracking

Track and manage:

* Systolic blood pressure
* Diastolic blood pressure
* Heart rate
* Blood oxygen saturation (SpO₂)

### Blood Glucose Monitoring

Record glucose readings with context:

* Fasting
* Pre-meal
* Post-meal

### Weight Tracking

* Log weight measurements
* Review historical trends
* Monitor long-term progress

### Medical Reports

Store and organize:

* Blood test reports
* Urine test reports
* Custom medical reports
* Notes and findings

### Analytics & Visualization

* Interactive charts
* Historical health insights
* Calendar-based record navigation
* Dashboard summaries

### Reporting

* PDF export support
* Spreadsheet export support
* Historical data review

---

## Technology Stack

### Frontend

* React 19
* TypeScript
* Vite
* Chart.js
* react-chartjs-2
* Lucide React

### Backend

* Node.js
* Express.js

### Database

* SQLite (development)
* PostgreSQL (production)

### Authentication

* JSON Web Tokens (JWT)
* bcryptjs

### Reporting & Export

* jsPDF
* xlsx

---

## Architecture

VitalDiary uses a full-stack architecture where:

* React powers the frontend interface.
* Express provides REST API endpoints.
* SQLite or PostgreSQL stores user health data.
* Express serves the production React build.
* JWT secures protected API routes.

The frontend build is served directly from the backend, enabling deployment as a single application.

---

## Project Structure

```text
vitaldiary/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Analytics.tsx
│   │   │   ├── CalendarView.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── HistoryView.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── LogModal.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Toast.tsx
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
├── middleware/
│   └── auth.js
│
├── routes/
│   ├── auth.js
│   ├── vitals.js
│   ├── glucose.js
│   ├── weight.js
│   └── reports.js
│
├── database.js
├── server.js
├── package.json
└── vitaldiary.db
```

---

## Database Support

VitalDiary supports two database engines:

### SQLite

Used automatically for local development when no PostgreSQL connection string is configured.

### PostgreSQL

Used automatically when a database connection string is provided.

Supported environment variables:

```env
DATABASE_URL=
DATABASE_PRIVATE_URL=
```

The application automatically:

* Creates required database tables
* Creates performance indexes
* Verifies schema integrity
* Handles database startup retries
* Detects and uses the available database engine

---

## Database Schema

### Users

```text
id
email
password
created_at
```

### Vitals

```text
id
user_id
timestamp
systolic
diastolic
hr
spo2
notes
```

### Glucose

```text
id
user_id
timestamp
value
context
notes
```

### Weight

```text
id
user_id
timestamp
value
notes
```

### Reports

```text
id
user_id
timestamp
report_type
title
data
notes
```

---

## Requirements

* Node.js 20.19.0 or newer
* npm

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd vitaldiary
```

Install dependencies:

```bash
npm install
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=8080
JWT_SECRET=your-secret-key

# Optional PostgreSQL configuration
DATABASE_URL=
DATABASE_PRIVATE_URL=
```

---

## Development

Run both frontend and backend:

```bash
npm run dev
```

Run backend only:

```bash
npm run server
```

Run frontend only:

```bash
npm run client
```

---

## Production Build

Build the frontend:

```bash
npm run build
```

Start the application:

```bash
npm start
```

---

## API Modules

| Module         | Description                |
| -------------- | -------------------------- |
| `/api/auth`    | User authentication        |
| `/api/vitals`  | Vital signs management     |
| `/api/glucose` | Blood glucose management   |
| `/api/weight`  | Weight tracking            |
| `/api/reports` | Medical reports management |

---

## Database Status Endpoint

The server provides a readiness endpoint:

```http
GET /api/db-status
```

Example response:

```json
{
  "ready": true
}
```

During cold starts, protected API endpoints may temporarily return:

```json
{
  "status": "waking_up",
  "error": "Database is warming up. This usually takes 10-25 seconds on a cold start. Please wait..."
}
```

---

## Reliability Features

* Automatic schema creation
* Database readiness checks
* Background reconnection attempts
* Cold-start recovery
* Indexed health record retrieval
* User-isolated data storage

---

## Security

* JWT authentication
* Password hashing with bcrypt
* Protected API routes
* User-scoped data access
* Environment-based configuration

---

## Future Enhancements

* Medication tracking
* Appointment management
* Health reminders
* Wearable device integration
* Advanced analytics
* Multi-device synchronization

---

## License

MIT License.

---

## Disclaimer

VitalDiary is intended for personal health tracking and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.