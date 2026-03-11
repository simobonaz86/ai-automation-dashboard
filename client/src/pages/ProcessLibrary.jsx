import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2,
  Bot, AlertTriangle, Check, Users, ArrowRightLeft
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

const DEFAULT_COLORS = ['#7c3aed', '#0891b2', '#d97706', '#059669', '#dc2626', '#6366f1', '#ec4899'];

export default function ProcessLibrary() {
  const [teams, setTeams] = useState([]);
  const [regions, setRegions] = useState([]);
  const [steps, setSteps] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('steps');

  // Step modal
  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [editStep, setEditStep] = useState(null);
  const [parentForNew, setParentForNew] = useState(null);
  const [stepForm, setStepForm] = useState({ name: '', description: '', is_automatable: false, is_custom: false, team_id: '' });

  // Team modal
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editTeam, setEditTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: '', code: '', default_color: '#7c3aed' });

  // Transfer modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTeam, setTransferTeam] = useState(null);
  const [transferEdits, setTransferEdits] = useState([]);

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([api.teams.list(), api.regions.list()]);
    setTeams(t);
    setRegions(r);
    const teamId = selectedTeam !== 'all' ? selectedTeam : undefined;
    const tree = await api.steps.tree(teamId);
    setSteps(tree);
  }, [selectedTeam]);

  useEffect(() => { load(); }, [load]);

  // --- Step handlers ---
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

  const openAddStep = (parent = null) => {
    setEditStep(null);
    setParentForNew(parent);
    setStepForm({
      name: '', description: '', is_automatable: false, is_custom: false,
      team_id: parent ? parent.team_id : (teams[0]?.id || ''),
    });
    setStepModalOpen(true);
  };

  const openEditStep = (step) => {
    setEditStep(step);
    setParentForNew(null);
    setStepForm({
      name: step.name, description: step.description || '',
      is_automatable: !!step.is_automatable, is_custom: !!step.is_custom, team_id: step.team_id,
    });
    setStepModalOpen(true);
  };

  const handleSaveStep = async () => {
    if (!stepForm.name.trim()) return;
    if (editStep) {
      await api.steps.update(editStep.id, {
        name: stepForm.name, description: stepForm.description,
        is_automatable: stepForm.is_automatable ? 1 : 0,
        is_custom: stepForm.is_custom ? 1 : 0,
      });
    } else {
      await api.steps.create({
        name: stepForm.name, description: stepForm.description,
        team_id: parentForNew ? parentForNew.team_id : stepForm.team_id,
        parent_id: parentForNew ? parentForNew.id : null,
        is_automatable: stepForm.is_automatable ? 1 : 0,
        is_custom: stepForm.is_custom ? 1 : 0,
        sort_order: 99,
      });
    }
    setStepModalOpen(false);
    load();
  };

  const handleDeleteStep = async (step) => {
    if (!confirm(`Delete "${step.name}" and all sub-steps?`)) return;
    await api.steps.delete(step.id);
    load();
  };

  const handleAllocChange = async (stepId, value) => {
    await api.steps.updateAllocations(stepId, [{ region_id: null, allocation_pct: value }]);
    load();
  };

  // --- Team handlers ---
  const openAddTeam = () => {
    setEditTeam(null);
    const nextColor = DEFAULT_COLORS[teams.length % DEFAULT_COLORS.length];
    setTeamForm({ name: '', code: '', default_color: nextColor });
    setTeamModalOpen(true);
  };

  const openEditTeam = (team) => {
    setEditTeam(team);
    setTeamForm({ name: team.name, code: team.code, default_color: team.default_color || '#7c3aed' });
    setTeamModalOpen(true);
  };

  const handleSaveTeam = async () => {
    if (!teamForm.name.trim() || !teamForm.code.trim()) return;
    if (editTeam) {
      await api.teams.update(editTeam.id, teamForm);
    } else {
      await api.teams.create(teamForm);
    }
    setTeamModalOpen(false);
    load();
  };

  const handleDeleteTeam = async (team) => {
    if (!confirm(`Delete team "${team.name}"? This will fail if any process steps are assigned to it.`)) return;
    try {
      await api.teams.delete(team.id);
      if (selectedTeam === team.id) setSelectedTeam('all');
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  // --- Transfer handlers ---
  const openTransfers = (team) => {
    setTransferTeam(team);
    const otherTeams = teams.filter(t => t.id !== team.id);
    const edits = [];
    for (const other of otherTeams) {
      for (const region of regions) {
        const existing = (team.transfers || []).find(
          tr => tr.target_team_id === other.id && tr.region_id === region.id
        );
        edits.push({
          target_team_id: other.id,
          target_team_name: other.name,
          target_team_code: other.code,
          region_id: region.id,
          region_code: region.code,
          transfer_pct: existing ? existing.transfer_pct : 0,
        });
      }
    }
    setTransferEdits(edits);
    setTransferModalOpen(true);
  };

  const handleSaveTransfers = async () => {
    const transfers = transferEdits
      .filter(e => e.transfer_pct > 0)
      .map(e => ({
        target_team_id: e.target_team_id,
        region_id: e.region_id,
        transfer_pct: e.transfer_pct,
      }));
    await api.teams.updateTransfers(transferTeam.id, transfers);
    setTransferModalOpen(false);
    load();
  };

  const filteredSteps = selectedTeam === 'all'
    ? steps
    : steps.filter(s => s.team_id === selectedTeam);

  const stepCount = (teamId) => {
    let count = 0;
    const walk = (nodes) => nodes.forEach(n => { if (n.team_id === teamId) count++; if (n.children) walk(n.children); });
    walk(steps);
    return count;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚙️ Process Library</h1>
          <p className="text-sm text-gray-500 mt-1">Manage teams, process steps, sub-steps, and FTE allocation percentages</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('steps')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'steps' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Process Steps
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'teams' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Teams & Transfers
        </button>
      </div>

      {/* ========== TEAMS TAB ========== */}
      {activeTab === 'teams' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">Functional teams own process steps. Cross-team FTE transfers adjust net FTE available to each team.</p>
            <button className="btn-primary" onClick={openAddTeam}>
              <Plus size={16} /> New Team
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map(team => {
              const sc = stepCount(team.id);
              const outbound = (team.transfers || []).reduce((s, t) => s + t.transfer_pct, 0);
              const uniqueTargets = new Set((team.transfers || []).map(t => t.target_team_id)).size;
              return (
                <div key={team.id} className="card p-5 relative group">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: team.default_color || '#374151' }}
                    >
                      {team.code}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{team.name}</h3>
                      <p className="text-xs text-gray-500">Code: {team.code}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditTeam(team)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Edit team">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteTeam(team)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete team">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Process Steps</span>
                      <span className="font-medium text-gray-900">{sc}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Outbound Transfers</span>
                      <span className="font-medium text-gray-900">
                        {uniqueTargets > 0 ? `${uniqueTargets} team${uniqueTargets > 1 ? 's' : ''}` : 'None'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Accent Color</span>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: team.default_color || '#374151' }} />
                        <span className="text-xs text-gray-400 font-mono">{team.default_color}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    className="w-full btn-secondary btn-sm justify-center"
                    onClick={() => openTransfers(team)}
                  >
                    <ArrowRightLeft size={14} /> Configure Transfers
                  </button>
                </div>
              );
            })}

            {teams.length === 0 && (
              <div className="col-span-full text-center py-12 text-sm text-gray-400 card">
                No teams defined. Click "New Team" to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== STEPS TAB ========== */}
      {activeTab === 'steps' && (
        <>
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
            <button className="btn-primary btn-sm" onClick={() => openAddStep()}>
              <Plus size={14} /> Add Step
            </button>
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
                    onEdit={openEditStep}
                    onDelete={handleDeleteStep}
                    onAddChild={openAddStep}
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
        </>
      )}

      {/* ========== STEP MODAL ========== */}
      <Modal open={stepModalOpen} onClose={() => setStepModalOpen(false)} title={editStep ? 'Edit Process Step' : 'Add Process Step'}>
        <div className="space-y-4">
          {!editStep && !parentForNew && (
            <div>
              <label className="label">Team</label>
              <select className="input" value={stepForm.team_id} onChange={e => setStepForm(f => ({ ...f, team_id: e.target.value }))}>
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
              className="input" value={stepForm.name}
              onChange={e => setStepForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Vendor Comms (Milestone Chasing)" autoFocus
            />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <textarea className="input" rows={2} value={stepForm.description}
              onChange={e => setStepForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={stepForm.is_automatable}
                onChange={e => setStepForm(f => ({ ...f, is_automatable: e.target.checked }))} className="rounded border-gray-300" />
              Automatable (can be assigned to AI agents)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={stepForm.is_custom}
                onChange={e => setStepForm(f => ({ ...f, is_custom: e.target.checked }))} className="rounded border-gray-300" />
              Custom / Placeholder
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setStepModalOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveStep} disabled={!stepForm.name.trim()}>
              {editStep ? 'Save Changes' : 'Add Step'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========== TEAM MODAL ========== */}
      <Modal open={teamModalOpen} onClose={() => setTeamModalOpen(false)} title={editTeam ? 'Edit Team' : 'Create New Team'}>
        <div className="space-y-4">
          <div>
            <label className="label">Team Name</label>
            <input className="input" value={teamForm.name}
              onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Finance, HR, Supply Chain" autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Short Code</label>
              <input className="input" value={teamForm.code}
                onChange={e => setTeamForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. FIN, HR, SC" maxLength={10}
              />
              <p className="text-xs text-gray-400 mt-1">Used in tabs, badges, and charts</p>
            </div>
            <div>
              <label className="label">Accent Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={teamForm.default_color}
                  onChange={e => setTeamForm(f => ({ ...f, default_color: e.target.value }))}
                  className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
                />
                <div className="flex gap-1 flex-wrap">
                  {DEFAULT_COLORS.map(c => (
                    <button key={c} onClick={() => setTeamForm(f => ({ ...f, default_color: c }))}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${teamForm.default_color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setTeamModalOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveTeam} disabled={!teamForm.name.trim() || !teamForm.code.trim()}>
              {editTeam ? 'Save Changes' : 'Create Team'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========== TRANSFER MODAL ========== */}
      <Modal open={transferModalOpen} onClose={() => setTransferModalOpen(false)}
        title={transferTeam ? `Cross-Team Transfers — ${transferTeam.name}` : 'Transfers'} wide
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Configure what percentage of <strong>{transferTeam?.name}</strong> FTE is transferred to other teams, per region.
            Net FTE = Raw FTE × (1 − outbound%) + inbound from other teams.
          </p>

          {transferEdits.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Target Team</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Region</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-28">Transfer %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transferEdits.map((edit, idx) => (
                    <tr key={`${edit.target_team_id}-${edit.region_id}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{edit.target_team_code}</td>
                      <td className="px-3 py-2 text-gray-600">{edit.region_code}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" min={0} max={100} step={1}
                            className="w-16 px-2 py-1 text-sm border border-gray-200 rounded text-center focus:ring-2 focus:ring-blue-500"
                            value={edit.transfer_pct}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setTransferEdits(prev => prev.map((p, i) => i === idx ? { ...p, transfer_pct: val } : p));
                            }}
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No other teams to transfer to. Create another team first.</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setTransferModalOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSaveTransfers}>Save Transfers</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
