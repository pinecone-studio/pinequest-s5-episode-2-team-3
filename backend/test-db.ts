import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from './src/index.js';

// D1's SQL and atomic batch interface, backed by a real SQLite database.
class Statement {
  constructor(private db: Database, private sql: string, private values: (string | number | null)[] = []) {}
  bind(...values: (string | number | null)[]) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.query(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.db.query(this.sql).all(...this.values) }; }
  async run() { return { meta: this.db.query(this.sql).run(...this.values) }; }
  execute() {
    if (/^\s*SELECT/i.test(this.sql)) return { results: this.db.query(this.sql).all(...this.values), meta: { changes: 0 } };
    return { results: [], meta: this.db.query(this.sql).run(...this.values) };
  }
}
export class LocalD1 {
  sqlite = new Database(':memory:');
  constructor() {
    const folder = new URL('./migrations/', import.meta.url);
    for (const file of readdirSync(folder).filter(name => name.endsWith('.sql')).sort()) this.sqlite.exec(readFileSync(new URL(file, folder), 'utf8'));
  }
  prepare(sql: string) { return new Statement(this.sqlite, sql); }
  async batch(statements: Statement[]) { return this.sqlite.transaction(() => statements.map(s => s.execute()))(); }
  fetch = ((input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), { DB: this })) as typeof fetch;
  call(method: string, path: string, body?: unknown) {
    return this.fetch(`http://localhost${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  }
}
