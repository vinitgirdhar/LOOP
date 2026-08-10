'use client';

import { useState } from 'react';
import { Icon, IconName } from '@/components/icons';
import { cx } from '@/lib/format';

export function FeaturesInfographic() {
  // Interactive state for Auto-Pilot preview
  const [activeTrigger, setActiveTrigger] = useState<'pr' | 'chat'>('pr');
  
  // Interactive state for Ask Workspace RAG perspective
  const [ragRole, setRagRole] = useState<'internal' | 'client'>('internal');

  // Interactive state for Platform Essentials tab selection
  const [activeFeature, setActiveFeature] = useState<string>('kanban');

  return (
    <div className="space-y-12">
      {/* 1. HERO INFOGRAPHIC CARDS: THE 3 CORE DIFFERENTIATORS */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* DIFFERENTIATOR 1: Auto-Pilot Board */}
        <div className="group relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--bg-subtle)] p-6 shadow-sm transition-all duration-300 hover:border-[var(--accent)] hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Icon.bolt width={22} height={22} />
            </span>
            <span className="badge bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold">
              #1 Differentiator
            </span>
          </div>

          <h3 className="mt-4 text-xl font-bold text-[var(--text)]">Auto-Pilot Self-Updating Board</h3>
          <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
            Real activity from GitHub & Slack feeds a rules engine that proposes board changes with evidence.
          </p>

          {/* Infographic Diagram Flow */}
          <div className="mt-5 space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)]">
              <span>Event Trigger Flow</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTrigger('pr')}
                  className={cx('rounded-md px-2 py-0.5 transition-all', activeTrigger === 'pr' ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--surface)] text-[var(--text-muted)]')}
                >
                  PR Merged
                </button>
                <button
                  onClick={() => setActiveTrigger('chat')}
                  className={cx('rounded-md px-2 py-0.5 transition-all', activeTrigger === 'chat' ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--surface)] text-[var(--text-muted)]')}
                >
                  Chat Blocker
                </button>
              </div>
            </div>

            {/* Visual Pipeline */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <div className="flex-1 truncate rounded-lg bg-[var(--surface)] p-2 text-center border border-[var(--border)] font-semibold text-[var(--accent)]">
                {activeTrigger === 'pr' ? 'github: PAY-12' : 'slack: #proj-pay'}
              </div>
              <span className="text-[var(--text-faint)]">➔</span>
              <div className="flex-1 rounded-lg bg-emerald-500/10 p-2 text-center border border-emerald-500/30 text-emerald-600 font-bold dark:text-emerald-400">
                Rules: 94%
              </div>
              <span className="text-[var(--text-faint)]">➔</span>
              <div className="flex-1 rounded-lg bg-[var(--surface)] p-2 text-center border border-[var(--border)] font-semibold">
                Audit Log
              </div>
            </div>

            {/* Proposal Inbox Mini Card */}
            <div className="rounded-xl border border-emerald-500/40 bg-[var(--surface)] p-2.5 text-xs shadow-sm">
              <div className="flex items-center justify-between font-semibold">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Proposal #{activeTrigger === 'pr' ? 'PAY-12' : 'PAY-6'}
                </span>
                <span className="text-[10px] text-[var(--text-faint)]">94% Confidence</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-muted)] font-medium">
                {activeTrigger === 'pr'
                  ? 'Move PAY-12 to Code Review (Branch feat/pay-12 merged)'
                  : 'Flag PAY-6 as Blocked ("stuck on API rate limit")'}
              </p>
              <div className="mt-2 flex gap-1.5">
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Accept & Update
                </span>
                <span className="rounded bg-[var(--bg-inset)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                  Reject
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* DIFFERENTIATOR 2: Explainable Project Health */}
        <div className="group relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--bg-subtle)] p-6 shadow-sm transition-all duration-300 hover:border-[var(--accent)] hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Icon.chart width={22} height={22} />
            </span>
            <span className="badge bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
              Deterministic Math
            </span>
          </div>

          <h3 className="mt-4 text-xl font-bold text-[var(--text)]">0–100 Explainable Health Score</h3>
          <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
            Deterministic score calculated from 5 published signals. AI only writes the plain English summary.
          </p>

          {/* Infographic Gauge & Signals */}
          <div className="mt-5 space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 border-4 border-emerald-500 text-emerald-600 font-extrabold text-lg dark:text-emerald-400">
                  88
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--text)]">Project Health: Healthy</p>
                  <p className="text-[11px] text-[var(--text-muted)]">5/5 Signals calculated</p>
                </div>
              </div>
            </div>

            {/* Signal Breakdown Bars */}
            <div className="space-y-1.5 text-[11px]">
              {[
                { label: 'Overdue Ratio (25%)', val: '92%', color: 'bg-emerald-500' },
                { label: 'Blocked Chains (20%)', val: '100%', color: 'bg-emerald-500' },
                { label: 'Velocity Trend (25%)', val: '84%', color: 'bg-blue-500' },
                { label: 'WIP Overload (15%)', val: '75%', color: 'bg-amber-500' },
                { label: 'Silent Tasks (15%)', val: '90%', color: 'bg-emerald-500' },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)] truncate w-32">{s.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                    <div className={cx('h-full rounded-full', s.color)} style={{ width: s.val }} />
                  </div>
                  <span className="font-mono font-semibold w-8 text-right">{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DIFFERENTIATOR 3: Permission-Aware Ask the Workspace RAG */}
        <div className="group relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--bg-subtle)] p-6 shadow-sm transition-all duration-300 hover:border-[var(--accent)] hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Icon.search width={22} height={22} />
            </span>
            <span className="badge bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-semibold">
              RBAC AI RAG
            </span>
          </div>

          <h3 className="mt-4 text-xl font-bold text-[var(--text)]">Ask the Workspace (RAG)</h3>
          <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
            Role permissions filter vectors before search — internal chat never leaks to client accounts.
          </p>

          {/* Infographic RAG Filter Comparison */}
          <div className="mt-5 space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[var(--text-muted)]">Switch Viewer Role:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setRagRole('internal')}
                  className={cx('rounded-md px-2 py-0.5 font-semibold transition-all', ragRole === 'internal' ? 'bg-purple-600 text-white' : 'bg-[var(--surface)] text-[var(--text-muted)]')}
                >
                  PM / Dev View
                </button>
                <button
                  onClick={() => setRagRole('client')}
                  className={cx('rounded-md px-2 py-0.5 font-semibold transition-all', ragRole === 'client' ? 'bg-purple-600 text-white' : 'bg-[var(--surface)] text-[var(--text-muted)]')}
                >
                  Client View
                </button>
              </div>
            </div>

            {/* Prompt & Citation Result */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs space-y-2">
              <p className="font-semibold text-[var(--text-muted)]">Q: "What is blocking sprint release?"</p>
              
              {ragRole === 'internal' ? (
                <div className="space-y-1.5 text-[11px] text-[var(--text)]">
                  <p className="text-purple-600 dark:text-purple-400 font-medium">
                    ✓ Full internal access: Found 2 sources (Chat + Commits)
                  </p>
                  <div className="rounded bg-purple-500/10 p-2 font-mono text-[10px] text-purple-700 dark:text-purple-300">
                    [Cited #proj-pay]: "Stuck on PAY-6 rate limit" (Internal Slack)
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-[11px] text-[var(--text)]">
                  <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                    🔒 Client Security Guard: Internal chat filtered out
                  </p>
                  <div className="rounded bg-emerald-500/10 p-2 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                    [Cited Shared Wiki]: "Sprint 4 Roadmap & Release Schedule"
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* 2. VISUAL INFOGRAPHIC MATRIX FOR CORE PLATFORM ESSENTIALS */}
      <div>
        <div className="text-center max-w-xl mx-auto mb-8">
          <h3 className="text-2xl font-bold text-[var(--text)]">Complete Platform Essentials</h3>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-muted)]">
            Everything your team needs out of the box — fully integrated, zero third-party plugin clutter.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          
          {/* Card 1: Kanban Board */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--border-strong)] transition-all">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Icon.board width={20} height={20} />
              </span>
              <div>
                <h4 className="font-bold text-base text-[var(--text)]">Kanban That Bends</h4>
                <p className="text-[11px] text-[var(--text-muted)]">Drag desktop / Tap mobile</p>
              </div>
            </div>
            {/* Visual Mini UI */}
            <div className="mt-3.5 grid grid-cols-3 gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2 text-[10px]">
              <div className="rounded-lg bg-[var(--surface)] p-1.5 border border-[var(--border-subtle)] text-center">
                <span className="font-bold text-[var(--text-muted)]">To Do</span>
                <span className="block text-xs font-bold text-amber-600">4</span>
              </div>
              <div className="rounded-lg bg-[var(--surface)] p-1.5 border border-[var(--border-subtle)] text-center">
                <span className="font-bold text-[var(--text-muted)]">In Progress</span>
                <span className="block text-xs font-bold text-blue-600">2</span>
              </div>
              <div className="rounded-lg bg-[var(--surface)] p-1.5 border border-[var(--border-subtle)] text-center">
                <span className="font-bold text-[var(--text-muted)]">Done</span>
                <span className="block text-xs font-bold text-emerald-600">12</span>
              </div>
            </div>
          </div>

          {/* Card 2: Sprints and Burndown */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--border-strong)] transition-all">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Icon.sprint width={20} height={20} />
              </span>
              <div>
                <h4 className="font-bold text-base text-[var(--text)]">Sprints & Burndown</h4>
                <p className="text-[11px] text-[var(--text-muted)]">Nightly velocity calculations</p>
              </div>
            </div>
            {/* Visual Mini Burndown Chart */}
            <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-[11px]">
              <div className="space-y-0.5">
                <span className="font-bold text-[var(--text)]">Sprint 14 Velocity</span>
                <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">+18% vs last sprint</span>
              </div>
              <div className="flex items-end gap-1 h-7">
                <span className="w-2 rounded-t bg-rose-400 h-6" />
                <span className="w-2 rounded-t bg-rose-400 h-5" />
                <span className="w-2 rounded-t bg-emerald-500 h-4" />
                <span className="w-2 rounded-t bg-emerald-500 h-2" />
              </div>
            </div>
          </div>

          {/* Card 3: Docs with History */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--border-strong)] transition-all">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Icon.doc width={20} height={20} />
              </span>
              <div>
                <h4 className="font-bold text-base text-[var(--text)]">Docs & Version Control</h4>
                <p className="text-[11px] text-[var(--text-muted)]">Markdown, tables, 1-click restore</p>
              </div>
            </div>
            {/* Visual Mini Doc Version Tree */}
            <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-[11px]">
              <span className="font-mono text-xs font-bold text-[var(--text)]">api_spec_v2.4.md</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                Shared to Client
              </span>
            </div>
          </div>

          {/* Card 4: Real-time Chat */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--border-strong)] transition-all">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Icon.chat width={20} height={20} />
              </span>
              <div>
                <h4 className="font-bold text-base text-[var(--text)]">Real-time WebSocket Chat</h4>
                <p className="text-[11px] text-[var(--text-muted)]">Channels, threads, @mentions</p>
              </div>
            </div>
            {/* Visual Mini Chat Pill */}
            <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-semibold">#proj-payments</span>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">4 typing...</span>
            </div>
          </div>

          {/* Card 5: Time Tracking */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--border-strong)] transition-all">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <Icon.clock width={20} height={20} />
              </span>
              <div>
                <h4 className="font-bold text-base text-[var(--text)]">Built-in Time Logger</h4>
                <p className="text-[11px] text-[var(--text-muted)]">Stopwatch, capacity & daily logs</p>
              </div>
            </div>
            {/* Visual Mini Timer Widget */}
            <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-[11px]">
              <span className="font-mono text-xs font-extrabold text-teal-600 dark:text-teal-400">03:42:19</span>
              <span className="rounded bg-teal-500/15 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                ● Live Logging
              </span>
            </div>
          </div>

          {/* Card 6: Security You Can Audit */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--border-strong)] transition-all">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Icon.shield width={20} height={20} />
              </span>
              <div>
                <h4 className="font-bold text-base text-[var(--text)]">Auditable RBAC Security</h4>
                <p className="text-[11px] text-[var(--text-muted)]">OAuth 2.0, audit log exports</p>
              </div>
            </div>
            {/* Visual Mini Audit Pill */}
            <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2.5 text-[11px]">
              <span className="font-mono text-[10px] font-semibold text-[var(--text-muted)]">AUDIT_LOG_EXPORT</span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                256-Bit Encrypted
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
