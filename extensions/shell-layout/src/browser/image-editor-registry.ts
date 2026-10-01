import { Disposable } from "@theia/core/lib/common/disposable";
import { injectable } from "@theia/core/shared/inversify";
import { CustomEditor, DeployedPlugin } from "@theia/plugin-ext/lib/common";
import { PluginCustomEditorRegistry } from "@theia/plugin-ext/lib/main/browser/custom-editors/plugin-custom-editor-registry";

@injectable()
export class ImageEditorRegistry extends PluginCustomEditorRegistry {
  override registerCustomEditor(editor: CustomEditor, plugin: DeployedPlugin): Disposable {
    if (
      editor.viewType === "imagePreview.previewEditor" &&
      plugin.metadata.model.id === "vscode.media-preview"
    ) {
      return super.registerCustomEditor(
        {
          ...editor,
          selector: [...editor.selector, { filenamePattern: "*.svg" }],
        },
        plugin,
      );
    }
    return super.registerCustomEditor(editor, plugin);
  }
}
