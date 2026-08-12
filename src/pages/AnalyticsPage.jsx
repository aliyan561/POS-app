import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { Calendar, Filter, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { 
  format, parseISO, isWithinInterval, startOfDay, endOfDay, 
  isToday, isThisWeek, startOfWeek, addDays, getHours 
} from 'date-fns';
import './AnalyticsPage.css';

const COLORS = [
  '#1d4ed8', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

export default function AnalyticsPage() {
  const [allOrders, setAllOrders] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [dateFilterType, setDateFilterType] = useState('month'); // all, daily, weekly, month, custom
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  const [serviceFilter, setServiceFilter] = useState('all'); // all, comparison, or specific service id
  const [metric, setMetric] = useState('revenue'); // revenue, customers
  const [chartType, setChartType] = useState('bar'); // bar, line
  
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


  const chartData = useMemo(() => {
    // 1. Filter orders by date
    const filteredOrders = allOrders.filter(order => {
      const orderDate = parseISO(order.order_date);
      if (dateFilterType === 'all') return true;
      if (dateFilterType === 'daily') return isToday(orderDate);
      if (dateFilterType === 'weekly') return isThisWeek(orderDate);
      if (dateFilterType === 'month' && filterMonth) {
        return format(orderDate, 'yyyy-MM') === filterMonth;
      }
      if (dateFilterType === 'custom' && filterStartDate && filterEndDate) {
        const start = startOfDay(parseISO(filterStartDate));
        const end = endOfDay(parseISO(filterEndDate));
        return isWithinInterval(orderDate, { start, end });
      }
      return true;
    });

    // 2. Group data
    const grouped = {};

    filteredOrders.forEach(order => {
      const orderDate = parseISO(order.order_date);
      let groupKey = '';

      if (dateFilterType === 'daily') {
        const hour = getHours(orderDate);
        groupKey = format(orderDate.setHours(hour, 0, 0, 0), 'ha'); // e.g. 10AM
      } else if (dateFilterType === 'weekly') {
        groupKey = format(orderDate, 'EEE'); // Mon, Tue, Wed
      } else if (dateFilterType === 'all') {
        groupKey = format(orderDate, 'MMM yyyy'); // Jan 2024
      } else {
        groupKey = format(orderDate, 'MMM dd'); // Jan 05
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          name: groupKey,
          totalValue: 0, 
          uniquePatients: new Set() 
        };
      }

      // Process metrics for this order
      const patientId = order.patients?.id || order.id; // Fallback to order id if no patient

      if (serviceFilter === 'all') {
        grouped[groupKey].totalValue += Number(order.final_total_pkr);
        grouped[groupKey].uniquePatients.add(patientId);
      } else {
        // Specific service filter
        let hasService = false;
        let serviceRevenue = 0;
        
        order.order_items.forEach(item => {
          if (item.service_id === serviceFilter) {
            hasService = true;
            serviceRevenue += Number(item.services?.price_pkr || 0) * item.quantity;
          } else {
            // Check if item's service is a child of the selected parent filter
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

    // 3. Transform for Recharts
    const result = Object.values(grouped).map(group => {
      const dataPoint = { name: group.name };
      
      if (metric === 'revenue') {
        dataPoint.Value = group.totalValue;
      } else {
        dataPoint.Value = group.uniquePatients.size;
      }
      return dataPoint;
    });

    // Optionally sort by date logic here, but since filteredOrders is ascending, 
    // the keys might be ordered organically depending on object insertion order.
    // For 'weekly' we might need specific sorting to ensure Mon->Sun.
    if (dateFilterType === 'weekly') {
      const dayOrder = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
      result.sort((a, b) => dayOrder[a.name] - dayOrder[b.name]);
    }
    
    // For daily, sort by hour
    if (dateFilterType === 'daily') {
       result.sort((a, b) => {
         // Convert 10AM to 10, 2PM to 14
         const getH = (str) => {
           const isPM = str.includes('PM');
           let h = parseInt(str.replace(/AM|PM/g, ''));
           if (isPM && h !== 12) h += 12;
           if (!isPM && h === 12) h = 0;
           return h;
         };
         return getH(a.name) - getH(b.name);
       });
    }

    return result;
  }, [allOrders, dateFilterType, filterMonth, filterStartDate, filterEndDate, serviceFilter, metric, servicesList]);

  // Top Services Calculation
  const topServices = useMemo(() => {
    const filtered = allOrders.filter(order => {
      const d = parseISO(order.order_date);
      if (topServicesFilter === 'week') return isThisWeek(d);
      return format(d, 'yyyy-MM') === format(new Date(), 'yyyy-MM');
    });

    const revenueMap = {};
    filtered.forEach(order => {
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
  }, [allOrders, topServicesFilter, servicesList]);

  // Calculate totals for summary cards
  const summaryTotals = useMemo(() => {
    let totalRev = 0;
    let totalCust = 0;

    chartData.forEach(point => {
      if (metric === 'revenue') totalRev += point.Value || 0;
      else totalCust += point.Value || 0;
    });

    return { revenue: totalRev, customers: totalCust };
  }, [chartData, metric]);

  const yAxisFormatter = (value) => {
    if (metric === 'revenue') {
      if (value >= 1000) return `Rs ${value / 1000}k`;
      return `Rs ${value}`;
    }
    return value;
  };

  const tooltipFormatter = (value, name) => {
    if (metric === 'revenue') return [`Rs ${value.toLocaleString()}`, name];
    return [value, name];
  };

  if (isLoading) {
    return <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>Loading...</div>;
  }

  return (
    <div className="analytics-layout">
      {/* Top Services Section */}
      <div className="mb-4">
        <div className="top-services-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-main)' }}>Top 4 Services Earned</h3>
          <div className="time-filters">
            <button 
              className={`filter-btn ${topServicesFilter === 'week' ? 'active' : ''}`} 
              onClick={() => setTopServicesFilter('week')}
            >
              This Week
            </button>
            <button 
              className={`filter-btn ${topServicesFilter === 'month' ? 'active' : ''}`} 
              onClick={() => setTopServicesFilter('month')}
            >
              This Month
            </button>
          </div>
        </div>
        
        <div className="stats-grid top-services-grid">
          {topServices.map((ts, i) => (
            <div key={ts.id} className="stat-card">
              <div className="stat-details">
                <span className="stat-label" style={{ fontSize: '0.875rem' }}>#{i + 1} {ts.name}</span>
                <span className="stat-value" style={{ color: 'var(--primary)', fontSize: '1.25rem' }}>
                  Rs {ts.revenue.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="analytics-controls">
        
        {/* Timeframe */}
        <div className="filter-group">
          <label className="filter-label"><Calendar size={14}/> Timeframe</label>
          <div className="time-filters">
            <button className={`filter-btn ${dateFilterType === 'all' ? 'active' : ''}`} onClick={() => setDateFilterType('all')}>All Time</button>
            <button className={`filter-btn ${dateFilterType === 'daily' ? 'active' : ''}`} onClick={() => setDateFilterType('daily')}>Daily</button>
            <button className={`filter-btn ${dateFilterType === 'weekly' ? 'active' : ''}`} onClick={() => setDateFilterType('weekly')}>Weekly</button>
            <button className={`filter-btn ${dateFilterType === 'month' ? 'active' : ''}`} onClick={() => setDateFilterType('month')}>Monthly</button>
            <button className={`filter-btn ${dateFilterType === 'custom' ? 'active' : ''}`} onClick={() => setDateFilterType('custom')}>Custom</button>
          </div>
          
          {dateFilterType === 'month' && (
            <input type="month" className="form-control" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{marginTop: '0.5rem'}}/>
          )}

          {dateFilterType === 'custom' && (
            <div style={{display: 'flex', gap: '0.5rem', marginTop: '0.5rem'}}>
              <input type="date" className="form-control" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)}/>
              <input type="date" className="form-control" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)}/>
            </div>
          )}
        </div>

        {/* Metric (Y-Axis) */}
        <div className="filter-group">
          <label className="filter-label"><BarChart3 size={14}/> Metric (Y-Axis)</label>
          <select className="form-control" value={metric} onChange={e => setMetric(e.target.value)} style={{ width: '180px' }}>
            <option value="revenue">Price Earned (Revenue)</option>
            <option value="customers">Customers Count</option>
          </select>
        </div>

        {/* Services */}
        <div className="filter-group">
          <label className="filter-label"><Filter size={14}/> Service Filter</label>
          <select className="form-control" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} style={{ width: '250px' }}>
            <option value="all">All Services Total</option>
            <optgroup label="Specific Services">
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
            <button className={`filter-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>Bar</button>
            <button className={`filter-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>Line</button>
          </div>
        </div>

      </div>

      {/* Summary Cards */}
      <div className="analytics-summary">
        <div className="summary-card">
          <div className="summary-label">
            {metric === 'revenue' ? 'Total Revenue (Filtered)' : 'Total Customers (Filtered)'}
          </div>
          <div className="summary-value">
            {metric === 'revenue' ? `Rs ${summaryTotals.revenue.toLocaleString()}` : summaryTotals.customers.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-container">
        <div className="chart-header">
          <div className="chart-title">
            {metric === 'revenue' ? 'Revenue' : 'Customers'} Over Time 
          </div>
        </div>
        <div className="chart-wrapper">
          {chartData.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
              No data available for the selected filters.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)'}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)'}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{fill: 'var(--text-muted)'}} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tickFormatter={yAxisFormatter} tick={{fill: 'var(--text-muted)'}} axisLine={false} tickLine={false} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
                    formatter={tooltipFormatter}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" dataKey="Value" stroke="var(--primary)" strokeWidth={3} dot={{r: 4, fill: 'var(--primary)'}} activeDot={{r: 6}} />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
