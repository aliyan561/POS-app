import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Wallet, LogOut, BarChart3, Users, ClipboardList, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import PosPage from './pages/PosPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import LoginPage from './pages/LoginPage';
import EmployeesPage from './pages/EmployeesPage';
import AttendancePage from './pages/AttendancePage';
import logo from '../assets/logo-transparent-bg.png';
import { useAuth } from './AuthContext';

function AdminNotifications() {
  const [requests, setRequests] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchRequests();
    
    const subscription = supabase
      .channel('public:deletion_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deletion_requests' }, payload => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('deletion_requests')
      .select('*')
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
      
    if (data) setRequests(data);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        className="btn btn-outline" 
        style={{ position: 'relative', padding: '0.35rem 0.5rem', borderColor: requests.length > 0 ? 'var(--danger)' : 'var(--border)' }}
        onClick={() => setIsOpen(!isOpen)}
        title="Deletion Requests"
      >
        <Bell size={18} color={requests.length > 0 ? 'var(--danger)' : 'var(--text-main)'} />
        {requests.length > 0 && (
          <span style={{ 
            position: 'absolute', top: '-5px', right: '-5px', 
            backgroundColor: 'var(--danger)', color: 'white', 
            borderRadius: '50%', width: '18px', height: '18px', 
            fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
          }}>
            {requests.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem',
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)', 
          borderRadius: 'var(--radius)', width: '300px', boxShadow: 'var(--shadow-md)', zIndex: 1000,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: '600', backgroundColor: 'var(--secondary)' }}>
            Deletion Requests
          </div>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {requests.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No active requests.
              </div>
            ) : (
              requests.map(req => (
                <div key={req.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    <strong>{req.patient_name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      OTP Code:
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--danger)', letterSpacing: '0.1em' }}>
                      {req.otp_code}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
            <NavLink 
              to="/attendance" 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <ClipboardList size={20} />
              <span>Attendance</span>
            </NavLink>
            {role === 'admin' && (
              <>
                <NavLink 
                  to="/employees" 
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Users size={20} />
                  <span>Employees</span>
                </NavLink>
                <NavLink 
                  to="/analytics" 
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <BarChart3 size={20} />
                  <span>Analytics</span>
                </NavLink>
                <NavLink 
                  to="/expenses" 
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Wallet size={20} />
                  <span>Expenses</span>
                </NavLink>
              </>
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
              {role === 'admin' && <AdminNotifications />}
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
              <Route path="/attendance" element={<AttendancePage />} />
              <Route 
                path="/employees" 
                element={
                  role === 'admin' 
                    ? <EmployeesPage /> 
                    : <Navigate to="/dashboard" replace />
                } 
              />
              <Route 
                path="/analytics" 
                element={
                  role === 'admin' 
                    ? <AnalyticsPage /> 
                    : <Navigate to="/dashboard" replace />
                } 
              />
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
