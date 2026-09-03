import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Plus, X, Edit, Users, Award, Tag, Printer } from 'lucide-react';
import { format, parseISO, isToday, isThisWeek } from 'date-fns';
import logoImg from '../../assets/with-text-logo.png';
import './ExpensesPage.css';

export default function ExpensesPage() {
  const [allOrders, setAllOrders] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [dateFilterType, setDateFilterType] = useState('all'); // all, daily, weekly, month
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [filterCategory, setFilterCategory] = useState('All');

  const EXPENSE_CATEGORIES = ['Utilities', 'Salaries', 'Admin Expense', 'Maintenance', 'Disposables', 'Subscriptions'];
  const allAvailableCategories = useMemo(() => {
    const categoriesFromData = allExpenses.map(e => e.category);
    return Array.from(new Set([...EXPENSE_CATEGORIES, ...categoriesFromData])).filter(Boolean);
  }, [allExpenses]);

  // Available Months list built from expenses and orders
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    allExpenses.forEach(e => {
      if (e.expense_date) monthSet.add(format(parseISO(e.expense_date), 'yyyy-MM'));
    });
    allOrders.forEach(o => {
      if (o.order_date) monthSet.add(format(parseISO(o.order_date), 'yyyy-MM'));
    });
    monthSet.add(format(new Date(), 'yyyy-MM'));
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [allExpenses, allOrders]);

  const formatMonthLabel = (ym) => {
    const [year, month] = ym.split('-').map(Number);
    return format(new Date(year, month - 1), 'MMMM yyyy');
  };

  const lastMonthValue = useMemo(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return format(lastMonth, 'yyyy-MM');
  }, []);

  const handleMonthSelect = (value) => {
    if (value === 'last-month') {
      setFilterMonth(lastMonthValue);
      setDateFilterType('month');
    } else {
      setFilterMonth(value);
      setDateFilterType('month');
    }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [currentEditId, setCurrentEditId] = useState(null);
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ title: '', category: '', amount_pkr: '', expense_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), approved_by: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Print state
  const [printingExpense, setPrintingExpense] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);

    // Fetch orders for revenue
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, order_date, final_total_pkr');

    // Fetch expenses
    const { data: expensesData } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false });

    // Fetch employees for salaries
    const { data: employeesData } = await supabase
      .from('employees')
      .select('id, monthly_salary');

    if (ordersData) setAllOrders(ordersData);
    if (expensesData) setAllExpenses(expensesData);
    if (employeesData) setAllEmployees(employeesData);
    setIsLoading(false);
  }

  // Filter Helper
  const passesDateFilter = (dateStr) => {
    if (dateFilterType === 'all') return true;

    const date = parseISO(dateStr);

    if (dateFilterType === 'daily') return isToday(date);
    if (dateFilterType === 'weekly') return isThisWeek(date);
    if (dateFilterType === 'month' && filterMonth) {
      return format(date, 'yyyy-MM') === filterMonth;
    }
    return true;
  };

  // Filtered Data
  const filteredOrders = useMemo(() => allOrders.filter(o => passesDateFilter(o.order_date)), [allOrders, dateFilterType, filterMonth]);
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(e => {
      const passDate = passesDateFilter(e.expense_date);
      const passCategory = filterCategory === 'All' ? true : e.category === filterCategory;
      return passDate && passCategory;
    });
  }, [allExpenses, dateFilterType, filterMonth, filterCategory]);

  // Calculations
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.final_total_pkr), 0);
  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount_pkr), 0);
  const netProfit = totalRevenue - totalExpenses;

  // Salaries grabbed from employees page / table
  const totalSalariesFromEmployees = useMemo(() => {
    return allEmployees.reduce((sum, emp) => sum + Number(emp.monthly_salary || 0), 0);
  }, [allEmployees]);

  // Top expense categories breakdown from filtered expenses
  const topCategories = useMemo(() => {
    const totals = {};
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Other';
      totals[cat] = (totals[cat] || 0) + Number(exp.amount_pkr || 0);
    });
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  const topCategory1 = topCategories[0] || { category: 'None', amount: 0 };
  const topCategory2 = topCategories[1] || { category: 'None', amount: 0 };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.title || !expenseForm.amount_pkr || !expenseForm.expense_date) return;

    setIsSubmitting(true);
    let error;

    if (modalMode === 'edit') {
      const { error: updateError } = await supabase
        .from('expenses')
        .update({
          title: expenseForm.title,
          category: expenseForm.category,
          amount_pkr: Number(expenseForm.amount_pkr),
          expense_date: new Date(expenseForm.expense_date).toISOString(),
          approved_by: expenseForm.approved_by || null
        })
        .eq('id', currentEditId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('expenses').insert([{
        title: expenseForm.title,
        category: expenseForm.category,
        amount_pkr: Number(expenseForm.amount_pkr),
        expense_date: new Date(expenseForm.expense_date).toISOString(),
        approved_by: expenseForm.approved_by || null
      }]);
      error = insertError;
    }

    setIsSubmitting(false);
    if (error) {
      alert(`Failed to ${modalMode} expense: ` + error.message);
    } else {
      setIsModalOpen(false);
      setShowCustomCategory(false);
      setExpenseForm({ title: '', category: '', amount_pkr: '', expense_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), approved_by: '' });
      fetchData(); // Refresh table
    }
  };

  const handleEditClick = (exp) => {
    setModalMode('edit');
    setCurrentEditId(exp.id);
    setShowCustomCategory(false);
    setExpenseForm({
      title: exp.title,
      category: exp.category,
      amount_pkr: exp.amount_pkr,
      expense_date: format(parseISO(exp.expense_date), "yyyy-MM-dd'T'HH:mm"),
      approved_by: exp.approved_by || ''
    });
    setIsModalOpen(true);
  };

  const handleAddNewClick = () => {
    setModalMode('add');
    setCurrentEditId(null);
    setShowCustomCategory(false);
    setExpenseForm({ title: '', category: '', amount_pkr: '', expense_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), approved_by: '' });
    setIsModalOpen(true);
  };

  return (
    <div className="expenses-layout">
      {/* Top Controls: Category, Timeframe & Month Dropdown */}
      <div className="expenses-controls-advanced mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="filter-group">
          <label className="filter-label"><Calendar size={14} /> Category Filter</label>
          <select
            className="form-control"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ width: '200px', padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
          >
            <option value="All">All Categories</option>
            {allAvailableCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="filter-group">
            <label className="filter-label"><Calendar size={14} /> Timeframe</label>
            <div className="time-filters">
              <button className={`filter-btn ${dateFilterType === 'all' ? 'active' : ''}`} onClick={() => setDateFilterType('all')}>All Time</button>
              <button className={`filter-btn ${dateFilterType === 'daily' ? 'active' : ''}`} onClick={() => setDateFilterType('daily')}>Today</button>
              <button className={`filter-btn ${dateFilterType === 'weekly' ? 'active' : ''}`} onClick={() => setDateFilterType('weekly')}>This Week</button>
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label"><Calendar size={14} /> Month</label>
            <select 
              className="form-control" 
              value={filterMonth} 
              onChange={e => handleMonthSelect(e.target.value)} 
              style={{ width: '220px', padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
            >
              <option value="last-month">📅 Last Month ({formatMonthLabel(lastMonthValue)})</option>
              {availableMonths.map(ym => (
                <option key={ym} value={ym}>
                  {formatMonthLabel(ym)}{ym === format(new Date(), 'yyyy-MM') ? ' (Current)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Widgets */}
      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon bg-blue-100 text-blue-600">
            <TrendingUp size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">Total Revenue</span>
            <span className="stat-value">Rs {totalRevenue.toLocaleString()}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-red-100 text-red-600">
            <TrendingDown size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">Total Expenses</span>
            <span className="stat-value">Rs {totalExpenses.toLocaleString()}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className={`stat-icon ${netProfit >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            <DollarSign size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">Net Profit / Loss</span>
            <span className={`stat-value ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Rs {netProfit.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Category Breakdown Widgets (Salaries + Top Categories) */}
      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon bg-purple-100 text-purple-600">
            <Users size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">Total Salaries (Employees)</span>
            <span className="stat-value">Rs {totalSalariesFromEmployees.toLocaleString()}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-amber-100 text-amber-600">
            <Award size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">Most Expensed: {topCategory1.category}</span>
            <span className="stat-value">Rs {topCategory1.amount.toLocaleString()}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-indigo-100 text-indigo-600">
            <Tag size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">2nd Most Expensed: {topCategory2.category}</span>
            <span className="stat-value">Rs {topCategory2.amount.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card flex-1" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header flex-between" style={{ padding: '1.25rem 1.5rem' }}>
          <span>Expense Transactions</span>
          <button className="btn btn-primary add-expense-btn" onClick={handleAddNewClick}>
            <Plus size={18} /> Log New Expense
          </button>
        </div>

        <div className="card-body p-0" style={{ overflowY: 'auto' }}>
          {isLoading ? (
            <div className="skeleton-table">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton-row">
                  <div className="skeleton-cell skeleton-w-20"></div>
                  <div className="skeleton-cell skeleton-w-30"></div>
                  <div className="skeleton-cell skeleton-w-20"></div>
                  <div className="skeleton-cell skeleton-w-20"></div>
                </div>
              ))}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="empty-state">No expenses recorded for this timeframe.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table mobile-cards">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Approved By</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map(exp => (
                    <tr key={exp.id}>
                      <td data-label="Date">
                        <div className="date-cell">
                          <Calendar size={14} className="text-muted" />
                          {format(parseISO(exp.expense_date), 'MMM dd, yyyy - hh:mm a')}
                        </div>
                      </td>
                      <td data-label="Title" className="font-medium text-main">{exp.title}</td>
                      <td data-label="Category">
                        <span className={`badge-category cat-${exp.category.toLowerCase().replace(/\s+/g, '-')}`}>
                          {exp.category}
                        </span>
                      </td>
                      <td data-label="Approved By">
                        {exp.approved_by ? (
                          <span className="approved-by-badge">{exp.approved_by}</span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td data-label="Amount" className="text-right font-semibold text-danger">
                        - Rs {exp.amount_pkr.toLocaleString()}
                      </td>
                      <td data-label="Actions" className="text-right">
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleEditClick(exp)} title="Edit">
                            <Edit size={16} />
                          </button>
                          <button 
                            className="btn btn-outline" 
                            style={{ padding: '0.25rem 0.5rem' }} 
                            onClick={async () => {
                              setPrintingExpense(exp);
                              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                              window.print();
                              setPrintingExpense(null);
                            }} 
                            title="Print Voucher"
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{modalMode === 'edit' ? 'Edit Expense' : 'Add New Expense'}</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="modal-body">
              <div className="form-group">
                <label className="form-label">Expense Title</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Monthly Electricity Bill"
                  value={expenseForm.title}
                  onChange={e => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Category</label>
                  {!showCustomCategory ? (
                    <select
                      className="form-control"
                      value={expenseForm.category}
                      onChange={e => {
                        if (e.target.value === 'custom') {
                          setShowCustomCategory(true);
                          setExpenseForm({ ...expenseForm, category: '' });
                        } else {
                          setExpenseForm({ ...expenseForm, category: e.target.value });
                        }
                      }}
                      required
                    >
                      <option value="" disabled>Select a category</option>
                      {allAvailableCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="custom" style={{ fontWeight: 'bold' }}>+ Add Custom Category</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="New category name"
                        value={expenseForm.category}
                        onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                        autoFocus
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setShowCustomCategory(false);
                          setExpenseForm({ ...expenseForm, category: '' });
                        }}
                        style={{ padding: '0 0.5rem' }}
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Amount (PKR)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="5000"
                    value={expenseForm.amount_pkr}
                    onChange={e => setExpenseForm({ ...expenseForm, amount_pkr: e.target.value })}
                    required
                    min="1"
                  />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Date & Time</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={expenseForm.expense_date}
                    onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    required
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Approved By</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Dr. Salman, Manager"
                    value={expenseForm.approved_by}
                    onChange={e => setExpenseForm({ ...expenseForm, approved_by: e.target.value })}
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
                  {isSubmitting ? 'Saving...' : (modalMode === 'edit' ? 'Save Changes' : 'Add Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden Thermal Expense Receipt (visible only during print) */}
      {printingExpense && (
        <div id="expense-receipt" className="print-only">
          <div className="receipt-header">
            <img src={logoImg} alt="Prime Diagnostic Centre Logo" className="receipt-logo" style={{ margin: '0 auto 10px auto', display: 'block', maxWidth: '100%' }} />
            <h2>Prime Diagnostic Centre</h2>
            <p>0314-1117447</p>
            <p><strong>EXPENSE PAYMENT VOUCHER</strong></p>
          </div>

          <div className="receipt-details">
            <p><strong>Voucher Ref #:</strong> EXP-{printingExpense.id ? String(printingExpense.id).substring(0, 8).toUpperCase() : 'N/A'}</p>
            <p><strong>Date:</strong> {format(parseISO(printingExpense.expense_date), 'MMM dd, yyyy - hh:mm a')}</p>
          </div>

          <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

          <table className="receipt-items">
            <tbody>
              <tr>
                <td><strong>Title:</strong></td>
                <td>{printingExpense.title}</td>
              </tr>
              <tr>
                <td><strong>Category:</strong></td>
                <td>{printingExpense.category}</td>
              </tr>
              {printingExpense.approved_by && (
                <tr>
                  <td><strong>Approved By:</strong></td>
                  <td>{printingExpense.approved_by}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ borderTop: '1px dashed #000', margin: '10px 0' }}></div>

          <div className="receipt-totals">
            <h3>Amount: <span style={{ float: 'right' }}>Rs {Number(printingExpense.amount_pkr).toLocaleString()}</span></h3>
          </div>

          <div style={{ borderTop: '1px dashed #000', margin: '15px 0' }}></div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px', fontSize: '11px' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ borderTop: '1px solid #000', width: '80%', margin: '0 auto 4px auto' }}></div>
              <p>Approved By</p>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ borderTop: '1px solid #000', width: '80%', margin: '0 auto 4px auto' }}></div>
              <p>Received By</p>
            </div>
          </div>

          <div style={{ borderTop: '1px dashed #000', margin: '15px 0' }}></div>
          <p style={{ textAlign: 'center', fontSize: '11px', lineHeight: '1.4' }}>Address: RC 8-5-2, Mohanlal Bhagwandas Building, Civil Hospital Road, Off M.A. Jinnah Road, Karachi</p>
        </div>
      )}
    </div>
  );
}
