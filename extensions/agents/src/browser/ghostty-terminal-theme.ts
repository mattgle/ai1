import { DisposableCollection, Event } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceService } from "@theia/core/lib/common/preferences";
import { ThemeChangeEvent } from "@theia/core/lib/common/theme";
import { inject, injectable } from "@theia/core/shared/inversify";
import { TerminalThemeService } from "@theia/terminal/lib/browser/terminal-theme-service";
import type { ITheme } from "xterm";
import {
  GHOSTTY_COLORS,
  TERMINAL_APPEARANCE,
  TERMINAL_COLOR_OVERRIDES,
  TerminalColor,
  terminalColorOverrides,
} from "../common/terminal-appearance";

const COLOR_IDS: Record<TerminalColor, string> = {
  background: "terminal.background",
  foreground: "terminal.foreground",
  cursor: "terminalCursor.foreground",
  cursorAccent: "terminalCursor.background",
  selectionBackground: "terminal.selectionBackground",
  selectionForeground: "terminal.selectionForeground",
  selectionInactiveBackground: "terminal.inactiveSelectionBackground",
  black: "terminal.ansiBlack",
  red: "terminal.ansiRed",
  green: "terminal.ansiGreen",
  yellow: "terminal.ansiYellow",
  blue: "terminal.ansiBlue",
  magenta: "terminal.ansiMagenta",
  cyan: "terminal.ansiCyan",
  white: "terminal.ansiWhite",
  brightBlack: "terminal.ansiBrightBlack",
  brightRed: "terminal.ansiBrightRed",
  brightGreen: "terminal.ansiBrightGreen",
  brightYellow: "terminal.ansiBrightYellow",
  brightBlue: "terminal.ansiBrightBlue",
  brightMagenta: "terminal.ansiBrightMagenta",
  brightCyan: "terminal.ansiBrightCyan",
  brightWhite: "terminal.ansiBrightWhite",
};

@injectable()
export class GhosttyTerminalTheme extends TerminalThemeService implements FrontendApplicationContribution {
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  protected readonly subscriptions = new DisposableCollection();

  override get onDidChange(): Event<ThemeChangeEvent> {
    return Event.any(
      super.onDidChange,
      Event.map(
        Event.filter(
          this.preferences.onPreferenceChanged,
          (change) =>
            change.preferenceName === TERMINAL_APPEARANCE ||
            change.preferenceName === TERMINAL_COLOR_OVERRIDES,
        ),
        () => ({ newTheme: this.themeService.getCurrentTheme() }),
      ),
    );
  }

  override get theme(): ITheme {
    const base = super.theme;
    const type = this.themeService.getCurrentTheme().type;
    if (type === "hc" || type === "hcLight") {
      return base;
    }
    return {
      ...base,
      ...(this.preferences.get(TERMINAL_APPEARANCE, "ghostty") === "ghostty" ? GHOSTTY_COLORS : {}),
      ...terminalColorOverrides(this.preferences.get(TERMINAL_COLOR_OVERRIDES)),
    };
  }

  async onStart(): Promise<void> {
    await this.preferences.ready;
    const style = document.createElement("style");
    style.textContent = `.terminal-container { ${Object.entries(COLOR_IDS)
      .map(([key, id]) => `${this.colorRegistry.toCssVariableName(id)}: var(--ai1-terminal-${key});`)
      .join(" ")} }`;
    document.head.appendChild(style);
    const apply = () => {
      const theme = this.theme;
      for (const key of Object.keys(COLOR_IDS) as TerminalColor[]) {
        const variable = `--ai1-terminal-${key}`;
        const value = theme[key];
        if (value) {
          document.body.style.setProperty(variable, value);
        } else {
          document.body.style.removeProperty(variable);
        }
      }
    };
    apply();
    this.subscriptions.push(this.onDidChange(apply));
    this.subscriptions.push({
      dispose: () => {
        style.remove();
        for (const key of Object.keys(COLOR_IDS)) {
          document.body.style.removeProperty(`--ai1-terminal-${key}`);
        }
      },
    });
  }

  onStop(): void {
    this.subscriptions.dispose();
  }
}
