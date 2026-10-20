import { ContractError } from '../../shared/contracts.ts';
export class BodyError extends ContractError {
  constructor(message, status) { super(message); this.status = status; }
}
export async function readJson(request, limit = 5_000_000) {
  const reader = request.body?.getReader();
  if (!reader) throw new ContractError('JSON буруу байна.');
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new BodyError('Хүсэлтийн өгөгдөл зөвшөөрсөн хэмжээнээс их байна.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ContractError('JSON буруу байна.'); }
}
