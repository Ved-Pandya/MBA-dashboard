export const FOCUS_SECONDS = 25 * 60;
export const FOCUS_PENALTY_SECONDS = 60;

export interface FocusState {
  remaining: number;
  endsAt: number | null;
  away: boolean;
  penalties: number;
}
export const initialFocusState: FocusState = { remaining: FOCUS_SECONDS, endsAt: null, away: false, penalties: 0 };
type FocusAction = { type: "toggle" | "tick" | "hidden" | "visible" | "reset"; now: number };

/** Wall-clock deadlines avoid interval drift; hidden time never earns focus time. */
export function focusReducer(state: FocusState, action: FocusAction): FocusState {
  if (action.type === "reset") return initialFocusState;
  if (action.type === "visible") return state.away ? { ...state, away: false, endsAt: action.now + state.remaining * 1000 } : state;
  if (action.type === "toggle" && state.away) return { ...state, away: false };
  if (action.type === "toggle" && state.endsAt === null) {
    const remaining = state.remaining || FOCUS_SECONDS;
    return { ...state, remaining, endsAt: action.now + remaining * 1000, away: false, penalties: state.remaining ? state.penalties : 0 };
  }
  if (state.endsAt === null) return state;
  const remaining = Math.max(0, Math.ceil((state.endsAt - action.now) / 1000));
  if (remaining === 0) return { ...state, remaining: 0, endsAt: null, away: false };
  if (action.type === "hidden") return { remaining: remaining + FOCUS_PENALTY_SECONDS, endsAt: null, away: true, penalties: state.penalties + 1 };
  if (action.type === "toggle") return { ...state, remaining, endsAt: null };
  return remaining === state.remaining ? state : { ...state, remaining };
}
