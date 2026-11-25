async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  }
  return data;
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (Array.isArray(val)) {
      if (val.length) search.set(key, val.join(','));
    } else if (val !== undefined && val !== null && val !== '') {
      search.set(key, String(val));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function fetchHealth() {
  return requestJson('/api/health');
}

export function fetchSummary() {
  return requestJson('/api/summary');
}

export function fetchZones(filters = {}, signal) {
  return requestJson(`/api/zones${buildQuery(filters)}`, { signal });
}

export function fetchRoutes(filters = {}, signal) {
  return requestJson(`/api/routes${buildQuery(filters)}`, { signal });
}

export function fetchFacilities(filters = {}, signal) {
  return requestJson(`/api/facilities${buildQuery(filters)}`, { signal });
}

export function fetchAnalysisLayer(filters = {}, signal) {
  return requestJson(`/api/analysis/layer${buildQuery(filters)}`, { signal });
}

export function fetchScoring() {
  return requestJson('/api/analysis/scoring');
}
