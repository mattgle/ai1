// Gives each refresh a number. Only the newest refresh can show its result,
// so a slow scan that ends late does not replace a newer result.
export class RefreshSequence {
  private current = 0;

  start(): number {
    this.current += 1;
    return this.current;
  }

  isLatest(token: number): boolean {
    return token === this.current;
  }
}
