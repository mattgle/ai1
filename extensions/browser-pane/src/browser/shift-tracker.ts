import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { injectable } from "@theia/core/shared/inversify";
import { ShiftEvent, shiftApplies } from "../common/shift-state";

@injectable()
export class ShiftTracker implements FrontendApplicationContribution {
  protected last: ShiftEvent | undefined;

  onStart(): void {
    const record = (event: MouseEvent | KeyboardEvent): void => {
      this.last = { shift: event.shiftKey, at: Date.now() };
    };
    document.addEventListener("mousedown", record, true);
    document.addEventListener("keydown", record, true);
  }

  wasShiftHeld(): boolean {
    return shiftApplies(this.last, Date.now());
  }
}
