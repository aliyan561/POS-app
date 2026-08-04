import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { TrendingUp, Users, Calendar, Search, X, Filter } from 'lucide-react';
import './DashboardPage.css';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, isToday, isThisWeek } from 'date-fns';

export default function DashboardPage() {
  const [allOrders, setAllOrders] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters state
  const [dateFilterType, setDateFilterType] = useState('all'); // all, month, custom
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  const [serviceFilter, setServiceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setIsLoading(true);
    
    // Fetch orders with order_items
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        order_date,
        final_total_pkr,
        discount_applied_pkr,
        patients (
          name,
          phone_number,
          visit_description,
          age,
          gender,
          referred_by
        ),
        order_items (
          quantity,
          service_id,
          services (
            price_pkr
          )
        )
      `)
      .order('order_date', { ascending: false });

    // Fetch services for dropdown
    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .order('service_name', { ascending: true });

    if (ordersError) console.error("Error fetching dashboard data:", ordersError);
    else if (ordersData) setAllOrders(ordersData);

    if (servicesData) setServicesList(servicesData);
    
    setIsLoading(false);
  }

  const filteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      const orderDate = parseISO(order.order_date);
      
      // 1. Apply Date Filter
      let passesDate = true;
      if (dateFilterType === 'daily') {
        passesDate = isToday(orderDate);
      } else if (dateFilterType === 'weekly') {
        passesDate = isThisWeek(orderDate);
      } else if (dateFilterType === 'month' && filterMonth) {
        const orderMonth = format(orderDate, 'yyyy-MM');
        passesDate = orderMonth === filterMonth;
      } else if (dateFilterType === 'custom' && filterStartDate && filterEndDate) {
        const start = startOfDay(parseISO(filterStartDate));
        const end = endOfDay(parseISO(filterEndDate));
        passesDate = isWithinInterval(orderDate, { start, end });
      }

      // 2. Apply Service Filter
      let passesService = true;
      if (serviceFilter) {
        passesService = order.order_items.some(item => {
          if (item.service_id === serviceFilter) return true;
          // Check if item's service is a child of the selected parent filter
          const itemService = servicesList.find(s => s.id === item.service_id);
          return itemService && itemService.parent_id === serviceFilter;
        });
      }

      // 3. Apply Search Query
      let passesSearch = true;
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const name = order.patients?.name?.toLowerCase() || '';
        const phone = order.patients?.phone_number?.toLowerCase() || '';
        const shortId = order.id.substring(0, 8).toLowerCase();
        passesSearch = name.includes(query) || phone.includes(query) || shortId.includes(query);
      }

      return passesDate && passesService && passesSearch;
    });
  }, [allOrders, dateFilterType, filterMonth, filterStartDate, filterEndDate, serviceFilter, searchQuery]);

  // Calculate stats based on filters
  const totalRevenue = filteredOrders.reduce((sum, order) => {
    // If no service filter, just add the final total of the order
    if (!serviceFilter) return sum + Number(order.final_total_pkr);
    
    // If filtering by service, ONLY sum the price of that specific service (and its children)
    const matchingItems = order.order_items.filter(item => {
      if (item.service_id === serviceFilter) return true;
      const itemService = servicesList.find(s => s.id === item.service_id);
      return itemService && itemService.parent_id === serviceFilter;
    });
    
    const serviceTotal = matchingItems.reduce((s, item) => s + (Number(item.services?.price_pkr || 0) * item.quantity), 0);
    return sum + serviceTotal;
  }, 0);

  const totalPatients = filteredOrders.length;

  const handlePatientClick = async (order) => {
    setSelectedOrder(order);
    setIsModalLoading(true);
    
    const { data, error } = await supabase
      .from('order_items')
      .select(`
        quantity,
        services (
          service_name,
          price_pkr
        )
      `)
      .eq('order_id', order.id);

    if (error) {
      console.error("Error fetching order items:", error);
      setOrderItems([]);
    } else if (data) {
      setOrderItems(data);
    }
    
    setIsModalLoading(false);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setOrderItems([]);
  };

  return (
    <div className="dashboard-layout">
      {/* Top Controls: Advanced Filters */}
      <div className="dashboard-controls-advanced mb-4">
        
        {/* Date Filters */}
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

        {/* Service Filter */}
        <div className="filter-group">
          <label className="filter-label"><Filter size={14}/> Filter by Service</label>
          <select 
            className="form-control" 
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            style={{ width: '250px' }}
          >
            <option value="">All Services</option>
            {servicesList.filter(s => !s.parent_id).map(parentService => {
              const children = servicesList.filter(s => s.parent_id === parentService.id);
              
              if (children.length > 0) {
                return (
                  <optgroup key={parentService.id} label={parentService.service_name}>
                    <option value={parentService.id}>All {parentService.service_name}</option>
                    {children.map(child => (
                      <option key={child.id} value={child.id}>
                        {child.service_name}
                      </option>
                    ))}
                  </optgroup>
                );
              } else {
                return (
                  <option key={parentService.id} value={parentService.id}>
                    {parentService.service_name}
                  </option>
                );
              }
            })}
          </select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="stats-grid mb-4">
        <div className="stat-card">
          <div className="stat-icon bg-blue-100 text-blue-600">
            <TrendingUp size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">
              {serviceFilter ? 'Service Revenue' : 'Total Revenue'}
            </span>
            <span className="stat-value">Rs {totalRevenue.toLocaleString()}</span>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon bg-green-100 text-green-600">
            <Users size={24} />
          </div>
          <div className="stat-details">
            <span className="stat-label">Total Visits</span>
            <span className="stat-value">{totalPatients}</span>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="card flex-1" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header flex-between">
          <span>Patient History</span>
          
          {/* Search Bar & Refresh */}
          <div className="table-actions">
            <div className="search-bar">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search by name or phone..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="btn btn-outline" onClick={fetchDashboardData}>
              Refresh
            </button>
          </div>
        </div>
        
        <div className="card-body p-0" style={{ overflowY: 'auto' }}>
          {isLoading ? (
            <div className="skeleton-table">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton-row">
                  <div className="skeleton-cell skeleton-w-20"></div>
                  <div className="skeleton-cell skeleton-w-20"></div>
                  <div className="skeleton-cell skeleton-w-20"></div>
                  <div className="skeleton-cell skeleton-w-30"></div>
                  <div className="skeleton-cell skeleton-w-10"></div>
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state">No records found.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Receipt #</th>
                    <th>Patient Name</th>
                    <th>Visit Description</th>
                    <th className="text-right">Order Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => (
                    <tr key={order.id}>
                      <td>
                        <div className="date-cell">
                          <Calendar size={14} className="text-muted" />
                          {format(parseISO(order.order_date), 'MMM dd, yyyy - hh:mm a')}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {order.id.substring(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="patient-name-btn"
                          onClick={() => handlePatientClick(order)}
                        >
                          {order.patients?.name || 'Unknown'}
                        </button>
                        {order.patients?.phone_number && (
                          <div className="text-muted" style={{fontSize: '0.8rem', marginTop: '4px'}}>
                            {order.patients.phone_number}
                          </div>
                        )}
                      </td>
                      <td className="text-muted max-w-xs truncate" title={order.patients?.visit_description}>
                        {order.patients?.visit_description || '-'}
                      </td>
                      <td className="text-right font-semibold text-primary">
                        Rs {order.final_total_pkr}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Visit Details</h2>
              <button className="close-btn" onClick={closeModal}><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              <div className="patient-summary">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ marginBottom: '4px' }}>{selectedOrder.patients?.name || 'Unknown'}</h3>
                    <p className="text-muted" style={{ marginBottom: '4px' }}>
                      {format(parseISO(selectedOrder.order_date), 'MMMM dd, yyyy - hh:mm a')}
                    </p>
                    {selectedOrder.patients?.phone_number && <p className="text-muted" style={{ marginBottom: 0 }}>{selectedOrder.patients.phone_number}</p>}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.9rem' }}>
                    {selectedOrder.patients?.age && <div className="text-muted" style={{ marginBottom: '4px' }}>Age: <strong style={{ color: 'var(--text-main)' }}>{selectedOrder.patients.age}</strong></div>}
                    {selectedOrder.patients?.gender && <div className="text-muted" style={{ marginBottom: '4px' }}>Sex: <strong style={{ color: 'var(--text-main)' }}>{selectedOrder.patients.gender}</strong></div>}
                    {selectedOrder.patients?.referred_by && <div className="text-muted" style={{ marginBottom: '4px' }}>Ref: <strong style={{ color: 'var(--text-main)' }}>{selectedOrder.patients.referred_by}</strong></div>}
                  </div>
                </div>
                
                {selectedOrder.patients?.visit_description && (
                  <p className="visit-desc" style={{ marginTop: '0.75rem' }}>"{selectedOrder.patients.visit_description}"</p>
                )}
              </div>

              <div className="services-list">
                <h4>Services Rendered</h4>
                {isModalLoading ? (
                  <p className="text-muted text-center py-4">Loading services...</p>
                ) : orderItems.length === 0 ? (
                  <p className="text-muted text-center py-4">No services found.</p>
                ) : (
                  <ul className="items-ul">
                    {orderItems.map((item, idx) => (
                      <li key={idx} className="item-li">
                        <div className="item-li-info">
                          <span className="item-li-name">{item.services.service_name}</span>
                          <span className="item-li-qty">x{item.quantity}</span>
                        </div>
                        <span className="item-li-price">Rs {item.services.price_pkr * item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="order-totals">
                <div className="totals-row">
                  <span>Subtotal</span>
                  <span>Rs {Number(selectedOrder.final_total_pkr) + Number(selectedOrder.discount_applied_pkr)}</span>
                </div>
                <div className="totals-row text-danger">
                  <span>Discount</span>
                  <span>- Rs {selectedOrder.discount_applied_pkr}</span>
                </div>
                <div className="totals-row grand-total">
                  <span>Final Total</span>
                  <span className="text-primary">Rs {selectedOrder.final_total_pkr}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
