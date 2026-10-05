export class RefreshStatus {
  refreshing = false;
  stale = true;
  lastSuccess?: number;
  durationMs?: number;
  error?: string;
  private revision = 0;
  private scanRevision = 0;
  private started = 0;

  invalidate(): void {
    this.revision++;
    this.stale = true;
  }

  start(now = Date.now()): void {
    this.refreshing = true;
    this.started = now;
    this.scanRevision = this.revision;
  }

  succeed(now = Date.now()): void {
    this.refreshing = false;
    this.lastSuccess = now;
    this.durationMs = Math.max(0, now - this.started);
    this.stale = this.scanRevision !== this.revision;
    this.error = undefined;
  }

  fail(message: string): void {
    this.refreshing = false;
    this.stale = true;
    this.error = message;
  }
}
