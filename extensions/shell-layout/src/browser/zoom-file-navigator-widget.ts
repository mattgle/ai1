import { NodeProps, open, OpenerService, TreeNode } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import type * as React from "@theia/core/shared/react";
import { FileNode } from "@theia/filesystem/lib/browser/file-tree";
import { FileNavigatorWidget } from "@theia/navigator/lib/browser/navigator-widget";

@injectable()
export class ZoomFileNavigatorWidget extends FileNavigatorWidget {
  @inject(OpenerService)
  protected readonly openerService!: OpenerService;

  protected controlClickHandled = false;

  protected override createNodeAttributes(
    node: TreeNode,
    props: NodeProps,
  ): React.Attributes & React.HTMLAttributes<HTMLElement> {
    const attributes = super.createNodeAttributes(node, props);
    return {
      ...attributes,
      onMouseDown: (event) => {
        this.controlClickHandled = FileNode.is(node) && event.ctrlKey && event.button === 0;
        if (this.controlClickHandled && FileNode.is(node)) {
          // macOS turns Control-click into a context menu after mouse down.
          event.preventDefault();
          event.stopPropagation();
          this.model.selectNode(node);
          const opened = open(this.openerService, node.uri);
          this.commandService
            .executeCommand("ai1.center.zoom", opened)
            .catch((error) => this.messageService.error(String(error)));
        } else {
          attributes.onMouseDown?.(event);
        }
      },
      onClick: (event) => {
        if (FileNode.is(node) && event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
        } else {
          attributes.onClick?.(event);
        }
      },
      onContextMenu: (event) => {
        if (event.ctrlKey && this.controlClickHandled) {
          event.preventDefault();
          event.stopPropagation();
          this.controlClickHandled = false;
        } else {
          attributes.onContextMenu?.(event);
        }
      },
    };
  }
}
