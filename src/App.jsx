import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Wallet, LogOut } from 'lucide-react';
import PosPage from './pages/PosPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import LoginPage from './pages/LoginPage';
import logo from '../assets/logo-transparent-bg.png';
import { useAuth } from './AuthContext';

function App() {
  const { session, user, role, signOut } = useAuth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <Router>
      <div className="app-container">
        {/* Sidebar */}
        <aside className="sidebar no-print">
          <div className="sidebar-logo">
            <img src={logo} alt="Prime Diagnostic Centre" />
          </div>
          
          <nav className="nav-links">
            <NavLink 
              to="/" 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <ShoppingCart size={20} />
              <span>POS Point</span>
            </NavLink>
            <NavLink 
              to="/dashboard" 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
            {role === 'admin' && (
              <NavLink 
                to="/expenses" 
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Wallet size={20} />
                <span>Expenses</span>
              </NavLink>
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <header className="page-header no-print">
            <h1>Prime Diagnostic Centre POS</h1>
            <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Logged in as <strong>{role || 'User'}</strong> ({user?.email})
              </span>
              <button 
                onClick={signOut}
                className="btn btn-outline" 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </header>
          
          <div className="page-content">
            <Routes>
              <Route path="/" element={<PosPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route 
                path="/expenses" 
                element={
                  role === 'admin' 
                    ? <ExpensesPage /> 
                    : <Navigate to="/dashboard" replace />
                } 
              />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
