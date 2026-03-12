import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { Save, Copy, TrendingUp, Info } from 'lucide-react';
import Modal from '../components/Modal';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function FTEBaselines() {
  const [grid, setGrid] = useState([]);
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState('Budget 2026');
  const [growth, setGrowth] = useState({});
  const [regions, setRegions] = useState([]);
  const [pendingChanges, setPendingChanges] = useState({});
  const [growthDirty, setGrowthDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versionModal, setVersionModal] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [activeTab, setActiveTab] = useState('baselines');

  const load = useCallback(async () => {
    const [g, v, gr, r] = await Promise.all([
      api.baselines.grid(version),
      api.baselines.versions(),
      api.baselines.getGrowth(version),
      api.regions.list(),
    ]);
    setGrid(g);
    setVersions(v);
    setGrowth(gr);
    setRegions(r);
    setPendingChanges({});
    setGrowthDirty(false);
  }, [version]);

  useEffect(() => { load(); }, [load]);

  const months = Array.from({ length: 12 }, (_, i) => ({
    key: `2026-${String(i + 1).padStart(2, '0')}`,
    label: MONTH_NAMES[i],
    month: i + 1,
  }));

  const getCellValue = (row, monthKey) => {
    const changeKey = `${row.region_id}_${row.team_id}_${monthKey}`;
    if (pendingChanges[changeKey] !== undefined) return pendingChanges[changeKey];
    return row.months[monthKey] || 0;
  };

  const setCellValue = (row, monthKey, value) => {
    const changeKey = `${row.region_id}_${row.team_id}_${monthKey}`;
    setPendingChanges(prev => ({ ...prev, [changeKey]: parseFloat(value) || 0 }));
  };

  const getRowTotal = (row) => months.reduce((sum, m) => sum + getCellValue(row, m.key), 0);
  const getRowAvg = (row) => getRowTotal(row) / 12;
  const getColumnTotal = (monthKey) => grid.reduce((sum, row) => sum + getCellValue(row, monthKey), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [];
      for (const [key, value] of Object.entries(pendingChanges)) {
        const parts = key.split('_');
        const regionId = parts[0];
        const teamId = parts[1];
        const monthKey = parts.slice(2).join('_');
        const month = parseInt(monthKey.split('-')[1]);
        updates.push({ region_id: regionId, team_id: teamId, year: 2026, month, fte_value: value });
      }
      if (updates.length > 0) await api.baselines.bulkUpdate(updates, version);

      if (growthDirty) {
        const rates = [];
        for (const year of [2027, 2028, 2029]) {
          const yd = growth[year];
          if (!yd) continue;
          rates.push({ region_id: null, team_id: null, year, growth_pct: yd.global });
          for (const [regionId, rd] of Object.entries(yd.byRegion || {})) {
            if (rd.growth_pct !== null && rd.growth_pct !== undefined) {
              rates.push({ region_id: regionId, team_id: null, year, growth_pct: rd.growth_pct });
            }
          }
        }
        await api.baselines.updateGrowth(rates, version);
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handlePaste = (e, rowIdx, startMonthIdx) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    const rows = text.split('\n').filter(r => r.trim());
    rows.forEach((rowData, rIdx) => {
      const values = rowData.split('\t');
      values.forEach((val, cIdx) => {
        const gridRow = grid[rowIdx + rIdx];
        const monthObj = months[startMonthIdx + cIdx];
        if (gridRow && monthObj) {
          setCellValue(gridRow, monthObj.key, parseFloat(val.replace(/,/g, '')) || 0);
        }
      });
    });
  };

  const updateGlobalGrowth = (year, value) => {
    setGrowth(prev => ({
      ...prev,
      [year]: { ...prev[year], global: parseFloat(value) || 0 },
    }));
    setGrowthDirty(true);
  };

  const updateRegionalGrowth = (year, regionId, value) => {
    const parsed = value === '' ? null : parseFloat(value);
    setGrowth(prev => ({
      ...prev,
      [year]: {
        ...prev[year],
        byRegion: {
          ...(prev[year]?.byRegion || {}),
          [regionId]: { ...(prev[year]?.byRegion?.[regionId] || {}), growth_pct: parsed },
        },
      },
    }));
    setGrowthDirty(true);
  };

  const handleCreateVersion = async () => {
    if (!newVersionName.trim()) return;
    await api.baselines.createVersion(version, newVersionName);
    setVersion(newVersionName);
    setVersionModal(false);
    load();
  };

  const hasPending = Object.keys(pendingChanges).length > 0 || growthDirty;

  return (
    <div className="p-6 max-w-[100rem] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 FTE Baselines</h1>
          <p className="text-sm text-gray-500 mt-1">2026 base year headcount + YoY growth rates — future years computed dynamically</p>
        </div>
        <div className="flex items-center gap-3">
          {hasPending && (
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
          )}
          <button className="btn-primary" onClick={handleSave} disabled={!hasPending || saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Version:</label>
          <select className="input w-48" value={version} onChange={e => setVersion(e.target.value)}>
            {versions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <button className="btn-ghost btn-sm" onClick={() => { setNewVersionName(''); setVersionModal(true); }}>
            <Copy size={14} /> Clone
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 border-b border-gray-200">
          <button onClick={() => setActiveTab('baselines')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'baselines' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            2026 Base Year
          </button>
          <button onClick={() => setActiveTab('growth')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'growth' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <TrendingUp size={14} className="inline mr-1 -mt-0.5" />
            YoY Growth Rates
          </button>
        </div>
      </div>

      {activeTab === 'baselines' && (
        <>
          <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2">
            <Info size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Enter monthly FTE headcount for <strong>2026</strong> (the base year). Years 2027–2029 are computed automatically using the growth rates and AI savings from your scenarios. Paste from Excel/Sheets is supported.
            </p>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 min-w-[200px]">
                    Region / Team
                  </th>
                  {months.map(m => (
                    <th key={m.key} className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">
                      {m.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-20 bg-gray-100">Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grid.map((row, rowIdx) => (
                  <tr key={`${row.region_id}_${row.team_id}`} className="hover:bg-blue-50/30">
                    <td className="px-4 py-2 sticky left-0 bg-white font-medium whitespace-nowrap">
                      <span className="text-gray-900">{row.region_code}</span>
                      <span className="mx-1.5 text-gray-300">·</span>
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: row.team_code === 'CX' ? '#f3e8ff' : '#e0f2fe', color: row.team_code === 'CX' ? '#7c3aed' : '#0891b2' }}>
                        {row.team_code}
                      </span>
                    </td>
                    {months.map((m, mIdx) => {
                      const val = getCellValue(row, m.key);
                      const changeKey = `${row.region_id}_${row.team_id}_${m.key}`;
                      const isChanged = pendingChanges[changeKey] !== undefined;
                      return (
                        <td key={m.key} className="px-1 py-1">
                          <input type="number"
                            className={`w-full px-2 py-1 text-sm text-center border rounded transition-colors ${isChanged ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                            value={val} onChange={e => setCellValue(row, m.key, e.target.value)}
                            onPaste={e => handlePaste(e, rowIdx, mIdx)} step={0.1}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-semibold text-gray-700 bg-gray-50 tabular-nums">
                      {getRowAvg(row).toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td className="px-4 py-2 font-semibold text-gray-700 sticky left-0 bg-gray-50">Totals</td>
                  {months.map(m => (
                    <td key={m.key} className="px-2 py-2 text-center font-semibold text-gray-700 tabular-nums">
                      {getColumnTotal(m.key).toFixed(0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-bold text-gray-900 bg-gray-100 tabular-nums">
                    {(months.reduce((s, m) => s + getColumnTotal(m.key), 0) / 12).toFixed(0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {activeTab === 'growth' && (
        <>
          <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2">
            <Info size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Set YoY growth rates for 2027–2029. The <strong>global rate</strong> applies to all regions. Optionally override per region. Future baselines are computed as: <code className="bg-blue-100 px-1 rounded">(prior year net FTE − AI savings) × (1 + growth%)</code>
            </p>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-48"></th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">2027</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">2028</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">2029</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-blue-50/40">
                  <td className="px-6 py-3 font-semibold text-gray-900">Global Default</td>
                  {[2027, 2028, 2029].map(year => (
                    <td key={year} className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <input type="number" step={0.1}
                          className="w-20 px-2 py-1.5 text-sm border border-blue-200 rounded text-center focus:ring-2 focus:ring-blue-500 bg-white"
                          value={growth[year]?.global ?? 0}
                          onChange={e => updateGlobalGrowth(year, e.target.value)}
                        />
                        <span className="text-xs text-gray-500">%</span>
                      </div>
                    </td>
                  ))}
                </tr>
                {regions.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-700">
                      {r.name} <span className="text-xs text-gray-400">({r.code})</span>
                    </td>
                    {[2027, 2028, 2029].map(year => {
                      const rd = growth[year]?.byRegion?.[r.id];
                      const hasOverride = rd?.growth_pct !== null && rd?.growth_pct !== undefined;
                      const effectiveRate = hasOverride ? rd.growth_pct : (growth[year]?.global ?? 0);
                      return (
                        <td key={year} className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" step={0.1}
                              className={`w-20 px-2 py-1.5 text-sm border rounded text-center focus:ring-2 focus:ring-blue-500 ${hasOverride ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                              value={hasOverride ? rd.growth_pct : ''}
                              placeholder={`${growth[year]?.global ?? 0}`}
                              onChange={e => updateRegionalGrowth(year, r.id, e.target.value)}
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </div>
                          {hasOverride && (
                            <button className="text-[10px] text-gray-400 hover:text-red-500 mt-1 block mx-auto" onClick={() => updateRegionalGrowth(year, r.id, '')}>
                              Reset to global
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={versionModal} onClose={() => setVersionModal(false)} title="Clone Baseline Version">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Create a new version by copying all data from "{version}".</p>
          <div>
            <label className="label">New Version Name</label>
            <input className="input" value={newVersionName} onChange={e => setNewVersionName(e.target.value)} placeholder="e.g. Reforecast Q1 2026" autoFocus />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setVersionModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCreateVersion} disabled={!newVersionName.trim()}>Clone</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
