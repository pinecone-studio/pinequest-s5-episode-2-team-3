import { readJson } from './body.js';
import { mutation, canonical } from '../../shared/sync.ts';
import { validateState } from '../../shared/contracts.ts';

export async function readSnapshot(db) {
  const [clock, settings, events] = await db.batch([
    db.prepare('SELECT revision FROM sync_clock WHERE id = 1'),
    db.prepare('SELECT goal, mode FROM settings WHERE id = 1'),
    db.prepare('SELECT id, amount, type, at, device_id FROM events ORDER BY id'),
  ]);
  return { revision: clock.results[0].revision, state: validateState({ ...settings.results[0], events: events.results.map(({ device_id, ...e }) => ({ ...e, ...(device_id == null ? {} : { deviceId: device_id }) })) }) };
}

export async function applySnapshot(request, db) {
  const input = mutation(await readJson(request));
  input.state = canonical(input.state);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input))))).map(b => b.toString(16).padStart(2, '0')).join('');
  const events = JSON.stringify(input.state.events);
  const gate = 'EXISTS (SELECT 1 FROM sync_batches WHERE id = ?1 AND hash = ?2 AND applied = 0)';
  const results = await db.batch([
    db.prepare(`INSERT INTO sync_batches (id, hash) SELECT ?1, ?2 FROM sync_clock WHERE id = 1 AND revision = ?3 ON CONFLICT(id) DO NOTHING`).bind(input.id, hash, input.baseRevision),
    db.prepare(`UPDATE settings SET goal = ?3, mode = ?4 WHERE id = 1 AND ${gate}`).bind(input.id, hash, input.state.goal, input.state.mode),
    db.prepare(`DELETE FROM events WHERE id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?3)) AND ${gate}`).bind(input.id, hash, events),
    // Explicit app undo/backup restore is allowed; a raw device retry still cannot resurrect a deletion.
    db.prepare(`UPDATE event_receipts SET deleted = 0 WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?3)) AND ${gate}`).bind(input.id, hash, events),
    db.prepare(`INSERT INTO events (id, amount, type, at, device_id)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.amount'), json_extract(value, '$.type'), json_extract(value, '$.at'), json_extract(value, '$.deviceId')
      FROM json_each(?3) WHERE ${gate}
      ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, type = excluded.type, at = excluded.at, device_id = excluded.device_id`).bind(input.id, hash, events),
    db.prepare(`UPDATE sync_batches SET applied = 1, revision = (SELECT revision FROM sync_clock WHERE id = 1) WHERE id = ?1 AND hash = ?2 AND applied = 0`).bind(input.id, hash),
    db.prepare('SELECT hash, revision, applied FROM sync_batches WHERE id = ?1').bind(input.id),
  ]);
  const receipt = results[6].results[0];
  if (!receipt) return { status: 409, body: { code: 'revision', error: 'Сервер дээр мэдээлэл өөрчлөгдсөн байна.' } };
  if (receipt.hash !== hash) return { status: 409, body: { code: 'id_reused', error: 'Хүсэлтийн ID өөр өгөгдөлтэй байна.' } };
  return { status: 200, body: { id: input.id, revision: receipt.revision } };
}
