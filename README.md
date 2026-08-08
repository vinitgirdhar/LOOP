# Loop — Enterprise Project Management & Team Collaboration Platform

> **DevFusion 4.0 — Problem Statement 5**  
> *The project management platform that keeps itself updated and proves why it says what it says.*

---

## 🚀 Overview

Every team already uses Jira, Notion, Slack, and GitHub. The pain isn't missing tools—the pain is that **the board is always out of date**. Work happens in chat and in commits, requiring manual card dragging, status write-ups, and blocker chasing.

**Loop** is a single workspace for projects, docs, and chat where an AI layer reads real activity (commits, chat, task events) and keeps the board honest. Every AI action is backed by evidence that a human can accept or reject.

### 🌟 Key Differentiators

1. **🤖 Auto-Pilot Board (Self-Updating Status)**
   - GitHub webhooks, chat activity, and task events feed a deterministic rules + AI pipeline.
   - When a commit mentions `PAY-12`, Loop proposes moving `PAY-12` to **Code Review**.
   - Proposals land in a **Suggestions Inbox** with evidence (links, quotes), confidence score, and Accept/Reject controls. High-confidence rules can auto-apply per project.
2. **📊 Explainable Project Health Score**
   - A 0–100 score per project computed via pure, deterministic arithmetic (5 signals: overdue ratio, blocked dependencies, velocity trend, WIP overload, silent tasks).
   - **No model invents numbers.** AI only generates the plain-English executive narrative on top of the calculated arithmetic.
3. **🔒 Ask the Workspace (Permission-Aware RAG)**
   - Semantic workspace query engine powered by `pgvector`.
   - Answers cite exact source tasks, wiki pages, messages, and commits.
   - **Strict RBAC filtering in SQL:** Client roles can never retrieve internal developer chat or confidential documents.

---

## 🏗 Architecture & Tech Stack

```mermaid
flowchart TD
    subgraph Frontend["Next.js 15 Web Application"]
        React["React 19 + TypeScript"]
        Tailwind["Tailwind CSS v4 (Hand-rolled Mobile-First UI)"]
    end

    subgraph Backend["Express 4 API & Real-Time Service"]
        API["Node.js + Express Services"]
        Sockets["Socket.IO Server (Real-time Chat & Updates)"]
        Cron["Node Cron (Anti-sleep & Health jobs)"]
    end

    subgraph Persistence["Database & Caching"]
        PG[("PostgreSQL 16 + pgvector")]
        Prisma["Prisma ORM 6"]
        Redis[("Redis 7 (Rate limiting & Sockets)")]
    end

    subgraph External["Third-Party & AI Providers"]
        Groq["Groq API (Primary LLM)"]
        Gemini["Google Gemini (Fallback LLM + Embeddings)"]
        Cloudinary["Cloudinary (Media storage)"]
        Resend["Resend (Transactional Email)"]
    end

    Frontend <-->|REST API + WebSockets| Backend
    Backend <--> Prisma
    Prisma <--> PG
    Backend <--> Redis
    Backend <--> External
```

- **Frontend:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4.
- **Backend API:** Node.js, Express 4, Socket.IO (Real-time events), Zod, Helmet, Swagger UI.
- **Database & Vector Store:** PostgreSQL 16 with `pgvector` extension & Prisma ORM 6.
- **Caching & Real-Time:** Redis 7.
- **AI Infrastructure:** Groq API (Primary LLM), Google Gemini (Fallback LLM & Vector Embeddings).
- **Integrations & Fallbacks:** Cloudinary (Local-disk fallback), Resend (Console logging fallback).

---

## ⚡ Quick Start & Local Setup

### Prerequisites
- **Node.js**: `v20.x` or higher
- **Docker Desktop**: For PostgreSQL (with `pgvector`) and Redis containers

### Step-by-Step Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/<your-username>/loop.git
   cd loop
   ```

2. **Start Local Infrastructure (Docker)**
   Starts PostgreSQL with `pgvector` on port `5433` and Redis on port `6380`.
   ```bash
   docker compose up -d
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Initialize & Seed Database**
   *Note: Prisma commands must be run from the root workspace directory.*
   ```bash
   npm run db:push
   npm run db:seed
   ```

5. **Start Development Servers**
   Starts both `@loop/api` (port 4000) and `@loop/web` (port 3000) concurrently.
   ```bash
   npm run dev
   ```

   - **Web App**: `http://localhost:3000`
   - **API Server**: `http://localhost:4000`
   - **Swagger / OpenAPI Documentation**: `http://localhost:4000/api/docs`

---

## 🔑 Seed Test Accounts

All accounts share the default password: **`Password123`**

| Role | Email Address | Description & Scope |
|---|---|---|
| **Workspace Owner** | `owner@loop.dev` | Full admin privileges across "Northwind Labs" workspace |
| **Project Manager** | `pm@loop.dev` | Project management, sprint creation, health monitoring |
| **Team Member** | `member@loop.dev` | Primary developer, task execution, time logging |
| **Developer 2** | `dev2@loop.dev` | Secondary developer for multi-user collaboration |
| **Developer 3** | `dev3@loop.dev` | Tertiary developer for multi-user collaboration |
| **QA Engineer** | `qa@loop.dev` | Quality assurance, testing, and task review |
| **Client** | `client@loop.dev` | External client role (locked down, SHARED visibility only) |
| **Platform Admin** | `admin@loop.dev` | Global platform administrator (feature flags, audit logs) |

