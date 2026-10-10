const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const API = `${API_BASE}/api`;

async function getJSON(path) {
  const response = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const body = await response.json();
  if (body?.success === false) throw new Error(body.message || `${path} returned an API error`);
  return body;
}
const arr = (body) => Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function normalizeInventory(item, index) {
  const coordinates = item?.location?.coordinates;
  const longitude = num(item.longitude ?? item.lon ?? coordinates?.[0] ?? item.landslide_longitude);
  const latitude = num(item.latitude ?? item.lat ?? coordinates?.[1] ?? item.landslide_latitude);
  if (longitude === null || latitude === null) return null;
  const id = String(item.site_id ?? item.landslide_id ?? item._id ?? `API-${index + 1}`);
  return { ...item, id, site_id: String(item.site_id ?? id), lon: longitude, lat: latitude,
    name: String(item.name ?? item.site_name ?? item.description ?? `Landslide ${String(item.site_id ?? id)}`),
    road: String(item.extent ?? item.landslide_type ?? 'Mapped landslide inventory site'), note: item.description || 'Mapped landslide inventory record', recent: '' };
}
function nearestRiskSite(lon, lat) {
  const sites = window.__slydeApi?.riskRows || [];
  let best = null, distanceKm = Infinity;
  for (const row of sites) {
    const dx = (Number(row.longitude) - lon) * 98.65;
    const dy = (Number(row.latitude) - lat) * 110.7;
    const d = Math.hypot(dx, dy);
    if (d < distanceKm) { distanceKm = d; best = row; }
  }
  return best ? { ...best, distanceKm } : null;
}
function siteRiskFor(site) {
  const rows = window.__slydeApi?.riskRows || [];
  return rows.find(r => String(r.site_id) === String(site.site_id)) || null;
}
function renderApiSiteList(sites) {
  const list = document.getElementById('siteList');
  const select = document.getElementById('placeSel');
  if (!list || !select) return;
  const old = select.querySelector('optgroup[data-api-sites="true"]');
  if (old) old.remove();
  const group = document.createElement('optgroup'); group.label = `Backend inventory (${sites.length})`; group.dataset.apiSites = 'true';
  for (const site of sites) {
    const option = document.createElement('option'); option.value = `api:${site.id}`; option.textContent = `${site.site_id} · ${site.name}`; group.appendChild(option);
  }
  select.appendChild(group);
  if (!select.dataset.apiListener) {
    select.addEventListener('change', () => {
      const value = select.value;
      if (!value.startsWith('api:')) return;
      const site = window.__slydeApi?.inventory?.find(item => item.id === value.slice(4));
      if (site) window.__sk?.pickSite(site);
    });
    select.dataset.apiListener = 'true';
  }
  if (!list.dataset.apiListener) {
    list.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-api-id]');
      if (!button) return;
      const site = window.__slydeApi?.inventory?.find(s => s.id === button.dataset.apiId);
      if (site) window.__sk?.pickSite(site);
    });
    list.dataset.apiListener = 'true';
  }
  const fragment = document.createDocumentFragment();
  for (const site of sites) {
    const li = document.createElement('li'); const button = document.createElement('button'); button.type = 'button'; button.dataset.apiId = site.id;
    const title = document.createElement('b'); title.textContent = `${site.site_id} · ${site.name}`;
    const desc = document.createElement('span'); desc.textContent = `${site.lat.toFixed(4)}°N, ${site.lon.toFixed(4)}°E · ${site.road}`;
    const score = siteRiskFor(site); const scoreLine = document.createElement('span'); scoreLine.className = 'rec';
    scoreLine.textContent = score ? `Relative score ${Number(score.relative_screening_score_0_100).toFixed(1)}/100 · ${score.date}` : 'No risk row for selected API date';
    button.append(title, desc, scoreLine); li.appendChild(button); fragment.appendChild(li);
  }
  const heading = document.createElement('li'); heading.style.cssText = 'font-size:13px;color:var(--muted);padding:4px 2px'; heading.textContent = 'Backend inventory sites';
  list.append(heading, fragment);
}
function addMapSites(sites) {
  const map = window.__sk;
  if (!map?.addLabel) return;
  // Existing static context remains untouched; backend inventory is added as API-backed map markers.
  for (const site of sites) {
    if (site.lon < 87.95 || site.lon > 89.05 || site.lat < 27.02 || site.lat > 28.18) continue;
    if (map.D?.hotspots?.some(h => String(h.id) === site.id)) continue;
    const label = map.addLabel({ lon: site.lon, lat: site.lat, cls: 'hot', text: site.site_id, kind: 'hot', aria: `Backend landslide site ${site.site_id}`, onClick: () => map.pickSite(site) });
    const score = siteRiskFor(site);
    const value = Number(score?.relative_screening_score_0_100);
    const color = !Number.isFinite(value) ? 'var(--high)' : value < 25 ? 'var(--low)' : value < 50 ? 'var(--mod)' : value < 75 ? 'var(--high)' : 'var(--crit)';
    const marker = label?.querySelector('i'); if (marker) marker.style.background = color;
  }
}
export async function connectSlydeBackend() {
  const status = document.getElementById('imd');
  const toast = (message) => { const node = document.getElementById('toast'); if (node) { node.textContent = message; node.classList.add('on'); setTimeout(() => node.classList.remove('on'), 3500); } };
  try {
    const [health, inventoryBody, riskBody, gridBody, historicalBody, satelliteBody] = await Promise.all([
      getJSON('/health'),
      getJSON('/landslides?limit=1000'),
      getJSON('/risk?date=2025-06-07&limit=1000'),
      getJSON('/rainfall?dataset=grid&limit=1000'),
      getJSON('/rainfall?dataset=historical&startDate=2025-06-07&endDate=2025-06-07&limit=1000'),
      getJSON('/satellite?limit=100')
    ].map(p => p.catch(error => ({ __error: error.message }))));
    const inventory = arr(inventoryBody).map(normalizeInventory).filter(Boolean);
    const riskRows = arr(riskBody);
    const gridRainfall = arr(gridBody);
    const historicalRainfall = arr(historicalBody);
    const satelliteRows = arr(satelliteBody);
    window.__slydeApi = { health, inventory, riskRows, gridRainfall, historicalRainfall, satelliteRows, nearestRiskSite, siteRiskFor,
      endpoints: { health: !health.__error, landslides: !inventoryBody.__error, risk: !riskBody.__error, rainfallGrid: !gridBody.__error, rainfallHistorical: !historicalBody.__error, satellite: !satelliteBody.__error } };
    // Associate the closest date-matched risk record with every known inventory site.
    for (const site of inventory) site.backendRisk = siteRiskFor(site);
    addMapSites(inventory);
    renderApiSiteList(inventory);
    const good = Object.values(window.__slydeApi.endpoints).filter(Boolean).length;
    const total = Object.keys(window.__slydeApi.endpoints).length;
    if (status) status.textContent = `24-hour rain uses IMD's daily scale. Backend ${good}/${total} endpoints responding · ${inventory.length} inventory sites · ${riskRows.length} risk rows · NASA GPM IMERG grid ${gridRainfall.length} rows · historical rainfall ${historicalRainfall.length} rows · risk date 2025-06-07. Sliders remain scenario controls.`;
    if (window.__sk?.renderResult) window.__sk.renderResult();
    if (good < total) toast(`Backend connected partially: ${good}/${total} API endpoints responding. Check the browser console and backend logs.`);
    else toast(`Backend connected: ${inventory.length} inventory sites and ${riskRows.length} dated risk rows loaded.`);
    return window.__slydeApi;
  } catch (error) {
    console.error('SLYDE API integration failed:', error);
    if (status) status.textContent = `Backend unavailable: ${error.message}. Start the Node API at localhost:5050.`;
    toast('Backend API unavailable. The original map demo remains available.');
    throw error;
  }
}
