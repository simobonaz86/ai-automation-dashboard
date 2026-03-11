import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import { ArrowLeft, Save, Trash2, Bot } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const METRICS = ['min_automation', 'max_automation', 'adoption'];
const METRIC_LABELS = { min_automation: 'Min Automation %', max_automation: 'Max Automation %', adoption: 'AI Feature Adoption %' };
const METRIC_COLORS = { min_automation: '#3b82f6', max_automation: '#ef4444', adoption: '#10b981' };
const YEARS = [2026, 2027, 2028, 2029];
const STATUSES = ['Draft', 'Planned', 'Active', 'Retired'];
const INTERPOLATIONS = ['linear', 's_curve', 'step'];

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [form, setForm] = useState({});
  const [automatableSteps, setAutomatableSteps] = useState([]);
  const [selectedSteps, setSelectedSteps] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeMetric, setActiveMetric] = useState('adoption');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [agentData, steps] = await Promise.all([
        api.agents.get(id),
        api.steps.automatable(),
      ]);
      setAgent(agentData);
      setForm({
        name: agentData.name,
        description: agentData.description || '',
        status: agentData.status,
        owner: agentData.owner || '',
        launch_date: agentData.launch_date || '',
        technology_tags: agentData.technology_tags || [],
      });
      setAutomatableSteps(steps);
      setSelectedSteps(agentData.assignments.map(a => a.step_id));

      const p = {};
      for (const metric of METRICS) {
        const profileData = agentData.profiles[metric];
        if (profileData) {
          p[metric] = {
            launch_month: profileData.launch_month,
            interpolation: profileData.interpolation,
            milestones: profileData.milestones,
          };
        } else {
          p[metric] = {
            launch_month: agentData.launch_date || '2027-01-01',
            interpolation: 'linear',
            milestones: YEARS.map(y => ({ year: y, q4_value: 0 })),
          };
        }
      }
      setProfiles(p);
    };
    load();
  }, [id]);

  const chartData = useMemo(() => {
    if (!Object.keys(profiles).length) return [];
    const months = [];
    for (let y = 2026; y <= 2029; y++) {
      for (let m = 1; m <= 12; m++) {
        months.push({ year: y, month: m, label: `${y}-${String(m).padStart(2, '0')}` });
      }
    }
    return months.map(({ year, month, label }) => {
      const point = { name: label };
      for (const metric of METRICS) {
        const p = profiles[metric];
        if (!p) continue;
        const launchDate = new Date(p.launch_month);
        const launchIdx = (launchDate.getFullYear() - 2026) * 12 + launchDate.getMonth();
        const currentIdx = (year - 2026) * 12 + (month - 1);

        if (currentIdx < launchIdx) {
          point[metric] = 0;
          continue;
        }

        const sorted = [...p.milestones].sort((a, b) => a.year - b.year);
        const pts = sorted.map(ms => ({ idx: (ms.year - 2026) * 12 + 11, value: ms.q4_value }));

        if (pts.length === 0) { point[metric] = 0; continue; }
        if (currentIdx >= pts[pts.length - 1].idx) { point[metric] = pts[pts.length - 1].value; continue; }

        let left = { idx: Math.max(launchIdx - 1, 0), value: 0 };
        let right = pts[0];
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].idx >= currentIdx) {
            right = pts[i];
            left = i > 0 ? pts[i - 1] : { idx: Math.max(launchIdx - 1, 0), value: 0 };
            break;
          }
        }

        const span = right.idx - left.idx;
        const progress = span > 0 ? (currentIdx - left.idx) / span : 1;
        let value;
        if (p.interpolation === 'step') {
          value = left.value;
        } else if (p.interpolation === 's_curve') {
          const s = progress * progress * (3 - 2 * progress);
          value = left.value + (right.value - left.value) * s;
        } else {
          value = left.value + (right.value - left.value) * progress;
        }
        point[metric] = Math.round(value * 100) / 100;
      }
      return point;
    });
  }, [profiles]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.agents.update(id, form);
      await api.agents.updateAssignments(id, selectedSteps.map(stepId => ({ step_id: stepId, is_active: 1 })));
      const profilesList = [];
      for (const metric of METRICS) {
        const p = profiles[metric];
        if (p) {
          profilesList.push({
            metric,
            launch_month: p.launch_month,
            milestones: p.milestones,
            interpolation: p.interpolation,
          });
        }
      }
      await api.agents.updateProfiles(id, profilesList);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${form.name}"?`)) return;
    await api.agents.delete(id);
    navigate('/agents');
  };

  const updateMilestone = (metric, year, value) => {
    setProfiles(prev => ({
      ...prev,
      [metric]: {
        ...prev[metric],
        milestones: prev[metric].milestones.map(ms =>
          ms.year === year ? { ...ms, q4_value: parseFloat(value) || 0 } : ms
        ),
      },
    }));
  };

  if (!agent) return <div className="p-6 text-center text-gray-400">Loading...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button className="btn-ghost" onClick={() => navigate('/agents')}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Bot size={24} className="text-blue-600" />
            {form.name}
            <StatusBadge status={form.status} />
          </h1>
        </div>
        <button className="btn-danger btn-sm" onClick={handleDelete}><Trash2 size={14} /> Delete</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Identity */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Agent Identity</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Owner</label>
                <input className="input" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
              </div>
              <div>
                <label className="label">Launch Date</label>
                <input type="month" className="input" value={(form.launch_date || '').slice(0, 7)} onChange={e => setForm(f => ({ ...f, launch_date: e.target.value + '-01' }))} />
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          {/* Assumption Profile / Ramp Builder */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Assumption Profile — Ramp Builder</h2>

            <div className="flex gap-2 mb-4">
              {METRICS.map(m => (
                <button
                  key={m}
                  onClick={() => setActiveMetric(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeMetric === m ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                  style={activeMetric === m ? { backgroundColor: METRIC_COLORS[m] } : {}}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>

            {profiles[activeMetric] && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Launch Month</label>
                    <input
                      type="month"
                      className="input"
                      value={(profiles[activeMetric].launch_month || '').slice(0, 7)}
                      onChange={e => setProfiles(prev => ({
                        ...prev,
                        [activeMetric]: { ...prev[activeMetric], launch_month: e.target.value + '-01' }
                      }))}
                    />
                  </div>
                  <div>
                    <label className="label">Interpolation</label>
                    <select
                      className="input"
                      value={profiles[activeMetric].interpolation}
                      onChange={e => setProfiles(prev => ({
                        ...prev,
                        [activeMetric]: { ...prev[activeMetric], interpolation: e.target.value }
                      }))}
                    >
                      {INTERPOLATIONS.map(i => <option key={i} value={i}>{i === 's_curve' ? 'S-Curve' : i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Year-End (Q4) Milestones</label>
                  <div className="grid grid-cols-4 gap-3">
                    {YEARS.map(y => {
                      const ms = profiles[activeMetric].milestones.find(m => m.year === y);
                      return (
                        <div key={y} className="text-center">
                          <div className="text-xs text-gray-500 mb-1">Dec {y}</div>
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded text-center focus:ring-2 focus:ring-blue-500"
                              value={ms ? ms.q4_value : 0}
                              onChange={e => updateMilestone(activeMetric, y, e.target.value)}
                              min={0}
                              max={100}
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval={5}
                    stroke="#9ca3af"
                  />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(value, name) => [`${value.toFixed(1)}%`, METRIC_LABELS[name]]}
                  />
                  <Legend formatter={(value) => METRIC_LABELS[value]} wrapperStyle={{ fontSize: 12 }} />
                  {METRICS.map(m => (
                    <Line
                      key={m}
                      type="monotone"
                      dataKey={m}
                      stroke={METRIC_COLORS[m]}
                      strokeWidth={activeMetric === m ? 3 : 1.5}
                      dot={false}
                      opacity={activeMetric === m ? 1 : 0.4}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Step Assignments */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Step Assignments</h2>
            <p className="text-xs text-gray-500 mb-3">Select automatable process steps this agent applies to:</p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {automatableSteps.map(step => (
                <label key={step.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedSteps.includes(step.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedSteps(prev => [...prev, step.id]);
                      } else {
                        setSelectedSteps(prev => prev.filter(id => id !== step.id));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <div>
                    <span className="text-gray-900">{step.name}</span>
                    <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{step.team_code}</span>
                  </div>
                </label>
              ))}
              {automatableSteps.length === 0 && (
                <p className="text-xs text-gray-400 py-4 text-center">No automatable steps found</p>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Stats</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Assigned Steps</span>
                <span className="font-medium text-gray-900">{selectedSteps.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <StatusBadge status={form.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-600">{new Date(agent.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
