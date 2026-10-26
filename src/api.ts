import type { AiPlan } from '../shared/plan';

// Backend Worker; override with VITE_API_URL for local `wrangler dev`.
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'https://dusal-api.bbek3201.workers.dev';

export async function askAi(body: { age: number; weight: number; height: number; activity: string; condition: string; doctorLimit: number; note: string }): Promise<AiPlan> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Интернэт холболтоо шалгаад дахин оролдоно уу.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'AI хариулж чадсангүй. Дахин оролдоно уу.');
  return data as AiPlan;
}

// Whether the backend has an AI key configured; false when the API can't be reached.
export async function checkAi(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    return Boolean((await response.json()).ai);
  } catch {
    return false;
  }
}
