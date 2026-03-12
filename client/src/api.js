const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  regions: {
    list: () => request('/regions'),
    create: (data) => request('/regions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/regions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/regions/${id}`, { method: 'DELETE' }),
  },
  teams: {
    list: () => request('/teams'),
    create: (data) => request('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/teams/${id}`, { method: 'DELETE' }),
    updateTransfers: (id, transfers) => request(`/teams/${id}/transfers`, { method: 'PUT', body: JSON.stringify({ transfers }) }),
  },
  steps: {
    tree: (teamId) => request(`/process-steps${teamId ? `?team_id=${teamId}` : ''}`),
    flat: () => request('/process-steps/flat'),
    automatable: () => request('/process-steps/automatable'),
    create: (data) => request('/process-steps', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/process-steps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/process-steps/${id}`, { method: 'DELETE' }),
    updateAllocations: (id, allocations) => request(`/process-steps/${id}/allocations`, { method: 'PUT', body: JSON.stringify({ allocations }) }),
    reorder: (items) => request('/process-steps/reorder', { method: 'PUT', body: JSON.stringify({ items }) }),
  },
  agents: {
    list: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/agents${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/agents/${id}`),
    create: (data) => request('/agents', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
    clone: (id) => request(`/agents/${id}/clone`, { method: 'POST' }),
    updateAssignments: (id, assignments) => request(`/agents/${id}/assignments`, { method: 'PUT', body: JSON.stringify({ assignments }) }),
    updateProfiles: (id, profiles) => request(`/agents/${id}/profiles`, { method: 'PUT', body: JSON.stringify({ profiles }) }),
    getCurve: (id) => request(`/agents/${id}/curve`),
  },
  baselines: {
    grid: (version) => request(`/baselines/grid?version=${encodeURIComponent(version)}`),
    versions: () => request('/baselines/versions'),
    bulkUpdate: (updates, version) => request('/baselines/bulk', { method: 'PUT', body: JSON.stringify({ updates, version }) }),
    createVersion: (source, name) => request('/baselines/version', { method: 'POST', body: JSON.stringify({ source_version: source, new_version: name }) }),
    getGrowth: (version) => request(`/baselines/growth?version=${encodeURIComponent(version)}`),
    updateGrowth: (rates, version) => request('/baselines/growth', { method: 'PUT', body: JSON.stringify({ rates, version }) }),
  },
  scenarios: {
    list: () => request('/scenarios'),
    get: (id) => request(`/scenarios/${id}`),
    create: (data) => request('/scenarios', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/scenarios/${id}`, { method: 'DELETE' }),
    calculate: (id) => request(`/scenarios/${id}/calculate`),
    compare: (ids) => request(`/scenarios/compare/${ids.join(',')}`),
  },
};
