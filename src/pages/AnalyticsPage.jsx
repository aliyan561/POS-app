import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { Calendar, Filter, BarChart3, PieChart as PieChartIcon, TrendingUp, Award, Zap } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Area, AreaChart
} from 'recharts';
import { 
  format, parseISO, 
  isToday, isThisWeek, getHours,
  getDate, getDaysInMonth
} from 'date-fns';
import './AnalyticsPage.css';

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#14b8a6', '#a855f7', '#e11d48'
];

const SERVICE_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
];

export default function AnalyticsPage() {
  const [allOrders, setAllOrders] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [dateFilterType, setDateFilterType] = useState('month'); // all, daily, weekly, weekly-all, month
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  const [serviceFilter, setServiceFilter] = useState('all'); // all, compare, or specific service id
  const [metric, setMetric] = useState('revenue'); // revenue, customers
  const [chartType, setChartType] = useState('line'); // bar, line, area
  
  const [topServicesFilter, setTopServicesFilter] = useState('month'); // week, month

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    
    // Fetch orders with order_items
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        order_date,
        final_total_pkr,
        discount_applied_pkr,
        patients ( id ),
        order_items (
          quantity,
          service_id,
          services ( price_pkr )
        )
      `)
      .order('order_date', { ascending: true });

    // Fetch services for dropdown
    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .order('service_name', { ascending: true });

    if (ordersError) console.error("Error fetching analytics data:", ordersError);
    else if (ordersData) setAllOrders(ordersData);

    if (servicesData) setServicesList(servicesData);
    
    setIsLoading(false);
  }

  // Build parent services map for grouping
  const parentServicesMap = useMemo(() => {
    const map = {};
    servicesList.forEach(s => {
      if (!s.parent_id) {
        map[s.id] = { ...s, children: [] };
      }
    });
    servicesList.forEach(s => {
      if (s.parent_id && map[s.parent_id]) {
        map[s.parent_id].children.push(s);
      }
    });
    return map;
  }, [servicesList]);

  // Get parent category for any service id
  const getParentCategory = (serviceId) => {
    // If it's a parent itself
    if (parentServicesMap[serviceId]) return parentServicesMap[serviceId];
    // If it's a child, find its parent
    const service = servicesList.find(s => s.id === serviceId);
    if (service && service.parent_id && parentServicesMap[service.parent_id]) {
      return parentServicesMap[service.parent_id];
    }
    return null;
  };

  // Filter orders by date
  const filteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      const orderDate = parseISO(order.order_date);
      if (dateFilterType === 'all') return true;
      if (dateFilterType === 'daily') return isToday(orderDate);
      if (dateFilterType === 'weekly') return isThisWeek(orderDate);
      if (dateFilterType === 'weekly-all' && filterMonth) {
        return format(orderDate, 'yyyy-MM') === filterMonth;
      }
      if (dateFilterType === 'month' && filterMonth) {
        return format(orderDate, 'yyyy-MM') === filterMonth;
      }
      return true;
    });
  }, [allOrders, dateFilterType, filterMonth]);

  // Build list of available months from order data
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    allOrders.forEach(order => {
      monthSet.add(format(parseISO(order.order_date), 'yyyy-MM'));
    });
    // Also ensure current month is always in the list
    monthSet.add(format(new Date(), 'yyyy-MM'));
    
    // Sort descending (newest first)
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [allOrders]);

  // Format yyyy-MM to readable month name
  const formatMonthLabel = (ym) => {
    const [year, month] = ym.split('-').map(Number);
    return format(new Date(year, month - 1), 'MMMM yyyy');
  };

  // Get last month value
  const lastMonthValue = useMemo(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return format(lastMonth, 'yyyy-MM');
  }, []);

  // Handle month dropdown change
  const handleMonthSelect = (value) => {
    if (value === 'last-month') {
      setFilterMonth(lastMonthValue);
      setDateFilterType('month');
    } else {
      setFilterMonth(value);
      setDateFilterType('month');
    }
  };

  // Get group key for an order based on date filter type
  const getGroupKey = (orderDate) => {
    if (dateFilterType === 'daily') {
      const hour = getHours(orderDate);
      return format(new Date(orderDate).setHours(hour, 0, 0, 0), 'ha');
    } else if (dateFilterType === 'weekly') {
      return format(orderDate, 'EEE');
    } else if (dateFilterType === 'weekly-all') {
      const day = getDate(orderDate);
      const weekNum = Math.ceil(day / 7);
      return `Week ${weekNum}`;
    } else if (dateFilterType === 'all') {
      return format(orderDate, 'MMM yyyy');
    } else {
      return format(orderDate, 'MMM dd');
    }
  };

  // Pre-generate all expected time slots so line/area charts always have points to connect
  // Returns [{name, sortKey}] for every expected time slot so charts always have points
  const getEmptySlots = () => {
    const slots = [];
    if (dateFilterType === 'weekly-all' && filterMonth) {
      const [year, month] = filterMonth.split('-').map(Number);
      const daysInMonth = getDaysInMonth(new Date(year, month - 1));
      const totalWeeks = Math.ceil(daysInMonth / 7);
      for (let w = 1; w <= totalWeeks; w++) {
        slots.push({ name: `Week ${w}`, sortKey: w });
      }
    } else if (dateFilterType === 'weekly') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      days.forEach((d, i) => slots.push({ name: d, sortKey: i + 1 }));
    } else if (dateFilterType === 'daily') {
      for (let h = 6; h <= 23; h++) {
        const isPM = h >= 12;
        let display = h % 12;
        if (display === 0) display = 12;
        slots.push({ name: `${display}${isPM ? 'PM' : 'AM'}`, sortKey: h });
      }
    } else if (dateFilterType === 'month' && filterMonth) {
      const [year, month] = filterMonth.split('-').map(Number);
      const daysInMo = getDaysInMonth(new Date(year, month - 1));
      for (let d = 1; d <= daysInMo; d++) {
        const date = new Date(year, month - 1, d);
        slots.push({ name: format(date, 'MMM dd'), sortKey: date.getTime() });
      }
    }
    return slots;
  };

  // ─── STANDARD CHART DATA (all / specific service) ───
  const chartData = useMemo(() => {
    if (serviceFilter === 'compare') return []; // handled separately

    // Seed with all expected time slots (0 values) so line/area charts always connect
    const emptySlots = getEmptySlots();
    const grouped = {};
    emptySlots.forEach(slot => {
      grouped[slot.name] = {
        name: slot.name,
        totalValue: 0,
        uniquePatients: new Set(),
        _sortKey: slot.sortKey
      };
    });

    filteredOrders.forEach(order => {
      const orderDate = parseISO(order.order_date);
      const groupKey = getGroupKey(orderDate);

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          name: groupKey,
          totalValue: 0, 
          uniquePatients: new Set(),
          _sortKey: orderDate.getTime()
        };
      }
      // Keep the earliest real sort key
      if (grouped[groupKey]._sortKey === 0) {
        grouped[groupKey]._sortKey = orderDate.getTime();
      }

      const patientId = order.patients?.id || order.id;

      if (serviceFilter === 'all') {
        grouped[groupKey].totalValue += Number(order.final_total_pkr);
        grouped[groupKey].uniquePatients.add(patientId);
      } else {
        let hasService = false;
        let serviceRevenue = 0;
        
        order.order_items.forEach(item => {
          if (item.service_id === serviceFilter) {
            hasService = true;
            serviceRevenue += Number(item.services?.price_pkr || 0) * item.quantity;
          } else {
            const itemService = servicesList.find(s => s.id === item.service_id);
            if (itemService && itemService.parent_id === serviceFilter) {
              hasService = true;
              serviceRevenue += Number(item.services?.price_pkr || 0) * item.quantity;
            }
          }
        });

        if (hasService) {
          grouped[groupKey].totalValue += serviceRevenue;
          grouped[groupKey].uniquePatients.add(patientId);
        }
      }
    });

    const result = Object.values(grouped).map(group => {
      const dataPoint = { name: group.name, _sortKey: group._sortKey };
      if (metric === 'revenue') {
        dataPoint.Value = group.totalValue;
      } else {
        dataPoint.Value = group.uniquePatients.size;
      }
      return dataPoint;
    });

    // Sorting — pre-filled slots maintain order naturally for known slot types
    if (dateFilterType === 'weekly') {
      const dayOrder = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
      result.sort((a, b) => dayOrder[a.name] - dayOrder[b.name]);
    } else if (dateFilterType === 'daily') {
       result.sort((a, b) => {
         const getH = (str) => {
           const isPM = str.includes('PM');
           let h = parseInt(str.replace(/AM|PM/g, ''));
           if (isPM && h !== 12) h += 12;
           if (!isPM && h === 12) h = 0;
           return h;
         };
         return getH(a.name) - getH(b.name);
       });
    } else if (dateFilterType === 'weekly-all') {
      result.sort((a, b) => {
        const weekA = parseInt(a.name.replace('Week ', ''));
        const weekB = parseInt(b.name.replace('Week ', ''));
        return weekA - weekB;
      });
    } else {
      result.sort((a, b) => a._sortKey - b._sortKey);
    }
    
    return result;
  }, [filteredOrders, dateFilterType, filterMonth, serviceFilter, metric, servicesList]);

  // ─── COMPARE SERVICES CHART DATA (multi-line) ───
  const compareChartData = useMemo(() => {
    if (serviceFilter !== 'compare') return { data: [], serviceKeys: [] };

    // Step 1: Calculate total revenue per parent category to find top 8
    const categoryTotals = {};
    filteredOrders.forEach(order => {
      if (!order.order_items) return;
      order.order_items.forEach(item => {
        const parent = getParentCategory(item.service_id);
        if (!parent) return;
        const rev = Number(item.services?.price_pkr || 0) * item.quantity;
        categoryTotals[parent.id] = (categoryTotals[parent.id] || 0) + rev;
      });
    });

    // Get top 8 categories by revenue
    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([id]) => id);

    const topCategorySet = new Set(topCategories);

    // Build service keys (names) for rendering lines
    const serviceKeys = topCategories.map(id => parentServicesMap[id]?.service_name).filter(Boolean);

    // Step 2: Pre-fill all time slots with 0 for every service so lines always connect
    const emptySlots = getEmptySlots();
    const grouped = {};
    emptySlots.forEach(slot => {
      const entry = { name: slot.name, _sortKey: slot.sortKey };
      serviceKeys.forEach(key => { entry[key] = 0; });
      grouped[slot.name] = entry;
    });

    filteredOrders.forEach(order => {
      const orderDate = parseISO(order.order_date);
      const groupKey = getGroupKey(orderDate);

      if (!grouped[groupKey]) {
        const entry = { name: groupKey, _sortKey: orderDate.getTime() };
        serviceKeys.forEach(key => { entry[key] = 0; });
        grouped[groupKey] = entry;
      }
      if (grouped[groupKey]._sortKey === 0) {
        grouped[groupKey]._sortKey = orderDate.getTime();
      }

      if (!order.order_items) return;
      order.order_items.forEach(item => {
        const parent = getParentCategory(item.service_id);
        if (!parent || !topCategorySet.has(parent.id)) return;

        const safeName = parent.service_name;
        const rev = Number(item.services?.price_pkr || 0) * item.quantity;
        grouped[groupKey][safeName] = (grouped[groupKey][safeName] || 0) + rev;
      });
    });

    const result = Object.values(grouped);

    // Sort
    if (dateFilterType === 'weekly') {
      const dayOrder = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
      result.sort((a, b) => dayOrder[a.name] - dayOrder[b.name]);
    } else if (dateFilterType === 'daily') {
       result.sort((a, b) => {
         const getH = (str) => {
           const isPM = str.includes('PM');
           let h = parseInt(str.replace(/AM|PM/g, ''));
           if (isPM && h !== 12) h += 12;
           if (!isPM && h === 12) h = 0;
           return h;
         };
         return getH(a.name) - getH(b.name);
       });
    } else if (dateFilterType === 'weekly-all') {
      result.sort((a, b) => {
        const weekA = parseInt(a.name.replace('Week ', ''));
        const weekB = parseInt(b.name.replace('Week ', ''));
        return weekA - weekB;
      });
    } else {
      result.sort((a, b) => a._sortKey - b._sortKey);
    }

    return { data: result, serviceKeys };
  }, [filteredOrders, serviceFilter, dateFilterType, parentServicesMap, servicesList]);

  // ─── BEST DAY & BEST WEEK INSIGHTS ───
  const insights = useMemo(() => {
    // Best Day: find the single calendar day with highest revenue
    const dailyRevenue = {};
    filteredOrders.forEach(order => {
      const dayKey = format(parseISO(order.order_date), 'yyyy-MM-dd');
      dailyRevenue[dayKey] = (dailyRevenue[dayKey] || 0) + Number(order.final_total_pkr);
    });

    let bestDay = { date: '-', revenue: 0 };
    Object.entries(dailyRevenue).forEach(([date, rev]) => {
      if (rev > bestDay.revenue) {
        bestDay = { date, revenue: rev };
      }
    });
    if (bestDay.date !== '-') {
      bestDay.dateFormatted = format(parseISO(bestDay.date), 'EEE, MMM dd yyyy');
    } else {
      bestDay.dateFormatted = '-';
    }

    // Best Week: group by week number within the data
    const weeklyRevenue = {};
    filteredOrders.forEach(order => {
      const orderDate = parseISO(order.order_date);
      const monthKey = format(orderDate, 'MMM yyyy');
      const day = getDate(orderDate);
      const weekNum = Math.ceil(day / 7);
      const weekKey = `Week ${weekNum} — ${monthKey}`;
      weeklyRevenue[weekKey] = (weeklyRevenue[weekKey] || 0) + Number(order.final_total_pkr);
    });

    let bestWeek = { label: '-', revenue: 0 };
    Object.entries(weeklyRevenue).forEach(([label, rev]) => {
      if (rev > bestWeek.revenue) {
        bestWeek = { label, revenue: rev };
      }
    });

    // Total revenue for filtered range
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.final_total_pkr), 0);
    const totalCustomers = filteredOrders.length;

    return { bestDay, bestWeek, totalRevenue, totalCustomers };
  }, [filteredOrders]);

  // Top Services Calculation based on filteredOrders
  const topServices = useMemo(() => {
    const revenueMap = {};
    filteredOrders.forEach(order => {
      if (!order.order_items) return;
      order.order_items.forEach(item => {
        const sId = item.service_id;
        const rev = Number(item.services?.price_pkr || 0) * item.quantity;
        revenueMap[sId] = (revenueMap[sId] || 0) + rev;
      });
    });

    const sorted = Object.entries(revenueMap)
      .map(([id, rev]) => {
        const s = servicesList.find(x => x.id === id);
        return {
          id,
          name: s ? s.service_name : 'Unknown Service',
          revenue: rev
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);
      
    // Pad to 4 boxes if not enough data
    while(sorted.length < 4) {
      sorted.push({ id: `empty-${sorted.length}`, name: '-', revenue: 0 });
    }

    return sorted;
  }, [filteredOrders, servicesList]);

  const yAxisFormatter = (value) => {
    if (metric === 'revenue') {
      if (value >= 1000000) return `Rs ${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `Rs ${(value / 1000).toFixed(0)}k`;
      return `Rs ${value}`;
    }
    return value;
  };

  const tooltipFormatter = (value, name) => {
    if (metric === 'revenue') return [`Rs ${Number(value).toLocaleString()}`, name];
    return [value, name];
  };

  const isCompareMode = serviceFilter === 'compare';
  const activeChartData = isCompareMode ? compareChartData.data : chartData;

  if (isLoading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="analytics-loader">
          <div className="loader-spinner"></div>
          <span>Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-layout">
      {/* ── Top Header & Unified Timeframe Controls ── */}
      <div className="mb-4">
        <div className="top-services-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-main)' }}>Top 4 Services Earned</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="time-filters">
              <button className={`filter-btn ${dateFilterType === 'all' ? 'active' : ''}`} onClick={() => setDateFilterType('all')}>All Time</button>
              <button className={`filter-btn ${dateFilterType === 'daily' ? 'active' : ''}`} onClick={() => setDateFilterType('daily')}>Today</button>
              <button className={`filter-btn ${dateFilterType === 'weekly' ? 'active' : ''}`} onClick={() => setDateFilterType('weekly')}>This Week</button>
              <button className={`filter-btn ${dateFilterType === 'weekly-all' ? 'active' : ''}`} onClick={() => setDateFilterType('weekly-all')}>Weekly</button>
            </div>

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
        
        <div className="stats-grid top-services-grid">
          {topServices.map((ts, i) => (
            <div key={ts.id} className="stat-card">
              <div className="stat-rank" style={{ backgroundColor: COLORS[i] || COLORS[0] }}>
                #{i + 1}
              </div>
              <div className="stat-details">
                <span className="stat-label" style={{ fontSize: '0.875rem' }}>{ts.name}</span>
                <span className="stat-value" style={{ color: COLORS[i] || 'var(--primary)', fontSize: '1.25rem' }}>
                  Rs {ts.revenue.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Insight Cards (Best Day / Best Week / Totals) ── */}
      <div className="insights-grid">
        <div className="insight-card insight-revenue">
          <div className="insight-icon">
            <TrendingUp size={20} />
          </div>
          <div className="insight-content">
            <span className="insight-label">
              {metric === 'revenue' ? 'Total Revenue' : 'Total Customers'}
            </span>
            <span className="insight-value">
              {metric === 'revenue' 
                ? `Rs ${insights.totalRevenue.toLocaleString()}` 
                : insights.totalCustomers.toLocaleString()
              }
            </span>
          </div>
        </div>

        <div className="insight-card insight-best-day">
          <div className="insight-icon best-day-icon">
            <Award size={20} />
          </div>
          <div className="insight-content">
            <span className="insight-label">Best Day</span>
            <span className="insight-value-sm">{insights.bestDay.dateFormatted}</span>
            <span className="insight-sub">Rs {insights.bestDay.revenue.toLocaleString()}</span>
          </div>
        </div>

        <div className="insight-card insight-best-week">
          <div className="insight-icon best-week-icon">
            <Zap size={20} />
          </div>
          <div className="insight-content">
            <span className="insight-label">Best Week</span>
            <span className="insight-value-sm">{insights.bestWeek.label}</span>
            <span className="insight-sub">Rs {insights.bestWeek.revenue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="analytics-controls">

        {/* Metric (Y-Axis) */}
        <div className="filter-group">
          <label className="filter-label"><BarChart3 size={14}/> Metric</label>
          <select className="form-control" value={metric} onChange={e => setMetric(e.target.value)} style={{ width: '180px' }}>
            <option value="revenue">Revenue (PKR)</option>
            <option value="customers">Customers Count</option>
          </select>
        </div>

        {/* Services Filter */}
        <div className="filter-group">
          <label className="filter-label"><Filter size={14}/> Service Filter</label>
          <select className="form-control" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} style={{ width: '250px' }}>
            <option value="all">All Services (Total)</option>
            <option value="compare">⚡ Compare All Services</option>
            <optgroup label="Individual Services">
              {servicesList.filter(s => !s.parent_id).map(parentService => (
                <option key={parentService.id} value={parentService.id}>
                  {parentService.service_name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        
        {/* Chart Type */}
        <div className="filter-group">
          <label className="filter-label"><PieChartIcon size={14}/> Chart Type</label>
          <div className="time-filters">
            <button className={`filter-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
            <button className={`filter-btn ${chartType === 'area' ? 'active' : ''}`} onClick={() => setChartType('area')}>Area</button>
            <button className={`filter-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>Bar</button>
          </div>
        </div>

      </div>

      {/* ── Chart ── */}
      <div className="chart-container">
        <div className="chart-header">
          <div className="chart-title">
            {isCompareMode 
              ? `Service Comparison — ${metric === 'revenue' ? 'Revenue' : 'Customers'}`
              : `${metric === 'revenue' ? 'Revenue' : 'Customers'} Over Time`
            }
          </div>
          {isCompareMode && (
            <div className="chart-subtitle">
              Top {compareChartData.serviceKeys.length} service categories by revenue
            </div>
          )}
        </div>
        <div className="chart-wrapper">
          {activeChartData.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
              No data available for the selected filters.
            </div>
          ) : isCompareMode ? (
            /* ── COMPARE MODE: Multi-line / Multi-bar chart ── */
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={compareChartData.data} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  {compareChartData.serviceKeys.map((key, i) => (
                    <Bar 
                      key={key} 
                      dataKey={key} 
                      fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} 
                      radius={[4, 4, 0, 0]}
                      stackId={undefined}
                    />
                  ))}
                </BarChart>
              ) : chartType === 'area' ? (
                <AreaChart data={compareChartData.data} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <defs>
                    {compareChartData.serviceKeys.map((key, i) => (
                      <linearGradient key={key} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={SERVICE_COLORS[i % SERVICE_COLORS.length]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={SERVICE_COLORS[i % SERVICE_COLORS.length]} stopOpacity={0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  {compareChartData.serviceKeys.map((key, i) => (
                    <Area 
                      key={key} 
                      type="monotone" 
                      dataKey={key} 
                      stroke={SERVICE_COLORS[i % SERVICE_COLORS.length]} 
                      fill={`url(#gradient-${i})`}
                      strokeWidth={2}
                      connectNulls={true}
                      dot={{r: 3, fill: SERVICE_COLORS[i % SERVICE_COLORS.length]}}
                      activeDot={{r: 5}}
                    />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={compareChartData.data} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  {compareChartData.serviceKeys.map((key, i) => (
                    <Line 
                      key={key} 
                      type="monotone" 
                      dataKey={key} 
                      stroke={SERVICE_COLORS[i % SERVICE_COLORS.length]} 
                      strokeWidth={3} 
                      dot={{r: 4, fill: SERVICE_COLORS[i % SERVICE_COLORS.length]}} 
                      activeDot={{r: 6}}
                      connectNulls={true}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            /* ── STANDARD MODE: Single line/bar/area chart ── */
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : chartType === 'area' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <defs>
                    <linearGradient id="gradient-single" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Area type="monotone" dataKey="Value" stroke="var(--primary)" fill="url(#gradient-single)" strokeWidth={3} connectNulls={true} dot={{r: 3, fill: 'var(--primary)'}} activeDot={{r: 5}} />
                </AreaChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)', fontSize: 12}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" dataKey="Value" stroke="var(--primary)" strokeWidth={3} dot={{r: 4, fill: 'var(--primary)'}} activeDot={{r: 6}} connectNulls={true} />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
