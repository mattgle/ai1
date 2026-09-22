export interface SseEvent {
  event: string;
  data: string;
}

// Parses a text/event-stream body chunk by chunk. A block ends at a blank
// line. Lines that start with ":" are comments. The "id" and "retry" fields
// are not used.
export class SseParser {
  private buffer = "";

  constructor(private readonly onEvent: (event: SseEvent) => void) {}

  push(chunk: string): void {
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, "\n");
    let end = this.buffer.indexOf("\n\n");
    while (end >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      this.emit(block);
      end = this.buffer.indexOf("\n\n");
    }
  }

  private emit(block: string): void {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) {
        continue;
      }
      const colon = line.indexOf(":");
      const field = colon >= 0 ? line.slice(0, colon) : line;
      const value = colon >= 0 ? line.slice(colon + 1).replace(/^ /, "") : "";
      if (field === "event") {
        event = value;
      } else if (field === "data") {
        data.push(value);
      }
    }
    if (data.length > 0) {
      this.onEvent({ event, data: data.join("\n") });
    }
  }
}