*The seed script populates 2 workspaces ("Northwind Product" & secondary), 3 projects (`PAY`, `MOB`, `INF`), 27 tasks, 3 sprints with burndown snapshots, wiki documentation, chat history, 14 days of time logs, GitHub integration rows, pending Auto-Pilot suggestions, and audit logs.*

---

## 📋 Environment Variables

Copy `.env.example` to `.env` in the root directory:

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5433/loop?schema=public` |
| `REDIS_URL` | Redis server connection string | `redis://localhost:6380` |
| `PORT` | API server port | `4000` |
| `API_URL` | Public backend URL | `http://localhost:4000` |
| `WEB_URL` | Public frontend URL | `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | Secret for short-lived JWT access tokens | `your-access-secret` |
| `JWT_REFRESH_SECRET` | Secret for httpOnly refresh tokens | `your-refresh-secret` |
| `GROQ_API_KEY` | Groq API Key (Primary LLM) | `gsk_...` (optional fallback to Gemini) |
| `GEMINI_API_KEY` | Google Gemini API Key (RAG embeddings & fallback LLM) | `AIzaSy...` |
| `CLOUDINARY_URL` | Cloudinary API connection string | Optional (falls back to local disk storage) |
| `RESEND_API_KEY` | Resend API Key for transactional email | Optional (falls back to console logging) |

---

## 🚢 Deployment (Render & Docker)

### Render Blueprint Deployment
The repository includes a ready-to-deploy [`render.yaml`](file:///d:/Cooking%20stuff/PS5%20Devfolio/render.yaml) blueprint:
1. Connect your GitHub repository to **Render**.
2. Select **New Blueprint Instance**.
3. Render automatically provisions:
   - **PostgreSQL 16** with `pgvector` enabled
   - **Redis Key-Value store**
   - **Loop API Web Service** (Node/Express)
   - **Loop Frontend Service** (Next.js)
4. Fill in external API secrets (`GROQ_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, etc.) in the Render dashboard.

### Anti-Sleep Mechanism (2 Layers)
To prevent Render's free instances from spinning down after 15 minutes of inactivity:
- **Layer 1 (Internal Keep-Alive)**: [`apps/api/src/jobs/keepAlive.ts`](file:///d:/Cooking%20stuff/PS5%20Devfolio/apps/api/src/jobs/keepAlive.ts) pings `/api/health` every 5 minutes when running in production.
- **Layer 2 (External Keep-Alive)**: [`.github/workflows/keep-alive.yml`](file:///d:/Cooking%20stuff/PS5%20Devfolio/.github/workflows/keep-alive.yml) runs every 10 minutes via GitHub Actions to wake slept services. Configure repository variables `API_PING_URL` and `WEB_PING_URL`.

---

## 📖 API Documentation & ER Diagram

- **OpenAPI / Swagger Specs**: Navigate to `/api/docs` on any running API instance (or [`apps/api/src/docs/openapi.ts`](file:///d:/Cooking%20stuff/PS5%20Devfolio/apps/api/src/docs/openapi.ts)).
- **Entity-Relationship Diagram**: Comprehensive database schema model and relationships documentation is available in [`docs/ER.md`](file:///d:/Cooking%20stuff/PS5%20Devfolio/docs/ER.md).

---

## 🚫 Out of Scope for v2

To maintain hyper-focus on solving project stale-data issues with maximum quality, the following features are explicitly designated for **v2**:
- Real payment processing & billing checkout gateway integrations
- Native WebRTC video calling
- Interactive whiteboard & mind-mapping canvases
- Gantt chart timeline view
- Offline Progressive Web App (PWA) sync
- Multi-language i18n localization

---

## 📽️ Demo Walkthrough Script

For evaluators and judges recording or testing the 3–5 minute presentation:
1. **Landing & Authentication** (20s): Show landing page, dark mode, sign in.
2. **Workspace & Roles** (30s): Overview of organization members and RBAC matrix.
3. **Kanban & Task Management** (60s): Create task, drag & drop across columns, subtasks, @mentions.
4. **Auto-Pilot Suggestions Inbox** (60s): Push commit / trigger task event. Show evidence card in inbox, confidence score, accept action, and audit log write.
5. **Explainable Health Score** (45s): Review 5 mathematical signals, point weighting, top 3 corrective actions, and AI narrative.
6. **Permission-Aware Ask Workspace** (45s): Query RAG engine as PM/Member with citations. Switch to Client account and demonstrate blocked internal chat retrieval.
7. **Analytics & Specs** (30s): Velocity burndown charts, Swagger API docs (`/api/docs`), and database ER diagram (`docs/ER.md`).

---

## 📜 License & Acknowledgments

Built for **DevFusion 4.0 Hackathon — Problem Statement 5**.  
Developed with Next.js 15, Express, Prisma 6, pgvector, Groq, and Google Gemini.
