/**
 * Spaced review per palace, not per card: one recall walk is one review.
 * A perfect walk climbs the ladder; any miss drops back to tomorrow.
 */
const LADDER_DAYS = [1, 3, 7, 14, 30, 60];
const DAY_MS = 86_400_000;

export interface Walk {
  at: string;
  correct: number;
  total: number;
  missed: string[];
}

export interface ReviewState {
  step: number;
  due: string | null;
  walks: Walk[];
}

const storageKey = (palaceId: string) => `palatium:review:${palaceId}`;

export function loadReview(palaceId: string): ReviewState {
  const raw = localStorage.getItem(storageKey(palaceId));
  if (!raw) return { step: 0, due: null, walks: [] };
  return JSON.parse(raw) as ReviewState;
}

export function recordWalk(palaceId: string, walk: Walk, now = new Date()): ReviewState {
  const prev = loadReview(palaceId);
  const step = walk.correct === walk.total ? Math.min(prev.step + 1, LADDER_DAYS.length - 1) : 0;
  const next: ReviewState = {
    step,
    due: new Date(now.getTime() + LADDER_DAYS[step] * DAY_MS).toISOString(),
    walks: [...prev.walks, walk],
  };
  localStorage.setItem(storageKey(palaceId), JSON.stringify(next));
  return next;
}

export function describeDue(state: ReviewState, now = new Date()): string {
  if (!state.due) return 'Not walked yet. Take the learning walk, then test yourself.';
  const days = Math.ceil((new Date(state.due).getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return 'A recall walk is due.';
  return days === 1 ? 'Next recall walk: tomorrow.' : `Next recall walk: in ${days} days.`;
}
