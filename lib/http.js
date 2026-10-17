export async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    const err = new Error(`${new URL(url).host} returned ${res.status}: ${String(detail).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}
