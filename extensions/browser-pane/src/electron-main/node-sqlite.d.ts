declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(location: string, options?: { readOnly?: boolean; readBigInts?: boolean });
    exec(sql: string): void;
    prepare(sql: string): {
      all(...parameters: unknown[]): unknown[];
      run(...parameters: unknown[]): unknown;
    };
    close(): void;
  }
}
