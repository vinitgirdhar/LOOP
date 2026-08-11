'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { cx } from '@/lib/format';

export function FeaturesInfographic() {
  // Interactive state for Auto-Pilot preview
  const [activeTrigger, setActiveTrigger] = useState<'pr' | 'chat'>('pr');
  
  // Interactive state for Ask Workspace RAG perspective
  const [ragRole, setRagRole] = useState<'internal' | 'client'>('internal');


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
              <Icon.chevronRight width={13} height={13} className="shrink-0 text-[var(--text-faint)]" />
              <div className="flex-1 rounded-lg bg-[var(--success-soft)] p-2 text-center border border-[var(--success)] text-[var(--success)] font-bold ">
                Rules: 94%
              </div>
              <Icon.chevronRight width={13} height={13} className="shrink-0 text-[var(--text-faint)]" />
              <div className="flex-1 rounded-lg bg-[var(--surface)] p-2 text-center border border-[var(--border)] font-semibold">
                Audit Log
              </div>
            </div>

            {/* Proposal Inbox Mini Card */}
            <div className="rounded-xl border border-[var(--success)] bg-[var(--surface)] p-2.5 text-xs shadow-sm">
              <div className="flex items-center justify-between font-semibold">
                <span className="text-[var(--success)] flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-pulse" />
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
                <span className="rounded bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--success)]">
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
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Icon.chart width={22} height={22} />
            </span>
            <span className="badge bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold">
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
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-soft)] border-4 border-[var(--success)] text-[var(--success)] font-extrabold text-lg ">
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
                { label: 'Overdue Ratio (25%)', val: '92%', color: 'bg-[var(--success)]' },
                { label: 'Blocked Chains (20%)', val: '100%', color: 'bg-[var(--success)]' },
                { label: 'Velocity Trend (25%)', val: '84%', color: 'bg-[var(--accent)]' },
                { label: 'WIP Overload (15%)', val: '75%', color: 'bg-[var(--warning)]' },
                { label: 'Silent Tasks (15%)', val: '90%', color: 'bg-[var(--success)]' },
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
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Icon.search width={22} height={22} />
            </span>
            <span className="badge bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold">
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
                  className={cx('rounded-md px-2 py-0.5 font-semibold transition-all', ragRole === 'internal' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--text-muted)]')}
                >
                  PM / Dev View
                </button>
                <button
                  onClick={() => setRagRole('client')}
                  className={cx('rounded-md px-2 py-0.5 font-semibold transition-all', ragRole === 'client' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--text-muted)]')}
                >
                  Client View
                </button>
              </div>
            </div>

            {/* Prompt & Citation Result */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs space-y-2">
              <p className="font-semibold text-[var(--text-muted)]">Q: &quot;What is blocking sprint release?&quot;</p>
              
              {ragRole === 'internal' ? (
                <div className="space-y-1.5 text-[11px] text-[var(--text)]">
                  <p className="flex items-center gap-1.5 font-medium text-[var(--accent)]">
                    <Icon.check width={12} height={12} className="shrink-0" />
                    Full internal access: found 2 sources (chat + commits)
                  </p>
                  <div className="rounded bg-[var(--accent-soft)] p-2 font-mono text-[10px] text-[var(--accent)]">
                    [Cited #proj-pay]: &quot;Stuck on PAY-6 rate limit&quot; (Internal Slack)
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-[11px] text-[var(--text)]">
                  <p className="flex items-center gap-1.5 font-medium text-[var(--success)]">
                    <Icon.lock width={12} height={12} className="shrink-0" />
                    Client security guard: internal chat filtered out
                  </p>
                  <div className="rounded bg-[var(--success-soft)] p-2 font-mono text-[10px] text-[var(--success)]">
                    [Cited Shared Wiki]: &quot;Sprint 4 Roadmap &amp; Release Schedule&quot;
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--warning-soft)] text-[var(--warning)]">
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
                <span className="block text-xs font-bold text-[var(--warning)]">4</span>
              </div>
              <div className="rounded-lg bg-[var(--surface)] p-1.5 border border-[var(--border-subtle)] text-center">
                <span className="font-bold text-[var(--text-muted)]">In Progress</span>
                <span className="block text-xs font-bold text-[var(--accent)]">2</span>
              </div>
              <div className="rounded-lg bg-[var(--surface)] p-1.5 border border-[var(--border-subtle)] text-center">
                <span className="font-bold text-[var(--text-muted)]">Done</span>
                <span className="block text-xs font-bold text-[var(--success)]">12</span>
              </div>
            </div>
          </div>

          {/* Card 2: Sprints and Burndown */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--border-strong)] transition-all">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--danger-soft)] text-[var(--danger)]">
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
                <span className="block text-[10px] text-[var(--success)] font-semibold">+18% vs last sprint</span>
              </div>
              <div className="flex items-end gap-1 h-7">
                <span className="w-2 rounded-t bg-[var(--danger)] h-6" />
                <span className="w-2 rounded-t bg-[var(--danger)] h-5" />
                <span className="w-2 rounded-t bg-[var(--success)] h-4" />
                <span className="w-2 rounded-t bg-[var(--success)] h-2" />
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
                <span className="h-2 w-2 rounded-full bg-[var(--success)] animate-ping" />
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--success-soft)] text-[var(--success)]">
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
              <span className="rounded bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--success)]">
                256-Bit Encrypted
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
