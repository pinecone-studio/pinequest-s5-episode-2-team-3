import { validateEntry } from '../../shared/contracts.ts';

export const EVENT_COLUMNS = 'id, amount, type, at, device_id';

export function toEvent(row) {
  if (!row) return null;
  const { device_id, ...event } = row;
  if (device_id !== null && device_id !== undefined) event.deviceId = device_id;
  return validateEntry(event);
}

// The first payload for an ID is kept as a receipt: an identical retry is 200, a different
// payload is 409, and a retry after the user deleted the entry is 204 and never resurrects it.
export async function insertEvent(db, event) {
  const payload = JSON.stringify(event);
  const [receiptInsert, , receipts, rows] = await db.batch([
    db.prepare('INSERT INTO event_receipts (id, payload) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING').bind(event.id, payload),
    db.prepare(`INSERT INTO events (id, amount, type, at, device_id)
      SELECT ?1, ?2, ?3, ?4, ?5 FROM event_receipts WHERE id = ?1 AND payload = ?6 AND deleted = 0
      ON CONFLICT(id) DO NOTHING`).bind(event.id, event.amount, event.type, event.at, event.deviceId ?? null, payload),
    db.prepare('SELECT payload, deleted FROM event_receipts WHERE id = ?1').bind(event.id),
    db.prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?1`).bind(event.id),
  ]);
  const receipt = receipts.results[0];
  if (receipt.payload !== payload) return { status: 409, body: { error: 'Энэ ID өөр анхны өгөгдөлтэй бүртгэгдсэн байна.' } };
  if (receipt.deleted) return { status: 204, body: null };
  return { status: receiptInsert.meta.changes ? 201 : 200, body: toEvent(rows.results[0]) };
}
