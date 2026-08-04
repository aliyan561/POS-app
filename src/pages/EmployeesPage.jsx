import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Plus, X, Clock, DollarSign, UserRound, Edit, AlertCircle } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import './EmployeesPage.css';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [editingId, setEditingId] = useState(null);
  
  const initialFormState = { 
    name: '', 
    role: '', 
    monthly_salary: '',
    shift_start_time: '09:00',
    shift_end_time: '17:00',
    late_penalty: '0'
  };
  const [employeeForm, setEmployeeForm] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
    setIsLoading(true);
    // Fetch employees
    const { data: empData, error: empError } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });

    if (empError) {
      console.error('Error fetching employees:', empError);
    } else {
      setEmployees(empData || []);
    }

    // Fetch attendance for the current month to calculate summary
    const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    
    const { data: attData, error: attError } = await supabase
      .from('attendance')
      .select('employee_id, date')
      .gte('date', start)
      .lte('date', end);

    if (!attError && attData) {
      const summary = {};
      const today = new Date().getDate(); // Number of days passed in the month
      
      attData.forEach(record => {
        if (!summary[record.employee_id]) {
          summary[record.employee_id] = { present: 0 };
        }
        summary[record.employee_id].present += 1;
      });

      // Calculate absent days based on days passed
      (empData || []).forEach(emp => {
        if (!summary[emp.id]) {
          summary[emp.id] = { present: 0 };
        }
        summary[emp.id].absent = Math.max(0, today - summary[emp.id].present);
      });

      setAttendanceSummary(summary);
    }
    
    setIsLoading(false);
  }

  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingId(null);
    setEmployeeForm(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (emp) => {
    setModalMode('edit');
    setEditingId(emp.id);
    setEmployeeForm({
      name: emp.name,
      role: emp.role,
      monthly_salary: emp.monthly_salary || '',
      shift_start_time: emp.shift_start_time ? emp.shift_start_time.substring(0, 5) : '09:00',
      shift_end_time: emp.shift_end_time ? emp.shift_end_time.substring(0, 5) : '17:00',
      late_penalty: emp.late_penalty || '0'
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeForm.name || !employeeForm.role) return;
    
    setIsSubmitting(true);
    
    const payload = {
      name: employeeForm.name,
      role: employeeForm.role,
      monthly_salary: employeeForm.monthly_salary ? Number(employeeForm.monthly_salary) : null,
      shift_start_time: employeeForm.shift_start_time ? `${employeeForm.shift_start_time}:00` : null,
      shift_end_time: employeeForm.shift_end_time ? `${employeeForm.shift_end_time}:00` : null,
      late_penalty: employeeForm.late_penalty ? Number(employeeForm.late_penalty) : 0
    };

    let error;
    if (modalMode === 'add') {
      const { error: insertError } = await supabase.from('employees').insert([payload]);
      error = insertError;
    } else {
      const { error: updateError } = await supabase.from('employees').update(payload).eq('id', editingId);
      error = updateError;
    }

    setIsSubmitting(false);
    if (error) {
      alert(`Failed to ${modalMode} employee: ` + error.message);
    } else {
      setIsModalOpen(false);
      setEmployeeForm(initialFormState);
      fetchEmployees(); // Refresh list
    }
  };

  return (
    <div className="employees-layout">
      <div className="card flex-1" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-header flex-between" style={{ padding: '1.25rem 1.5rem' }}>
          <span>Employee Management</span>
          <button className="btn btn-primary" onClick={handleOpenAddModal}>
            <Plus size={18} /> Add Employee
          </button>
        </div>
        
        <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div className="employees-grid">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="employee-card skeleton-table" style={{ height: '220px' }}></div>
              ))}
            </div>
          ) : employees.length === 0 ? (
            <div className="empty-state">
              <UserRound size={48} />
              <div>No employees found. Add one to get started!</div>
            </div>
          ) : (
            <div className="employees-grid">
              {employees.map(emp => {
                const summary = attendanceSummary[emp.id] || { present: 0, absent: 0 };
                return (
                  <div key={emp.id} className="employee-card">
                    <div className="employee-header">
                      <div>
                        <span className="employee-name">{emp.name}</span>
                        <div style={{ marginTop: '0.25rem' }}>
                          <span className="employee-role">{emp.role}</span>
                        </div>
                      </div>
                      <button 
                        className="btn btn-icon" 
                        onClick={() => handleOpenEditModal(emp)}
                        title="Edit Employee"
                      >
                        <Edit size={16} className="text-muted" />
                      </button>
                    </div>
                    
                    <div className="employee-details">
                      <div className="detail-item">
                        <span className="detail-label"><Clock size={12}/> Shift</span>
                        <span className="detail-value" style={{ fontSize: '0.875rem' }}>
                          {emp.shift_start_time ? emp.shift_start_time.substring(0, 5) : '--'} to {emp.shift_end_time ? emp.shift_end_time.substring(0, 5) : '--'}
                        </span>
                      </div>
                      
                      <div className="detail-item">
                        <span className="detail-label"><DollarSign size={12}/> Salary</span>
                        <span className="detail-value salary-value" style={{ fontSize: '0.875rem' }}>
                          {emp.monthly_salary ? `Rs ${emp.monthly_salary.toLocaleString()}` : 'Not set'}
                        </span>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><AlertCircle size={12}/> Late Penalty</span>
                        <span className="detail-value text-danger" style={{ fontSize: '0.875rem' }}>
                          Rs {emp.late_penalty || 0}
                        </span>
                      </div>
                    </div>

                    <div className="employee-attendance-summary">
                      <div className="summary-title">This Month's Attendance</div>
                      <div className="summary-stats">
                        <div className="stat-present">
                          <strong>{summary.present}</strong> Days Present
                        </div>
                        <div className="stat-absent">
                          <strong>{summary.absent}</strong> Days Absent
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Employee Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{modalMode === 'add' ? 'Add New Employee' : 'Edit Employee'}</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Full Name</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. John Doe"
                    value={employeeForm.name}
                    onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Role</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Receptionist, Technician"
                    value={employeeForm.role}
                    onChange={e => setEmployeeForm({...employeeForm, role: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Monthly Salary (PKR)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 50000"
                    value={employeeForm.monthly_salary}
                    onChange={e => setEmployeeForm({...employeeForm, monthly_salary: e.target.value})}
                    min="1"
                  />
                </div>
              </div>

              <h3 style={{ fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>Shift & Penalties</h3>
              
              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Shift Start Time</label>
                  <input 
                    type="time" 
                    className="form-control" 
                    value={employeeForm.shift_start_time}
                    onChange={e => setEmployeeForm({...employeeForm, shift_start_time: e.target.value})}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Shift End Time</label>
                  <input 
                    type="time" 
                    className="form-control" 
                    value={employeeForm.shift_end_time}
                    onChange={e => setEmployeeForm({...employeeForm, shift_end_time: e.target.value})}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Late Penalty (PKR)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 500"
                    value={employeeForm.late_penalty}
                    onChange={e => setEmployeeForm({...employeeForm, late_penalty: e.target.value})}
                    min="0"
                  />
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  className="btn btn-outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : (modalMode === 'add' ? 'Add Employee' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
