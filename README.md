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
- **Lane 3 — Real-Time Engine & AI Systems**: Auto-Pilot suggestions inbox, explainable health score calculation, permission-aware workspace search, Supabase Realtime channels, and 3D visual components.

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

### 3. Permission-Aware Workspace Search ("Ask the Workspace")
- **Grounded Retrieval**: Natural-language questions are answered only from the workspace's own tasks, wiki, and projects. The model is handed the retrieved context and instructed to say plainly when the answer is not in it, rather than guessing.
- **Strict Role-Based Filtering**: Retrieval runs through the caller's own session, so row-level security applies *before* any content reaches the prompt. A client or restricted role cannot be answered from projects they were never added to — those rows never enter the context.
- **Cited Sources**: Every generated answer returns the source tickets and documents it drew from.

### 4. Sprint & Kanban Management
- **Interactive Board**: Drag-and-drop workflow across customizable status columns (Backlog, To Do, In Progress, Code Review, Testing, Done).
- **Sprint Analytics**: Sprint backlog planning, capacity tracking, story point allocation, and real-time burndown charts.
- **Task Details**: Nested subtasks, dependency mapping, custom tags, attachments, checklists, and time tracking logs.

### 5. Real-Time Communication & Activity Feeds
- **Workspace Channels & DMs**: Supabase Realtime messaging with thread support, attachments, @mentions, and emoji reactions.
- **In-App Notifications**: Real-time notifications for task assignments, blocker alerts, and system notifications.

### 6. Interactive 3D Architecture Visualizations
- High-performance landing experience with WebGL graphics rendered via Three.js and React Three Fiber.

---

## Technology Stack

### Frontend Architecture
- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling & Animation**: Tailwind CSS v4, GSAP, custom SVG icon set
- **3D Engine**: Three.js, React Three Fiber

### Backend & Infrastructure
- **Server Environment**: Node.js, Next.js App Router Route Handlers (deployed on Vercel)
- **Real-Time Communication**: Supabase Realtime (Postgres change feeds over WebSocket, filtered by row-level security)
- **Validation**: Zod schema enforcement

### Data Layer
- **Primary Database**: PostgreSQL 16 (managed by Supabase)
- **Data Client**: `supabase-js` with row-level security enforced on every query
- **Workspace Search**: Permission-scoped retrieval over tasks, wiki, and projects

### External Integrations & AI Services
- **Primary LLM**: Groq API (`llama-3.3-70b-versatile`)
- **Fallback LLM**: Google Gemini API (`gemini-flash-latest`, with automatic failover from Groq)
- **Asset Storage**: Cloudinary (with local filesystem fallback)
- **Email Service**: Resend (with console logging fallback)

---

## Local Setup & Deployment Guide

### Prerequisites
- **Node.js**: Version 20.x or later
- **npm**: Version 10.x or later
- **Docker Desktop** *(Optional)*: Required only to run the local Supabase stack (PostgreSQL, Auth, Storage) via the Supabase CLI

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

Ensure the following configuration variables are defined (see `.env.example` for the full list):
```env
# Supabase — database, auth, storage, realtime
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"   # server-side only, never exposed to the client

# AI providers (Groq primary, Gemini fallback)
GROQ_API_KEY="your-groq-api-key"
GEMINI_API_KEY="your-gemini-api-key"

# Optional: Cloudinary (falls back to local storage), Resend (falls back to console)
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

- **Web Application**: Access at `http://localhost:3000`
- **API Documentation**: OpenAPI specification served at `http://localhost:3000/api/openapi.json`

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

1. **WebSocket Proxy Fallback**: In environments behind strict enterprise proxies or firewalls, the Supabase Realtime connection falls back to HTTP long-polling, introducing a slight latency (~1-2 seconds) for real-time messages.
2. **AI Provider Rate Limits**: During peak concurrent AI queries, free-tier Groq API rate limits may be reached. The engine automatically fails over to Google Gemini, and reports which provider answered.
3. **Keyword Retrieval Scope**: "Ask the Workspace" retrieves context by permission-scoped keyword match over titles and content, not semantic similarity — so a question shares best results when it shares vocabulary with the source material. The row-level-security-before-retrieval guarantee and the Groq→Gemini failover are unaffected.
4. **WebGL Hardware Requirements**: Complex 3D network visuals on the marketing page require WebGL support; performance may throttle on older integrated GPUs or low-power mobile devices.

---

## Project Documentation & Resources

- **Live Application**: [ps-5-devfolio-web.vercel.app](https://ps-5-devfolio-web.vercel.app/)
- **API Specification**: `http://localhost:4000/api/docs`
- **Database Architecture Diagram**: [`docs/ER.md`](file:///d:/Cooking%20stuff/PS5%20Devfolio/docs/ER.md)

---

## License

Built for **DevFusion 4.0 — Problem Statement 5**. Released under the MIT License.
