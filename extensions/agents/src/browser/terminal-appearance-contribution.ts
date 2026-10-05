import {
  CommandContribution,
  CommandRegistry,
  MessageService,
  QuickInputService,
  QuickPickService,
} from "@theia/core";
import { codicon, Widget } from "@theia/core/lib/browser";
import { PreferenceScope, PreferenceService } from "@theia/core/lib/common/preferences";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { inject, injectable } from "@theia/core/shared/inversify";
import { TerminalWidget } from "@theia/terminal/lib/browser/base/terminal-widget";
import { TERMINAL_APPEARANCE, TERMINAL_COLOR_OVERRIDES } from "../common/terminal-appearance";
import { parseTerminalFontSize } from "../common/terminal-font-size";

const COMMAND = {
  id: "ai1.terminal.appearanceSettings",
  category: "Terminal",
  label: "Appearance…",
  iconClass: codicon("settings-gear"),
};
const FONT_SIZE = "terminal.integrated.fontSize";
const FONT_FAMILY = "terminal.integrated.fontFamily";
const NORMAL_WEIGHT = "terminal.integrated.fontWeight";
const BOLD_WEIGHT = "terminal.integrated.fontWeightBold";
const BRIGHT_BOLD = "terminal.integrated.drawBoldTextInBrightColors";
const APPEARANCE_KEYS = [
  FONT_SIZE,
  FONT_FAMILY,
  NORMAL_WEIGHT,
  BOLD_WEIGHT,
  BRIGHT_BOLD,
  TERMINAL_APPEARANCE,
  TERMINAL_COLOR_OVERRIDES,
];

@injectable()
export class TerminalAppearanceContribution implements CommandContribution, TabBarToolbarContribution {
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;
  @inject(QuickPickService)
  protected readonly pick!: QuickPickService;
  @inject(QuickInputService)
  protected readonly input!: QuickInputService;
  @inject(MessageService)
  protected readonly messages!: MessageService;

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(COMMAND, { execute: () => this.configure() });
  }

  registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
    toolbar.registerItem({
      id: COMMAND.id,
      command: COMMAND.id,
      tooltip: "Terminal appearance",
      priority: 20,
      isVisible: (widget: Widget) => widget instanceof TerminalWidget,
    });
  }

  protected async configure(): Promise<void> {
    try {
      await this.preferences.ready;
      const choices = [
        { label: "Font size", description: `${this.preferences.get(FONT_SIZE)} px`, key: FONT_SIZE },
        { label: "Font family", description: String(this.preferences.get(FONT_FAMILY)), key: FONT_FAMILY },
        {
          label: "Normal text weight",
          description: String(this.preferences.get(NORMAL_WEIGHT)),
          key: NORMAL_WEIGHT,
        },
        {
          label: "Bold text weight",
          description: String(this.preferences.get(BOLD_WEIGHT)),
          key: BOLD_WEIGHT,
        },
        {
          label: "Bold ANSI colors",
          description: this.preferences.get(BRIGHT_BOLD) ? "Bright colors" : "Normal colors",
          key: BRIGHT_BOLD,
        },
        {
          label: "Palette",
          description:
            this.preferences.get(TERMINAL_APPEARANCE, "ghostty") === "ghostty"
              ? "Ghostty 0x96f"
              : "Editor theme",
          key: TERMINAL_APPEARANCE,
        },
        {
          label: "Restore terminal defaults",
          description: "Remove app-profile appearance overrides only",
          key: "reset",
        },
      ];
      const selected = await this.pick.show(choices, { placeholder: "Terminal appearance · App profile" });
      if (!selected) return;
      let value: unknown;
      if (selected.key === FONT_SIZE) {
        const text = await this.input.input({
          placeHolder: "Terminal font size",
          prompt: "Enter a size of at least 6 pixels.",
          value: String(this.preferences.get(FONT_SIZE)),
          validateInput: async (text) =>
            parseTerminalFontSize(text) === undefined ? "Enter a number of at least 6 pixels." : undefined,
        });
        if (text === undefined) return;
        value = parseTerminalFontSize(text);
        if (value === undefined) return;
      } else if (selected.key === FONT_FAMILY) {
        const text = await this.input.input({
          placeHolder: "Terminal font family",
          value: String(this.preferences.get(FONT_FAMILY)),
          validateInput: async (text) => (text.trim() ? undefined : "Enter a font family."),
        });
        if (text === undefined || !text.trim()) return;
        value = text.trim();
      } else if (selected.key === NORMAL_WEIGHT || selected.key === BOLD_WEIGHT) {
        const weights = [
          "normal",
          "bold",
          ...Array.from({ length: 9 }, (_, index) => String((index + 1) * 100)),
        ].map((weight) => ({ label: weight, value: weight }));
        const chosen = await this.pick.show(weights, {
          placeholder: selected.label,
          activeItem: weights.find((item) => item.value === this.preferences.get(selected.key)),
        });
        if (!chosen) return;
        value = chosen.value;
      } else if (selected.key === BRIGHT_BOLD) {
        const chosen = await this.pick.show(
          [
            { label: "Bright colors", value: true },
            { label: "Normal colors", value: false },
          ],
          { placeholder: "Bold ANSI colors" },
        );
        if (!chosen) return;
        value = chosen.value;
      } else if (selected.key === TERMINAL_APPEARANCE) {
        const chosen = await this.pick.show(
          [
            { label: "Ghostty 0x96f", value: "ghostty" },
            { label: "Editor theme", value: "theme" },
          ],
          { placeholder: "Terminal palette · Custom color overrides stay in effect" },
        );
        if (!chosen) return;
        value = chosen.value;
      } else {
        const chosen = await this.pick.show(
          [
            { label: "Restore terminal defaults", value: true },
            { label: "Cancel", value: false },
          ],
          { placeholder: "Remove app-profile terminal appearance overrides?" },
        );
        if (!chosen?.value) return;
        for (const key of APPEARANCE_KEYS) await this.preferences.set(key, undefined, PreferenceScope.User);
        return;
      }
      await this.preferences.set(selected.key, value, PreferenceScope.User);
    } catch (error) {
      await this.messages.error(
        `Cannot save terminal appearance: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
