import { Disposable, Emitter, Event } from "@theia/core";
import { Endpoint } from "@theia/core/lib/browser/endpoint";
import { IconTheme, IconThemeService } from "@theia/core/lib/browser/icon-theme-service";
import { IconThemeContribution } from "@theia/core/lib/browser/icon-theme-contribution";
import {
  DidChangeLabelEvent,
  LabelProviderContribution,
  URIIconReference,
} from "@theia/core/lib/browser/label-provider";
import URI from "@theia/core/lib/common/uri";
import { injectable } from "@theia/core/shared/inversify";
import { FileStatNode } from "@theia/filesystem/lib/browser/file-tree";
import { FileStat } from "@theia/filesystem/lib/common/files";
import { buildStyleSheet, iconClass, ICON_BASE_CLASS } from "../common/material-icon-css";
import { IconTarget, resolveIconId } from "../common/material-icon-resolver";
import {
  MATERIAL_ICONS_MANIFEST_PATH,
  MATERIAL_ICONS_ROUTE,
  MaterialIconManifest,
} from "../common/material-icons-protocol";

type IconElement = URI | URIIconReference | FileStat | FileStatNode;

@injectable()
export class MaterialIconTheme implements IconTheme, IconThemeContribution, LabelProviderContribution {
  readonly id = "material-icon-theme";
  readonly label = "Material Icon Theme";
  readonly hasFileIcons = true;
  readonly hasFolderIcons = true;

  protected manifest: MaterialIconManifest | undefined;
  protected active = false;
  protected styleElement: HTMLStyleElement | undefined;

  protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();
  get onDidChange(): Event<DidChangeLabelEvent> {
    return this.onDidChangeEmitter.event;
  }

  registerIconThemes(iconThemes: IconThemeService): void {
    iconThemes.register(this);
  }

  activate(): Disposable {
    this.active = true;
    this.load().catch((error) => console.error("ai1-material-icons: the manifest did not load", error));
    return Disposable.create(() => {
      this.active = false;
      this.styleElement?.remove();
      this.styleElement = undefined;
      this.onDidChangeEmitter.fire({ affects: () => true });
    });
  }

  canHandle(element: object): number {
    if (!this.active || !this.manifest) {
      return 0;
    }
    const isFileUri = element instanceof URI && element.scheme === "file";
    return isFileUri || URIIconReference.is(element) || FileStat.is(element) || FileStatNode.is(element)
      ? Number.MAX_SAFE_INTEGER
      : 0;
  }

  getIcon(element: IconElement): string | undefined {
    if (!this.manifest) {
      return undefined;
    }
    return `${ICON_BASE_CLASS} ${iconClass(resolveIconId(this.manifest, this.toTarget(element)))}`;
  }

  protected toTarget(element: IconElement): IconTarget {
    if (FileStatNode.is(element)) {
      const expanded = (element as { expanded?: boolean }).expanded === true;
      return {
        name: element.fileStat.name,
        kind: element.fileStat.isDirectory ? "folder" : "file",
        expanded,
      };
    }
    if (FileStat.is(element)) {
      return { name: element.name, kind: element.isDirectory ? "folder" : "file", expanded: false };
    }
    if (URIIconReference.is(element)) {
      return {
        name: element.uri?.path.base ?? "",
        kind: element.id === "folder" ? "folder" : "file",
        expanded: false,
      };
    }
    return { name: element.path.base, kind: "file", expanded: false };
  }

  protected async load(): Promise<void> {
    const manifestUrl = new Endpoint({ path: `${MATERIAL_ICONS_ROUTE}/${MATERIAL_ICONS_MANIFEST_PATH}` })
      .getRestUrl()
      .toString();
    if (!this.manifest) {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`${manifestUrl} gives status ${response.status}`);
      }
      this.manifest = (await response.json()) as MaterialIconManifest;
    }
    if (!this.active) {
      return;
    }
    // The manifest gives each icon path relative to its own folder, for example "./../icons/git.svg".
    const css = buildStyleSheet(this.manifest.iconDefinitions, (iconPath) =>
      new URL(iconPath, manifestUrl).toString(),
    );
    this.styleElement?.remove();
    this.styleElement = document.createElement("style");
    this.styleElement.id = "ai1-material-icons";
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);
    this.onDidChangeEmitter.fire({ affects: () => true });
  }
}
