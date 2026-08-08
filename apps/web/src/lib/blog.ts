export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readingMinutes: number;
  author: string;
  tag: string;
  /** Simple paragraph / heading / list blocks — no markdown runtime needed. */
  body: ({ h?: string; p?: string; list?: string[]; quote?: string })[];
}

export const POSTS: Post[] = [
  {
    slug: 'explainable-health-score',
    title: 'A project health score you can argue with',
    excerpt: 'Most health indicators are a coloured dot nobody trusts. Here is the exact arithmetic behind ours, and why no language model touches the number.',
    date: '2026-07-28',
    readingMinutes: 5,
    author: 'Ava Sharma',
    tag: 'Product',
    body: [
      { p: 'Every project tool eventually ships a health indicator. Most of them are a red, amber or green dot with no explanation, so the first time it disagrees with a manager it gets ignored forever. We wanted the opposite: a number you can take apart.' },
      { h: 'Five signals, fixed weights' },
      { p: 'The score starts at 100 and each signal subtracts points. The weights are published in the product, not buried in a blog post:' },
      { list: [
        'Overdue ratio — 30 points. Full penalty once 40% of open tasks are past due.',
        'Blocked dependency chains — 20 points. Full penalty at 25% of open tasks blocked or waiting on an unfinished blocker.',
        'Velocity trend — 20 points. Compares points closed in the last 14 days against the 14 before. No history means no penalty.',
        'WIP overload — 15 points. The share of people carrying more than four tasks in flight.',
        'Silent tasks — 15 points. Open tasks with no activity for five or more days.',
      ] },
      { h: 'Why the model never computes it' },
      { p: 'A language model asked to "score this project" will produce a confident number with no reproducible basis, and it will produce a different one tomorrow from the same data. So the model is handed the finished arithmetic and asked to write two sentences of English. It cannot invent a figure because it is never asked for one.' },
      { quote: 'The health score is the first project metric my team has not immediately dismissed, because you can see exactly which five numbers produced it.' },
      { h: 'The part people actually use' },
      { p: 'Underneath the score we rank the signals by how many points they cost and turn the top three into concrete actions: re-date these four overdue tasks, unblock this chain, rebalance this person. A score without a next step is just a mood.' },
    ],
  },
  {
    slug: 'auto-pilot-evidence',
    title: 'Why every AI action in Loop carries a receipt',
    excerpt: 'Auto-Pilot proposes board changes from commits and chat. It never applies them silently, and each proposal shows the trigger that produced it.',
    date: '2026-07-14',
    readingMinutes: 4,
    author: 'Rohan Mehta',
    tag: 'Engineering',
    body: [
      { p: 'The reason boards go stale is not laziness. It is that updating a card is a second, manual copy of information that already exists in a commit, a pull request or a chat message. Auto-Pilot closes that gap without taking the keyboard away from you.' },
      { h: 'Rules first, model second' },
      { p: 'A pull request on a branch called PAY-12 is not an ambiguous signal — a regular expression handles it, deterministically, at 94% confidence. The model is only invoked for the genuinely ambiguous case: somebody says "I am stuck on the payment API" without naming a task. It is then given the fifteen most recently active open tasks and asked to pick one, with a confidence score and permission to answer null.' },
      { h: 'Proposals, not writes' },
      { p: 'Every outcome becomes a card in the suggestions inbox showing the trigger, the quoted evidence, the confidence and the exact field change. Accept writes to the task and to the audit log. Reject closes it. A project owner can switch on auto-apply, and even then only rule-based suggestions above 90% qualify — model-matched ones are capped below that line deliberately.' },
      { h: 'What this buys you on stage' },
      { p: 'A wrong suggestion is not a failure, it is a demonstration of the accept step. That is a much better property than a system that quietly moved the wrong card and nobody noticed until Friday.' },
    ],
  },
  {
    slug: 'permission-aware-rag',
    title: 'Permission-aware retrieval is the boring feature that makes AI enterprise ready',
    excerpt: 'Filtering results after the model has seen them is not access control. Here is how retrieval is scoped before anything reaches the context window.',
    date: '2026-06-30',
    readingMinutes: 4,
    author: 'Ava Sharma',
    tag: 'Security',
    body: [
      { p: 'Plenty of products bolt a chat box onto a knowledge base and call it done. The interesting question is what happens when a client account asks "what is blocking the release?" and the honest answer lives in an internal engineering channel.' },
      { h: 'Order of operations' },
      { p: 'Loop resolves the asker\'s role and project membership first, converts that into a SQL filter, and only then runs the similarity search. A client account is restricted to sources marked shared — task progress and explicitly published documents. Internal chat and comments are never candidates, so they cannot appear in the context window and the model cannot leak what it was never given.' },
      { h: 'Citations are not decoration' },
      { p: 'Every answer numbers its sources and links back to them. If a claim has no citation it is a bug, not a stylistic choice — and because retrieval was already filtered, following a citation can never land somebody on a page they are not allowed to open.' },
      { h: 'Degrading honestly' },
      { p: 'Without an embeddings key the retriever falls back to keyword search over the same permission-filtered rows, and the UI says so. The failure mode is fewer results, never wider access.' },
    ],
  },
];

export const findPost = (slug: string) => POSTS.find((post) => post.slug === slug);
