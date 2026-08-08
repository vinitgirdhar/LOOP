'use client';

/**
 * Charts are hand-rolled SVG. Three small components cover every chart in the
 * product, they inherit the theme variables, and they add nothing to the
 * bundle — which matters more on a phone than a charting library would.
 */

interface Series {
  label: string;
  color: string;
  points: { x: string; y: number }[];
  dashed?: boolean;
}

export function LineChart({ series, height = 180, yLabel }: { series: Series[]; height?: number; yLabel?: string }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <ChartEmpty height={height} />;

  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const maxY = Math.max(1, ...all.map((p) => p.y));
  const width = 100;
  const padTop = 6;
  const usable = 100 - padTop;

  const path = (points: { y: number }[]) =>
    points
      .map((point, index) => {
        const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
        const y = padTop + usable - (point.y / maxY) * usable;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={yLabel ?? 'chart'}>
          {[0, 25, 50, 75, 100].map((tick) => (
            <line key={tick} x1="0" x2="100" y1={padTop + (usable * tick) / 100} y2={padTop + (usable * tick) / 100} stroke="var(--border)" strokeWidth="0.4" />
          ))}
          {series.map((s) => (
            <path
              key={s.label}
              d={path(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              {...(s.dashed ? { strokeDasharray: '4 3' } : {})}
            />
          ))}
        </svg>
        <span className="pointer-events-none absolute left-0 top-0 text-[10px] text-[var(--text-faint)]">{maxY}</span>
        <span className="pointer-events-none absolute bottom-0 left-0 text-[10px] text-[var(--text-faint)]">0</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-faint)]">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color, opacity: s.dashed ? 0.5 : 1 }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  data,
  height = 160,
  color = 'var(--accent)',
  format = (value: number) => String(value),
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  color?: string;
  format?: (value: number) => string;
}) {
  if (data.length === 0) return <ChartEmpty height={height} />;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="scroll-thin overflow-x-auto">
      <div className="flex min-w-full items-end gap-1.5" style={{ height }}>
        {data.map((item, index) => (
          <div key={`${item.label}-${index}`} className="group flex min-w-6 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-medium text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">{format(item.value)}</span>
            <div
              className="w-full rounded-t-[3px] transition-[height] duration-500"
              style={{ height: `${Math.max(2, (item.value / max) * 100)}%`, background: item.color ?? color }}
              title={`${item.label}: ${format(item.value)}`}
            />
            <span className="max-w-full truncate text-[9px] text-[var(--text-faint)]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({ value, size = 92, stroke = 9, color = 'var(--accent)', label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label ?? `${clamped}%`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-inset)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums leading-none">{Math.round(clamped)}</span>
        {label && <span className="mt-0.5 text-[9px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span>}
      </div>
    </div>
  );
}

/** Horizontal stacked bar — used for workload and time-by-project splits. */
export function StackedBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-inset)]">
        {segments.map((segment) => (
          <div key={segment.label} style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }} title={`${segment.label}: ${segment.value}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: segment.color }} />
            {segment.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const ChartEmpty = ({ height }: { height: number }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed text-xs text-[var(--text-faint)]" style={{ height }}>
    Not enough data yet
  </div>
);

export const CHART_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];
