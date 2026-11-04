import { CommandHandler } from "@theia/core/lib/common/command";
import { Disposable } from "@theia/core/lib/common/disposable";
import { injectable } from "@theia/core/shared/inversify";
import { PluginContributionHandler } from "@theia/plugin-ext/lib/main/browser/plugin-contribution-handler";

@injectable()
export class MarkdownPreviewContributionHandler extends PluginContributionHandler {
  override registerCommandHandler(id: string, execute: CommandHandler["execute"]): Disposable {
    const settingsIndex = id === "markdown.showPreview" ? 2 : id === "markdown.showPreviewToSide" ? 1 : -1;
    if (settingsIndex === -1) return super.registerCommandHandler(id, execute);

    return super.registerCommandHandler(id, (...args: unknown[]) => {
      // The bundled Markdown extension reuses unlocked previews for other files.
      const settings = args[settingsIndex] as { locked?: boolean } | undefined;
      args[settingsIndex] = { ...settings, locked: settings?.locked ?? true };
      return execute(...args);
    });
  }
}
