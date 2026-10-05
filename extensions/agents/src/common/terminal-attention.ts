import { SessionStatus } from "./agents-protocol";

export type TerminalAttention = "working" | "input" | "done" | "failed" | undefined;

export class TerminalAttentionState {
  private status: SessionStatus | undefined;
  private acknowledged = false;
  private revision: string | undefined;

  update(status: SessionStatus, selected: boolean, revision?: string): void {
    if (status !== this.status || revision !== this.revision) {
      this.status = status;
      this.revision = revision;
      this.acknowledged = selected && status !== "blocked";
    }
  }

  select(): void {
    if (this.status !== "blocked") {
      this.acknowledged = true;
    }
  }

  get attention(): TerminalAttention {
    if (this.status === "blocked") return "input";
    if (this.status === "working") return "working";
    if (this.acknowledged) return undefined;
    if (this.status === "done" || this.status === "failed") return this.status;
    return undefined;
  }
}

export function attentionClass(className: string, attention: TerminalAttention): string {
  const other = className
    .split(/\s+/)
    .filter((name) => name && !/^ai1-attention-(working|input|done|failed)$/.test(name));
  if (attention) other.push(`ai1-attention-${attention}`);
  return other.join(" ");
}

export function attentionCaption(caption: string, attention: TerminalAttention): string {
  const label = {
    working: "Working",
    input: "Needs your input",
    done: "Agent response is complete",
    failed: "Agent turn fails",
  };
  return attention ? `${caption}\n${label[attention]}` : caption;
}
