# Loop

### Enterprise Project Management & Team Collaboration Platform
> **Problem Statement 5: Enterprise Project Management & Team Collaboration Platform (Jira + Notion + Slack + GitHub)**  
> *Combining Jira, Notion, Slack, and GitHub into a self-updating, evidence-backed workspace.*

<p align="left">
  <a href="https://ps-5-devfolio-web.vercel.app/"><img src="https://img.shields.io/badge/Live_Demo-ps--5--devfolio--web.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

---

## Executive Summary

| Requirement | Specification |
|:---|:---|
| **Project Name** | **Loop** |
| **Problem Statement** | **Problem Statement 5: Enterprise Project Management & Team Collaboration Platform (Jira + Notion + Slack + GitHub)** |
| **Difficulty Level** | Advanced |
| **Domain** | SaaS • Productivity • Project Management • DevTools |
| **Duration** | 24–48 Hours |
| **Live Application** | [https://ps-5-devfolio-web.vercel.app/](https://ps-5-devfolio-web.vercel.app/) |
| **API Specification** | `http://localhost:4000/api/docs` (OpenAPI 3.0 / Swagger) |

---

## Team & Responsibilities

- **Lane 1 — Infrastructure & Security**: Authentication, RBAC system, database schema architecture, security middleware, and cloud deployment pipelines.
- **Lane 2 — Product & Core Application**: Project planning, issue tracking, interactive Kanban board, sprint backlog, wiki documentation, and time logging.
- **Lane 3 — Real-Time Engine & AI Systems**: Auto-Pilot suggestions inbox, explainable health score calculation, permission-aware RAG search, Socket.IO real-time channels, and 3D visual components.

---

## Problem Statement & Background

### Official Context
Modern software teams operate across fragmented toolchains: Jira for issue tracking, Notion for documentation, Slack for daily communication, GitHub for source code, and spreadsheets for executive status reports. This fragmentation leads to constant context switching, duplicated effort, stale project status, and poor cross-functional visibility.

The objective of **Problem Statement 5** is to build a production-grade enterprise SaaS platform that integrates project planning, issue tracking, documentation, sprint management, real-time communication, and AI-driven productivity into a unified environment while adhering to enterprise security and role-based access standards.

### The Core Problem Loop Solves
In practice, project management software fails not because features are missing, but because **project boards are almost always out of date**. Actual development occurs in terminal sessions, pull requests, and chat threads. Updating ticket statuses manually is administrative overhead that engineers often delay or skip.

Loop addresses this root cause by connecting development activity directly to project governance. An AI-assisted Auto-Pilot engine monitors real-world events—such as Git commits, pull requests, and discussion threads—and generates status update proposals. To maintain complete transparency, Loop never mutates project state silently. Every proposal includes verifiable evidence and requires explicit human approval unless project-level auto-apply rules are enabled.

---

## Key Feature Capabilities

### 1. Auto-Pilot Governance Engine
- **Event Ingestion**: Ingests GitHub webhooks, team chat messages, and task status changes into a rules-and-AI evaluation pipeline.
- **Evidence-Backed Proposals**: When a branch or commit referencing a ticket (e.g., `PAY-12`) is detected, Loop drafts a proposal to move `PAY-12` to Code Review.
- **Suggestions Inbox**: Proposals arrive in a dedicated inbox displaying code snippets, message quotes, commit hashes, confidence ratings, and Accept/Reject controls. Approved actions write directly to the audit log.

### 2. Deterministic & Explainable Health Scoring
- **0–100 Mathematical Index**: Project health is computed through pure deterministic arithmetic across five explicit indicators: overdue task ratio, blocked dependency depth, velocity trend, work-in-progress overload per member, and stale task inactivity.
- **Auditable & Non-Hallucinatory**: Language models never compute or guess numerical scores. AI is restricted strictly to generating plain-English executive summaries based on the computed metrics and recommending corrective actions.

### 3. Permission-Aware Workspace RAG Search
- **Semantic Querying**: Powered by PostgreSQL `pgvector` for deep contextual search across tasks, wiki documentation, chat history, and pull requests.
- **Strict Role-Based Filtering**: Vector retrieval enforces SQL-level user permissions prior to context aggregation. External client accounts or restricted roles cannot retrieve internal developer discussions or private technical specs.
- **Inline Citations**: Every generated answer includes direct links to source tickets, documents, and messages.

### 4. Sprint & Kanban Management
- **Interactive Board**: Drag-and-drop workflow across customizable status columns (Backlog, To Do, In Progress, Code Review, Testing, Done).
- **Sprint Analytics**: Sprint backlog planning, capacity tracking, story point allocation, and real-time burndown charts.
- **Task Details**: Nested subtasks, dependency mapping, custom tags, attachments, checklists, and time tracking logs.

### 5. Real-Time Communication & Activity Feeds
- **Workspace Channels & DMs**: Socket.IO-powered messaging with thread support, rich attachments, @mentions, and emoji reactions.
- **In-App Notifications**: Real-time notifications for task assignments, blocker alerts, and system notifications.

### 6. Interactive 3D Architecture Visualizations
- High-performance landing experience with WebGL graphics rendered via Three.js and React Three Fiber.

---

## Technology Stack

### Frontend Architecture
- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Lucide Icons, Framer Motion, GSAP
- **3D Engine**: Three.js, React Three Fiber

### Backend & Infrastructure
- **Server Environment**: Node.js, Express 4, Next.js Server Actions & API Routes
- **Real-Time Communication**: Socket.IO (WebSocket with polling fallback)
- **Validation**: Zod schema enforcement

### Data Layer
- **Primary Database**: PostgreSQL 16
- **Vector Search Engine**: `pgvector`
- **ORM & Data Client**: Prisma ORM 6, Supabase Client

### External Integrations & AI Services
- **Primary LLM**: Groq API
- **Fallback LLM & Vector Embeddings**: Google Gemini API (`gemini-2.5-flash` & `text-embedding-004`)
- **Asset Storage**: Cloudinary (with local filesystem fallback)
- **Email Service**: Resend (with console logging fallback)

---

## Local Setup & Deployment Guide

### Prerequisites
- **Node.js**: Version 20.x or later
- **npm**: Version 10.x or later
- **Docker Desktop** *(Optional)*: Required for running local PostgreSQL (`pgvector`) and Redis containers

### 1. Clone Repository
```bash
git clone https://github.com/vinitgirdhar/PS5-Devfolio.git
cd PS5-Devfolio
```

### 2. Environment Setup
Create a `.env` file in the root directory based on `.env.example`:
```bash
cp .env.example .env
```

Ensure the following configuration variables are defined:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/loop?schema=public"
REDIS_URL="redis://localhost:6380"
PORT=4000
API_URL="http://localhost:4000"
WEB_URL="http://localhost:3000"
GEMINI_API_KEY="your-gemini-api-key"
GROQ_API_KEY="your-groq-api-key"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Seed
Execute database schema push and populate initial seed data:
```bash
npm run db:push
npm run db:seed
```

### 5. Launch Development Server
```bash
npm run dev
```

- **Web Application**: Access at `http://localhost:3000` (or `http://localhost:3001`)
- **API Documentation**: Access OpenAPI / Swagger interface at `http://localhost:4000/api/docs`

---

## Seeded Test Credentials

All pre-configured seed accounts share the default password: **`Password123`**

| Role | Email Address | Access Level & Scope |
|:---|:---|:---|
| **Workspace Owner** | `owner@loop.dev` | Complete administrative authority over organization, settings, and billing |
| **Project Manager** | `pm@loop.dev` | Project configuration, sprint management, delegation, and reporting |
| **Developer / Team Member** | `member@loop.dev` | Task execution, code activity tracking, time logging, and channel discussion |
| **QA Engineer** | `qa@loop.dev` | Quality assurance review, bug ticket creation, and test validation |
| **External Client** | `client@loop.dev` | Read-only shared visibility view (Strict SQL-level RBAC isolation) |
| **Platform Admin** | `admin@loop.dev` | Global platform configuration, feature flag toggles, and audit log inspection |

---

## Known Limitations & Design Trade-Offs

1. **WebSocket Proxy Fallback**: In environments behind strict enterprise proxies or firewalls, Socket.IO connection falls back to HTTP long-polling, introducing a slight latency (~1-2 seconds) for real-time messages.
2. **AI Provider Rate Limits**: During peak concurrent semantic queries, free-tier Groq API rate limits may be reached. The engine automatically handles failover to Google Gemini.
3. **Asynchronous Embedding Generation**: Vector embeddings for newly added wiki pages and discussion messages are processed asynchronously in background jobs, resulting in a 3-5 second delay before appearing in RAG search indices.
4. **WebGL Hardware Requirements**: Complex 3D network visuals on the marketing page require WebGL support; performance may throttle on older integrated GPUs or low-power mobile devices.

---

## Project Documentation & Resources

- **Live Application**: [ps-5-devfolio-web.vercel.app](https://ps-5-devfolio-web.vercel.app/)
- **API Specification**: `http://localhost:4000/api/docs`
- **Database Architecture Diagram**: [`docs/ER.md`](file:///d:/Cooking%20stuff/PS5%20Devfolio/docs/ER.md)

---

## License

Built for **DevFusion 4.0 — Problem Statement 5**. Released under the MIT License.
