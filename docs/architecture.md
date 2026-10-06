# VitalDiary System Architecture

This document outlines the high-level architecture of VitalDiary, demonstrating the flow of data across the client, backend, caching layer, and databases.

## High-Level Architecture Diagram

```mermaid
flowchart TD
    %% Define Nodes
    Client["Client (React / Vite)"]
    Express["Express Server (Node.js)"]
    
    %% Middleware & Services
    RateLimiter["Rate Limiter"]
    Auth["JWT Auth Middleware"]
    Validation["Zod Schema Validation"]
    
    %% Data Stores
    Redis["Upstash Redis (Cache)"]
    DB[("PostgreSQL / SQLite")]
    VecDB[("SQLite-Vec (Vector Store)")]
    
    %% External Services
    Groq["Groq API (Llama 3.3)"]
    Transformers["@xenova/transformers (Local Embeddings)"]

    %% Connections
    Client -- "REST API (JSON)" --> Express
    Express --> RateLimiter
    RateLimiter --> Auth
    Auth --> Validation
    
    Validation -- "1. Check Cache" --> Redis
    Redis -- "Cache Miss" --> DB
    Validation -- "Write Operations" --> DB
    DB -- "Trigger" --> Transformers
    Transformers -- "384-dim Vector" --> VecDB
    
    Validation -- "Chat Prompt" --> Transformers
    Transformers -- "Search" --> VecDB
    VecDB -- "Top-K Logs" --> Express
    Express -- "System Prompt + Context" --> Groq
    Groq -- "AI Response" --> Client
    
    %% Styling
    classDef client fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:white;
    classDef server fill:#10b981,stroke:#047857,stroke-width:2px,color:white;
    classDef db fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:white;
    classDef external fill:#8b5cf6,stroke:#5b21b6,stroke-width:2px,color:white;
    classDef cache fill:#ef4444,stroke:#b91c1c,stroke-width:2px,color:white;

    class Client client;
    class Express,RateLimiter,Auth,Validation server;
    class DB,VecDB db;
    class Redis cache;
    class Groq external;
```

## Flow Description

1. **Client Interaction**: The user accesses the web application, built with React and Vite, interacting via standard RESTful JSON APIs.
2. **Security Perimeter**: Requests enter the Node.js Express server and immediately pass through `express-rate-limit` (abuse protection), `authenticateToken` (JWT validation & RBAC), and `validate` (Zod schema boundary).
3. **Caching Layer**: Read operations (`GET`) attempt to fetch data from Upstash Redis first. On a cache hit, the data is returned immediately. On a cache miss, data is queried from the primary database, cached for 5 minutes, and then returned. Write operations (`POST`, `PUT`, `DELETE`) invalidate the specific user's cache pattern to ensure data consistency.
4. **Primary Database**: Handles structured relational data and JSON fields. VitalDiary supports both SQLite (local development) and PostgreSQL (production).
5. **RAG Data Pipeline (Write)**: When medical records are created, updated, or deleted, a fire-and-forget hook invokes `@xenova/transformers` locally. The text is embedded into a 384-dimensional semantic vector and stored in `sqlite-vec`.
6. **AI Assistant Pipeline (Read)**: When the user asks a health question, their prompt is embedded locally. A cosine distance similarity search is executed against `sqlite-vec` to retrieve the top 5 most relevant historical logs. These logs are securely injected into the system prompt context window and sent to the Groq API (Llama 3.3) to generate a highly personalized, context-aware response.
