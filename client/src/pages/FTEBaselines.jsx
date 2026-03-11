import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { Save, Plus, Copy } from 'lucide-react';
import Modal from '../components/Modal';

const YEARS = [2026, 2027, 2028, 2029];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function FTEBaselines() {
  const [grid, setGrid] = useState([]);
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState('Budget 2026');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [pendingChanges, setPendingChanges] = useState({});
  const [saving, setSaving] = useState(false);
  const [versionModal, setVersionModal] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');

  const load = useCallback(async () => {
    const [g, v] = await Promise.all([
      api.baselines.grid(version),
      api.baselines.versions(),
    ]);
    setGrid(g);
    setVersions(v);
    setPendingChanges({});
  }, [version]);

  useEffect(() => { load(); }, [load]);

  const months = Array.from({ length: 12 }, (_, i) => ({
    key: `${selectedYear}-${String(i + 1).padStart(2, '0')}`,
    label: MONTH_NAMES[i],
    year: selectedYear,
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

  const getRowTotal = (row) => {
    return months.reduce((sum, m) => sum + getCellValue(row, m.key), 0);
  };

  const getColumnTotal = (monthKey) => {
    return grid.reduce((sum, row) => sum + getCellValue(row, monthKey), 0);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [];
      for (const [key, value] of Object.entries(pendingChanges)) {
        const [regionId, teamId, monthKey] = key.split('_');
        const [year, month] = monthKey.split('-').map(Number);
        updates.push({ region_id: regionId, team_id: teamId, year, month, fte_value: value });
      }
      if (updates.length > 0) {
        await api.baselines.bulkUpdate(updates, version);
        await load();
      }
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

  const handleCreateVersion = async () => {
    if (!newVersionName.trim()) return;
    await api.baselines.createVersion(version, newVersionName);
    setVersion(newVersionName);
    setVersionModal(false);
    load();
  };

  const hasPending = Object.keys(pendingChanges).length > 0;

  return (
    <div className="p-6 max-w-[100rem] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 FTE Baselines</h1>
          <p className="text-sm text-gray-500 mt-1">Monthly headcount per region and team — keyboard navigation and clipboard paste supported</p>
        </div>
        <div className="flex items-center gap-3">
          {hasPending && (
            <span className="text-xs text-amber-600 font-medium">{Object.keys(pendingChanges).length} unsaved changes</span>
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
            <Copy size={14} /> Clone Version
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedYear === y ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {y}
            </button>
          ))}
        </div>
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
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 bg-gray-100">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grid.map((row, rowIdx) => (
              <tr key={`${row.region_id}_${row.team_id}`} className="hover:bg-blue-50/30">
                <td className="px-4 py-2 sticky left-0 bg-white font-medium whitespace-nowrap">
                  <span className="text-gray-900">{row.region_code}</span>
                  <span className="mx-1.5 text-gray-300">·</span>
                  <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: row.team_code === 'CX' ? '#f3e8ff' : '#e0f2fe',
                      color: row.team_code === 'CX' ? '#7c3aed' : '#0891b2',
                    }}
                  >
                    {row.team_code}
                  </span>
                </td>
                {months.map((m, mIdx) => {
                  const val = getCellValue(row, m.key);
                  const changeKey = `${row.region_id}_${row.team_id}_${m.key}`;
                  const isChanged = pendingChanges[changeKey] !== undefined;
                  return (
                    <td key={m.key} className="px-1 py-1">
                      <input
                        type="number"
                        className={`w-full px-2 py-1 text-sm text-center border rounded transition-colors ${
                          isChanged
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        } focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                        value={val}
                        onChange={e => setCellValue(row, m.key, e.target.value)}
                        onPaste={e => handlePaste(e, rowIdx, mIdx)}
                        step={0.1}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-semibold text-gray-700 bg-gray-50">
                  {getRowTotal(row).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-50">
            <tr>
              <td className="px-4 py-2 font-semibold text-gray-700 sticky left-0 bg-gray-50">Column Totals</td>
              {months.map(m => (
                <td key={m.key} className="px-2 py-2 text-center font-semibold text-gray-700">
                  {getColumnTotal(m.key).toFixed(1)}
                </td>
              ))}
              <td className="px-3 py-2 text-center font-bold text-gray-900 bg-gray-100">
                {months.reduce((sum, m) => sum + getColumnTotal(m.key), 0).toFixed(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

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
