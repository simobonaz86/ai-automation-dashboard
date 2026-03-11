import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, GripVertical,
  Bot, AlertTriangle, Check
} from 'lucide-react';

function StepRow({ step, depth = 0, regions, onEdit, onDelete, onAddChild, onAllocChange, expandedIds, toggleExpand }) {
  const isExpanded = expandedIds.has(step.id);
  const hasChildren = step.children && step.children.length > 0;
  const childrenSum = hasChildren
    ? step.children.reduce((s, c) => s + (c.allocation_pct || 0), 0)
    : null;

  return (
    <>
      <tr className={`group hover:bg-gray-50 ${step.is_custom ? 'opacity-50' : ''} ${!step.is_active ? 'opacity-40' : ''}`}>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 24}px` }}>
            <span className="w-5 flex-shrink-0 mr-1">
              {hasChildren ? (
                <button onClick={() => toggleExpand(step.id)} className="p-0.5 rounded hover:bg-gray-200 text-gray-400">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              ) : (
                <span className="inline-block w-4" />
              )}
            </span>
            <span className={`text-sm font-medium ${step.is_custom ? 'italic text-gray-400' : 'text-gray-900'}`}>
              {step.name}
            </span>
            {step.is_automatable ? (
              <span className="ml-2 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">AUTO</span>
            ) : null}
            {step.agent_count > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                <Bot size={10} /> {step.agent_count}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 w-28">
          <div className="flex items-center gap-1">
            <input
              type="number"
              className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
              value={step.allocation_pct || 0}
              onChange={(e) => onAllocChange(step.id, parseFloat(e.target.value) || 0)}
              min={0}
              max={100}
              step={1}
            />
            <span className="text-xs text-gray-400">%</span>
          </div>
        </td>
        <td className="px-3 py-2.5 w-24">
          {childrenSum !== null && (
            <span className={`text-xs font-medium ${Math.abs(childrenSum - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {Math.abs(childrenSum - 100) < 0.01 ? (
                <span className="inline-flex items-center gap-1"><Check size={12} /> 100%</span>
              ) : (
                <span className="inline-flex items-center gap-1"><AlertTriangle size={12} /> {childrenSum.toFixed(1)}%</span>
              )}
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 w-32 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onAddChild(step)} className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Add sub-step">
              <Plus size={14} />
            </button>
            <button onClick={() => onEdit(step)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600" title="Edit">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(step)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && hasChildren && step.children.map(child => (
        <StepRow
          key={child.id}
          step={child}
          depth={depth + 1}
          regions={regions}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onAllocChange={onAllocChange}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
        />
      ))}
    </>
  );
}

export default function ProcessLibrary() {
  const [teams, setTeams] = useState([]);
  const [regions, setRegions] = useState([]);
  const [steps, setSteps] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editStep, setEditStep] = useState(null);
  const [parentForNew, setParentForNew] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', is_automatable: false, is_custom: false, team_id: '' });

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([api.teams.list(), api.regions.list()]);
    setTeams(t);
    setRegions(r);
    const teamId = selectedTeam !== 'all' ? selectedTeam : undefined;
    const tree = await api.steps.tree(teamId);
    setSteps(tree);
  }, [selectedTeam]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set();
    const collect = (nodes) => nodes.forEach(n => { allIds.add(n.id); if (n.children) collect(n.children); });
    collect(steps);
    setExpandedIds(allIds);
  };

  const openAdd = (parent = null) => {
    setEditStep(null);
    setParentForNew(parent);
    setForm({
      name: '',
      description: '',
      is_automatable: false,
      is_custom: false,
      team_id: parent ? parent.team_id : (teams[0]?.id || ''),
    });
    setModalOpen(true);
  };

  const openEdit = (step) => {
    setEditStep(step);
    setParentForNew(null);
    setForm({
      name: step.name,
      description: step.description || '',
      is_automatable: !!step.is_automatable,
      is_custom: !!step.is_custom,
      team_id: step.team_id,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editStep) {
      await api.steps.update(editStep.id, {
        name: form.name,
        description: form.description,
        is_automatable: form.is_automatable ? 1 : 0,
        is_custom: form.is_custom ? 1 : 0,
      });
    } else {
      await api.steps.create({
        name: form.name,
        description: form.description,
        team_id: parentForNew ? parentForNew.team_id : form.team_id,
        parent_id: parentForNew ? parentForNew.id : null,
        is_automatable: form.is_automatable ? 1 : 0,
        is_custom: form.is_custom ? 1 : 0,
        sort_order: 99,
      });
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async (step) => {
    if (!confirm(`Delete "${step.name}" and all sub-steps?`)) return;
    await api.steps.delete(step.id);
    load();
  };

  const handleAllocChange = async (stepId, value) => {
    await api.steps.updateAllocations(stepId, [{ region_id: null, allocation_pct: value }]);
    load();
  };

  const filteredSteps = selectedTeam === 'all'
    ? steps
    : steps.filter(s => s.team_id === selectedTeam);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚙️ Process Library</h1>
          <p className="text-sm text-gray-500 mt-1">Define teams, process steps, sub-steps, and FTE allocation percentages</p>
        </div>
        <button className="btn-primary" onClick={() => openAdd()}>
          <Plus size={16} /> Add Step
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setSelectedTeam('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedTeam === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
        >
          All Teams
        </button>
        {teams.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedTeam(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedTeam === t.id ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            style={selectedTeam === t.id ? { backgroundColor: t.default_color || '#374151' } : {}}
          >
            {t.code}
          </button>
        ))}
        <div className="flex-1" />
        <button className="btn-ghost btn-sm" onClick={expandAll}>Expand All</button>
        <button className="btn-ghost btn-sm" onClick={() => setExpandedIds(new Set())}>Collapse All</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Process Step</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Allocation %</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Children</th>
              <th className="px-3 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredSteps.map(step => (
              <StepRow
                key={step.id}
                step={step}
                regions={regions}
                onEdit={openEdit}
                onDelete={handleDelete}
                onAddChild={openAdd}
                onAllocChange={handleAllocChange}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
              />
            ))}
            {filteredSteps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">
                  No process steps found. Click "Add Step" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editStep ? 'Edit Process Step' : 'Add Process Step'}>
        <div className="space-y-4">
          {!editStep && !parentForNew && (
            <div>
              <label className="label">Team</label>
              <select className="input" value={form.team_id} onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))}>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {parentForNew && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              Adding sub-step under: <strong>{parentForNew.name}</strong>
            </div>
          )}
          <div>
            <label className="label">Step Name</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Vendor Comms (Milestone Chasing)"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_automatable}
                onChange={e => setForm(f => ({ ...f, is_automatable: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Automatable (can be assigned to AI agents)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_custom}
                onChange={e => setForm(f => ({ ...f, is_custom: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Custom / Placeholder
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
              {editStep ? 'Save Changes' : 'Add Step'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
