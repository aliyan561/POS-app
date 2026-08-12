import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { ClipboardCheck, Calendar, Clock, AlertCircle, Download } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, getDaysInMonth } from 'date-fns';
import { useAuth } from '../AuthContext';
import './AttendancePage.css';

export default function AttendancePage() {
  const { user, role } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [attendanceData, setAttendanceData] = useState({}); // mapped by employee_id for daily view
  const [monthlyData, setMonthlyData] = useState({}); // mapped by emp_id -> date -> log for monthly view
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter state
  const [viewMode, setViewMode] = useState('daily'); // 'daily' or 'monthly'
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [attendanceLogId, setAttendanceLogId] = useState(null);
  const [hoursWorked, setHoursWorked] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Salary / Hover State
  const [expandedSalaryEmpId, setExpandedSalaryEmpId] = useState(null);
  const [hoveredPenalty, setHoveredPenalty] = useState(null);

  useEffect(() => {
    fetchData();
  }, [viewMode, filterDate, filterMonth]);

  async function fetchData() {
    setIsLoading(true);
    
    // Fetch all employees
    const { data: empData, error: empError } = await supabase
      .from('employees')
      .select('*')
      .order('name');
    
    if (empData) setEmployees(empData);

    if (viewMode === 'daily' && filterDate) {
      const { data: attData } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', filterDate);

      if (attData) {
        const attMap = {};
        attData.forEach(log => {
          attMap[log.employee_id] = log;
        });
        setAttendanceData(attMap);
      }
    } else if (viewMode === 'monthly' && filterMonth) {
      // Create date objects for start and end of selected month
      const [year, month] = filterMonth.split('-');
      const dateInMonth = new Date(year, month - 1, 1);
      
      const start = format(startOfMonth(dateInMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(dateInMonth), 'yyyy-MM-dd');

      const { data: attData } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', start)
        .lte('date', end);

      if (attData) {
        const monthMap = {};
        attData.forEach(log => {
          if (!monthMap[log.employee_id]) {
            monthMap[log.employee_id] = {};
          }
          // use the date string as the key
          monthMap[log.employee_id][log.date] = log;
        });
        setMonthlyData(monthMap);
      }
    }
    
    setIsLoading(false);
  }

  const handleClockIn = async (emp) => {
    const confirmMsg = `Clock in ${emp.name} right now? \nTime will be recorded for late calculations.`;
    if (!window.confirm(confirmMsg)) return;

    const now = new Date();
    const logInTimeIso = now.toISOString();

    let penalty = 0;
    
    // Check if late (add 15 mins grace period)
    if (emp.shift_start_time) {
      const [hours, minutes, seconds] = emp.shift_start_time.split(':').map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(hours, minutes, seconds || 0, 0);
      shiftStart.setMinutes(shiftStart.getMinutes() + 15); // 15 mins grace period
      
      if (now > shiftStart) {
        penalty = emp.late_penalty || 0;
      }
    }

    const { data, error } = await supabase.from('attendance').insert([{
      employee_id: emp.id,
      date: filterDate,
      hours_worked: 0, // 0 means clocked in but not checked out yet
      logged_by: user?.id,
      log_in_time: logInTimeIso,
      penalty_applied: penalty
    }]);

    if (error) {
      if (error.code === '23505') { 
        alert("Attendance for this employee on this date has already been logged.");
      } else {
        alert("Failed to log attendance: " + error.message);
      }
    } else {
      fetchData();
    }
  };

  const handleClockOutNow = async (emp, logId, logInTimeIso) => {
    if (!logInTimeIso) {
      alert("No log-in time recorded. Please edit hours manually.");
      handleOpenClockOutModal(emp, logId);
      return;
    }

    const logInTime = parseISO(logInTimeIso);
    const now = new Date();
    
    const diffMs = now - logInTime;
    const hours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    
    if (hours < 0) {
      alert("Invalid time calculation. Please edit hours manually.");
      return;
    }

    const confirmMsg = `Clock out ${emp.name} now? \nTotal time calculated: ${hours} hours.`;
    if (!window.confirm(confirmMsg)) return;
    
    const { error } = await supabase
      .from('attendance')
      .update({ hours_worked: hours })
      .eq('id', logId);

    if (error) {
      alert("Failed to clock out: " + error.message);
    } else {
      fetchData();
    }
  };

  const handleOpenClockOutModal = (emp, logId) => {
    setSelectedEmp(emp);
    setAttendanceLogId(logId);
    setHoursWorked('8'); // Default to 8 or standard shift
    setIsModalOpen(true);
  };

  const handleClockOut = async (e) => {
    e.preventDefault();
    if (!attendanceLogId || !hoursWorked) return;
    
    setIsSubmitting(true);

    const { error } = await supabase
      .from('attendance')
      .update({ hours_worked: Number(hoursWorked) })
      .eq('id', attendanceLogId);

    setIsSubmitting(false);
    if (error) {
      alert("Failed to clock out: " + error.message);
    } else {
      setIsModalOpen(false);
      setSelectedEmp(null);
      setAttendanceLogId(null);
      fetchData();
    }
  };

  const handleMarkAbsent = async (emp, log) => {
    if (role !== 'admin') return;
    if (!log) return; 

    const confirmMsg = `Mark ${emp.name} as Absent on ${log.date}? This will remove their recorded hours for this day.`;
    if (!window.confirm(confirmMsg)) return;

    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', log.id);

    if (error) {
      alert("Failed to mark absent: " + error.message);
    } else {
      fetchData();
    }
  };

  // Monthly Matrix Helpers
  const renderMonthlyMatrix = () => {
    const [year, month] = filterMonth.split('-');
    const dateInMonth = new Date(year, month - 1, 1);
    const daysInMonth = getDaysInMonth(dateInMonth);
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <div className="attendance-matrix-container">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="sticky-col">Employee Name</th>
              <th className="summary-col">Total Present</th>
              {daysArray.map(day => (
                <th key={day} className="day-col">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const empLogs = monthlyData[emp.id] || {};
              let totalPresent = 0;
              
              // Pre-calculate totals
              daysArray.forEach(day => {
                const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
                if (empLogs[dateStr]) totalPresent++;
              });

              return (
                <tr key={emp.id}>
                  <td className="sticky-col font-medium">{emp.name}</td>
                  <td className="summary-col font-bold text-main">{totalPresent}</td>
                  {daysArray.map(day => {
                    const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
                    const log = empLogs[dateStr];
                    
                    let cellClass = '';
                    let cellText = '-';

                    if (log) {
                      const displayedHours = log.hours_worked > 0 ? `${log.hours_worked}h` : 'In';
                      if (log.penalty_applied > 0) {
                        cellClass = 'cell-late';
                        cellText = displayedHours;
                      } else {
                        cellClass = 'cell-present';
                        cellText = displayedHours;
                      }
                    } else if (dateStr < format(new Date(), 'yyyy-MM-dd')) {
                      // Past dates without a log are considered Absent
                      cellClass = 'cell-absent';
                      cellText = 'A';
                    }

                    const isHighlighted = hoveredPenalty?.empId === emp.id && hoveredPenalty?.dateStr === dateStr;
                    if (isHighlighted) {
                      cellClass += ' highlighted-cell';
                    }

                    return (
                      <td 
                        key={day} 
                        className={`day-col ${cellClass}`} 
                        title={dateStr} 
                        style={{ position: 'relative', cursor: role === 'admin' && log ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (role === 'admin' && log) {
                            handleMarkAbsent(emp, log);
                          }
                        }}
                      >
                        {cellText}
                        {cellClass === 'cell-late' && (
                           <span style={{ 
                             position: 'absolute', 
                             top: '2px', 
                             right: '2px', 
                             fontSize: '0.6rem', 
                             fontWeight: 'bold',
                             backgroundColor: '#fef08a',
                             color: '#854d0e',
                             padding: '1px 4px',
                             borderRadius: '4px'
                           }}>L</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSalarySection = () => {
    if (viewMode !== 'monthly') return null;

    return (
      <div className="salary-summary-section">
        <h3 className="salary-section-title">Monthly Salary Overview</h3>
        <div className="salary-grid">
          {employees.map(emp => {
            const empLogs = monthlyData[emp.id] || {};
            let totalPenalties = 0;
            const penaltyDates = [];
            
            Object.values(empLogs).forEach(log => {
              if (log.penalty_applied > 0) {
                totalPenalties += log.penalty_applied;
                // sort by date later if needed, Object.values is generally ok but sort is safer
                penaltyDates.push(log);
              }
            });

            // sort penalty dates chronologically
            penaltyDates.sort((a, b) => a.date.localeCompare(b.date));

            const baseSalary = emp.monthly_salary || 0;
            const netSalary = Math.max(0, baseSalary - totalPenalties);
            const isExpanded = expandedSalaryEmpId === emp.id;

            return (
              <div 
                key={emp.id} 
                className={`salary-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedSalaryEmpId(isExpanded ? null : emp.id)}
              >
                <div className="salary-card-header">
                  <span className="emp-name">{emp.name}</span>
                  <span className="net-salary">Rs {netSalary.toLocaleString()}</span>
                </div>
                
                <div className="salary-details-basic">
                  <span>Base: Rs {baseSalary.toLocaleString()}</span>
                  <span className="text-danger">Penalties: Rs {totalPenalties.toLocaleString()}</span>
                </div>

                {isExpanded && (
                  <div className="penalty-breakdown" onClick={(e) => e.stopPropagation()}>
                    <h4 className="breakdown-title">Late Details</h4>
                    {penaltyDates.length > 0 ? (
                      <ul className="penalty-list">
                        {penaltyDates.map(log => (
                          <li 
                            key={log.id} 
                            className="penalty-item"
                            onMouseEnter={() => setHoveredPenalty({ empId: emp.id, dateStr: log.date })}
                            onMouseLeave={() => setHoveredPenalty(null)}
                          >
                            <span>{format(parseISO(log.date), 'MMM dd, yyyy')}</span>
                            <span className="text-danger">-Rs {log.penalty_applied}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="no-penalties">No late penalties this month! 🎉</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleExportCSV = () => {
    let csvContent = '';
    const BOM = '\uFEFF'; // For Excel to recognize UTF-8

    if (viewMode === 'monthly') {
      const [year, month] = filterMonth.split('-');
      const dateInMonth = new Date(year, month - 1, 1);
      const daysInMonth = getDaysInMonth(dateInMonth);
      const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

      // Header row
      const headers = ['Employee Name', 'Total Present', ...daysArray.map(d => `Day ${d}`), 'Base Salary', 'Penalties', 'Net Salary'];
      csvContent += headers.join(',') + '\n';

      // Data rows
      employees.forEach(emp => {
        const empLogs = monthlyData[emp.id] || {};
        let totalPresent = 0;
        let totalPenalties = 0;
        const row = [emp.name];

        const dayCells = daysArray.map(day => {
          const dateStr = `${filterMonth}-${String(day).padStart(2, '0')}`;
          const log = empLogs[dateStr];
          if (log) {
            totalPresent++;
            if (log.penalty_applied > 0) {
              totalPenalties += log.penalty_applied;
              const hrs = log.hours_worked > 0 ? `${log.hours_worked}h` : 'In';
              return `${hrs} (L)`;
            }
            return log.hours_worked > 0 ? `${log.hours_worked}h` : 'In';
          } else if (dateStr < format(new Date(), 'yyyy-MM-dd')) {
            return 'A';
          }
          return '-';
        });

        const baseSalary = emp.monthly_salary || 0;
        const netSalary = Math.max(0, baseSalary - totalPenalties);

        row.push(totalPresent, ...dayCells, baseSalary, totalPenalties, netSalary);
        csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
      });
    } else {
      // Daily view export
      const headers = ['Employee Name', 'Role', 'Shift Start', 'Shift End', 'Status', 'Hours Worked', 'Log In Time', 'Late Penalty'];
      csvContent += headers.join(',') + '\n';

      employees.forEach(emp => {
        const log = attendanceData[emp.id];
        const status = log ? (log.hours_worked > 0 ? 'Present' : 'Working') : 'Absent';
        const hours = log ? (log.hours_worked > 0 ? log.hours_worked : 0) : 0;
        const logInTime = log?.log_in_time ? format(parseISO(log.log_in_time), 'hh:mm a') : '-';
        const penalty = log?.penalty_applied || 0;

        const row = [
          emp.name,
          emp.role || '-',
          emp.shift_start_time ? emp.shift_start_time.substring(0, 5) : '-',
          emp.shift_end_time ? emp.shift_end_time.substring(0, 5) : '-',
          status,
          hours,
          logInTime,
          penalty
        ];
        csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
      });
    }

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = viewMode === 'monthly' 
      ? `Attendance_${filterMonth}.csv` 
      : `Attendance_${filterDate}.csv`;
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="attendance-layout">
      <div className="card flex-1" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Attendance Tracker</span>
          <div className="time-filters" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className={`filter-btn ${viewMode === 'daily' ? 'active' : ''}`} onClick={() => setViewMode('daily')}>Daily View</button>
            <button className={`filter-btn ${viewMode === 'monthly' ? 'active' : ''}`} onClick={() => setViewMode('monthly')}>Monthly Details</button>
            <button 
              className="btn btn-outline" 
              onClick={handleExportCSV}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              title="Export to Spreadsheet"
            >
              <Download size={16} /> Export
            </button>
          </div>
        </div>
        
        <div className="card-body p-0" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            <div className="attendance-filters" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              
              {viewMode === 'daily' ? (
                <>
                  <div className="attendance-filter-input">
                    <label className="form-label">Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={filterDate}
                      onChange={e => setFilterDate(e.target.value)}
                    />
                  </div>
                  <button 
                    className="btn btn-outline" 
                    onClick={() => setFilterDate(format(new Date(), 'yyyy-MM-dd'))}
                    style={{ height: '42px' }}
                  >
                    Today
                  </button>
                </>
              ) : (
                <div className="attendance-filter-input">
                  <label className="form-label">Month</label>
                  <input 
                    type="month" 
                    className="form-control" 
                    value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="attendance-table-container" style={{ flex: 1, overflow: 'auto' }}>
            {isLoading ? (
              <div className="skeleton-table" style={{ padding: '1.5rem' }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton-row">
                    <div className="skeleton-cell skeleton-w-20"></div>
                    <div className="skeleton-cell skeleton-w-30"></div>
                    <div className="skeleton-cell skeleton-w-20"></div>
                    <div className="skeleton-cell skeleton-w-20"></div>
                  </div>
                ))}
              </div>
            ) : employees.length === 0 ? (
              <div className="empty-state" style={{ margin: '2rem' }}>
                <ClipboardCheck size={48} />
                <div>No employees found. Add employees in the Admin panel.</div>
              </div>
            ) : viewMode === 'monthly' ? (
              renderMonthlyMatrix()
            ) : (
              <table className="data-table mobile-cards">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Role</th>
                    <th>Shift & Penalty Details</th>
                    <th>Status / Log In Time</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const log = attendanceData[emp.id];
                    const isPresent = !!log;

                    return (
                      <tr key={emp.id} style={{ backgroundColor: isPresent ? 'var(--bg-main)' : 'transparent' }}>
                        <td data-label="Employee Name" className="font-medium text-main">{emp.name}</td>
                        <td data-label="Role">
                          <span className="badge-category cat-utilities">
                            {emp.role}
                          </span>
                        </td>
                        <td data-label="Shift Details">
                           <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <span>
                                <Clock size={12} className="text-muted" style={{ display: 'inline', marginRight: '4px' }}/>
                                {emp.shift_start_time ? emp.shift_start_time.substring(0, 5) : '--'} to {emp.shift_end_time ? emp.shift_end_time.substring(0, 5) : '--'}
                              </span>
                              {emp.late_penalty > 0 && (
                                <span className="text-danger" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertCircle size={12} /> Late penalty: Rs {emp.late_penalty}
                                </span>
                              )}
                           </div>
                        </td>
                        <td data-label="Status">
                          {isPresent ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <span className="text-success font-semibold" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <ClipboardCheck size={14} /> 
                                {log.hours_worked > 0 ? `Present (${log.hours_worked} hrs)` : 'Present (Working)'}
                              </span>
                              {log.log_in_time && (
                                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                  Logged in at {format(parseISO(log.log_in_time), 'hh:mm a')}
                                </span>
                              )}
                              {log.penalty_applied > 0 && (
                                <span className="text-danger" style={{ fontSize: '0.75rem', fontWeight: '500' }}>
                                  {role === 'admin' ? `Penalty applied: Rs ${log.penalty_applied}` : 'Late Today'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-danger" style={{ opacity: 0.7 }}>Absent (Not Logged)</span>
                          )}
                        </td>
                        <td data-label="Action" className="text-right">
                          {!isPresent ? (
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
                              onClick={() => handleClockIn(emp)}
                            >
                              Clock In
                            </button>
                          ) : log.hours_worked === 0 ? (
                            <button 
                              className="btn btn-outline" 
                              style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
                              onClick={() => handleClockOutNow(emp, log.id, log.log_in_time)}
                            >
                              Clock Out
                            </button>
                          ) : (
                            <button 
                              className="btn btn-outline" 
                              style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem', opacity: 0.7 }}
                              onClick={() => handleOpenClockOutModal(emp, log.id)}
                            >
                              Edit Hours
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Salary Section appended below table container */}
          {renderSalarySection()}
        </div>
      </div>

      {/* Log Hours (Clock Out) Modal */}
      {isModalOpen && selectedEmp && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>{hoursWorked === '8' ? 'Edit Hours' : 'Manual Entry'} - {selectedEmp.name}</h2>
            </div>
            
            <form onSubmit={handleClockOut} className="modal-body">
              <div style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <p>Date: <strong>{format(parseISO(filterDate), 'MMM dd, yyyy')}</strong></p>
                <p style={{ marginTop: '0.5rem' }}>
                  Please enter the total hours worked by this employee manually.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Hours Worked Today</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="e.g. 8"
                  value={hoursWorked}
                  onChange={e => setHoursWorked(e.target.value)}
                  min="0"
                  step="0.5"
                  required
                />
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
                  {isSubmitting ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
