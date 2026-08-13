---
status: accepted
---

# PostgreSQL + Node + raw SQL + Docker

The stack is TanStack Start (React, TypeScript, Node-capable server functions) with no backend built yet. We chose **PostgreSQL** as the database and **Node.js** for the backend — it shares a language with the existing TypeScript frontend/admin, avoiding a second runtime/ecosystem (Python was considered and rejected: nothing in this project needs Python's specific strengths like ML/data science). Rather than an ORM (Prisma/TypeORM), the backend talks to Postgres via **raw SQL** through a plain API layer — no code-generation step, full control over queries. **Docker** runs Postgres locally and in deployment, per explicit preference.
