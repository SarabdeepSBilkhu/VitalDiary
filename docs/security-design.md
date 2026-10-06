# Security & Compliance Design Document

VitalDiary incorporates several enterprise-grade security and compliance principles commonly required by HIPAA and GDPR. This document outlines the rationale behind each security control implemented in the system.

## 1. Access Control (RBAC & Authentication)
- **Principle**: Least Privilege (HIPAA Security Rule § 164.312(a)(1)).
- **Implementation**: JSON Web Tokens (JWT) for stateless session management. Role-Based Access Control (RBAC) with roles `patient`, `caregiver`, and `admin` is enforced by the `authorize()` middleware on protected routes.
- **Why**: Prevents horizontal and vertical privilege escalation — a caregiver cannot access admin settings, and a patient cannot view another patient's data.

## 2. Encryption at Rest
- **Principle**: Data Confidentiality (HIPAA Security Rule § 164.312(a)(2)(iv)).
- **Implementation**: AES-256-GCM authenticated encryption via Node's native `crypto` module. Sensitive fields (`allergies`, `emergency_contact` in profiles, and `data` in medical reports) are encrypted before writing to the database. The key is loaded from the `ENCRYPTION_KEY` environment variable.
- **Why**: If the database file is compromised or stolen, the most sensitive identifying health data remains unreadable without the encryption key.

## 3. Audit Logging
- **Principle**: Accountability and Traceability (HIPAA Security Rule § 164.312(b)).
- **Implementation**: The `auditLog` middleware captures all write operations (POST, PUT, DELETE), asynchronously logging `user_id`, `route`, `action`, `ip`, and `timestamp` to a dedicated `audit_log` table.
- **Why**: Provides a forensic trail of who changed what and when, critical for investigating data breaches or unauthorized modifications.

## 4. Rate Limiting
- **Principle**: Availability and Abuse Prevention.
- **Implementation**: `express-rate-limit` applied per-route via `rateLimiter.js`:
  - `/api/auth`: 20 requests per 15 minutes (brute-force / credential stuffing protection)
  - `/api/ai`: 30 requests per minute (API key exhaustion / runaway LLM cost protection)
- **Why**: Ensures the application remains available to legitimate users even under automated attack.

## 5. Input Validation
- **Principle**: Data Integrity (GDPR Art. 5(1)(d) — Accuracy).
- **Implementation**: The `zod` library validates all incoming request bodies on write routes. Strict physiological bounds are enforced (e.g., systolic BP must be 40–300 mmHg).
- **Why**: Prevents injection attacks, guards against accidental data corruption, and ensures the RAG pipeline is fed high-quality data.

## 6. Account Deletion & GDPR Compliance
- **Principle**: Right to Erasure (GDPR Art. 17).
- **Implementation**: Account deletion cascades via `ON DELETE CASCADE` across all related tables (vitals, glucose, weight, medications, reports, profiles, audit logs, caregiver links).
- **Why**: Ensures complete data removal on user request, satisfying GDPR's right-to-erasure requirement.
