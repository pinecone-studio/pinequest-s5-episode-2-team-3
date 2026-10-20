import { validateDeviceReading, ContractError } from '../../shared/contracts.ts';
import { classify, validateDeviceStatus } from '../../shared/device.ts';
import { readJson } from './body.js';

const result = (status, body) => ({ status, body });
async function digest(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function authenticate(request, env, deviceId) {
  if (!env.DEVICE_TOKENS) return result(503, { error: 'Төхөөрөмжийн түлхүүр тохируулаагүй байна.' });
  let tokens;
  try { tokens = JSON.parse(env.DEVICE_TOKENS); } catch { return result(503, { error: 'Төхөөрөмжийн түлхүүрийн тохиргоо буруу байна.' }); }
  const expected = tokens && Object.hasOwn(tokens, deviceId) ? tokens[deviceId] : null;
  const supplied = request.headers.get('Authorization')?.match(/^Bearer ([a-zA-Z0-9_-]{32,256})$/)?.[1];
  // Compare digests so comparison timing cannot expose a prefix of a device's secret.
  if (typeof expected !== 'string' || !/^[a-zA-Z0-9_-]{32,256}$/.test(expected) || !supplied || await digest(expected) !== await digest(supplied)) {
    return result(401, { error: 'Төхөөрөмжийн ID эсвэл түлхүүр буруу байна.' });
  }
  return null;
}
export async function listDevices(db) {
  const { results } = await db.prepare('SELECT reading, received_at, outcome FROM device_states ORDER BY device_id').all();
  return results.map(row => validateDeviceStatus({ reading: JSON.parse(row.reading), receivedAt: row.received_at, outcome: row.outcome }));
}
export async function ingestReading(request, env, deviceId) {
  const denied = await authenticate(request, env, deviceId);
  if (denied) return denied;
  const reading = validateDeviceReading(await readJson(request, 4096));
  if (reading.deviceId !== deviceId) throw new ContractError('Хаяг болон хэмжилтийн төхөөрөмжийн ID зөрж байна.');
  if (Date.parse(reading.at) > Date.now() + 5 * 60_000) throw new ContractError('Төхөөрөмжийн цаг ирээдүйд байна. UTC цагаа тохируулна уу.');
  const payload = JSON.stringify(reading);
  const eventId = 'dev-' + (await digest(`${deviceId}\n${reading.id}`)).slice(0, 60);
  const db = env.DB;
  const gate = 'EXISTS (SELECT 1 FROM device_readings WHERE device_id = ?1 AND id = ?2 AND payload = ?3 AND processed = 0)';
  for (let tries = 0; tries < 5; tries++) {
    const previous = await db.prepare('SELECT * FROM device_states WHERE device_id = ?1').bind(deviceId).first();
    const before = previous ? { reading: validateDeviceReading(JSON.parse(previous.reading)), baselineMl: previous.baseline_ml, lastStableAt: previous.last_stable_at } : null;
    const change = classify(before, reading);
    const expectedRevision = previous?.revision ?? 0;
    const statements = [
      db.prepare(`INSERT INTO device_readings (device_id, id, payload, outcome, event_id)
        SELECT ?1, ?2, ?3, ?4, ?5 WHERE COALESCE((SELECT revision FROM device_states WHERE device_id = ?1), 0) = ?6
        ON CONFLICT(device_id, id) DO NOTHING`).bind(deviceId, reading.id, payload, change.outcome, change.amount ? eventId : null, expectedRevision),
    ];
    if (change.outcome !== 'stale') statements.push(
      db.prepare(`INSERT INTO device_states (device_id, revision, reading, received_at, baseline_ml, last_stable_at, outcome)
        SELECT ?1, ?4, ?3, ?5, ?6, ?7, ?8 WHERE ${gate}
        ON CONFLICT(device_id) DO UPDATE SET revision = excluded.revision, reading = excluded.reading,
        received_at = excluded.received_at, baseline_ml = excluded.baseline_ml, last_stable_at = excluded.last_stable_at, outcome = excluded.outcome`)
        .bind(deviceId, reading.id, payload, expectedRevision + 1, new Date().toISOString(), change.next.baselineMl, change.next.lastStableAt, change.outcome),
    );
    if (change.amount) statements.push(
      db.prepare(`INSERT INTO events (id, amount, type, at, device_id) SELECT ?4, ?5, 'drink', ?6, ?1 WHERE ${gate}`)
        .bind(deviceId, reading.id, payload, eventId, change.amount, reading.at),
    );
    statements.push(
      db.prepare(`UPDATE device_readings SET processed = 1 WHERE device_id = ?1 AND id = ?2 AND payload = ?3 AND processed = 0`).bind(deviceId, reading.id, payload),
      db.prepare('SELECT payload, outcome, event_id, processed FROM device_readings WHERE device_id = ?1 AND id = ?2').bind(deviceId, reading.id),
    );
    const applied = await db.batch(statements);
    const receipt = applied[applied.length - 1].results[0];
    if (!receipt) continue; // Another reading won the CAS; classify against its committed baseline.
    if (receipt.payload !== payload) return result(409, { error: 'Энэ хэмжилтийн ID өөр өгөгдөлтэй байна.' });
    return result(200, { id: reading.id, deviceId, outcome: receipt.outcome, eventId: receipt.event_id });
  }
  return result(503, { error: 'Төхөөрөмжийн өөр хэмжилт боловсруулж байна. Ижил ID-гаар дахин оролдоно уу.' });
}
