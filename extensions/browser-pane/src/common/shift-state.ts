export interface ShiftEvent {
  shift: boolean;
  at: number;
}

// An open request does not carry the mouse event. So AI1 reads Shift from
// the last click or key press, if it was a short time ago.
export const SHIFT_WINDOW_MS = 1500;

export function shiftApplies(last: ShiftEvent | undefined, now: number): boolean {
  return last !== undefined && last.shift && now - last.at <= SHIFT_WINDOW_MS;
}
