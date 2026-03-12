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

const YEARS = [2026, 2027, 2028, 2029];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(n, decimals = 1) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) < 0.05 && decimals <= 1) return '0.0';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtInt(n) {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) < 0.005) return '0.0%';
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="text-gray-600">{p.name}</span>
          </span>
          <span className="font-medium text-gray-900 tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, subtitle, icon: Icon, color = 'blue' }) {
  const styles = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', ring: 'ring-red-100' },
    green: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100' },
  };
  const s = styles[color];
  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.bg} ${s.text} ring-1 ${s.ring}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="text-[28px] font-bold text-gray-900 tracking-tight tabular-nums">{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1.5">{subtitle}</div>}
    </div>
  );
}

function StepTreeRow({ step, depth = 0, stepData, expanded, toggleExpand }) {
  const data = stepData?.[step.id];
  const hasChildren = step.children && step.children.length > 0;
  const isExpanded = expanded.has(step.id);
  const hasSavings = data && (data.min > 0.01 || data.max > 0.01);

  return (
    <>
      <tr className={`group hover:bg-gray-50/80 ${step.is_custom ? 'opacity-40' : ''}`}>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button onClick={() => toggleExpand(step.id)} className="mr-1.5 p-0.5 rounded hover:bg-gray-200 text-gray-400">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span className="w-[22px]" />}
            <span className={`text-sm ${depth === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{step.name}</span>
            {step.agent_count > 0 && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                <Bot size={9} /> {step.agent_count}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-600">{data ? fmt(data.allocated) : '—'}</td>
        <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-medium ${hasSavings ? 'text-blue-600' : 'text-gray-300'}`}>{data ? fmt(data.min) : '—'}</td>
        <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-medium ${hasSavings ? 'text-red-600' : 'text-gray-300'}`}>{data ? fmt(data.max) : '—'}</td>
        <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-500">
          {data && data.allocated > 0.01 ? fmtPct((data.max / data.allocated) * 100) : '—'}
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
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${selectedYear === null ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
      >
        All Years
      </button>
      {YEARS.map(y => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${selectedYear === y ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

const axisStyle = { fontSize: 11, fill: '#6b7280', fontFamily: 'Inter, system-ui, sans-serif' };
const gridStyle = { strokeDasharray: '3 3', stroke: '#e5e7eb' };

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

  const effectiveTotals = useMemo(() => {
    if (!results) return { min: 0, max: 0, baseline: 0 };
    if (selectedYear === null) return results.totals;
    return results.yearlyTotals[selectedYear] || { min: 0, max: 0, baseline: 0 };
  }, [results, selectedYear]);

  const yearlyChartData = useMemo(() => {
    if (!results) return [];
    return YEARS.map(y => {
      const yt = results.yearlyTotals[y] || { min: 0, max: 0, baseline: 0 };
      return {
        year: y.toString(),
        baseline: Math.round(yt.baseline),
        min_saved: Math.round(yt.min * 10) / 10,
        max_saved: Math.round(yt.max * 10) / 10,
        pct_min: yt.baseline > 0 ? (yt.min / yt.baseline) * 100 : 0,
        pct_max: yt.baseline > 0 ? (yt.max / yt.baseline) * 100 : 0,
      };
    });
  }, [results]);

  const monthlyChartData = useMemo(() => {
    if (!results) return [];
    let entries = Object.entries(results.monthly).sort(([a], [b]) => a.localeCompare(b));
    if (selectedYear !== null) {
      entries = entries.filter(([key]) => key.startsWith(`${selectedYear}-`));
    }
    return entries.map(([key, val]) => {
      const [y, m] = key.split('-');
      const label = selectedYear
        ? MONTH_SHORT[parseInt(m) - 1]
        : `${MONTH_SHORT[parseInt(m) - 1]} ${y.slice(2)}`;
      return {
        month: label,
        min_saved: Math.round(val.min * 10) / 10,
        max_saved: Math.round(val.max * 10) / 10,
      };
    });
  }, [results, selectedYear]);

  const regionData = useMemo(() => {
    if (!results) return [];
    return Object.values(results.byRegion).map(r => {
      if (selectedYear === null) return { ...r, min: Math.round(r.min * 10) / 10, max: Math.round(r.max * 10) / 10, baseline: Math.round(r.baseline) };
      const yr = r.yearly[selectedYear] || { min: 0, max: 0, baseline: 0 };
      return { ...r, min: Math.round(yr.min * 10) / 10, max: Math.round(yr.max * 10) / 10, baseline: Math.round(yr.baseline) };
    }).sort((a, b) => b.max - a.max);
  }, [results, selectedYear]);

  const agentData = useMemo(() => {
    if (!results) return [];
    return Object.values(results.byAgent).map(a => {
      if (selectedYear === null) return { ...a, min: Math.round(a.min * 10) / 10, max: Math.round(a.max * 10) / 10, entitlement: Math.round(a.entitlement * 10) / 10 };
      const yr = a.yearly[selectedYear] || { min: 0, max: 0, entitlement: 0 };
      return { ...a, min: Math.round(yr.min * 10) / 10, max: Math.round(yr.max * 10) / 10, entitlement: Math.round(yr.entitlement * 10) / 10 };
    }).sort((a, b) => b.entitlement - a.entitlement);
  }, [results, selectedYear]);

  const stepData = useMemo(() => {
    if (!results) return {};
    const out = {};
    for (const [id, s] of Object.entries(results.byStep)) {
      if (selectedYear === null) {
        out[id] = { ...s, min: Math.round(s.min * 10) / 10, max: Math.round(s.max * 10) / 10, allocated: Math.round(s.allocated * 10) / 10 };
      } else {
        const yr = s.yearly[selectedYear] || { min: 0, max: 0, allocated: 0 };
        out[id] = { ...s, min: Math.round(yr.min * 10) / 10, max: Math.round(yr.max * 10) / 10, allocated: Math.round(yr.allocated * 10) / 10 };
      }
    }
    return out;
  }, [results, selectedYear]);

  const activeAgentCount = useMemo(() => {
    return agentData.filter(a => a.min > 0.01 || a.max > 0.01 || a.entitlement > 0.01).length;
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
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <TrendingDown size={24} className="text-gray-400" />
          </div>
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
  const periodLabel = selectedYear ? `monthly avg in ${selectedYear}` : 'monthly avg 2026–2029';

  return (
    <div className={`${presentationMode ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : ''} p-6 max-w-7xl mx-auto`}>
      <div className={`flex items-center justify-between mb-6 ${presentationMode ? 'mb-8' : ''}`}>
        <div>
          <h1 className={`font-bold text-gray-900 ${presentationMode ? 'text-3xl' : 'text-2xl'}`}>📈 Dashboard</h1>
          {!presentationMode && <p className="text-sm text-gray-500 mt-1">FTE savings by region, step, agent, and scenario</p>}
        </div>
        <div className="flex items-center gap-3">
          {!presentationMode && (
            <select className="input w-56" value={selectedScenario} onChange={e => setSelectedScenario(e.target.value)}>
              {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewMode('min')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'min' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Min</button>
            <button onClick={() => setViewMode('max')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'max' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Max</button>
          </div>
          <button className="btn-ghost btn-sm" onClick={() => setPresentationMode(!presentationMode)}>
            {presentationMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {presentationMode ? 'Exit' : 'Present'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
        </div>
      ) : results ? (
        <>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar size={14} />
              <span>Showing: <strong className="text-gray-900">{yearLabel}</strong></span>
            </div>
            <YearSelector selectedYear={selectedYear} onChange={setSelectedYear} />
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <MetricCard label="FTE Baseline" value={fmtInt(effectiveTotals.baseline)} subtitle={periodLabel} icon={Users} color="blue" />
            <MetricCard label="FTE Saved (Min)" value={fmt(effectiveTotals.min)} subtitle={effectiveTotals.baseline > 0 ? `${fmtPct((effectiveTotals.min / effectiveTotals.baseline) * 100)} of baseline` : '—'} icon={TrendingDown} color="green" />
            <MetricCard label="FTE Saved (Max)" value={fmt(effectiveTotals.max)} subtitle={effectiveTotals.baseline > 0 ? `${fmtPct((effectiveTotals.max / effectiveTotals.baseline) * 100)} of baseline` : '—'} icon={TrendingDown} color="red" />
            <MetricCard label="Active Agents" value={activeAgentCount} subtitle={selectedYear ? `with savings in ${selectedYear}` : 'contributing to savings'} icon={Bot} color="amber" />
          </div>

          {!presentationMode && (
            <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
              {panels.map(p => (
                <button key={p.id} onClick={() => setActivePanel(p.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activePanel === p.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{p.label}</button>
              ))}
            </div>
          )}

          {/* ===== OVERVIEW ===== */}
          {(activePanel === 'overview' || presentationMode) && (
            <div className="space-y-6 mb-8">
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">FTE Saved — Year-by-Year</h3>
                <p className="text-xs text-gray-400 mb-5">Monthly average FTE baseline vs savings per year</p>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyChartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} barGap={2} barCategoryGap="25%">
                      <CartesianGrid {...gridStyle} vertical={false} />
                      <XAxis dataKey="year" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtInt} />
                      <Tooltip content={<ChartTooltipContent />} cursor={{ fill: '#f9fafb' }} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                      <Bar dataKey="baseline" fill="#e5e7eb" name="FTE Baseline" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="min_saved" fill="#3b82f6" name="Saved (Min)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="max_saved" fill="#ef4444" name="Saved (Max)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Monthly Savings Trend {selectedYear ? `— ${selectedYear}` : ''}</h3>
                <p className="text-xs text-gray-400 mb-5">Total FTE savings across all regions per month</p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyChartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="gradMax" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradMin" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridStyle} vertical={false} />
                      <XAxis dataKey="month" tick={{ ...axisStyle, fontSize: selectedYear ? 11 : 9 }} axisLine={false} tickLine={false} interval={selectedYear ? 0 : 5} />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, 0)} />
                      <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: '#d1d5db', strokeDasharray: '4 4' }} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                      <Area type="monotone" dataKey="max_saved" fill="url(#gradMax)" stroke="#ef4444" strokeWidth={2} name="Saved (Max)" dot={false} />
                      <Area type="monotone" dataKey="min_saved" fill="url(#gradMin)" stroke="#3b82f6" strokeWidth={2} name="Saved (Min)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/80">
                  <h3 className="text-sm font-semibold text-gray-900">Yearly Summary</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Click a row to filter the dashboard to that year</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Year</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Baseline</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-blue-500 uppercase tracking-wider">Min Saved</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-red-500 uppercase tracking-wider">Max Saved</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-blue-500 uppercase tracking-wider">% Min</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-red-500 uppercase tracking-wider">% Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {yearlyChartData.map(row => (
                      <tr key={row.year} className={`cursor-pointer transition-colors ${selectedYear === parseInt(row.year) ? 'bg-blue-50/60' : 'hover:bg-gray-50/60'}`} onClick={() => setSelectedYear(selectedYear === parseInt(row.year) ? null : parseInt(row.year))}>
                        <td className="px-6 py-3 font-semibold text-gray-900">{row.year}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtInt(row.baseline)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-700">{fmt(row.min_saved)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-red-700">{fmt(row.max_saved)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-blue-600">{fmtPct(row.pct_min)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">{fmtPct(row.pct_max)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== BY REGION ===== */}
          {(activePanel === 'region' || presentationMode) && (
            <div className="space-y-6 mb-8">
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">FTE Saved by Region {selectedYear ? `— ${selectedYear}` : ''}</h3>
                <p className="text-xs text-gray-400 mb-5">Monthly average per region</p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} barGap={2} barCategoryGap="20%">
                      <CartesianGrid {...gridStyle} vertical={false} />
                      <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtInt} />
                      <Tooltip content={<ChartTooltipContent />} cursor={{ fill: '#f9fafb' }} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                      <Bar dataKey="baseline" fill="#e5e7eb" name="Baseline" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="min" fill="#3b82f6" name="Saved (Min)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="max" fill="#ef4444" name="Saved (Max)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/80">
                  <h3 className="text-sm font-semibold text-gray-900">Regional Breakdown — FTE Saved per Year</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Region</th>
                        {YEARS.map(y => (
                          <th key={y} className="px-3 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider" colSpan={2}>{y}</th>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-50">
                        <th></th>
                        {YEARS.map(y => (
                          <React.Fragment key={`${y}-sub`}>
                            <th className="px-2 py-1 text-center text-[10px] font-medium text-blue-500">Min</th>
                            <th className="px-2 py-1 text-center text-[10px] font-medium text-red-500">Max</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Object.values(results.byRegion).sort((a, b) => b.max - a.max).map(r => (
                        <tr key={r.id} className="hover:bg-gray-50/60">
                          <td className="px-6 py-3 font-medium text-gray-900">{r.name}</td>
                          {YEARS.map(y => (
                            <React.Fragment key={`${r.id}-${y}`}>
                              <td className={`px-2 py-3 text-center tabular-nums ${selectedYear === y ? 'bg-blue-50/60 font-semibold text-blue-700' : 'text-blue-600'}`}>{fmt(r.yearly[y]?.min || 0)}</td>
                              <td className={`px-2 py-3 text-center tabular-nums ${selectedYear === y ? 'bg-red-50/60 font-semibold text-red-700' : 'text-red-600'}`}>{fmt(r.yearly[y]?.max || 0)}</td>
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

          {/* ===== BY PROCESS STEP ===== */}
          {(activePanel === 'step' || presentationMode) && (
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Process Step Breakdown {selectedYear ? `— ${selectedYear}` : ''}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">FTE allocated and saved per process step ({periodLabel})</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="btn-ghost btn-sm" onClick={expandAllSteps}>Expand All</button>
                  <button className="btn-ghost btn-sm" onClick={() => setExpandedSteps(new Set())}>Collapse</button>
                </div>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Step</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">Allocated</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold text-blue-500 uppercase tracking-wider w-28">Min Saved</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold text-red-500 uppercase tracking-wider w-28">Max Saved</th>
                      <th className="px-3 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">% Auto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {processTree.map(step => (
                      <StepTreeRow key={step.id} step={step} stepData={stepData} expanded={expandedSteps} toggleExpand={toggleStepExpand} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== AGENT ENTITLEMENT ===== */}
          {(activePanel === 'agent' || presentationMode) && (
            <div className="space-y-6 mb-8">
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Agent Entitlement {selectedYear ? `— ${selectedYear}` : ''}</h3>
                <p className="text-xs text-gray-400 mb-5">FTE pool addressed by each agent vs actual savings</p>
                {agentData.length > 0 ? (
                  <div style={{ height: Math.max(200, agentData.length * 60 + 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={agentData} layout="vertical" margin={{ top: 10, right: 20, bottom: 0, left: 10 }} barGap={1} barCategoryGap="25%">
                        <CartesianGrid {...gridStyle} horizontal={false} />
                        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, 0)} />
                        <YAxis dataKey="name" type="category" tick={{ ...axisStyle, fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ fill: '#f9fafb' }} />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                        <Bar dataKey="entitlement" fill="#e5e7eb" name="FTE Entitlement" radius={[0, 6, 6, 0]} barSize={16} />
                        <Bar dataKey="min" fill="#3b82f6" name="Saved (Min)" radius={[0, 6, 6, 0]} barSize={16} />
                        <Bar dataKey="max" fill="#ef4444" name="Saved (Max)" radius={[0, 6, 6, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No agent data for this period.</p>
                )}
              </div>

              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/80">
                  <h3 className="text-sm font-semibold text-gray-900">Agent Detail — Yearly Breakdown</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Entitlement, min and max savings per agent per year</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Agent</th>
                        {YEARS.map(y => (
                          <th key={y} className={`px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider ${selectedYear === y ? 'text-gray-900 bg-gray-100/60' : 'text-gray-400'}`} colSpan={3}>{y}</th>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-50">
                        <th></th>
                        {YEARS.map(y => (
                          <React.Fragment key={`${y}-agent-sub`}>
                            <th className={`px-1 py-1 text-center text-[9px] font-medium ${selectedYear === y ? 'text-gray-600' : 'text-gray-400'}`}>FTE</th>
                            <th className={`px-1 py-1 text-center text-[9px] font-medium ${selectedYear === y ? 'text-blue-600' : 'text-blue-400'}`}>Min</th>
                            <th className={`px-1 py-1 text-center text-[9px] font-medium ${selectedYear === y ? 'text-red-600' : 'text-red-400'}`}>Max</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Object.values(results.byAgent).sort((a, b) => b.entitlement - a.entitlement).map(a => (
                        <tr key={a.id} className="hover:bg-gray-50/60">
                          <td className="px-6 py-3">
                            <span className="font-medium text-gray-900">{a.name}</span>
                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${a.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : a.status === 'Planned' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                          </td>
                          {YEARS.map(y => {
                            const yr = a.yearly[y] || { min: 0, max: 0, entitlement: 0 };
                            const isSel = selectedYear === y;
                            const hasVal = yr.min > 0.01 || yr.max > 0.01;
                            return (
                              <React.Fragment key={`${a.id}-${y}`}>
                                <td className={`px-1 py-3 text-center tabular-nums text-xs ${isSel ? 'bg-gray-50 font-semibold text-gray-700' : hasVal ? 'text-gray-500' : 'text-gray-300'}`}>{fmt(yr.entitlement)}</td>
                                <td className={`px-1 py-3 text-center tabular-nums text-xs ${isSel ? 'bg-blue-50/60 font-semibold text-blue-700' : hasVal ? 'text-blue-600' : 'text-gray-300'}`}>{fmt(yr.min)}</td>
                                <td className={`px-1 py-3 text-center tabular-nums text-xs ${isSel ? 'bg-red-50/60 font-semibold text-red-700' : hasVal ? 'text-red-600' : 'text-gray-300'}`}>{fmt(yr.max)}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                      {Object.keys(results.byAgent).length === 0 && (
                        <tr><td colSpan={1 + YEARS.length * 3} className="px-6 py-8 text-center text-sm text-gray-400">No agents in this scenario.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
