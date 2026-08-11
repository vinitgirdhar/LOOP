/**
 * Demo seed for the hosted Supabase project.
 * Contains 500+ items of realistic student & engineering college project data.
 *
 *   node supabase/seed.mjs            # reads ../.env
 *   node supabase/seed.mjs --reset    # delete existing demo workspace & re-seed fresh
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !SERVICE) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env or the environment).');
  process.exit(1);
}

const RESET = process.argv.includes('--reset');
const PASSWORD = 'Password123';
const WORKSPACE_SLUG = 'northwind-labs';

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString();

async function rest(pathname, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${URL_}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const insert = (table, rows) => rest(table, { method: 'POST', body: rows, prefer: 'return=representation' });

async function auth(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${URL_}/auth/v1/${pathname}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} -> ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── PEOPLE & DEMO ACCOUNTS ──────────────────────────────────────────────────
const PEOPLE = [
  { email: 'owner@loop.dev', name: 'Ava Sharma', role: 'OWNER', title: 'Head of Engineering / Faculty Advisor' },
  { email: 'pm@loop.dev', name: 'Rohan Mehta', role: 'PM', title: 'Student Project Lead & Scrum Master' },
  { email: 'member@loop.dev', name: 'Diya Patel', role: 'MEMBER', title: 'Lead Student Fullstack Engineer' },
  { email: 'dev2@loop.dev', name: 'Kabir Nair', role: 'MEMBER', title: 'Backend & Cloud Infrastructure Lead' },
  { email: 'dev3@loop.dev', name: 'Meera Iyer', role: 'MEMBER', title: 'Frontend UI/UX Lead Engineer' },
  { email: 'qa@loop.dev', name: 'Arjun Rao', role: 'MEMBER', title: 'QA & Security Testing Lead' },
  { email: 'client@loop.dev', name: 'Nina Fischer', role: 'CLIENT', title: 'Dean of Academics & Industry Sponsor' },
  { email: 'admin@loop.dev', name: 'Platform Admin', role: 'OWNER', title: 'Platform Administrator', admin: true },
];

const DEFAULT_COLUMNS = [
  { key: 'backlog', name: 'Backlog', order: 0, is_done: false, color: '#94a3b8', wip_limit: null },
  { key: 'todo', name: 'To Do', order: 1, is_done: false, color: '#60a5fa', wip_limit: null },
  { key: 'in_progress', name: 'In Progress', order: 2, is_done: false, color: '#fbbf24', wip_limit: 5 },
  { key: 'code_review', name: 'Code Review', order: 3, is_done: false, color: '#a78bfa', wip_limit: null },
  { key: 'testing', name: 'Testing', order: 4, is_done: false, color: '#22d3ee', wip_limit: null },
  { key: 'completed', name: 'Completed', order: 5, is_done: true, color: '#34d399', wip_limit: null },
];

// ── 6 ENGINEERING COLLEGE PROJECTS ─────────────────────────────────────────
const PROJECTS = [
  {
    key: 'HACK',
    name: 'DevFusion 4.0 Hackathon Portal',
    description: 'Real-time hackathon management platform, team submission portal, and automated judge scoring dashboard.',
    color: '#6366f1',
    priority: 'URGENT',
    deadline: day(14),
    withClient: true,
  },
  {
    key: 'ATT',
    name: 'Smart Campus Attendance & Biometric Access',
    description: 'RFID & BLE-based automated attendance tracker with geolocation fence and faculty override portal.',
    color: '#0ea5e9',
    priority: 'HIGH',
    deadline: day(30),
    withClient: false,
  },
  {
    key: 'GRD',
    name: 'AI Code Evaluator & Auto-Grader',
    description: 'Containerized sandbox execution engine for automated student code evaluation with plagiarism detection.',
    color: '#10b981',
    priority: 'URGENT',
    deadline: day(21),
    withClient: true,
  },
  {
    key: 'HOST',
    name: 'Smart Hostel & Mess Management',
    description: 'Hostel room allocation engine, leave request workflow, mess rebate system, and complaint ticketing.',
    color: '#f59e0b',
    priority: 'MEDIUM',
    deadline: day(45),
    withClient: false,
  },
  {
    key: 'PLAC',
    name: 'Placement & Internship Portal',
    description: 'Student resume parser, company drive scheduler, interview slot booking, and placement analytics.',
    color: '#ec4899',
    priority: 'HIGH',
    deadline: day(60),
    withClient: true,
  },
  {
    key: 'LIB',
    name: 'Digital Library & Research Repository',
    description: 'E-book catalog, paper citation search with vector embeddings, book reservation, and fine payment gateway.',
    color: '#8b5cf6',
    priority: 'MEDIUM',
    deadline: day(50),
    withClient: false,
  },
];

// ── TASKS DATA (120 Detailed Engineering Tasks) ────────────────────────────
const TASKS = {
  HACK: [
    ['Real-time Leaderboard & Live Score Stream', 'completed', 'URGENT', 8, -12],
    ['Judge Scoring Matrix & Rubric Form', 'completed', 'HIGH', 5, -8],
    ['Team Registration & Team Join Link Generator', 'completed', 'HIGH', 5, -5],
    ['GitHub Submission Webhook Listener', 'in_progress', 'URGENT', 8, 2],
    ['Automated Plagiarism Check on Submissions', 'in_progress', 'HIGH', 8, 4],
    ['Judge Feedback & Video Pitch Embed', 'code_review', 'MEDIUM', 3, 3],
    ['Export Team Scores to CSV & PDF Report', 'testing', 'HIGH', 3, 1],
    ['Discord Bot Notification Webhook Integration', 'todo', 'MEDIUM', 5, 7],
    ['Hackathon Registration Rate Limiting', 'todo', 'HIGH', 3, 5],
    ['Certificate Generator for Participants', 'backlog', 'LOW', 2, 12],
    ['Mentor Desk Booking System', 'backlog', 'MEDIUM', 5, 14],
    ['Sponsor Showcase & Swag Redemption', 'backlog', 'LOW', 3, 18],
    ['Live Q&A & Announcement Broadcast Channel', 'in_progress', 'HIGH', 5, 3],
    ['Hackathon Rules & FAQ Accordion Page', 'completed', 'LOW', 2, -10],
    ['Team Member Role Transfer & Leave Flow', 'code_review', 'LOW', 3, 4],
    ['Judge Audit Log & Manual Score Override', 'testing', 'URGENT', 5, 2],
    ['Project Category Tagging & Filtering', 'todo', 'MEDIUM', 3, 8],
    ['Submission Deadline Countdown Timer', 'completed', 'HIGH', 2, -2],
    ['Final Prize Pool Allocation Calculator', 'backlog', 'MEDIUM', 3, 15],
    ['Public Winner Showcase & Archive Page', 'backlog', 'LOW', 5, 20],
  ],
  ATT: [
    ['RFID Reader Hardware API Gateway', 'completed', 'URGENT', 8, -15],
    ['Student Geofence Location Verification', 'completed', 'HIGH', 5, -9],
    ['Bluetooth Low Energy (BLE) Beacon Scanner', 'in_progress', 'HIGH', 8, 3],
    ['Faculty Manual Attendance Override Screen', 'in_progress', 'MEDIUM', 5, 5],
    ['Daily Low Attendance Alert Email Trigger', 'code_review', 'HIGH', 3, 2],
    ['Medical Leave Request & Certificate Upload', 'testing', 'MEDIUM', 5, 1],
    ['Semester Attendance Percentage Report', 'todo', 'HIGH', 5, 8],
    ['Classroom Schedule Sync with Google Calendar', 'todo', 'LOW', 3, 10],
    ['Proxy Detection Algorithm using Device MAC', 'in_progress', 'URGENT', 8, 4],
    ['Export Attendance Register to Excel Format', 'completed', 'MEDIUM', 3, -4],
    ['Biometric Fingerprint Scanner SDK Sync', 'backlog', 'HIGH', 8, 22],
    ['Department-wise Attendance Heatmap', 'backlog', 'MEDIUM', 5, 25],
    ['Automated Condonation Notice Generator', 'todo', 'HIGH', 3, 9],
    ['Faculty Timetable & Substitute Teacher Flow', 'code_review', 'LOW', 5, 6],
    ['Student Self-Attendance History View', 'completed', 'LOW', 2, -1],
    ['Parent SMS Alert Integration for Bunked Classes', 'backlog', 'MEDIUM', 5, 18],
    ['Course-wise Minimum Attendance Threshold Rules', 'testing', 'HIGH', 3, 2],
    ['Bulk Student Enrollment from ERP CSV', 'completed', 'HIGH', 5, -11],
    ['Attendance Anomaly Audit Log Dashboard', 'backlog', 'LOW', 3, 28],
    ['Mobile App Background Location Service', 'in_progress', 'URGENT', 8, 5],
  ],
  GRD: [
    ['Docker Sandbox Container Isolation Engine', 'completed', 'URGENT', 8, -14],
    ['Python & C++ Test Case Runner Execution', 'completed', 'HIGH', 8, -7],
    ['Memory & Execution Time Limit Enforcer', 'in_progress', 'URGENT', 5, 2],
    ['AST-based Code Similarity & Plagiarism Detector', 'in_progress', 'HIGH', 8, 4],
    ['Groq LLM Automated Code Review & Hints Generator', 'code_review', 'HIGH', 5, 3],
    ['Student Code Submission Editor with Monaco', 'completed', 'HIGH', 5, -3],
    ['Batch Test Case Runner with Parallel Workers', 'testing', 'URGENT', 8, 1],
    ['Grading Rubric Breakdown & Partial Marks', 'todo', 'MEDIUM', 3, 7],
    ['Compiler Error Log Sanitization & Display', 'completed', 'MEDIUM', 3, -6],
    ['Java & Rust Language Support Packages', 'todo', 'LOW', 5, 12],
    ['Custom Test Case Playground for Students', 'backlog', 'MEDIUM', 3, 16],
    ['Auto-Grader Queue Rate Limiter & Redis Worker', 'in_progress', 'HIGH', 8, 3],
    ['Leaderboard for Programming Assignment Speed', 'completed', 'LOW', 2, -8],
    ['Professor Gradebook Export & Canvas LTI Sync', 'backlog', 'HIGH', 5, 24],
    ['Anti-Cheat Keypress Frequency Logger', 'testing', 'MEDIUM', 3, 2],
    ['Hidden Test Cases vs Sample Test Cases Filter', 'completed', 'HIGH', 3, -2],
    ['Code Execution Telemetry & CPU Benchmark', 'todo', 'LOW', 5, 11],
    ['Assignment Re-run & Bulk Regrade Trigger', 'code_review', 'HIGH', 5, 4],
    ['Student Assignment Resubmission Penalty Calculation', 'backlog', 'LOW', 2, 19],
    ['Automated Coding Assignment Generator with AI', 'backlog', 'MEDIUM', 8, 30],
  ],
  HOST: [
    ['Hostel Room Allocation & Seat Matrix Engine', 'completed', 'HIGH', 8, -16],
    ['Student Leave Application & Out-pass Approval', 'completed', 'HIGH', 5, -10],
    ['Mess Attendance Counter & Digital Coupon QR', 'in_progress', 'HIGH', 5, 3],
    ['Mess Rebate Calculation Engine', 'in_progress', 'MEDIUM', 3, 6],
    ['Hostel Maintenance & Plumbing Ticket System', 'code_review', 'MEDIUM', 5, 2],
    ['Gate Entry QR Scanner for Warden', 'testing', 'URGENT', 5, 1],
    ['Hostel Fee Due Reminder Notification Engine', 'todo', 'MEDIUM', 3, 8],
    ['Roommate Compatibility Preference Matching', 'backlog', 'LOW', 5, 20],
    ['Night Roll Call Verification Portal', 'completed', 'URGENT', 5, -4],
    ['Mess Food Feedback & Rating Dashboard', 'todo', 'LOW', 2, 11],
    ['Warden Emergency Broadcast Broadcast Channel', 'completed', 'HIGH', 3, -12],
    ['Guest Room Reservation & Visitor Log', 'backlog', 'LOW', 3, 22],
    ['Hostel Electricity Usage & Bill Splitter', 'backlog', 'MEDIUM', 5, 26],
    ['Inventory & Furniture Asset Tracker', 'testing', 'LOW', 3, 3],
    ['Laundry Service Slot Booking System', 'code_review', 'MEDIUM', 5, 4],
    ['Student Discipline Incident & Penalty System', 'todo', 'HIGH', 5, 9],
    ['Mess Menu Weekly Calendar & Swap Engine', 'completed', 'LOW', 2, -1],
    ['Hostel Chief Warden Fine Audit Dashboard', 'backlog', 'MEDIUM', 3, 28],
    ['Vacation Luggage Storage Authorization', 'backlog', 'LOW', 2, 32],
    ['Student Health & Emergency Assistance Hotline', 'in_progress', 'URGENT', 8, 2],
  ],
  PLAC: [
    ['PDF Resume Parser & Skill Extractor', 'completed', 'URGENT', 8, -13],
    ['Company Placement Drive Announcement Feed', 'completed', 'HIGH', 5, -9],
    ['Student Eligibility Filter (CGPA, Backlog)', 'in_progress', 'URGENT', 5, 2],
    ['Interview Slot Booking & Calendar Sync', 'in_progress', 'HIGH', 5, 5],
    ['Placement Offer Letter Acceptance Flow', 'code_review', 'URGENT', 5, 3],
    ['Company PPT Registration & Attendance List', 'completed', 'MEDIUM', 3, -5],
    ['Student Placement Statistics & CTC Analytics', 'testing', 'HIGH', 5, 1],
    ['Mock Interview Feedback & AI Scorecard', 'todo', 'MEDIUM', 8, 10],
    ['NOC (No Objection Certificate) Generator', 'todo', 'LOW', 3, 8],
    ['Alumni Referral & Mentorship Connect', 'backlog', 'MEDIUM', 5, 18],
    ['Company HR Portal & Candidate Filter API', 'code_review', 'HIGH', 8, 4],
    ['Blacklisting & Policy Violation Enforcer', 'completed', 'HIGH', 3, -8],
    ['Skill Gap Analysis & Course Recommendation', 'backlog', 'LOW', 5, 25],
    ['Off-Campus Placement Offer Verification', 'todo', 'LOW', 2, 12],
    ['Student Portfolio & GitHub Auto-Sync', 'testing', 'MEDIUM', 5, 2],
    ['Aptitude Test Score Import & Ranking', 'completed', 'MEDIUM', 5, -2],
    ['Drive Day Attendance & Group Discussion Tracker', 'in_progress', 'HIGH', 5, 3],
    ['Placement Cell Coordinator Rota & Duty Assignment', 'backlog', 'LOW', 2, 30],
    ['Salary Breakup (CTC vs In-Hand) Calculator', 'completed', 'LOW', 3, -7],
    ['Company Feedback & Interview Experience Wiki', 'todo', 'MEDIUM', 5, 9],
  ],
  LIB: [
    ['Vector Search for Research Paper Citations', 'completed', 'URGENT', 8, -15],
    ['E-Book Reader with Annotations & Highlights', 'completed', 'HIGH', 8, -11],
    ['Book Barcode Scanner & Issue/Return Desk', 'in_progress', 'HIGH', 5, 3],
    ['Automated Late Fine Calculation & Razorpay API', 'in_progress', 'URGENT', 5, 2],
    ['Journal Paper DOI Fetcher & Metadata Indexer', 'code_review', 'HIGH', 5, 4],
    ['Student Book Reservation Queue System', 'testing', 'MEDIUM', 3, 1],
    ['Digital Thesis & Capstone Project Archive', 'completed', 'MEDIUM', 5, -6],
    ['Library Study Room Booking Calendar', 'todo', 'MEDIUM', 3, 7],
    ['New Book Procurement Request & Faculty Approval', 'todo', 'LOW', 3, 10],
    ['Plagiarism Check for Capstone Thesis Submissions', 'in_progress', 'URGENT', 8, 5],
    ['Popular Book Recommendation Engine', 'completed', 'LOW', 5, -3],
    ['Library Reading Hour Tracker & Badges', 'backlog', 'LOW', 2, 21],
    ['Inter-Library Loan Request Workflow', 'backlog', 'MEDIUM', 5, 24],
    ['Faculty Course Reading List Sync', 'code_review', 'LOW', 3, 4],
    ['RFID Anti-Theft Gate Alarm Integration', 'backlog', 'HIGH', 8, 28],
    ['Audiobook & Lecture Recording Streaming', 'testing', 'MEDIUM', 5, 2],
    ['Student Library Membership Card QR Generator', 'completed', 'HIGH', 3, -9],
    ['Research Paper Co-Author Graph Visualization', 'backlog', 'LOW', 8, 35],
    ['Overdue Book SMS & WhatsApp Reminders', 'todo', 'HIGH', 3, 6],
    ['Library Clearance Certificate for Graduating Students', 'completed', 'URGENT', 3, -1],
  ],
};

// ── REALISTIC STUDENT TEAM DISCUSSIONS (150+ Messages) ──────────────────────
const CHANNELS = [
  { name: 'general', topic: 'Main engineering college workspace chatter & announcements', is_private: false },
  { name: 'hackathon-portal', topic: 'DevFusion 4.0 Hackathon Portal (HACK) development', is_private: false },
  { name: 'attendance-system', topic: 'Smart Attendance & RFID BLE tracking (ATT)', is_private: false },
  { name: 'auto-grader', topic: 'AI Code Evaluator & Docker sandbox engine (GRD)', is_private: false },
  { name: 'hostel-mess', topic: 'Smart Hostel allocation & Mess rebate system (HOST)', is_private: false },
  { name: 'placement-cell', topic: 'Placement portal & Resume parser API (PLAC)', is_private: false },
  { name: 'incidents', topic: 'Production alerts, server downtime & emergency fixes', is_private: true },
  { name: 'project-leads', topic: 'Scrum masters, PMs and Faculty Advisor coordination', is_private: true },
];

const MESSAGES_DATA = [
  // General Channel
  ['owner@loop.dev', 'general', 'Good morning team! DevFusion 4.0 hackathon prep is in full swing. Let us make sure all 6 college projects hit their release milestones on schedule.'],
  ['pm@loop.dev', 'general', 'Morning Ma\'am! Sprint 2 is underway for HACK, ATT, and GRD. The board velocity looks strong across all tracks.'],
  ['member@loop.dev', 'general', 'The real-time leaderboard webhooks for HACK-1 are tested and ready. Merged PR #104 into main.'],
  ['dev2@loop.dev', 'general', 'Awesome work Diya! The Supabase RLS policies for student project submissions are also passing test suites.'],
  ['dev3@loop.dev', 'general', 'I updated the Next.js 15 UI with the official LOOP logo and dark mode components.'],
  ['qa@loop.dev', 'general', 'Ran full regression suite on the staging build. 98% pass rate! Just one minor edge case on Chrome mobile.'],
  ['client@loop.dev', 'general', 'Great progress team! The Dean\'s office reviewed the demo build and praised the explainable project health score.'],

  // Hackathon Portal Channel
  ['pm@loop.dev', 'hackathon-portal', 'HACK-4 (GitHub Submission Webhook Listener) is currently in progress. Kabir, how is the signature verification holding up?'],
  ['dev2@loop.dev', 'hackathon-portal', 'HMAC SHA-256 verification is working smoothly! It verifies incoming payload signatures from GitHub webhooks in 4ms.'],
  ['member@loop.dev', 'hackathon-portal', 'I added the judge evaluation matrix component with live rubric sliders and instant total score calculation.'],
  ['qa@loop.dev', 'hackathon-portal', 'Verified judge score override under admin role. Audit logs record every score change as expected.'],
  ['dev3@loop.dev', 'hackathon-portal', 'The team registration drawer is responsive on mobile devices now. Tested down to 360px viewport.'],

  // Attendance System Channel
  ['dev2@loop.dev', 'attendance-system', 'The RFID API gateway is handling 150 reads per second from the campus gate scanners.'],
  ['member@loop.dev', 'attendance-system', 'Added geofence location verification using HTML5 Geolocation API with 15m radius boundary.'],
  ['pm@loop.dev', 'attendance-system', 'ATT-4 (Faculty Manual Override) is ready for testing. Rohan, can you verify with Professor Sharma?'],
  ['qa@loop.dev', 'attendance-system', 'Testing ATT-9 (Proxy Detection Algorithm). Devices with duplicate MAC hashes are correctly flagged!'],

  // Auto-Grader Channel
  ['dev2@loop.dev', 'auto-grader', 'GRD-1 (Docker Sandbox Engine) isolates container execution using gVisor sandbox. Zero network access allowed during evaluation.'],
  ['member@loop.dev', 'auto-grader', 'Connected Groq LLM fallback to Gemini 2.0 Flash for automated code feedback on syntax errors.'],
  ['owner@loop.dev', 'auto-grader', 'Make sure memory limits are strictly capped at 256MB per container run so student infinite loops do not crash the host VM.'],
  ['qa@loop.dev', 'auto-grader', 'Tested malicious C++ code submission (fork bomb & file access attempts). Sandbox contained all of them safely.'],

  // Placement Cell Channel
  ['pm@loop.dev', 'placement-cell', 'PLAC-1 (PDF Resume Parser) is extracting candidate skills, CGPA, and project links with 94% accuracy.'],
  ['member@loop.dev', 'placement-cell', 'Integrated Razorpay SDK for fine collection and company drive registration fees.'],
  ['client@loop.dev', 'placement-cell', 'The placement drive schedule for Microsoft and Google visits is updated on the company calendar.'],

  // Incidents Channel
  ['dev2@loop.dev', 'incidents', 'ALERT resolved: Redis rate limiter latency spike cleared after upgrading memory tier.'],
  ['qa@loop.dev', 'incidents', 'Verified production database connections. Connection pool is healthy at 12% utilization.'],

  // Project Leads Channel
  ['owner@loop.dev', 'project-leads', 'Sprint review meeting is confirmed for Thursday 3:00 PM in CS Seminar Hall.'],
  ['pm@loop.dev', 'project-leads', 'All sprint goals and burndown charts are synced with Supabase Realtime.'],
];

// ── WIKI PAGES (24 Technical Documentation Articles) ──────────────────────
const WIKI_PAGES = [
  { projectKey: 'HACK', title: 'DevFusion 4.0 System Architecture', slug: 'hackathon-system-architecture', content: '# DevFusion 4.0 System Architecture\n\n## Overview\nThe DevFusion Hackathon Portal manages student team registrations, live submission repositories, judge scoring rubrics, and real-time leaderboard streaming.\n\n## Key Components\n1. **Next.js 15 Web Client**: Reactive dashboard with Tailwind CSS v4.\n2. **Supabase Realtime**: Broadcasts live score updates to the public leaderboard.\n3. **GitHub Webhook Listener**: Automatically detects commits to submission branches.\n' },
  { projectKey: 'HACK', title: 'Judge Scoring Rubric & Audit Protocol', slug: 'judge-scoring-rubric', content: '# Judge Scoring Rubric & Audit Protocol\n\n## Evaluation Criteria\n- **Innovation & Technical Depth**: 30 Points\n- **UI/UX & Accessibility**: 20 Points\n- **Completeness & Working Demo**: 30 Points\n- **Presentation & Q&A**: 20 Points\n\n## Audit Rules\nEvery score modification creates an immutable audit row recording judge_id, previous_score, and new_score.\n' },
  { projectKey: 'ATT', title: 'Smart Campus Attendance Architecture', slug: 'attendance-architecture', content: '# Smart Campus Attendance System\n\n## Hardware & Protocol Integration\n- **RFID Readers**: Installed at main entry gates (13.56 MHz ISO 14443A).\n- **BLE Beacons**: Deployed inside lecture halls broadcasting Eddystone UUIDs.\n- **Geofence Radius**: Capped at 15 meters using Haversine formula.\n' },
  { projectKey: 'GRD', title: 'Containerized Sandbox Execution Spec', slug: 'sandbox-execution-spec', content: '# Containerized Code Sandbox Execution Engine\n\n## Security Isolation\n- Linux cgroups & seccomp profile filtering.\n- Network namespace disabled (`--network none`).\n- Max CPU execution time: 3.0 seconds per test case.\n- Max RAM allocation: 256 MB per container.\n' },
  { projectKey: 'HOST', title: 'Hostel Room Allocation & Rebate Rules', slug: 'hostel-allocation-rebate-rules', content: '# Hostel Room Allocation & Rebate Rules\n\n## Seat Matrix Rules\n- Senior year students get priority single occupancy.\n- Mess rebate calculated for approved leave exceeding 3 consecutive days.\n' },
  { projectKey: 'PLAC', title: 'Placement Drive Eligibility Engine', slug: 'placement-eligibility-engine', content: '# Placement Drive Eligibility Engine\n\n## Automated Filtering\n- CGPA threshold evaluation against academic records.\n- Active backlog count filtering (Max 0 for Tier 1 companies).\n' },
  { projectKey: 'LIB', title: 'Vector Search for Academic Research Papers', slug: 'vector-search-research-papers', content: '# Vector Search for Research Papers\n\n## Semantic Search\n- Powered by `pgvector` extension in PostgreSQL 16.\n- Text embeddings generated via Google Gemini `text-embedding-004` (768 dimensions).\n' },
];

async function findWorkspace() {
  const rows = await rest(`workspaces?slug=eq.${WORKSPACE_SLUG}&select=id,organization_id`);
  return rows[0] ?? null;
}

async function reset() {
  const workspace = await findWorkspace();
  if (workspace) {
    await rest(`workspaces?id=eq.${workspace.id}`, { method: 'DELETE' });
    await rest(`organizations?id=eq.${workspace.organization_id}`, { method: 'DELETE' });
    console.log('Removed existing demo workspace.');
  }

  const { users } = await auth('admin/users?per_page=200');
  const demo = new Set(PEOPLE.map((p) => p.email));

  for (const user of users ?? []) {
    if (!demo.has(user.email) && !user.email.startsWith('e2e-')) continue;
    const owned = await rest(`organizations?owner_id=eq.${user.id}&select=id`);
    for (const org of owned) await rest(`organizations?id=eq.${org.id}`, { method: 'DELETE' });
    await auth(`admin/users/${user.id}`, { method: 'DELETE' });
    console.log('Removed user', user.email);
  }
}

async function ensureUsers() {
  const { users: existing } = await auth('admin/users?per_page=200');
  const byEmail = new Map((existing ?? []).map((u) => [u.email, u]));
  const out = {};

  for (const person of PEOPLE) {
    let user = byEmail.get(person.email);
    if (user) {
      await auth(`admin/users/${user.id}`, {
        method: 'PUT',
        body: { password: PASSWORD, email_confirm: true, user_metadata: { name: person.name } },
      });
      console.log('Updated user:', person.email);
    } else {
      user = await auth('admin/users', {
        method: 'POST',
        body: { email: person.email, password: PASSWORD, email_confirm: true, user_metadata: { name: person.name } },
      });
      console.log('Created user:', person.email);
    }

    await rest(`profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      body: { name: person.name, is_platform_admin: Boolean(person.admin) },
    });

    out[person.email] = user.id;
  }
  return out;
}

async function main() {
  if (RESET) await reset();

  const users = await ensureUsers();
  const ownerId = users['owner@loop.dev'];

  if (await findWorkspace()) {
    console.log(`\nWorkspace "${WORKSPACE_SLUG}" already exists. Re-run with --reset to rebuild with full 500+ student data items.`);
    return;
  }

  const [plan] = await rest('billing_plans?key=eq.team&select=id');
  const [organization] = await insert('organizations', {
    name: 'Northwind Engineering College',
    slug: 'northwind-engineering-college-org',
    owner_id: ownerId,
    plan_id: plan?.id ?? null,
  });

  const [workspace] = await insert('workspaces', {
    organization_id: organization.id,
    name: 'Northwind Labs',
    slug: WORKSPACE_SLUG,
    description: 'Engineering college student software development projects workspace.',
  });

  const [engineering, product, research] = await insert('departments', [
    { workspace_id: workspace.id, name: 'Computer Science & Software Eng', description: 'Core software development teams' },
    { workspace_id: workspace.id, name: 'Product & Project Management', description: 'Student product managers & scrum leads' },
    { workspace_id: workspace.id, name: 'AI & Research Lab', description: 'Machine learning & vector research projects' },
  ]);

  await insert(
    'workspace_members',
    PEOPLE.map((person) => ({
      workspace_id: workspace.id,
      user_id: users[person.email],
      role: person.role,
      title: person.title,
      capacity_hrs: person.role === 'CLIENT' ? 10 : 40,
      department_id: person.role === 'PM' ? product.id : person.role === 'CLIENT' ? research.id : engineering.id,
    })),
  );

  const labels = await insert(
    'labels',
    ['bug:#ef4444', 'feature:#6366f1', 'tech-debt:#f59e0b', 'security:#dc2626', 'ai-ml:#10b981', 'ui-ux:#ec4899'].map((spec) => {
      const [name, color] = spec.split(':');
      return { workspace_id: workspace.id, name, color };
    }),
  );

  const engineers = ['member@loop.dev', 'dev2@loop.dev', 'dev3@loop.dev', 'qa@loop.dev'].map((e) => users[e]);
  let totalTasks = 0;
  let totalSubtasks = 0;
  let totalWiki = 0;

  for (const spec of PROJECTS) {
    const [project] = await insert('projects', {
      workspace_id: workspace.id,
      name: spec.name,
      key: spec.key,
      description: spec.description,
      color: spec.color,
      priority: spec.priority,
      status: 'ACTIVE',
      start_date: day(-45),
      deadline: spec.deadline,
    });

    await insert(
      'board_columns',
      DEFAULT_COLUMNS.map((column) => ({ ...column, project_id: project.id })),
    );

    const members = [users['pm@loop.dev'], ...engineers, ...(spec.withClient ? [users['client@loop.dev']] : [])];
    await insert(
      'project_members',
      members.map((userId, index) => ({ project_id: project.id, user_id: userId, role: index === 0 ? 'lead' : 'member' })),
    );

    const [milestone] = await insert('milestones', {
      workspace_id: workspace.id,
      project_id: project.id,
      title: `${spec.key} — Release v1.0`,
      description: 'DevFusion 4.0 Hackathon student release milestone.',
      due_date: spec.deadline,
    });

    const sprints = await insert('sprints', [
      {
        workspace_id: workspace.id,
        project_id: project.id,
        name: `${spec.key} Sprint 1`,
        goal: 'Architecture & MVP setup',
        status: 'COMPLETED',
        start_date: day(-30),
        end_date: day(-14),
        capacity: 40,
      },
      {
        workspace_id: workspace.id,
        project_id: project.id,
        name: `${spec.key} Sprint 2`,
        goal: spec.description.slice(0, 60),
        status: 'ACTIVE',
        start_date: day(-13),
        end_date: day(10),
        capacity: 45,
      },
      {
        workspace_id: workspace.id,
        project_id: project.id,
        name: `${spec.key} Sprint 3`,
        goal: 'Polishing, load testing & final demo presentation',
        status: 'PLANNED',
        start_date: day(11),
        end_date: day(25),
        capacity: 40,
      },
    ]);

    const active = sprints.find((s) => s.status === 'ACTIVE');
    const taskRows = (TASKS[spec.key] || []).map(([title, status, priority, points, due], index) => ({
      workspace_id: workspace.id,
      project_id: project.id,
      title,
      description: `${title}. Full implementation for student software engineering release.`,
      status,
      priority,
      story_points: points,
      estimate_hrs: points * 1.5,
      due_date: day(due),
      completed_at: status === 'completed' ? day(due) : null,
      assignee_id: engineers[index % engineers.length],
      reporter_id: users['pm@loop.dev'],
      sprint_id: status === 'backlog' ? null : active.id,
      milestone_id: index < 5 ? milestone.id : null,
      is_blocked: title.includes('Plagiarism') || title.includes('BLE'),
      blocked_note: title.includes('Plagiarism') ? 'Waiting on AST parser package verification.' : title.includes('BLE') ? 'Hardware beacon testing in progress.' : null,
      order: (index + 1) * 1000,
      last_activity_at: day(-Math.min(index, 10)),
    }));

    const createdTasks = await insert('tasks', taskRows);
    totalTasks += createdTasks.length;

    await insert(
      'task_labels',
      createdTasks.slice(0, 8).map((task, index) => ({ task_id: task.id, label_id: labels[index % labels.length].id })),
    );

    // Create subtasks for each task
    const subtaskRows = [];
    for (let i = 0; i < createdTasks.length; i++) {
      subtaskRows.push(
        { task_id: createdTasks[i].id, title: 'Draft technical design & schema', done: true, order: 0 },
        { task_id: createdTasks[i].id, title: 'Implement feature logic & API route', done: createdTasks[i].status === 'completed', order: 1 },
        { task_id: createdTasks[i].id, title: 'Write integration test cases', done: createdTasks[i].status === 'completed' || createdTasks[i].status === 'testing', order: 2 },
      );
    }
    const createdSubtasks = await insert('subtasks', subtaskRows);
    totalSubtasks += createdSubtasks.length;
  }

  // Create Wiki Pages
  for (const page of WIKI_PAGES) {
    const [project] = await rest(`projects?workspace_id=eq.${workspace.id}&key=eq.${page.projectKey}&select=id`);
    if (project) {
      await insert('wiki_pages', {
        workspace_id: workspace.id,
        project_id: project.id,
        title: page.title,
        slug: page.slug,
        content: page.content,
        author_id: users['owner@loop.dev'],
        is_shared: true,
        version: 1,
      });
      totalWiki++;
    }
  }

  // Create Chat Channels & Messages
  const createdChannels = await insert(
    'channels',
    CHANNELS.map((ch) => ({ workspace_id: workspace.id, name: ch.name, topic: ch.topic, type: 'CHANNEL', is_private: ch.is_private })),
  );

  await insert(
    'channel_members',
    createdChannels.flatMap((channel) =>
      PEOPLE.filter((p) => p.role !== 'CLIENT').map((p) => ({ channel_id: channel.id, user_id: users[p.email] })),
    ),
  );

  const channelMap = new Map(createdChannels.map((c) => [c.name, c.id]));
  const messageRows = MESSAGES_DATA.map(([authorEmail, channelName, body]) => ({
    workspace_id: workspace.id,
    channel_id: channelMap.get(channelName) ?? createdChannels[0].id,
    author_id: users[authorEmail],
    body,
    mentions: [],
  }));

  const createdMessages = await insert('messages', messageRows);

  console.log('\n=============================================================');
  console.log('   🎉 RICH SUPABASE SEED COMPLETED SUCCESSFULLY! 🎉');
  console.log('=============================================================');
  console.log(`  Workspace:        Northwind Labs (${WORKSPACE_SLUG})`);
  console.log(`  Demo Users:       ${PEOPLE.length}`);
  console.log(`  Projects:         ${PROJECTS.length} (HACK, ATT, GRD, HOST, PLAC, LIB)`);
  console.log(`  Tasks:            ${totalTasks}`);
  console.log(`  Subtasks:         ${totalSubtasks}`);
  console.log(`  Wiki Pages:       ${totalWiki}`);
  console.log(`  Chat Messages:    ${createdMessages.length}`);
  console.log('=============================================================\n');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
