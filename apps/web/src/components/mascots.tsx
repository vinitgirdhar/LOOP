import type { CSSProperties } from 'react';

/*
  The three mascots.

  Flat monochrome line figures: skin and paper take the surface colour, hair,
  clothes and props take `currentColor`. Nothing here is hard-coded to black,
  so the same drawing reads as ink on paper in light mode and paper on ink
  inside a `.panel-ink` or in dark mode — set the text colour and it follows.

  Each figure is drawn once on a 200×260 canvas and shown through one of two
  viewBoxes: the whole body for onboarding and empty states, or a crop of the
  head and shoulders for an avatar. Same paths, no second set of drawings.
*/

export type MascotId = 'ava' | 'ben' | 'cleo';

export const MASCOT_IDS: readonly MascotId[] = ['ava', 'ben', 'cleo'] as const;

export const MASCOT_LABELS: Record<MascotId, string> = {
  ava: 'Figure carrying two boxes',
  ben: 'Figure holding a checklist',
  cleo: 'Figure celebrating with a letter',
};

const VIEW_BOX = {
  full: '0 0 200 260',
  /* Head and shoulders: high enough to keep Cleo's bun, wide enough to keep
     her raised hand, low enough that the shoulders close off the bottom. */
  bust: '46 6 104 104',
} as const;

/**
 * Picks a mascot from any stable string — a user id, or their name when no id
 * is to hand. Pure and deterministic, so the server and the client agree and
 * the same person keeps the same face on every screen.
 */
export function mascotFor(seed: string | null | undefined): MascotId {
  const value = seed?.trim() || 'loop';
  // djb2. Small, stable, and good enough to spread names across three buckets.
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return MASCOT_IDS[Math.abs(hash) % MASCOT_IDS.length];
}

/* ── shared body parts ───────────────────────────────────────────────── */

const PAPER = 'var(--mascot-paper, var(--surface))';

const Shadow = () => <ellipse cx="100" cy="248" rx="54" ry="6" fill="currentColor" opacity="0.1" />;

const Legs = ({ swing = 0 }: { swing?: number }) => (
  <g fill="currentColor">
    <path d={`M82 152L${78 - swing} 234h18l2-82z`} />
    <path d={`M102 152l${2 + swing} 82h18l-4-82z`} />
    <rect x={70 - swing} y="230" width="30" height="11" rx="5.5" />
    <rect x={100 + swing} y="230" width="30" height="11" rx="5.5" />
  </g>
);

const Face = ({ smile = 'M93 71q7 6 14 0' }: { smile?: string }) => (
  <g>
    <circle cx="90" cy="61" r="2.8" fill="currentColor" />
    <circle cx="110" cy="61" r="2.8" fill="currentColor" />
    <path d={smile} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </g>
);

const HeadShape = () => (
  <>
    <path d="M94 82h12v14H94z" fill={PAPER} stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="100" cy="60" r="27" fill={PAPER} stroke="currentColor" strokeWidth="3" />
  </>
);

/* ── figures ─────────────────────────────────────────────────────────── */

/** Carrying a box in each hand — "we bring the work to you". */
const Ava = () => (
  <>
    <Shadow />
    <Legs />
    <HeadShape />
    {/*
      Hair is a rim, not a cap: the outer edge follows the skull, the inner
      edge is the fringe line, and everything below it stays face.
    */}
    <path
      d="M73 68C70 40 84 30 100 30s30 10 27 38v12s-3-14-6-20c-5-8-13-12-21-12s-16 4-21 12c-3 6-6 20-6 20z"
      fill="currentColor"
    />
    <Face />
    {/* torso and arms */}
    <path
      d="M100 88c-16 0-26 8-28 24l-4 38c0 6 6 8 12 8h40c6 0 12-2 12-8l-4-38c-2-16-12-24-28-24z"
      fill="currentColor"
    />
    <path d="M76 96c-14 6-22 26-26 50l14 4c4-22 10-36 18-44z" fill="currentColor" />
    <path d="M124 96c14 6 22 26 26 50l-14 4c-4-22-10-36-18-44z" fill="currentColor" />
    <circle cx="57" cy="150" r="8" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    <circle cx="143" cy="150" r="8" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    {/* the two boxes */}
    <rect x="26" y="158" width="44" height="52" rx="7" fill="currentColor" />
    <rect x="130" y="158" width="44" height="52" rx="7" fill="currentColor" />
    <path d="M38 158v-6h20v6M142 158v-6h20v6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="18" cy="120" r="4" fill="currentColor" opacity="0.35" />
    <circle cx="184" cy="96" r="5" fill="currentColor" opacity="0.25" />
  </>
);

