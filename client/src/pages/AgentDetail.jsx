import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import { ArrowLeft, Save, Trash2, Bot, Lock, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const METRICS = ['min_automation', 'max_automation', 'adoption'];
const METRIC_LABELS = { min_automation: 'Min Automation %', max_automation: 'Max Automation %', adoption: 'AI Feature Adoption %' };
const METRIC_COLORS = { min_automation: '#3b82f6', max_automation: '#ef4444', adoption: '#10b981' };
const YEARS = [2026, 2027, 2028, 2029];
const STATUSES = ['Draft', 'Planned', 'Active', 'Retired'];
const INTERPOLATIONS = ['linear', 's_curve', 'step'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getLaunchYear(launchDate) {
  if (!launchDate) return 2026;
  return new Date(launchDate).getFullYear();
}

function isYearBeforeLaunch(year, launchDate) {
  if (!launchDate) return false;
  const launchD = new Date(launchDate);
  const launchYear = launchD.getFullYear();
  const launchMonth = launchD.getMonth();
  // Year ends in December; if launch is after Dec of this year, entire year is before launch
  if (year < launchYear) return true;
  // If launch is in the same year but after July, the year's Q4 value is very constrained
  // but we still allow it — only fully block years ending before launch
  return false;
}

function isYearFullyBeforeLaunch(year, launchDate) {
  if (!launchDate) return false;
  const launchYear = new Date(launchDate).getFullYear();
  return year < launchYear;
}

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
  const [scenarios, setScenarios] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [agentData, steps, scens] = await Promise.all([
        api.agents.get(id),
        api.steps.automatable(),
        api.scenarios.list(),
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
      setScenarios(scens);

      const p = {};
      for (const metric of METRICS) {
        const profileData = agentData.profiles[metric];
        if (profileData) {
          p[metric] = {
            interpolation: profileData.interpolation,
            milestones: profileData.milestones,
          };
        } else {
          p[metric] = {
            interpolation: 'linear',
            milestones: YEARS.map(y => ({ year: y, q4_value: 0 })),
          };
        }
      }
      setProfiles(p);
    };
    load();
  }, [id]);

  const launchDate = form.launch_date || '2027-01-01';
  const launchYear = getLaunchYear(launchDate);
  const launchLabel = launchDate
    ? `${MONTH_SHORT[new Date(launchDate).getMonth()]} ${new Date(launchDate).getFullYear()}`
    : 'Not set';

  const includedInScenarios = useMemo(() => {
    return scenarios.filter(s => s.agent_set.includes(id));
  }, [scenarios, id]);

  const notInAnyScenario = includedInScenarios.length === 0 && scenarios.length > 0;

  const chartData = useMemo(() => {
    if (!Object.keys(profiles).length || !launchDate) return [];
    const months = [];
    for (let y = 2026; y <= 2029; y++) {
      for (let m = 1; m <= 12; m++) {
        months.push({ year: y, month: m, label: `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}` });
      }
    }
    return months.map(({ year, month, label }) => {
      const point = { name: label };
      for (const metric of METRICS) {
        const p = profiles[metric];
        if (!p) continue;
        const launchD = new Date(launchDate);
        const launchIdx = (launchD.getFullYear() - 2026) * 12 + launchD.getMonth();
        const currentIdx = (year - 2026) * 12 + (month - 1);

        if (currentIdx < launchIdx) { point[metric] = 0; continue; }

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
        if (p.interpolation === 'step') value = left.value;
        else if (p.interpolation === 's_curve') { const s = progress * progress * (3 - 2 * progress); value = left.value + (right.value - left.value) * s; }
        else value = left.value + (right.value - left.value) * progress;
        point[metric] = Math.round(value * 100) / 100;
      }
      return point;
    });
  }, [profiles, launchDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.agents.update(id, form);
      await api.agents.updateAssignments(id, selectedSteps.map(stepId => ({ step_id: stepId, is_active: 1 })));
      const profilesList = [];
      for (const metric of METRICS) {
        const p = profiles[metric];
        if (p) {
          const cleanedMilestones = p.milestones.map(ms => ({
            ...ms,
            q4_value: isYearFullyBeforeLaunch(ms.year, launchDate) ? 0 : ms.q4_value,
          }));
          profilesList.push({
            metric,
            launch_month: launchDate,
            milestones: cleanedMilestones,
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
    if (isYearFullyBeforeLaunch(year, launchDate)) return;
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

  const handleLaunchDateChange = (newDate) => {
    const fullDate = newDate + '-01';
    setForm(f => ({ ...f, launch_date: fullDate }));
    setProfiles(prev => {
      const next = { ...prev };
      for (const metric of METRICS) {
        if (next[metric]) {
          next[metric] = {
            ...next[metric],
            milestones: next[metric].milestones.map(ms => ({
              ...ms,
              q4_value: isYearFullyBeforeLaunch(ms.year, fullDate) ? 0 : ms.q4_value,
            })),
          };
        }
      }
      return next;
    });
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

      {notInAnyScenario && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">This agent is not included in any scenario</p>
            <p className="text-xs text-amber-600 mt-0.5">It won't appear on the Dashboard until you add it to a scenario. Go to Scenario Planner and edit a scenario to include this agent.</p>
          </div>
        </div>
      )}

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
                <label className="label">Go-Live Date</label>
                <input type="month" className="input" value={(form.launch_date || '').slice(0, 7)} onChange={e => handleLaunchDateChange(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Milestones before this date will be set to 0%</p>
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Description</label>
              <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          {/* Assumption Profile / Ramp Builder */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Assumption Profile — Ramp Builder</h2>
                <p className="text-xs text-gray-400 mt-0.5">Go-live: <strong className="text-gray-600">{launchLabel}</strong> — values before launch are locked to 0%</p>
              </div>
            </div>

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
                <div className="w-48">
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

                <div>
                  <label className="label">Year-End (Q4) Milestones</label>
                  <div className="grid grid-cols-4 gap-3">
                    {YEARS.map(y => {
                      const ms = profiles[activeMetric].milestones.find(m => m.year === y);
                      const locked = isYearFullyBeforeLaunch(y, launchDate);
                      return (
                        <div key={y} className={`text-center rounded-lg p-3 ${locked ? 'bg-gray-50' : 'bg-white border border-gray-100'}`}>
                          <div className={`text-xs mb-1.5 font-medium ${locked ? 'text-gray-400' : 'text-gray-600'}`}>
                            Dec {y}
                            {locked && <Lock size={10} className="inline ml-1 -mt-0.5" />}
                          </div>
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              className={`w-20 px-2 py-1.5 text-sm border rounded text-center ${
                                locked
                                  ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                              }`}
                              value={locked ? 0 : (ms ? ms.q4_value : 0)}
                              onChange={e => updateMilestone(activeMetric, y, e.target.value)}
                              disabled={locked}
                              min={0}
                              max={100}
                            />
                            <span className={`text-xs ${locked ? 'text-gray-300' : 'text-gray-400'}`}>%</span>
                          </div>
                          {locked && <div className="text-[10px] text-gray-400 mt-1">Before go-live</div>}
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
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={5} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} stroke="#9ca3af" tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(value, name) => [`${value.toFixed(1)}%`, METRIC_LABELS[name]]}
                  />
                  <Legend formatter={(value) => METRIC_LABELS[value]} wrapperStyle={{ fontSize: 12 }} />
                  {METRICS.map(m => (
                    <Line
                      key={m} type="monotone" dataKey={m} stroke={METRIC_COLORS[m]}
                      strokeWidth={activeMetric === m ? 3 : 1.5} dot={false}
                      opacity={activeMetric === m ? 1 : 0.3}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
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
                      if (e.target.checked) setSelectedSteps(prev => [...prev, step.id]);
                      else setSelectedSteps(prev => prev.filter(sid => sid !== step.id));
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
                <span className="text-gray-500">Go-Live</span>
                <span className="font-medium text-gray-900">{launchLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">In Scenarios</span>
                <span className={`font-medium ${includedInScenarios.length > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                  {includedInScenarios.length > 0 ? includedInScenarios.length : 'None'}
                </span>
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
