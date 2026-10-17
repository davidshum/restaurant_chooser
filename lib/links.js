const enc = encodeURIComponent;

function nextDinnerSlot(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() >= 20) d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T19:00`;
}

// Reserve / order / menu buttons. OpenTable has no public API, so we deep-link to its search.
export function buildActions(r, { party = 4 } = {}) {
  const where = r.lat != null ? `&latitude=${r.lat}&longitude=${r.lng}` : '';
  const openTable = { label: 'OpenTable', url: `https://www.opentable.com/s?term=${enc(r.name)}&covers=${party}&dateTime=${enc(nextDinnerSlot())}${where}` };

  const reserve = [];
  if (r.transactions.includes('restaurant_reservation') && r.yelp?.alias) {
    reserve.push({ label: 'Yelp Reservations', url: `https://www.yelp.com/reservations/${enc(r.yelp.alias)}?covers=${party}` });
  }
  reserve.push(openTable);
  if (r.reservable && r.mapsUrl) reserve.push({ label: 'Reserve with Google', url: r.mapsUrl });
  if (r.phoneRaw) reserve.push({ label: 'Call to book', url: `tel:${r.phoneRaw}` });

  const order = [];
  if (r.website && (r.takeout || r.delivery)) order.push({ label: 'Restaurant website', url: r.website });
  if ((r.transactions.includes('delivery') || r.transactions.includes('pickup')) && r.yelp?.url) {
    order.push({ label: 'Order on Yelp', url: r.yelp.url });
  }
  order.push({ label: 'DoorDash', url: `https://www.doordash.com/search/store/${enc(r.name)}/` });
  order.push({ label: 'Uber Eats', url: `https://www.ubereats.com/search?q=${enc(r.name)}` });
  order.push({ label: 'Grubhub', url: `https://www.grubhub.com/search?queryText=${enc(r.name)}` });

  const menu = [];
  if (r.menuUrl) menu.push({ label: 'Menu', url: r.menuUrl });
  if (r.yelp?.alias) menu.push({ label: 'Menu & dishes on Yelp', url: `https://www.yelp.com/menu/${enc(r.yelp.alias)}` });
  if (r.mapsUrl) menu.push({ label: 'Menu on Google Maps', url: r.mapsUrl });
  if (r.website) menu.push({ label: 'Restaurant website', url: r.website });

  const dest = r.lat != null ? `${r.lat},${r.lng}` : `${r.name} ${r.address || ''}`;
  return {
    reserve,
    order,
    menu,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}`,
    call: r.phoneRaw ? `tel:${r.phoneRaw}` : null,
  };
}
