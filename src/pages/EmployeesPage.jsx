import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Plus, X, Clock, DollarSign, UserRound, Edit, AlertCircle, Printer, Download, Table, LayoutGrid, ChevronLeft } from 'lucide-react';
import { startOfMonth, endOfMonth, format, getDaysInMonth, parseISO } from 'date-fns';
import logoImg from '../../assets/with-text-logo.png';
import './EmployeesPage.css';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // View toggle: 'cards' or 'payroll-table'
  const [viewMode, setViewMode] = useState('cards');
  // Payroll table month
  const [payrollMonth, setPayrollMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [payrollAttendance, setPayrollAttendance] = useState({});
  const [isPayrollLoading, setIsPayrollLoading] = useState(false);

  // Add/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [editingId, setEditingId] = useState(null);
  
  const initialFormState = { 
    name: '', 
    role: '', 
    monthly_salary: '',
    shift_start_time: '09:00',
    shift_end_time: '17:00',
    late_penalty: '0',
    advance_salary: '0'
  };
  const [employeeForm, setEmployeeForm] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail Modal State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [detailMonth, setDetailMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [detailAttendance, setDetailAttendance] = useState([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState(false);
  const [advanceValue, setAdvanceValue] = useState('0');
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);

  // Print state
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Fetch payroll attendance when payroll table view is active or month changes
  useEffect(() => {
    if (viewMode === 'payroll-table') {
      fetchPayrollAttendance();
    }
  }, [viewMode, payrollMonth]);

  // Fetch detail attendance when detail modal month changes
  useEffect(() => {
    if (isDetailOpen && selectedEmployee) {
      fetchDetailAttendance(selectedEmployee.id);
    }
  }, [detailMonth, isDetailOpen, selectedEmployee]);

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

  async function fetchPayrollAttendance() {
    setIsPayrollLoading(true);
    const [year, month] = payrollMonth.split('-');
    const dateInMonth = new Date(year, month - 1, 1);
    const start = format(startOfMonth(dateInMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(dateInMonth), 'yyyy-MM-dd');

    const { data: attData } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', start)
      .lte('date', end);

    if (attData) {
      const map = {};
      attData.forEach(log => {
        if (!map[log.employee_id]) map[log.employee_id] = [];
        map[log.employee_id].push(log);
      });
      setPayrollAttendance(map);
    }
    setIsPayrollLoading(false);
  }

  async function fetchDetailAttendance(empId) {
    setIsDetailLoading(true);
    const [year, month] = detailMonth.split('-');
    const dateInMonth = new Date(year, month - 1, 1);
    const start = format(startOfMonth(dateInMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(dateInMonth), 'yyyy-MM-dd');

    const { data: attData } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', empId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });

    setDetailAttendance(attData || []);
    setIsDetailLoading(false);
  }

  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingId(null);
    setEmployeeForm(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (emp, e) => {
    if (e) e.stopPropagation();
    setModalMode('edit');
    setEditingId(emp.id);
    setEmployeeForm({
      name: emp.name,
      role: emp.role,
      monthly_salary: emp.monthly_salary || '',
      shift_start_time: emp.shift_start_time ? emp.shift_start_time.substring(0, 5) : '09:00',
      shift_end_time: emp.shift_end_time ? emp.shift_end_time.substring(0, 5) : '17:00',
      late_penalty: emp.late_penalty || '0',
      advance_salary: emp.advance_salary || '0'
    });
    setIsModalOpen(true);
  };

  const handleOpenDetail = (emp) => {
    setSelectedEmployee(emp);
    setDetailMonth(format(new Date(), 'yyyy-MM'));
    setAdvanceValue(emp.advance_salary || 0);
    setEditingAdvance(false);
    setIsDetailOpen(true);
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
      late_penalty: employeeForm.late_penalty ? Number(employeeForm.late_penalty) : 0,
      advance_salary: employeeForm.advance_salary ? Number(employeeForm.advance_salary) : 0
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

  const handleSaveAdvance = async () => {
    if (!selectedEmployee) return;
    setIsSavingAdvance(true);
    const { error } = await supabase
      .from('employees')
      .update({ advance_salary: Number(advanceValue) || 0 })
      .eq('id', selectedEmployee.id);
    
    setIsSavingAdvance(false);
    if (error) {
      alert('Failed to update advance: ' + error.message);
    } else {
      setEditingAdvance(false);
      // Update local state
      const updated = { ...selectedEmployee, advance_salary: Number(advanceValue) || 0 };
      setSelectedEmployee(updated);
      setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
    }
  };

  // Helper: Calculate payroll for an employee given attendance logs
  const calcPayroll = (emp, logs) => {
    const baseSalary = Number(emp.monthly_salary) || 0;
    const perDayWage = Math.round(baseSalary / 30);
    const daysPresent = logs ? logs.length : 0;
    
    // Calculate days passed in the selected month (for current month, use today; for past months, use full month)
    const now = new Date();
    const [year, month] = (viewMode === 'payroll-table' ? payrollMonth : detailMonth).split('-');
    const dateInMonth = new Date(year, month - 1, 1);
    const totalDaysInMonth = getDaysInMonth(dateInMonth);
    const isCurrentMonth = format(now, 'yyyy-MM') === (viewMode === 'payroll-table' ? payrollMonth : detailMonth);
    const daysPassed = isCurrentMonth ? now.getDate() : totalDaysInMonth;
    
    const daysAbsent = Math.max(0, daysPassed - daysPresent);
    let totalPenalties = 0;
    if (logs) {
      logs.forEach(log => {
        if (log.penalty_applied > 0) totalPenalties += log.penalty_applied;
      });
    }
    const advance = Number(emp.advance_salary) || 0;
    const payableSalary = Math.max(0, baseSalary - advance - totalPenalties);

    return { baseSalary, perDayWage, daysPresent, daysAbsent, totalPenalties, advance, payableSalary, daysPassed, totalDaysInMonth };
  };

  // Print thermal slip
  const handlePrintSlip = async () => {
    setIsPrinting(true);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
    setIsPrinting(false);
  };

  // Export CSV for detail modal
  const handleExportCSV = () => {
    if (!selectedEmployee) return;
    const [year, month] = detailMonth.split('-');
    const dateInMonth = new Date(year, month - 1, 1);
    const totalDays = getDaysInMonth(dateInMonth);
    const daysArray = Array.from({ length: totalDays }, (_, i) => i + 1);
    const attMap = {};
    detailAttendance.forEach(log => { attMap[log.date] = log; });

    const BOM = '\uFEFF';
    let csvContent = '';
    csvContent += `Employee Attendance Report - ${selectedEmployee.name}\n`;
    csvContent += `Month: ${format(dateInMonth, 'MMMM yyyy')}\n`;
    csvContent += `Designation: ${selectedEmployee.role}\n\n`;
    
    const headers = ['Date', 'Day', 'Status', 'Clock In', 'Hours Worked', 'Penalty (PKR)'];
    csvContent += headers.join(',') + '\n';

    const today = format(new Date(), 'yyyy-MM-dd');

    daysArray.forEach(day => {
      const dateStr = `${detailMonth}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(year, month - 1, day);
      const dayName = format(dateObj, 'EEE');
      const log = attMap[dateStr];

      let status = 'Upcoming';
      let clockIn = '-';
      let hours = '-';
      let penalty = '0';

      if (log) {
        status = log.penalty_applied > 0 ? 'Late' : 'Present';
        clockIn = log.log_in_time ? format(parseISO(log.log_in_time), 'hh:mm a') : '-';
        hours = log.hours_worked > 0 ? log.hours_worked : (log.hours_worked === 0 ? 'Clocked In' : '-');
        penalty = log.penalty_applied || 0;
      } else if (dateStr < today) {
        status = 'Absent';
      }

      csvContent += [dateStr, dayName, status, clockIn, hours, penalty].map(c => `"${c}"`).join(',') + '\n';
    });

    // Add summary rows
    const payroll = calcPayroll(selectedEmployee, detailAttendance);
    csvContent += `\nSummary\n`;
    csvContent += `"Days Present","${payroll.daysPresent}"\n`;
    csvContent += `"Days Absent","${payroll.daysAbsent}"\n`;
    csvContent += `"Base Salary","Rs ${payroll.baseSalary}"\n`;
    csvContent += `"Late Penalties","Rs ${payroll.totalPenalties}"\n`;
    csvContent += `"Advance","Rs ${payroll.advance}"\n`;
    csvContent += `"Payable Salary","Rs ${payroll.payableSalary}"\n`;

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_${selectedEmployee.name.replace(/\s+/g, '_')}_${detailMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Payroll summary table
  const renderPayrollTable = () => {
    let grandTotal = 0;

    return (
      <div className="payroll-table-container">
        <div className="payroll-table-header">
          <div className="payroll-month-filter">
            <label className="form-label" style={{ marginBottom: 0, fontSize: '0.8rem' }}>Month</label>
            <input
              type="month"
              className="form-control"
              value={payrollMonth}
              onChange={e => setPayrollMonth(e.target.value)}
              style={{ width: '200px', padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
            />
          </div>
        </div>

        {isPayrollLoading ? (
          <div className="skeleton-table" style={{ padding: '2rem' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton-row">
                <div className="skeleton-cell skeleton-w-20"></div>
                <div className="skeleton-cell skeleton-w-30"></div>
                <div className="skeleton-cell skeleton-w-20"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table payroll-summary-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th className="text-right">Monthly Salary</th>
                  <th className="text-center">Days Worked</th>
                  <th className="text-right">Per Day Wage</th>
                  <th className="text-center">Leaves / Absent</th>
                  <th className="text-right">Late Penalties</th>
                  <th className="text-right">Advance</th>
                  <th className="text-right">Payable Salary</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const logs = payrollAttendance[emp.id] || [];
                  const payroll = calcPayroll(emp, logs);
                  grandTotal += payroll.payableSalary;

                  return (
                    <tr key={emp.id} className="payroll-row" onClick={() => handleOpenDetail(emp)}>
                      <td className="font-medium text-main">{emp.name}</td>
                      <td className="text-muted">{emp.role}</td>
                      <td className="text-right">Rs {payroll.baseSalary.toLocaleString()}</td>
                      <td className="text-center">{payroll.daysPresent}</td>
                      <td className="text-right">Rs {payroll.perDayWage.toLocaleString()}</td>
                      <td className="text-center">{payroll.daysAbsent}</td>
                      <td className="text-right text-danger">{payroll.totalPenalties > 0 ? `Rs ${payroll.totalPenalties.toLocaleString()}` : '-'}</td>
                      <td className="text-right">{payroll.advance > 0 ? `Rs ${payroll.advance.toLocaleString()}` : '-'}</td>
                      <td className="text-right font-semibold" style={{ color: 'var(--primary)' }}>Rs {payroll.payableSalary.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="payroll-total-row">
                  <td colSpan={8} className="font-semibold text-main">Total Payable</td>
                  <td className="text-right font-semibold" style={{ color: 'var(--primary)', fontSize: '1.05rem' }}>Rs {grandTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Detail modal content
  const renderDetailModal = () => {
    if (!selectedEmployee) return null;
    const payroll = calcPayroll(selectedEmployee, detailAttendance);
    const [year, month] = detailMonth.split('-');
    const dateInMonth = new Date(year, month - 1, 1);
    const totalDays = getDaysInMonth(dateInMonth);
    const daysArray = Array.from({ length: totalDays }, (_, i) => i + 1);
    const attMap = {};
    detailAttendance.forEach(log => { attMap[log.date] = log; });
    const today = format(new Date(), 'yyyy-MM-dd');

    return (
      <div className="modal-overlay" onClick={() => setIsDetailOpen(false)}>
        <div className="glass-modal-content detail-modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header detail-modal-header">
            <div className="detail-header-left">
              <button className="btn btn-icon" onClick={() => setIsDetailOpen(false)} title="Close">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h2>{selectedEmployee.name}</h2>
                <span className="employee-role">{selectedEmployee.role}</span>
              </div>
            </div>
            <div className="detail-header-actions">
              <input
                type="month"
                className="form-control"
                value={detailMonth}
                onChange={e => setDetailMonth(e.target.value)}
                style={{ width: '180px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
              />
              <button className="btn btn-outline" onClick={handleExportCSV} title="Export CSV">
                <Download size={16} /> Export
              </button>
              <button className="btn btn-primary" onClick={handlePrintSlip} title="Print Thermal Slip">
                <Printer size={16} /> Print
              </button>
            </div>
          </div>

          <div className="detail-modal-body">
            {/* Payroll Metrics */}
            <div className="payroll-metrics-grid">
              <div className="payroll-metric">
                <span className="metric-label">Monthly Salary</span>
                <span className="metric-value">Rs {payroll.baseSalary.toLocaleString()}</span>
              </div>
              <div className="payroll-metric">
                <span className="metric-label">Days Worked</span>
                <span className="metric-value">{payroll.daysPresent} <small>/ {payroll.daysPassed}</small></span>
              </div>
              <div className="payroll-metric">
                <span className="metric-label">Per Day Wage</span>
                <span className="metric-value">Rs {payroll.perDayWage.toLocaleString()}</span>
              </div>
              <div className="payroll-metric">
                <span className="metric-label">Leaves / Absent</span>
                <span className="metric-value metric-danger">{payroll.daysAbsent} Days</span>
              </div>
              <div className="payroll-metric">
                <span className="metric-label">Late Penalties</span>
                <span className="metric-value metric-danger">Rs {payroll.totalPenalties.toLocaleString()}</span>
              </div>
              <div className="payroll-metric payroll-metric-advance">
                <span className="metric-label">Advance</span>
                {editingAdvance ? (
                  <div className="advance-edit-row">
                    <input
                      type="number"
                      className="form-control"
                      value={advanceValue}
                      onChange={e => setAdvanceValue(e.target.value)}
                      style={{ width: '110px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                      min="0"
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleSaveAdvance} disabled={isSavingAdvance}>
                      {isSavingAdvance ? '...' : 'Save'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => { setEditingAdvance(false); setAdvanceValue(selectedEmployee.advance_salary || 0); }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <span className="metric-value metric-advance-val" onClick={() => { setEditingAdvance(true); setAdvanceValue(selectedEmployee.advance_salary || 0); }}>
                    Rs {payroll.advance.toLocaleString()} <Edit size={12} className="advance-edit-icon" />
                  </span>
                )}
              </div>
              <div className="payroll-metric payroll-metric-total">
                <span className="metric-label">Payable Salary</span>
                <span className="metric-value metric-primary">Rs {payroll.payableSalary.toLocaleString()}</span>
              </div>
            </div>

            {/* Shift Info */}
            <div className="detail-shift-info">
              <span><Clock size={14} /> Shift: {selectedEmployee.shift_start_time ? selectedEmployee.shift_start_time.substring(0, 5) : '--'} to {selectedEmployee.shift_end_time ? selectedEmployee.shift_end_time.substring(0, 5) : '--'}</span>
              <span><AlertCircle size={14} /> Late Penalty Per Day: Rs {selectedEmployee.late_penalty || 0}</span>
            </div>

            {/* Day-by-day attendance */}
            <div className="detail-attendance-table-wrapper">
              <h3 className="detail-section-title">Daily Attendance — {format(dateInMonth, 'MMMM yyyy')}</h3>
              {isDetailLoading ? (
                <div className="skeleton-table" style={{ padding: '1rem' }}>
                  {[...Array(5)].map((_, i) => <div key={i} className="skeleton-row"><div className="skeleton-cell skeleton-w-30"></div><div className="skeleton-cell skeleton-w-20"></div></div>)}
                </div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  <table className="data-table detail-attendance-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Status</th>
                        <th>Clock In</th>
                        <th>Hours</th>
                        <th className="text-right">Penalty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daysArray.map(day => {
                        const dateStr = `${detailMonth}-${String(day).padStart(2, '0')}`;
                        const dateObj = new Date(year, month - 1, day);
                        const dayName = format(dateObj, 'EEE');
                        const log = attMap[dateStr];

                        let status = 'upcoming';
                        let statusLabel = 'Upcoming';
                        let clockIn = '-';
                        let hours = '-';
                        let penalty = '-';

                        if (log) {
                          status = log.penalty_applied > 0 ? 'late' : 'present';
                          statusLabel = log.penalty_applied > 0 ? 'Late' : 'Present';
                          clockIn = log.log_in_time ? format(parseISO(log.log_in_time), 'hh:mm a') : '-';
                          hours = log.hours_worked > 0 ? `${log.hours_worked}h` : (log.hours_worked === 0 ? 'In' : '-');
                          penalty = log.penalty_applied > 0 ? `Rs ${log.penalty_applied}` : '-';
                        } else if (dateStr < today) {
                          status = 'absent';
                          statusLabel = 'Absent';
                        }

                        return (
                          <tr key={day} className={`att-row-${status}`}>
                            <td>{format(dateObj, 'dd MMM')}</td>
                            <td>{dayName}</td>
                            <td><span className={`att-badge att-badge-${status}`}>{statusLabel}</span></td>
                            <td>{clockIn}</td>
                            <td>{hours}</td>
                            <td className="text-right">{penalty}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Thermal print slip (hidden, only visible during print)
  const renderPrintSlip = () => {
    if (!selectedEmployee || !isDetailOpen) return null;
    const payroll = calcPayroll(selectedEmployee, detailAttendance);
    const [year, month] = detailMonth.split('-');
    const dateInMonth = new Date(year, month - 1, 1);

    return (
      <div id="employee-slip" className="print-only">
        <div className="receipt-header">
          <img src={logoImg} alt="Prime Diagnostic Centre Logo" className="receipt-logo" style={{ margin: '0 auto 10px auto', display: 'block', maxWidth: '100%' }} />
          <h2>Prime Diagnostic Centre</h2>
          <p>0314-1117447</p>
          <p><strong>Employee Attendance & Salary Slip</strong></p>
        </div>

        <div className="receipt-details">
          <p><strong>Employee:</strong> {selectedEmployee.name}</p>
          <p><strong>Designation:</strong> {selectedEmployee.role}</p>
          <p><strong>Month:</strong> {format(dateInMonth, 'MMMM yyyy')}</p>
          <p><strong>Shift:</strong> {selectedEmployee.shift_start_time ? selectedEmployee.shift_start_time.substring(0, 5) : '--'} to {selectedEmployee.shift_end_time ? selectedEmployee.shift_end_time.substring(0, 5) : '--'}</p>
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

        <table className="receipt-items">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Description</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Monthly Salary</td>
              <td style={{ textAlign: 'right' }}>Rs {payroll.baseSalary.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Per Day Wage (÷30)</td>
              <td style={{ textAlign: 'right' }}>Rs {payroll.perDayWage.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Days Present</td>
              <td style={{ textAlign: 'right' }}>{payroll.daysPresent} / {payroll.daysPassed}</td>
            </tr>
            <tr>
              <td>Absent Days</td>
              <td style={{ textAlign: 'right' }}>{payroll.daysAbsent}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

        <div className="receipt-totals">
          <p>Late Penalties: <span style={{ float: 'right' }}>- Rs {payroll.totalPenalties.toLocaleString()}</span></p>
          <p>Advance: <span style={{ float: 'right' }}>- Rs {payroll.advance.toLocaleString()}</span></p>
          <h3>Net Payable: <span style={{ float: 'right' }}>Rs {payroll.payableSalary.toLocaleString()}</span></h3>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '15px 0' }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', fontSize: '11px' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ borderTop: '1px solid #000', width: '80%', margin: '0 auto 4px auto' }}></div>
            <p>Employee Signature</p>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ borderTop: '1px solid #000', width: '80%', margin: '0 auto 4px auto' }}></div>
            <p>Manager Signature</p>
          </div>
        </div>

        <div style={{ borderTop: '1px dashed #000', margin: '15px 0' }}></div>
        <p style={{ textAlign: 'center', fontSize: '11px', lineHeight: '1.4' }}>Address: RC 8-5-2, Mohanlal Bhagwandas Building, Civil Hospital Road, Off M.A. Jinnah Road, Karachi</p>
      </div>
    );
  };

  return (
    <div className="employees-layout">
      <div className="card flex-1" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-header flex-between" style={{ padding: '1.25rem 1.5rem' }}>
          <div className="emp-header-left">
            <span>Employee Management</span>
            <div className="emp-view-toggle no-print">
              <button className={`filter-btn ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}>
                <LayoutGrid size={14} /> Cards
              </button>
              <button className={`filter-btn ${viewMode === 'payroll-table' ? 'active' : ''}`} onClick={() => setViewMode('payroll-table')}>
                <Table size={14} /> Payroll Table
              </button>
            </div>
          </div>
          <button className="btn btn-primary no-print" onClick={handleOpenAddModal}>
            <Plus size={18} /> Add Employee
          </button>
        </div>
        
        <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
          {viewMode === 'cards' ? (
            <>
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
                      <div key={emp.id} className="employee-card employee-card-clickable" onClick={() => handleOpenDetail(emp)}>
                        <div className="employee-header">
                          <div>
                            <span className="employee-name">{emp.name}</span>
                            <div style={{ marginTop: '0.25rem' }}>
                              <span className="employee-role">{emp.role}</span>
                            </div>
                          </div>
                          <button 
                            className="btn btn-icon" 
                            onClick={(e) => handleOpenEditModal(emp, e)}
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
            </>
          ) : (
            renderPayrollTable()
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
                <div style={{ flex: 1 }}>
                  <label className="form-label">Advance Salary (PKR)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 5000"
                    value={employeeForm.advance_salary}
                    onChange={e => setEmployeeForm({...employeeForm, advance_salary: e.target.value})}
                    min="0"
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

      {/* Employee Detail Modal */}
      {isDetailOpen && renderDetailModal()}

      {/* Thermal Print Slip (hidden, shown only for print) */}
      {renderPrintSlip()}
    </div>
  );
}
