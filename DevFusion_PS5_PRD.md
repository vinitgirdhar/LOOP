# PRD: Loop
### Problem Statement 5, DevFusion 4.0 (Enterprise Project Management & Team Collaboration Platform)

*Working name. Change it if the team prefers something else.*

---

## 1. The real problem (our angle)

Every team already has Jira, Notion, Slack and GitHub. The pain is not that the tools are missing. The pain is that **the board is always out of date**. Work happens in chat and in commits, then somebody has to manually go and drag cards, write status updates, and chase blockers. Managers get a picture that is one or two days stale, and reports are guesses.

So we are not building "another Jira clone with a chatbot bolted on". We are building **the project tool that keeps itself updated and can prove why it says what it says.**

**One line pitch:** Loop is a single workspace for projects, docs and chat, where an AI layer reads real activity (commits, chat, task events) and keeps the board honest, with every AI action backed by evidence a human can accept or reject.

Why judges and companies will like it: it solves an admin cost every company actually pays, it is explainable (no black box), and every piece of it is buildable in a hackathon window.

---

## 2. Users and roles

| Role | Owns | Key screens |
|---|---|---|
| Workspace Owner | Workspace, members, roles, billing view, integrations | Workspace settings, analytics |
| Project Manager | Projects, sprints, assignments, reports | Board, sprint, analytics |
| Team Member | Their tasks, time, comments, files | Board, task detail, chat |
| Client | Read only progress, approve deliverables, comment | Client view (locked down) |
| Platform Admin | All orgs, users, audit logs, feature flags | Admin panel |

RBAC is enforced in one middleware layer on the API, not in the UI. UI only hides what the API already blocks.

---

## 3. MVP scope

### 3.1 Base platform (must ship, this is 70% of the score)

- **Auth:** Google OAuth + email signup, mandatory email verification before workspace creation, password reset via emailed link, bcrypt hashing, JWT access token + refresh token in httpOnly cookies, multi device sessions, logout from all devices.
- **Workspace:** create, upload logo, invite by email, join by invite link, departments, role assignment.
- **Projects:** name, description, status, priority, deadline, members, milestones, files, wiki, activity timeline.
- **Tasks:** title, description, assignee, reporter, labels, priority, status, due date, attachments, checklist, story points, subtasks, dependencies, bulk actions.
- **Kanban board:** drag and drop across Backlog, To Do, In Progress, Code Review, Testing, Completed. Columns are editable per project.
- **Sprints:** name, goal, duration, capacity, sprint backlog, burndown chart, velocity, blockers.
- **Wiki:** markdown or rich text editor, code blocks, tables, images, nested pages, version history, search.
- **Team chat:** project channels, DMs, threads, @mentions, emoji reactions, file share, real time over WebSocket.
- **Files:** upload images, PDFs, video, ZIP, docs to Cloudinary, folders, preview, download, version history, type and size validation.
- **Time tracking:** start/stop timer, manual log, daily log, hours by project, team utilization.
- **Notifications:** real time in app for assignment, completion, mention, comment, file upload, sprint start/end, deadline reminder.
- **Global search:** projects, tasks, members, docs, messages, files.
- **Analytics dashboard:** project progress, velocity, completion rate, time logged, workload distribution, burnup/burndown, health score.
- **Landing page:** hero, features, pricing, testimonials, FAQ, contact, blog, footer, responsive nav, dark mode, SEO tags.
- **Admin panel:** orgs, users, roles, workspaces, projects, billing plans (display only), reports, integrations, audit logs, feature flags.

### 3.2 The three differentiators (this is why we win)

**A. Auto-Pilot Board (self updating status)**
GitHub webhooks plus chat plus task events feed a rules-and-AI pipeline. When a branch named `TASK-42` gets a PR, Loop proposes "move TASK-42 to Code Review". When someone types "I am stuck on the payment API" in a channel, Loop proposes "flag TASK-17 as blocked".
Nothing moves silently. Each proposal is a card in a **Suggestions inbox** showing the trigger, the evidence (commit link, message quote), the confidence, and Accept / Reject buttons. Accepting writes to the audit log. Users can turn on auto-apply for high confidence rules per project.

**B. Explainable Project Health Score**
A 0 to 100 score per project, computed by deterministic maths, not by a language model. Five signals: overdue ratio, blocked dependency chains, velocity trend, WIP overload per person, and silent tasks (no activity for N days). The UI shows each signal, its weight, its contribution, and the top three actions that would improve the score most. AI only writes the plain English narrative on top of the numbers, so it can never invent a number.

**C. Ask the Workspace (permission aware RAG)**
A chat box that answers "what is blocking the release?" or "who wrote the auth spec?" using tasks, wiki pages, messages and commits. Answers always cite the source items and link to them. Retrieval is filtered by the asker's role and project membership first, so a Client can never retrieve internal chat. Permission aware retrieval is the part most teams skip and it is what makes this enterprise ready.

**D. Nice extra if time allows:** auto generated daily standup digest and AI sprint planning suggestion (fill sprint to capacity based on velocity and story points). Both reuse the same engines above.

### 3.3 Out of scope for the MVP

Real payment processing, video calling, Zoom/Teams/Discord integrations, whiteboard, mind map, Gantt, offline PWA, multi language, native mobile app. We say clearly in the README that these are v2. Better to demo eight things that work than twenty that half work.

---

## 4. Architecture

