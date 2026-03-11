import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { Settings, Bot, BarChart3, Target, LayoutDashboard, Menu, X } from 'lucide-react';
import ProcessLibrary from './pages/ProcessLibrary';
import AgentRegistry from './pages/AgentRegistry';
import AgentDetail from './pages/AgentDetail';
import FTEBaselines from './pages/FTEBaselines';
import ScenarioPlanner from './pages/ScenarioPlanner';
import Dashboard from './pages/Dashboard';

const navItems = [
  { path: '/process-library', label: 'Process Library', icon: Settings, emoji: '⚙️' },
  { path: '/agents', label: 'Agent Registry', icon: Bot, emoji: '🤖' },
  { path: '/baselines', label: 'FTE Baselines', icon: BarChart3, emoji: '📊' },
  { path: '/scenarios', label: 'Scenario Planner', icon: Target, emoji: '🎯' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, emoji: '📈' },
];

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 flex-shrink-0`}>
          <div className="h-16 flex items-center px-4 border-b border-gray-200 gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-gray-900 truncate">AI Productivity Planner</h1>
                <p className="text-[10px] text-gray-400 truncate">CX & Ops — Landside</p>
              </div>
            )}
          </div>
          <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <span className="text-base flex-shrink-0">{item.emoji}</span>
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </nav>
          {sidebarOpen && (
            <div className="p-4 border-t border-gray-200">
              <p className="text-[10px] text-gray-400 text-center">v1.0 — March 2026</p>
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/process-library" element={<ProcessLibrary />} />
            <Route path="/agents" element={<AgentRegistry />} />
            <Route path="/agents/:id" element={<AgentDetail />} />
            <Route path="/baselines" element={<FTEBaselines />} />
            <Route path="/scenarios" element={<ScenarioPlanner />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
