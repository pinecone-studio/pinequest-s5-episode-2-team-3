import { afterEach, expect, test } from 'bun:test';
import { LocalD1 } from '../backend/test-db';
import worker from '../backend/src/index.js';

// The firmware builds its JSON in C++; send exactly those bytes to the real Worker so the two can't drift apart.
const TOKEN = 'synthetic-firmware-contract-test-token-1234567';
const run = Bun.spawnSync(['sh', 'firmware/test/run.sh', '--emit'], { stderr: 'pipe' });
const samples = run.exitCode === 0 ? run.stdout.toString().trim().split('\n').map(line => {
  const space = line.indexOf(' ');
  return { kind: line.slice(0, space) as 'event' | 'reading', body: line.slice(space + 1) };
}) : [];
const databases: LocalD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

test.skipIf(run.exitCode !== 0)('firmware request bodies are accepted by the Worker as sent', async () => {
  const db = new LocalD1(); databases.push(db);
  const env = { DB: db, DEVICE_TOKENS: JSON.stringify({ 'base-01': TOKEN }) };
  expect(samples.map(s => s.kind)).toEqual(['event', 'reading', 'reading']);
  for (const { kind, body } of samples) {
    const response = await worker.fetch(new Request(`http://localhost/api/devices/base-01/${kind === 'event' ? 'events' : 'readings'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body,
    }), env);
    expect([200, 201]).toContain(response.status);
  }
  expect(await (await db.call('GET', '/api/events')).json()).toEqual([
    { id: 'base-01-e-5-12', amount: 250, type: 'drink', at: '2025-10-20T10:00:00.123Z', deviceId: 'base-01' },
  ]);
  const [status] = await (await db.call('GET', '/api/devices')).json();
  expect(status.reading).toMatchObject({ id: 'base-01-r-5-4', stable: false, remainingMl: null });
});