```
Next.js 15 (App Router, TypeScript, Tailwind, shadcn/ui)   -> Vercel
        |  REST + WebSocket
Node/Express service (Socket.IO, webhooks, cron, AI jobs)  -> Railway (Docker)
        |
PostgreSQL + Prisma + pgvector   |   Redis (presence, rate limit, job queue)
        |
Cloudinary (files)  |  Claude API (AI layer)  |  Resend (email)
```

- **Why a separate Express service:** Vercel serverless functions are not good at long lived sockets, webhooks and background jobs. Splitting them keeps both halves simple and also satisfies the "Node + Express" requirement cleanly.
- **Auth:** NextAuth for Google OAuth plus a custom credentials flow, JWT verified in shared middleware used by both services.
- **Real time:** one Socket.IO namespace per workspace, rooms per project and per channel. Used by chat, notifications, board updates and presence.
- **AI:** all model calls go through one server side service with a strict JSON output schema and a hard rule that suggestions are proposals, never direct writes.
- **Security:** RBAC middleware on every route, Zod input validation, sanitised rich text output, rate limit per IP and per user, signed webhook verification, file type and size checks, audit log table for every privileged action, secrets only in env.

### Data model (core tables)

`users, organizations, workspaces, workspace_members, roles, permissions, projects, project_members, sprints, tasks, subtasks, task_dependencies, labels, comments, attachments, wiki_pages, wiki_versions, meetings, time_logs, notifications, channels, messages, activity_logs, integrations, ai_suggestions, health_snapshots, embeddings, settings`

Multi tenant rule: every business table carries `workspace_id` and every query is scoped by it. This one rule prevents the most common data leak in projects like this.

---

## 5. How this maps to the judging sheet

| Criteria | Weight | What we point the judge at |
|---|---|---|
| Core functionality | 30% | Full flow from signup to workspace to sprint to shipped task, all roles working |
| UI/UX | 20% | Dark and light theme, command palette (Cmd+K), drag and drop, skeletons, empty states, toasts, smooth transitions, WCAG basics |
| Code quality & architecture | 15% | Typed end to end, Prisma schema, service layer, shared RBAC middleware, clean commit history |
| Auth & security | 10% | OAuth, verification, refresh tokens, session revoke, RBAC, rate limit, audit log |
| Database design | 10% | Normalised ER diagram, indexes on hot paths, workspace scoping |
| Performance & scalability | 5% | Pagination, indexed search, optimistic UI, socket rooms instead of broadcast |
| Innovation & AI | 5% | Auto-Pilot Board, Explainable Health Score, permission aware Ask the Workspace |
| Deployment & docs | 5% | Live URL, Docker, Swagger, README with architecture diagram, seeded test accounts |

---

## 6. Deliverables checklist

- Public GitHub repo, clean commit history, conventional commits
- Live app (Vercel frontend, Railway backend)
- README with setup steps and architecture diagram
- Swagger/OpenAPI docs at `/api/docs`
- ER diagram in the repo
- `.env.example`
- Seed script creating one demo workspace with real looking data and **one test account per role** (owner, PM, member, client, admin) with credentials in the README
- Demo video, 3 to 5 minutes
- Dockerfile and docker-compose, plus a GitHub Actions CI workflow (bonus points, cheap to add)

---

## 7. Demo script (5 minutes, rehearse this)

1. Landing page, dark mode toggle, sign in with Google. (20s)
2. Workspace, invite a member, show the role matrix. (30s)
3. Board: create a task, drag it, open task detail, subtask, comment with @mention, other window gets a live notification. (60s)
4. **Money shot:** push a commit / merge a PR on a linked repo. A suggestion appears in the inbox with evidence. Accept it. The card moves and the audit log records it. (60s)
5. Health Score panel: show the five signals, the weights, and the top three fixes. Stress that the number is computed, not guessed. (45s)
6. Ask the Workspace: "what is blocking the sprint?" Answer with citations. Then log in as Client and ask the same thing, and show the internal chat source is not retrievable. (45s)
7. Analytics and burndown, then the Swagger docs and the ER diagram. (30s)

---

## 8. Work split (three people, by lane not by day)

- **Lane 1, Platform:** auth, RBAC, workspace, admin panel, security, deployment, Docker, Swagger.
- **Lane 2, Product core:** projects, tasks, board, sprints, wiki, files, time tracking, analytics.
- **Lane 3, Real time and AI:** sockets, chat, notifications, GitHub webhooks, Auto-Pilot, health score, RAG, landing page.

Shared: Prisma schema is agreed and frozen early by all three before feature work starts. Anyone can edit UI components, nobody edits the schema alone.

---

## 9. Risks and how we handle them

| Risk | Handling |
|---|---|
| Scope is huge, we run out of time | Base platform first, differentiators are built on top of it and are independently demoable. If chat slips, the board still ships. |
| AI gives wrong suggestions on stage | Suggestions are proposals with an accept step, so a wrong one is a feature demo of human control, not a failure. |
| Real time breaks in deployment | Socket service is a separate Railway container with a polling fallback. |
| Demo data looks empty | Seed script runs 3 projects, 2 sprints, 60 tasks, chat history and commits before judging. |
| Merge conflicts near the deadline | Feature branches per lane, small PRs, main stays deployable at all times. |

---

**The single sentence to repeat to every judge:** other teams are rebuilding Jira, we built the layer that keeps Jira honest, and it shows its evidence every time.
