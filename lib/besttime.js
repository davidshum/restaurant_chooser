import { config } from './config.js';
import { fetchJson } from './http.js';

// Live busyness (0-100+, % of the venue's usual peak) from BestTime.app. Returns null if unavailable.
export async function liveBusyness(name, address) {
  if (!config.bestTimeKey || !name || !address) return null;
  const p = new URLSearchParams({ api_key_private: config.bestTimeKey, venue_name: name, venue_address: address });
  try {
    const data = await fetchJson(`https://besttime.app/api/v1/forecasts/live?${p}`, { method: 'POST' }, 10000);
    const a = data?.analysis;
    if (data?.status !== 'OK' || !a?.venue_live_busyness_available) return null;
    return Number(a.venue_live_busyness);
  } catch {
    return null;
  }
}
