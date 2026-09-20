import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Plus, X, Edit, Users, Award, Tag, Printer, FileText, Download } from 'lucide-react';
import { 
  format, 
  parseISO, 
  isToday, 
  isThisWeek, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  startOfDay, 
  endOfDay, 
  subDays, 
  isWithinInterval 
} from 'date-fns';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
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

  const EXPENSE_CATEGORIES = ['Utilities', 'Salaries', 'Admin Expense', 'Maintenance', 'Disposables', 'Subscriptions', 'Inventory'];
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

  // Financial Report Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportPeriodType, setReportPeriodType] = useState('this-month'); // 'this-month', 'last-month', 'this-week', 'today', 'last-30', 'custom'
  const [customStartDate, setCustomStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Print state
  const [printingExpense, setPrintingExpense] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);

    // Fetch orders for revenue & direct visit costs
    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, order_date, final_total_pkr, discount_applied_pkr, injections_cost_pkr, commission_pkr, reporting_cost_pkr');

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

  // ----------------------------------------------------
  // REPORT CALCULATIONS & 1-PAGE PDF GENERATOR
  // ----------------------------------------------------
  const reportDateRange = useMemo(() => {
    const now = new Date();
    let start, end, label;

    switch (reportPeriodType) {
      case 'this-month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = format(now, 'MMMM yyyy');
        break;
      case 'last-month': {
        const prev = subMonths(now, 1);
        start = startOfMonth(prev);
        end = endOfMonth(prev);
        label = format(prev, 'MMMM yyyy');
        break;
      }
      case 'this-week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        label = `Week (${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')})`;
        break;
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        label = `Today (${format(now, 'MMMM dd, yyyy')})`;
        break;
      case 'last-30':
        start = subDays(now, 30);
        end = endOfDay(now);
        label = `Last 30 Days (${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')})`;
        break;
      case 'custom':
      default:
        start = customStartDate ? startOfDay(parseISO(customStartDate)) : startOfMonth(now);
        end = customEndDate ? endOfDay(parseISO(customEndDate)) : endOfDay(now);
        label = `${format(start, 'MMM dd, yyyy')} to ${format(end, 'MMM dd, yyyy')}`;
        break;
    }

    return { start, end, label };
  }, [reportPeriodType, customStartDate, customEndDate]);

  const reportFinancials = useMemo(() => {
    const { start, end } = reportDateRange;

    // Filter orders within period
    const ordersInRange = allOrders.filter(o => {
      if (!o.order_date) return false;
      const d = parseISO(o.order_date);
      return isWithinInterval(d, { start, end });
    });

    // Filter expenses within period
    const expensesInRange = allExpenses.filter(e => {
      if (!e.expense_date) return false;
      const d = parseISO(e.expense_date);
      return isWithinInterval(d, { start, end });
    });

    const totalRevenue = ordersInRange.reduce((sum, o) => sum + Number(o.final_total_pkr || 0), 0);
    const totalDiscounts = ordersInRange.reduce((sum, o) => sum + Number(o.discount_applied_pkr || 0), 0);
    
    // Direct visit costs from orders
    const injectionsCost = ordersInRange.reduce((sum, o) => sum + Number(o.injections_cost_pkr || 0), 0);
    const commissionsCost = ordersInRange.reduce((sum, o) => sum + Number(o.commission_pkr || 0), 0);
    const reportingCost = ordersInRange.reduce((sum, o) => sum + Number(o.reporting_cost_pkr || 0), 0);
    const totalDirectCosts = injectionsCost + commissionsCost + reportingCost;

    // General operating expenses
    const totalOperatingExpenses = expensesInRange.reduce((sum, e) => sum + Number(e.amount_pkr || 0), 0);

    const grandTotalExpenses = totalDirectCosts + totalOperatingExpenses;
    const grossProfit = totalRevenue - totalDirectCosts;
    const netProfit = totalRevenue - grandTotalExpenses;
    const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';
    const netMarginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';

    // Breakdown by Category
    const categoryTotals = {};
    const categoryCounts = {};
    expensesInRange.forEach(e => {
      const cat = e.category || 'General';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount_pkr || 0);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        count: categoryCounts[category] || 0,
        amount,
        percentage: totalOperatingExpenses > 0 ? ((amount / totalOperatingExpenses) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.amount - a.amount);

    // Top recent expenses
    const recentExpenses = [...expensesInRange]
      .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date))
      .slice(0, 6);

    return {
      orderCount: ordersInRange.length,
      expenseCount: expensesInRange.length,
      totalRevenue,
      totalDiscounts,
      injectionsCost,
      commissionsCost,
      reportingCost,
      totalDirectCosts,
      totalOperatingExpenses,
      grandTotalExpenses,
      grossProfit,
      netProfit,
      grossMarginPct,
      netMarginPct,
      categoryBreakdown,
      recentExpenses
    };
  }, [reportDateRange, allOrders, allExpenses]);

  const handleDownloadReport = async () => {
    setIsGeneratingReport(true);

    try {
      const { label } = reportDateRange;
      const f = reportFinancials;
      const cleanLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_');
      const escapeHtml = (str) => str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';

      // Build categories rows
      let catRows = '';
      if (f.categoryBreakdown.length > 0) {
        f.categoryBreakdown.slice(0, 6).forEach((c, idx) => {
          catRows += `
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
              <td style="padding: 5px 8px; font-weight: 600; color: #1e293b;">${idx + 1}. ${escapeHtml(c.category)}</td>
              <td style="padding: 5px 8px; text-align: center; color: #64748b;">${c.count} txns</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: #0f172a;">Rs ${c.amount.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 600; color: #1d4ed8;">${c.percentage}%</td>
            </tr>`;
        });
      } else {
        catRows = `<tr><td colspan="4" style="padding: 10px; text-align: center; color: #94a3b8; font-size: 11px;">No category expenses in this period</td></tr>`;
      }

      // Build recent disbursements rows
      let recentRows = '';
      if (f.recentExpenses.length > 0) {
        f.recentExpenses.forEach((exp) => {
          const expDate = exp.expense_date ? format(parseISO(exp.expense_date), 'MMM dd, yyyy') : 'N/A';
          recentRows += `
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
              <td style="padding: 5px 8px; color: #64748b;">${expDate}</td>
              <td style="padding: 5px 8px; font-weight: 500; color: #1e293b;">${escapeHtml(exp.title || 'Expense')}</td>
              <td style="padding: 5px 8px; color: #475569;"><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${escapeHtml(exp.category || 'General')}</span></td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: #dc2626;">Rs ${Number(exp.amount_pkr || 0).toLocaleString()}</td>
            </tr>`;
        });
      } else {
        recentRows = `<tr><td colspan="4" style="padding: 10px; text-align: center; color: #94a3b8; font-size: 11px;">No recorded transactions in this period</td></tr>`;
      }

      // Temporary single-page A4 container
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '794px';
      container.style.backgroundColor = '#ffffff';
      container.style.color = '#1e293b';
      container.style.fontFamily = "Arial, Helvetica, sans-serif";
      container.style.boxSizing = 'border-box';
      container.style.padding = '32px 36px';
      container.style.zIndex = '-9999';

      container.innerHTML = `
        <!-- Header -->
        <div style="text-align: center; border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px;">
          <h1 style="font-size: 24px; color: #1d4ed8; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 2px 0;">Prime Diagnostic Centre</h1>
          <div style="font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
            Executive Financial Statement & Expense Audit
          </div>
          <p style="font-size: 10px; color: #64748b; margin: 0 0 8px 0;">
            0314-1117447 &bull; Civil Hospital Road, Off M.A. Jinnah Road, Karachi
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 600; color: #1e40af;">
            <span>Reporting Period: <strong>${escapeHtml(label)}</strong></span>
            <span>Generated: <strong>${format(new Date(), 'MMM dd, yyyy \u2014 hh:mm a')}</strong></span>
            <span>Audited Records: <strong>${f.orderCount} visits &bull; ${f.expenseCount} expenses</strong></span>
          </div>
        </div>

        <!-- 4 Key Performance Metrics -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Gross Revenue</div>
            <div style="font-size: 16px; font-weight: 800; color: #1d4ed8; margin-top: 3px;">Rs ${f.totalRevenue.toLocaleString()}</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${f.orderCount} total orders</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Operating Expenses</div>
            <div style="font-size: 16px; font-weight: 800; color: #dc2626; margin-top: 3px;">Rs ${f.totalOperatingExpenses.toLocaleString()}</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${f.expenseCount} logged vouchers</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">Gross Profit</div>
            <div style="font-size: 16px; font-weight: 800; color: ${f.grossProfit >= 0 ? '#059669' : '#dc2626'}; margin-top: 3px;">Rs ${f.grossProfit.toLocaleString()}</div>
            <div style="font-size: 9px; color: #059669; margin-top: 2px;">${f.grossMarginPct}% gross margin</div>
          </div>
          <div style="background: ${f.netProfit >= 0 ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${f.netProfit >= 0 ? '#bbf7d0' : '#fecaca'}; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${f.netProfit >= 0 ? '#166534' : '#991b1b'}; letter-spacing: 0.05em;">Net Profit / (Loss)</div>
            <div style="font-size: 16px; font-weight: 800; color: ${f.netProfit >= 0 ? '#059669' : '#dc2626'}; margin-top: 3px;">Rs ${f.netProfit.toLocaleString()}</div>
            <div style="font-size: 9px; font-weight: 600; color: ${f.netProfit >= 0 ? '#059669' : '#dc2626'}; margin-top: 2px;">${f.netMarginPct}% net margin</div>
          </div>
        </div>

        <!-- Profit & Loss Summary Structure -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1d4ed8; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
            Statement of Financial Performance (P&L Breakdown)
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <tbody>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 8px; font-weight: 600;">1. Total Diagnostic Sales & Receipts</td>
                <td style="padding: 5px 8px; text-align: right; font-weight: 700;">Rs ${(f.totalRevenue + f.totalDiscounts).toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 8px; color: #64748b; padding-left: 20px;">Less: Discounts Allowed to Patients</td>
                <td style="padding: 5px 8px; text-align: right; color: #dc2626;">- Rs ${f.totalDiscounts.toLocaleString()}</td>
              </tr>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                <td style="padding: 5px 8px; font-weight: 700; color: #1e293b;">Net Patient Revenue</td>
                <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: #1e293b;">Rs ${f.totalRevenue.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 8px; color: #64748b; padding-left: 20px;">Less: Direct Visit Costs (Injections, Commissions & Reporting)</td>
                <td style="padding: 5px 8px; text-align: right; color: #ea580c;">- Rs ${f.totalDirectCosts.toLocaleString()}</td>
              </tr>
              <tr style="background: #eff6ff; border-bottom: 1px solid #bfdbfe;">
                <td style="padding: 5px 8px; font-weight: 700; color: #1d4ed8;">GROSS PROFIT</td>
                <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: #1d4ed8;">Rs ${f.grossProfit.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px 8px; color: #64748b; padding-left: 20px;">Less: General Clinic Operating Expenses (Salaries, Utilities, Admin, Supplies)</td>
                <td style="padding: 5px 8px; text-align: right; color: #dc2626;">- Rs ${f.totalOperatingExpenses.toLocaleString()}</td>
              </tr>
              <tr style="background: ${f.netProfit >= 0 ? '#ecfdf5' : '#fef2f2'}; border-top: 2px solid ${f.netProfit >= 0 ? '#059669' : '#dc2626'}; border-bottom: 2px solid ${f.netProfit >= 0 ? '#059669' : '#dc2626'};">
                <td style="padding: 6px 8px; font-size: 12px; font-weight: 800; color: ${f.netProfit >= 0 ? '#065f46' : '#991b1b'};">NET SURPLUS / (PROFIT) FOR PERIOD</td>
                <td style="padding: 6px 8px; font-size: 13px; font-weight: 800; text-align: right; color: ${f.netProfit >= 0 ? '#047857' : '#b91c1c'};">Rs ${f.netProfit.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Two Columns: Category Breakdown & Recent Disbursements -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px;">
          <!-- Category Breakdown -->
          <div>
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1d4ed8; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
              Operating Expenses by Category
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; font-size: 10px; color: #64748b; text-transform: uppercase;">
                  <th style="padding: 4px 8px; text-align: left;">Category</th>
                  <th style="padding: 4px 8px; text-align: center;">Count</th>
                  <th style="padding: 4px 8px; text-align: right;">Amount</th>
                  <th style="padding: 4px 8px; text-align: right;">%</th>
                </tr>
              </thead>
              <tbody>${catRows}</tbody>
            </table>
          </div>

          <!-- Top / Recent Expenses -->
          <div>
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1d4ed8; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
              Sample Expense Disbursements
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; font-size: 10px; color: #64748b; text-transform: uppercase;">
                  <th style="padding: 4px 8px; text-align: left;">Date</th>
                  <th style="padding: 4px 8px; text-align: left;">Description</th>
                  <th style="padding: 4px 8px; text-align: left;">Cat</th>
                  <th style="padding: 4px 8px; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Official Signatures -->
        <div style="display: flex; justify-content: space-between; margin-top: 20px; padding-top: 12px;">
          <div style="width: 180px; text-align: center;">
            <div style="border-top: 1px solid #94a3b8; margin-bottom: 4px;"></div>
            <div style="font-size: 10px; color: #475569; font-weight: 700; text-transform: uppercase;">Prepared By</div>
            <div style="font-size: 9px; color: #94a3b8;">Finance & Accounts Dept</div>
          </div>
          <div style="width: 180px; text-align: center;">
            <div style="border-top: 1px solid #94a3b8; margin-bottom: 4px;"></div>
            <div style="font-size: 10px; color: #475569; font-weight: 700; text-transform: uppercase;">Verified & Approved By</div>
            <div style="font-size: 9px; color: #94a3b8;">Medical Director / Admin</div>
          </div>
        </div>

        <!-- Footer -->
        <div style="margin-top: 14px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px;">
          <p style="font-size: 9px; color: #94a3b8; margin: 0; line-height: 1.4;">
            Prime Diagnostic Centre &bull; RC 8-5-2, Mohanlal Bhagwandas Building, Civil Hospital Road, Off M.A. Jinnah Road, Karachi &bull; Confidential Financial Statement (Page 1 of 1)
          </p>
        </div>
      `;

      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, 297));
      pdf.save(`Prime_Financial_Report_${cleanLabel}.pdf`);
      setIsReportModalOpen(false);
    } catch (err) {
      console.error("Report generation failed:", err);
      alert("Failed to generate report: " + (err.message || err));
    } finally {
      setIsGeneratingReport(false);
    }
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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-outline"
              style={{ borderColor: '#059669', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              onClick={() => setIsReportModalOpen(true)}
              title="Download 1-page financial summary & expenses report"
            >
              <FileText size={16} /> Download Report
            </button>
            <button className="btn btn-primary add-expense-btn" onClick={handleAddNewClick}>
              <Plus size={18} /> Log New Expense
            </button>
          </div>
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

      {/* ==========================================================================
          MODAL: DOWNLOAD 1-PAGE FINANCIAL & EXPENSE REPORT
          ========================================================================== */}
      {isReportModalOpen && (
        <div className="modal-overlay" onClick={() => !isGeneratingReport && setIsReportModalOpen(false)}>
          <div className="glass-modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header flex-between" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={20} style={{ color: '#059669' }} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Download Financial & Expense Report</h3>
              </div>
              <button className="btn btn-icon" onClick={() => setIsReportModalOpen(false)} disabled={isGeneratingReport}><X size={18} /></button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  SELECT TIME PERIOD
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <button 
                    type="button"
                    className={`btn btn-sm ${reportPeriodType === 'this-month' ? 'btn-primary' : 'btn-outline'}`}
                    style={reportPeriodType === 'this-month' ? { backgroundColor: '#059669', borderColor: '#059669' } : {}}
                    onClick={() => setReportPeriodType('this-month')}
                  >
                    📅 This Month
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-sm ${reportPeriodType === 'last-month' ? 'btn-primary' : 'btn-outline'}`}
                    style={reportPeriodType === 'last-month' ? { backgroundColor: '#059669', borderColor: '#059669' } : {}}
                    onClick={() => setReportPeriodType('last-month')}
                  >
                    📅 Last Month
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-sm ${reportPeriodType === 'this-week' ? 'btn-primary' : 'btn-outline'}`}
                    style={reportPeriodType === 'this-week' ? { backgroundColor: '#059669', borderColor: '#059669' } : {}}
                    onClick={() => setReportPeriodType('this-week')}
                  >
                    📆 This Week
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-sm ${reportPeriodType === 'today' ? 'btn-primary' : 'btn-outline'}`}
                    style={reportPeriodType === 'today' ? { backgroundColor: '#059669', borderColor: '#059669' } : {}}
                    onClick={() => setReportPeriodType('today')}
                  >
                    ⏰ Today
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-sm ${reportPeriodType === 'last-30' ? 'btn-primary' : 'btn-outline'}`}
                    style={reportPeriodType === 'last-30' ? { backgroundColor: '#059669', borderColor: '#059669' } : {}}
                    onClick={() => setReportPeriodType('last-30')}
                  >
                    📊 Last 30 Days
                  </button>
                  <button 
                    type="button"
                    className={`btn btn-sm ${reportPeriodType === 'custom' ? 'btn-primary' : 'btn-outline'}`}
                    style={reportPeriodType === 'custom' ? { backgroundColor: '#059669', borderColor: '#059669' } : {}}
                    onClick={() => setReportPeriodType('custom')}
                  >
                    ⚙️ Custom Range
                  </button>
                </div>
              </div>

              {reportPeriodType === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Start Date</label>
                    <input 
                      type="date" 
                      className="form-control form-control-sm"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>End Date</label>
                    <input 
                      type="date" 
                      className="form-control form-control-sm"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Live Preview Summary Card */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                  📊 Statement Summary: {reportDateRange.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Revenue</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1d4ed8' }}>Rs {reportFinancials.totalRevenue.toLocaleString()}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Expenses</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#dc2626' }}>Rs {reportFinancials.totalOperatingExpenses.toLocaleString()}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #dcfce7' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Net Profit</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: reportFinancials.netProfit >= 0 ? '#059669' : '#dc2626' }}>
                      Rs {reportFinancials.netProfit.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '8px', textAlign: 'center' }}>
                  Includes Gross Profit, Operating Margin ({reportFinancials.netMarginPct}%), and {reportFinancials.categoryBreakdown.length} expense categories on 1 comprehensive A4 page.
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setIsReportModalOpen(false)}
                disabled={isGeneratingReport}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                style={{ backgroundColor: '#059669', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={handleDownloadReport}
                disabled={isGeneratingReport}
              >
                <Download size={16} />
                {isGeneratingReport ? 'Generating 1-Page PDF...' : 'Download 1-Page PDF Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
