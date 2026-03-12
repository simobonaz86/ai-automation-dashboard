import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import {
  TrendingDown, Users, Bot, ChevronDown, ChevronRight, Maximize2, Minimize2,
  Calendar
} from 'lucide-react';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];
const YEARS = [2026, 2027, 2028, 2029];

function MetricCard({ label, value, subtitle, icon: Icon, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function StepTreeRow({ step, depth = 0, stepData, expanded, toggleExpand }) {
  const data = stepData?.[step.id];
  const hasChildren = step.children && step.children.length > 0;
  const isExpanded = expanded.has(step.id);

  return (
    <>
      <tr className={`hover:bg-gray-50 ${step.is_custom ? 'opacity-40' : ''}`}>
        <td className="px-4 py-2 whitespace-nowrap">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button onClick={() => toggleExpand(step.id)} className="mr-1 p-0.5 rounded hover:bg-gray-200 text-gray-400">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span className="w-5" />}
            <span className="text-sm text-gray-900">{step.name}</span>
            {step.agent_count > 0 && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                <Bot size={9} /> {step.agent_count}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-right text-sm text-gray-600">{data ? data.allocated.toFixed(1) : '—'}</td>
        <td className="px-3 py-2 text-right text-sm font-medium text-blue-600">{data ? data.min.toFixed(1) : '—'}</td>
        <td className="px-3 py-2 text-right text-sm font-medium text-red-600">{data ? data.max.toFixed(1) : '—'}</td>
        <td className="px-3 py-2 text-right text-sm text-gray-500">
          {data && data.allocated > 0 ? `${((data.max / data.allocated) * 100).toFixed(1)}%` : '—'}
        </td>
      </tr>
      {isExpanded && hasChildren && step.children.map(child => (
        <StepTreeRow key={child.id} step={child} depth={depth + 1} stepData={stepData} expanded={expanded} toggleExpand={toggleExpand} />
      ))}
    </>
  );
}

function YearSelector({ selectedYear, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedYear === null ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
      >
        All Years
      </button>
      {YEARS.map(y => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedYear === y ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [results, setResults] = useState(null);
  const [processTree, setProcessTree] = useState([]);
  const [viewMode, setViewMode] = useState('min');
  const [selectedYear, setSelectedYear] = useState(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [activePanel, setActivePanel] = useState('overview');
  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.scenarios.list().then(s => {
      setScenarios(s);
      const def = s.find(x => x.is_default) || s[0];
      if (def) setSelectedScenario(def.id);
    });
    api.steps.tree().then(setProcessTree);
  }, []);

  useEffect(() => {
    if (!selectedScenario) return;
    setLoading(true);
    api.scenarios.calculate(selectedScenario).then(r => {
      setResults(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedScenario]);

  // Derive totals based on selected year
  const effectiveTotals = useMemo(() => {
    if (!results) return { min: 0, max: 0, baseline: 0 };
    if (selectedYear === null) return results.totals;
    const yt = results.yearlyTotals[selectedYear];
    return yt || { min: 0, max: 0, baseline: 0 };
  }, [results, selectedYear]);

  const yearlyChartData = useMemo(() => {
    if (!results) return [];
    return YEARS.map(y => ({
      year: y.toString(),
      baseline: results.yearlyTotals[y]?.baseline || 0,
      min_saved: results.yearlyTotals[y]?.min || 0,
      max_saved: results.yearlyTotals[y]?.max || 0,
      pct_min: results.yearlyTotals[y]?.baseline ? ((results.yearlyTotals[y]?.min / results.yearlyTotals[y]?.baseline) * 100) : 0,
      pct_max: results.yearlyTotals[y]?.baseline ? ((results.yearlyTotals[y]?.max / results.yearlyTotals[y]?.baseline) * 100) : 0,
    }));
  }, [results]);

  const monthlyChartData = useMemo(() => {
    if (!results) return [];
    let entries = Object.entries(results.monthly).sort(([a], [b]) => a.localeCompare(b));
    if (selectedYear !== null) {
      entries = entries.filter(([key]) => key.startsWith(`${selectedYear}-`));
    }
    return entries.map(([key, val]) => ({
      month: key,
      baseline: val.baseline,
      min_saved: val.min,
      max_saved: val.max,
    }));
  }, [results, selectedYear]);

  // Region data filtered by selected year
  const regionData = useMemo(() => {
    if (!results) return [];
    return Object.values(results.byRegion).map(r => {
      if (selectedYear === null) return r;
      const yr = r.yearly[selectedYear] || { min: 0, max: 0, baseline: 0 };
      return { ...r, min: yr.min, max: yr.max, baseline: yr.baseline };
    }).sort((a, b) => b.max - a.max);
  }, [results, selectedYear]);

  // Agent data filtered by selected year
  const agentData = useMemo(() => {
    if (!results) return [];
    return Object.values(results.byAgent).map(a => {
      if (selectedYear === null) return a;
      const yr = a.yearly[selectedYear] || { min: 0, max: 0, entitlement: 0 };
      return { ...a, min: yr.min, max: yr.max, entitlement: yr.entitlement };
    }).sort((a, b) => b.entitlement - a.entitlement);
  }, [results, selectedYear]);

  // Step data filtered by selected year
  const stepData = useMemo(() => {
    if (!results) return {};
    const out = {};
    for (const [id, s] of Object.entries(results.byStep)) {
      if (selectedYear === null) {
        out[id] = s;
      } else {
        const yr = s.yearly[selectedYear] || { min: 0, max: 0, allocated: 0 };
        out[id] = { ...s, min: yr.min, max: yr.max, allocated: yr.allocated };
      }
    }
    return out;
  }, [results, selectedYear]);

  // Count agents with non-zero savings in selected period
  const activeAgentCount = useMemo(() => {
    return agentData.filter(a => a.min > 0.001 || a.max > 0.001 || a.entitlement > 0.001).length;
  }, [agentData]);

  const toggleStepExpand = useCallback((id) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const expandAllSteps = () => {
    const ids = new Set();
    const collect = (nodes) => nodes.forEach(n => { ids.add(n.id); if (n.children) collect(n.children); });
    collect(processTree);
    setExpandedSteps(ids);
  };

  if (!results && !loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Scenario Selected</h2>
          <p className="text-sm text-gray-500">Create a scenario in the Scenario Planner to view dashboard results.</p>
        </div>
      </div>
    );
  }

  const panels = [
    { id: 'overview', label: 'Overview' },
    { id: 'region', label: 'By Region' },
    { id: 'step', label: 'By Process Step' },
    { id: 'agent', label: 'Agent Entitlement' },
  ];

  const yearLabel = selectedYear ? `${selectedYear}` : 'All Years (2026–2029)';
  const periodLabel = selectedYear ? `monthly avg in ${selectedYear}` : 'monthly avg across 2026–2029';

  return (
    <div className={`${presentationMode ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : ''} p-6 max-w-7xl mx-auto`}>
      {/* Header */}
      <div className={`flex items-center justify-between mb-6 ${presentationMode ? 'mb-8' : ''}`}>
        <div>
          <h1 className={`font-bold text-gray-900 ${presentationMode ? 'text-3xl' : 'text-2xl'}`}>📈 Dashboard</h1>
          {!presentationMode && <p className="text-sm text-gray-500 mt-1">FTE savings by region, step, agent, and scenario</p>}
        </div>
        <div className="flex items-center gap-3">
          {!presentationMode && (
            <select
              className="input w-56"
              value={selectedScenario}
              onChange={e => setSelectedScenario(e.target.value)}
            >
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('min')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'min' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Min
            </button>
            <button
              onClick={() => setViewMode('max')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'max' ? 'bg-red-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Max
            </button>
          </div>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setPresentationMode(!presentationMode)}
          >
            {presentationMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {presentationMode ? 'Exit' : 'Present'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : results ? (
        <>
          {/* Year Selector — visible on all panels */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar size={14} />
              <span>Showing: <strong className="text-gray-900">{yearLabel}</strong></span>
            </div>
            <YearSelector selectedYear={selectedYear} onChange={setSelectedYear} />
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="FTE Baseline"
              value={effectiveTotals.baseline.toFixed(0)}
              subtitle={periodLabel}
              icon={Users}
              color="blue"
            />
            <MetricCard
              label="FTE Saved (Min)"
              value={effectiveTotals.min.toFixed(1)}
              subtitle={effectiveTotals.baseline > 0 ? `${((effectiveTotals.min / effectiveTotals.baseline) * 100).toFixed(2)}% of baseline` : '—'}
              icon={TrendingDown}
              color="green"
            />
            <MetricCard
              label="FTE Saved (Max)"
              value={effectiveTotals.max.toFixed(1)}
              subtitle={effectiveTotals.baseline > 0 ? `${((effectiveTotals.max / effectiveTotals.baseline) * 100).toFixed(2)}% of baseline` : '—'}
              icon={TrendingDown}
              color="red"
            />
            <MetricCard
              label="Active Agents"
              value={activeAgentCount}
              subtitle={selectedYear ? `with savings in ${selectedYear}` : 'contributing to savings'}
              icon={Bot}
              color="amber"
            />
          </div>

          {/* Panel Tabs */}
          {!presentationMode && (
            <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
              {panels.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePanel(p.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activePanel === p.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Overview Panel */}
          {(activePanel === 'overview' || presentationMode) && (
            <div className="space-y-6 mb-8">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">FTE Saved — Year-by-Year Progression</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="baseline" fill="#e5e7eb" name="FTE Baseline" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="min_saved" fill="#3b82f6" name="FTE Saved (Min)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="max_saved" fill="#ef4444" name="FTE Saved (Max)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Monthly FTE Savings Trend {selectedYear ? `— ${selectedYear}` : ''}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={selectedYear ? 0 : 5} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="max_saved" fill="#fecaca" stroke="#ef4444" name="FTE Saved (Max)" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="min_saved" fill="#bfdbfe" stroke="#3b82f6" name="FTE Saved (Min)" fillOpacity={0.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Yearly Summary Table */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-900">AI Assumptions — Year-End Summary</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Year</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Baseline FTE</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase">Saved (Min)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-red-600 uppercase">Saved (Max)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase">% Min</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-red-600 uppercase">% Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {yearlyChartData.map(row => (
                      <tr
                        key={row.year}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedYear === parseInt(row.year) ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`}
                        onClick={() => setSelectedYear(selectedYear === parseInt(row.year) ? null : parseInt(row.year))}
                      >
                        <td className="px-4 py-2.5 font-semibold text-gray-900">{row.year}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{row.baseline.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-blue-700">{row.min_saved.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-red-700">{row.max_saved.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-right text-blue-600">{row.pct_min.toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right text-red-600">{row.pct_max.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Region Panel */}
          {(activePanel === 'region' || presentationMode) && (
            <div className="space-y-6 mb-8">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  FTE Saved by Region {selectedYear ? `— ${selectedYear}` : ''}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="code" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="baseline" fill="#e5e7eb" name="Baseline" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="min" fill="#3b82f6" name="Saved (Min)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="max" fill="#ef4444" name="Saved (Max)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-900">Regional Breakdown — FTE Saved per Year</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Region</th>
                        {YEARS.map(y => (
                          <th key={y} className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase" colSpan={2}>{y}</th>
                        ))}
                      </tr>
                      <tr>
                        <th></th>
                        {YEARS.map(y => (
                          <React.Fragment key={`${y}-sub`}><th className="px-2 py-1 text-center text-[10px] text-blue-600">Min</th><th className="px-2 py-1 text-center text-[10px] text-red-600">Max</th></React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.values(results.byRegion).sort((a, b) => b.max - a.max).map(r => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{r.name} <span className="text-xs text-gray-400">({r.code})</span></td>
                          {YEARS.map(y => (
                            <React.Fragment key={`${r.id}-${y}`}>
                              <td className={`px-2 py-2.5 text-center text-blue-700 ${selectedYear === y ? 'bg-blue-50 font-semibold' : ''}`}>{(r.yearly[y]?.min || 0).toFixed(1)}</td>
                              <td className={`px-2 py-2.5 text-center text-red-700 ${selectedYear === y ? 'bg-red-50 font-semibold' : ''}`}>{(r.yearly[y]?.max || 0).toFixed(1)}</td>
                            </React.Fragment>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* By Process Step Panel */}
          {(activePanel === 'step' || presentationMode) && (
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Process Step Breakdown {selectedYear ? `— ${selectedYear}` : ''}
                </h3>
                <button className="btn-ghost btn-sm" onClick={expandAllSteps}>Expand All</button>
                <button className="btn-ghost btn-sm" onClick={() => setExpandedSteps(new Set())}>Collapse All</button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Step</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase w-28">FTE Allocated</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-blue-600 uppercase w-28">Saved (Min)</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-red-600 uppercase w-28">Saved (Max)</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase w-28">% Automatable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {processTree.map(step => (
                      <StepTreeRow
                        key={step.id}
                        step={step}
                        stepData={stepData}
                        expanded={expandedSteps}
                        toggleExpand={toggleStepExpand}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Agent Entitlement Panel */}
          {(activePanel === 'agent' || presentationMode) && (
            <div className="space-y-6 mb-8">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Agent Entitlement — FTE Pool per Agent {selectedYear ? `— ${selectedYear}` : ''}
                </h3>
                {agentData.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={agentData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 120 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="#9ca3af" width={110} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="entitlement" fill="#e5e7eb" name="FTE Entitlement" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="min" fill="#3b82f6" name="Saved (Min)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="max" fill="#ef4444" name="Saved (Max)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No agent data for this period. Try selecting a different year.</p>
                )}
              </div>

              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-900">Agent Detail — Yearly Entitlement & Savings</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Agent</th>
                      {YEARS.map(y => (
                        <th key={y} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase" colSpan={3}>{y}</th>
                      ))}
                    </tr>
                    <tr>
                      <th></th>
                      {YEARS.map(y => (
                        <React.Fragment key={`${y}-agent-sub`}>
                          <th className="px-1 py-1 text-center text-[10px] text-gray-500">Entitle</th>
                          <th className="px-1 py-1 text-center text-[10px] text-blue-600">Min</th>
                          <th className="px-1 py-1 text-center text-[10px] text-red-600">Max</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Object.values(results.byAgent).sort((a, b) => b.entitlement - a.entitlement).map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-900">{a.name}</span>
                          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            a.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>{a.status}</span>
                        </td>
                        {YEARS.map(y => {
                          const yr = a.yearly[y] || { min: 0, max: 0, entitlement: 0 };
                          const isSelected = selectedYear === y;
                          return (
                            <React.Fragment key={`${a.id}-${y}`}>
                              <td className={`px-1 py-2.5 text-center text-gray-500 text-xs ${isSelected ? 'bg-gray-100 font-semibold' : ''}`}>{yr.entitlement.toFixed(1)}</td>
                              <td className={`px-1 py-2.5 text-center text-blue-700 text-xs ${isSelected ? 'bg-blue-50 font-semibold' : ''}`}>{yr.min.toFixed(1)}</td>
                              <td className={`px-1 py-2.5 text-center text-red-700 text-xs ${isSelected ? 'bg-red-50 font-semibold' : ''}`}>{yr.max.toFixed(1)}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                    {Object.keys(results.byAgent).length === 0 && (
                      <tr>
                        <td colSpan={1 + YEARS.length * 3} className="px-4 py-8 text-center text-sm text-gray-400">
                          No agents in this scenario. Add agents in the Scenario Planner.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
