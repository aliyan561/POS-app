import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Plus, X } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, isToday, isThisWeek } from 'date-fns';
import './ExpensesPage.css';

export default function ExpensesPage() {
  const [allOrders, setAllOrders] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [dateFilterType, setDateFilterType] = useState('all'); // all, daily, weekly, month, custom
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');

  const EXPENSE_CATEGORIES = ['Utilities', 'Salaries', 'Admin Expense', 'Maintenance', 'Disposables', 'Subscriptions'];

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ title: '', category: 'Utilities', amount_pkr: '', expense_date: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    if (ordersData) setAllOrders(ordersData);
    if (expensesData) setAllExpenses(expensesData);
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
    if (dateFilterType === 'custom' && filterStartDate && filterEndDate) {
      const start = startOfDay(parseISO(filterStartDate));
      const end = endOfDay(parseISO(filterEndDate));
      return isWithinInterval(date, { start, end });
    }
    return true;
  };

  // Filtered Data
  const filteredOrders = useMemo(() => allOrders.filter(o => passesDateFilter(o.order_date)), [allOrders, dateFilterType, filterMonth, filterStartDate, filterEndDate]);
  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(e => {
      const passDate = passesDateFilter(e.expense_date);
      const passCategory = filterCategory === 'All' ? true : e.category === filterCategory;
      return passDate && passCategory;
    });
  }, [allExpenses, dateFilterType, filterMonth, filterStartDate, filterEndDate, filterCategory]);

  // Calculations
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.final_total_pkr), 0);
  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount_pkr), 0);
  const netProfit = totalRevenue - totalExpenses;

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.title || !expenseForm.amount_pkr || !expenseForm.expense_date) return;
    
    setIsSubmitting(true);
    const { data, error } = await supabase.from('expenses').insert([{
      title: expenseForm.title,
      category: expenseForm.category,
      amount_pkr: Number(expenseForm.amount_pkr),
      expense_date: new Date(expenseForm.expense_date).toISOString()
    }]);

    setIsSubmitting(false);
    if (error) {
      alert("Failed to add expense: " + error.message);
    } else {
      setIsModalOpen(false);
      setExpenseForm({ title: '', category: 'Utilities', amount_pkr: '', expense_date: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
      fetchData(); // Refresh table
    }
  };

  return (
    <div className="expenses-layout">
      {/* Top Controls: Advanced Filters */}
      <div className="expenses-controls-advanced mb-4">
        <div className="filter-group">
          <label className="filter-label"><Calendar size={14}/> Category</label>
          <div className="time-filters-advanced">
            <select 
              className="form-control" 
              value={filterCategory} 
              onChange={e => setFilterCategory(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
            >
              <option value="All">All Categories</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label"><Calendar size={14}/> Timeframe</label>
          <div className="time-filters-advanced">
            <div className="time-filters">
              <button className={`filter-btn ${dateFilterType === 'all' ? 'active' : ''}`} onClick={() => setDateFilterType('all')}>All Time</button>
              <button className={`filter-btn ${dateFilterType === 'daily' ? 'active' : ''}`} onClick={() => setDateFilterType('daily')}>Daily</button>
              <button className={`filter-btn ${dateFilterType === 'weekly' ? 'active' : ''}`} onClick={() => setDateFilterType('weekly')}>Weekly</button>
              <button className={`filter-btn ${dateFilterType === 'month' ? 'active' : ''}`} onClick={() => setDateFilterType('month')}>Monthly</button>
              <button className={`filter-btn ${dateFilterType === 'custom' ? 'active' : ''}`} onClick={() => setDateFilterType('custom')}>Custom</button>
            </div>
            
            {dateFilterType === 'month' && (
              <input 
                type="month" 
                className="form-control" 
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
              />
            )}

            {dateFilterType === 'custom' && (
              <div className="date-range-inputs">
                <input 
                  type="date" 
                  className="form-control" 
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                />
                <span className="text-muted">to</span>
                <input 
                  type="date" 
                  className="form-control" 
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                />
              </div>
            )}
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

      {/* Expenses Table */}
      <div className="card flex-1" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header flex-between" style={{ padding: '1.25rem 1.5rem' }}>
          <span>Expense Transactions</span>
          <button className="btn btn-primary add-expense-btn" onClick={() => setIsModalOpen(true)}>
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
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map(exp => (
                    <tr key={exp.id}>
                      <td>
                        <div className="date-cell">
                          <Calendar size={14} className="text-muted" />
                          {format(parseISO(exp.expense_date), 'MMM dd, yyyy - hh:mm a')}
                        </div>
                      </td>
                      <td className="font-medium text-main">{exp.title}</td>
                      <td>
                        <span className={`badge-category cat-${exp.category.toLowerCase().replace(/\s+/g, '-')}`}>
                          {exp.category}
                        </span>
                      </td>
                      <td className="text-right font-semibold text-danger">
                        - Rs {exp.amount_pkr.toLocaleString()}
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
              <h2>Add New Expense</h2>
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
                  onChange={e => setExpenseForm({...expenseForm, title: e.target.value})}
                  required
                />
              </div>

              <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Category</label>
                  <select 
                    className="form-control" 
                    value={expenseForm.category}
                    onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}
                  >
                    {EXPENSE_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Amount (PKR)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="5000"
                    value={expenseForm.amount_pkr}
                    onChange={e => setExpenseForm({...expenseForm, amount_pkr: e.target.value})}
                    required
                    min="1"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Date & Time</label>
                <input 
                  type="datetime-local" 
                  className="form-control" 
                  value={expenseForm.expense_date}
                  onChange={e => setExpenseForm({...expenseForm, expense_date: e.target.value})}
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
                  {isSubmitting ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