/** Holding a checked-off list — "everything accounted for". */
const Ben = () => (
  <>
    <Shadow />
    <Legs swing={2} />
    <HeadShape />
    {/* short crop — the fringe sits higher and there are no side panels */}
    <path d="M74 62C71 36 86 28 100 28s29 8 26 34v3s-3-11-7-16c-5-6-12-8-19-8s-14 3-19 9c-4 5-7 15-7 15z" fill="currentColor" />
    <Face smile="M93 70q7 7 14 0" />
    <path
      d="M100 88c-16 0-26 8-28 24l-4 38c0 6 6 8 12 8h40c6 0 12-2 12-8l-4-38c-2-16-12-24-28-24z"
      fill="currentColor"
    />
    {/* arms bent forward — the sheet sits low enough to leave the chest showing */}
    <path d="M76 96c-12 10-18 32-16 52l15-2c-1-18 2-30 8-36z" fill="currentColor" />
    <path d="M124 96c12 10 18 32 16 52l-15-2c1-18-2-30-8-36z" fill="currentColor" />
    {/* the sheet */}
    <rect x="62" y="124" width="76" height="58" rx="9" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    <path
      d="M76 141h36M76 153h48M76 165h28"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      opacity="0.85"
    />
    <circle cx="68" cy="152" r="9" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    <circle cx="132" cy="152" r="9" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    {/* the tick badge */}
    <circle cx="138" cy="176" r="15" fill="currentColor" />
    <path d="M131 176l5 5 10-11" fill="none" stroke={PAPER} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="22" cy="100" r="5" fill="currentColor" opacity="0.25" />
    <circle cx="180" cy="70" r="4" fill="currentColor" opacity="0.35" />
  </>
);

/** One arm up, a letter in the other — "you're all set". */
const Cleo = () => (
  <>
    <Shadow />
    <Legs swing={-3} />
    <HeadShape />
    {/* bun and hair */}
    <circle cx="100" cy="25" r="13" fill="currentColor" />
    <path d="M73 68C70 40 84 32 100 32s30 8 27 36v10s-3-13-6-19c-5-8-13-11-21-11s-16 3-21 11c-3 6-6 19-6 19z" fill="currentColor" />
    <Face smile="M92 70q8 8 16 0" />
    <path
      d="M100 88c-16 0-26 8-28 24l-4 38c0 6 6 8 12 8h40c6 0 12-2 12-8l-4-38c-2-16-12-24-28-24z"
      fill="currentColor"
    />
    {/* Left arm thrown up. Stroked rather than filled — a tapered outline this
        far from the body reads as a detached hook at avatar size. */}
    <path d="M80 98L59 60" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
    <circle cx="56" cy="54" r="8.5" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    {/* right arm out with the letter */}
    <path d="M124 96c14 5 22 21 24 38l-15 3c-2-17-7-27-15-33z" fill="currentColor" />
    <circle cx="141" cy="140" r="8" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    {/* the letter */}
    <rect x="120" y="146" width="62" height="44" rx="6" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    <path d="M120 152l31 21 31-21" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    <path d="M34 96l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="currentColor" opacity="0.4" />
    <circle cx="172" cy="66" r="5" fill="currentColor" opacity="0.3" />
    <circle cx="26" cy="150" r="4" fill="currentColor" opacity="0.25" />
  </>
);

const FIGURES: Record<MascotId, () => React.JSX.Element> = { ava: Ava, ben: Ben, cleo: Cleo };

/* ── component ───────────────────────────────────────────────────────── */

interface MascotProps {
  id: MascotId;
  /** `bust` crops to head and shoulders for avatars; `full` shows the figure. */
  crop?: keyof typeof VIEW_BOX;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Give it a label when the drawing carries meaning on its own. */
  title?: string;
}

export function Mascot({ id, crop = 'full', size, className, style, title }: MascotProps) {
  const Figure = FIGURES[id];
  return (
    <svg
      viewBox={VIEW_BOX[crop]}
      width={size}
      height={size}
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <Figure />
    </svg>
  );
}
