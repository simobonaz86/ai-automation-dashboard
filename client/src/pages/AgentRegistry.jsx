import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { Plus, Copy, Search, Bot, Calendar, ArrowRight } from 'lucide-react';

export default function AgentRegistry() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', status: 'Draft', owner: '', launch_date: '' });

  const load = async () => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    const data = await api.agents.list(params);
    setAgents(data);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const result = await api.agents.create(form);
    setModalOpen(false);
    navigate(`/agents/${result.id}`);
  };

  const handleClone = async (e, id) => {
    e.stopPropagation();
    const result = await api.agents.clone(id);
    navigate(`/agents/${result.id}`);
  };

  const statuses = ['Draft', 'Planned', 'Active', 'Retired'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🤖 Agent Registry</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage AI agents, define assumption profiles, and assign to process steps</p>
        </div>
        <button className="btn-primary" onClick={() => {
          setForm({ name: '', description: '', status: 'Draft', owner: '', launch_date: '' });
          setModalOpen(true);
        }}>
          <Plus size={16} /> New Agent
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search agents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!statusFilter ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            All
          </button>
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Assigned Steps</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Launch Date</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(agent => (
              <tr
                key={agent.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/agents/${agent.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Bot size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                      {agent.description && (
                        <div className="text-xs text-gray-500 line-clamp-1">{agent.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={agent.status} /></td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600">{agent.assignment_count} step{agent.assignment_count !== 1 ? 's' : ''}</span>
                </td>
                <td className="px-4 py-3">
                  {agent.launch_date && (
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <Calendar size={12} className="text-gray-400" />
                      {new Date(agent.launch_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={(e) => handleClone(e, agent.id)}
                      className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                      title="Clone agent"
                    >
                      <Copy size={14} />
                    </button>
                    <ArrowRight size={14} className="text-gray-400" />
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                  No agents found. Click "New Agent" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create New Agent">
        <div className="space-y-4">
          <div>
            <label className="label">Agent Name</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Vendor Milestone Collection" autoFocus />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Launch Date</label>
              <input type="month" className="input" value={form.launch_date?.slice(0, 7)} onChange={e => setForm(f => ({ ...f, launch_date: e.target.value + '-01' }))} />
            </div>
          </div>
          <div>
            <label className="label">Owner</label>
            <input className="input" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Team or person" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCreate} disabled={!form.name.trim()}>Create Agent</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
