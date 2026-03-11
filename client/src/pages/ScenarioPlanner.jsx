import React, { useState, useEffect } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { Plus, Pencil, Trash2, Star, BarChart3, GitCompare } from 'lucide-react';

export default function ScenarioPlanner() {
  const [scenarios, setScenarios] = useState([]);
  const [agents, setAgents] = useState([]);
  const [versions, setVersions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editScenario, setEditScenario] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [compareResults, setCompareResults] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', baseline_version: 'Budget 2026',
    agent_set: [], scope: 'global', is_default: false,
  });

  const load = async () => {
    const [s, a, v] = await Promise.all([
      api.scenarios.list(),
      api.agents.list({}),
      api.baselines.versions(),
    ]);
    setScenarios(s);
    setAgents(a);
    setVersions(v);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditScenario(null);
    setForm({
      name: '', description: '', baseline_version: versions[0] || 'Budget 2026',
      agent_set: [], scope: 'global', is_default: false,
    });
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditScenario(s);
    setForm({
      name: s.name,
      description: s.description || '',
      baseline_version: s.baseline_version,
      agent_set: s.agent_set,
      scope: s.scope,
      is_default: !!s.is_default,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editScenario) {
      await api.scenarios.update(editScenario.id, form);
    } else {
      await api.scenarios.create(form);
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (s) => {
    if (!confirm(`Delete scenario "${s.name}"?`)) return;
    await api.scenarios.delete(s.id);
    load();
  };

  const toggleCompare = (id) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
    setCompareResults(null);
  };

  const runCompare = async () => {
    if (compareIds.length < 2) return;
    const results = await api.scenarios.compare(compareIds);
    setCompareResults(results);
  };

  const YEARS = [2026, 2027, 2028, 2029];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🎯 Scenario Planner</h1>
          <p className="text-sm text-gray-500 mt-1">Create and compare scenarios with different agent combinations and baseline versions</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> New Scenario
        </button>
      </div>

      {/* Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {scenarios.map(s => (
          <div key={s.id} className={`card p-5 relative ${compareIds.includes(s.id) ? 'ring-2 ring-blue-500' : ''}`}>
            {s.is_default ? (
              <span className="absolute top-3 right-3">
                <Star size={16} className="text-amber-400 fill-amber-400" />
              </span>
            ) : null}
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{s.name}</h3>
            {s.description && <p className="text-xs text-gray-500 mb-3">{s.description}</p>}
            <div className="space-y-1.5 text-xs text-gray-600 mb-4">
              <div className="flex justify-between">
                <span>Baseline</span>
                <span className="font-medium">{s.baseline_version}</span>
              </div>
              <div className="flex justify-between">
                <span>Agents</span>
                <span className="font-medium">{s.agent_set.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Scope</span>
                <span className="font-medium capitalize">{s.scope}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`flex-1 btn-sm ${compareIds.includes(s.id) ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'btn-secondary'}`}
                onClick={() => toggleCompare(s.id)}
              >
                <GitCompare size={12} /> {compareIds.includes(s.id) ? 'Selected' : 'Compare'}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => openEdit(s)}><Pencil size={12} /></button>
              <button className="btn-ghost btn-sm text-red-500 hover:text-red-700" onClick={() => handleDelete(s)}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Compare */}
      {compareIds.length >= 2 && (
        <div className="mb-6">
          <button className="btn-primary" onClick={runCompare}>
            <BarChart3 size={16} /> Compare {compareIds.length} Scenarios
          </button>
        </div>
      )}

      {compareResults && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Scenario Comparison — FTE Saved (Monthly Average)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Metric</th>
                  {compareResults.map(r => (
                    <th key={r.scenario.id} className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" colSpan={2}>
                      {r.scenario.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th></th>
                  {compareResults.map(r => (
                    <React.Fragment key={`${r.scenario.id}-sub`}>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-blue-600">Min</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-red-600">Max</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {YEARS.map(year => (
                  <tr key={year} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{year}</td>
                    {compareResults.map(r => (
                      <React.Fragment key={`${r.scenario.id}-${year}`}>
                        <td className="px-3 py-2.5 text-center text-blue-700 font-medium">
                          {r.yearlyTotals?.[year]?.min?.toFixed(1) || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center text-red-700 font-medium">
                          {r.yearlyTotals?.[year]?.max?.toFixed(1) || '—'}
                        </td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-2.5 text-gray-900">Average</td>
                  {compareResults.map(r => (
                    <React.Fragment key={`${r.scenario.id}-avg`}>
                      <td className="px-3 py-2.5 text-center text-blue-700">
                        {r.totals?.min?.toFixed(1) || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center text-red-700">
                        {r.totals?.max?.toFixed(1) || '—'}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editScenario ? 'Edit Scenario' : 'New Scenario'} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Scenario Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Base Case 2026" autoFocus />
            </div>
            <div>
              <label className="label">Baseline Version</label>
              <select className="input" value={form.baseline_version} onChange={e => setForm(f => ({ ...f, baseline_version: e.target.value }))}>
                {versions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Scope</label>
              <select className="input" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}>
                <option value="global">Global (same profiles all regions)</option>
                <option value="per_region">Per Region (use regional overrides)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm pb-2">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                Default scenario (shown first on dashboard)
              </label>
            </div>
          </div>

          <div>
            <label className="label">Select Agents</label>
            <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto p-2 space-y-1">
              {agents.map(a => (
                <label key={a.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form.agent_set.includes(a.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setForm(f => ({ ...f, agent_set: [...f.agent_set, a.id] }));
                      } else {
                        setForm(f => ({ ...f, agent_set: f.agent_set.filter(id => id !== a.id) }));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-900">{a.name}</span>
                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${
                    a.status === 'Active' ? 'bg-green-100 text-green-700' :
                    a.status === 'Planned' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{a.status}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
              {editScenario ? 'Save Changes' : 'Create Scenario'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
