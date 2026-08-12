import { useState, useEffect, useMemo, Fragment } from 'react';
import { supabase } from '../supabase';
import { TrendingUp, Users, Calendar, Search, X, Filter, Edit, Check } from 'lucide-react';
import './DashboardPage.css';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, isToday, isThisWeek } from 'date-fns';
import { useAuth } from '../AuthContext';

export default function DashboardPage() {
  const { role, user } = useAuth();
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
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone_number: '',
    visit_description: '',
    age: '',
    gender: '',
    referred_by: '',
    final_total_pkr: 0,
    discount_applied_pkr: 0,
    injections_cost_pkr: 0,
    commission_pkr: 0,
    reporting_cost_pkr: 0
  });

  // Deletion State
  const [isDeleting, setIsDeleting] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [isOtpSubmitting, setIsOtpSubmitting] = useState(false);

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
        injections_cost_pkr,
        commission_pkr,
        reporting_cost_pkr,
        patients (
          id,
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
    setIsEditing(false);
    setEditForm({
      name: order.patients?.name || '',
      phone_number: order.patients?.phone_number || '',
      visit_description: order.patients?.visit_description || '',
      age: order.patients?.age || '',
      gender: order.patients?.gender || '',
      referred_by: order.patients?.referred_by || '',
      final_total_pkr: order.final_total_pkr || 0,
      discount_applied_pkr: order.discount_applied_pkr || 0,
      injections_cost_pkr: order.injections_cost_pkr || 0,
      commission_pkr: order.commission_pkr || 0,
      reporting_cost_pkr: order.reporting_cost_pkr || 0
    });
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
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrder?.patients?.id || !selectedOrder?.id) return;
    
    try {
      const patientUpdate = {
        name: editForm.name,
        phone_number: editForm.phone_number,
        visit_description: editForm.visit_description,
        age: editForm.age,
        gender: editForm.gender,
        referred_by: editForm.referred_by
      };

      const orderUpdate = {
        final_total_pkr: editForm.final_total_pkr,
        discount_applied_pkr: editForm.discount_applied_pkr,
        injections_cost_pkr: editForm.injections_cost_pkr,
        commission_pkr: editForm.commission_pkr,
        reporting_cost_pkr: editForm.reporting_cost_pkr
      };

      const { error: patientError } = await supabase
        .from('patients')
        .update(patientUpdate)
        .eq('id', selectedOrder.patients.id);
        
      if (patientError) throw patientError;

      const { error: orderError } = await supabase
        .from('orders')
        .update(orderUpdate)
        .eq('id', selectedOrder.id);
        
      if (orderError) throw orderError;
      
      // Update local state
      setAllOrders(prev => prev.map(o => {
        if (o.id === selectedOrder.id) {
          return {
            ...o,
            ...orderUpdate,
            patients: {
              ...o.patients,
              ...patientUpdate
            }
          };
        }
        return o;
      }));
      
      // Update selected order view
      setSelectedOrder(prev => ({
        ...prev,
        ...orderUpdate,
        patients: {
          ...prev.patients,
          ...patientUpdate
        }
      }));
      
      setIsEditing(false);
    } catch (err) {
      console.error("Error updating record:", err);
      alert("Failed to update record.");
    }
  };

  const handleExpenseChange = async (orderId, field, value) => {
    const numValue = Number(value) || 0;
    
    // Update database directly (state is already optimistically updated via onChange)
    try {
      const { error } = await supabase
        .from('orders')
        .update({ [field]: numValue })
        .eq('id', orderId);
        
      if (error) throw error;
      
      // Update state to strict number after successful save
      setAllOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          return { ...o, [field]: numValue };
        }
        return o;
      }));
    } catch (err) {
      console.error("Failed to update expense:", err);
      alert("Failed to save expense.");
    }
  };

  const handleDeleteClick = async () => {
    if (role === 'admin') {
      if (window.confirm("Are you sure you want to permanently delete this patient and their order?")) {
        await directDelete();
      }
    } else {
      // Receptionist: Generate request
      generateOTPRequest();
    }
  };

  const directDelete = async () => {
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.rpc('admin_delete_order', {
        p_order_id: selectedOrder.id
      });
      if (error) throw error;
      
      setAllOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
      closeModal();
    } catch (err) {
      console.error("Direct delete failed:", err);
      alert("Failed to delete record.");
    } finally {
      setIsDeleting(false);
    }
  };

  const generateOTPRequest = async () => {
    setIsDeleting(true);
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase
        .from('deletion_requests')
        .insert([{
          order_id: selectedOrder.id,
          patient_name: selectedOrder.patients?.name || 'Unknown',
          otp_code: otp,
          requested_by: user.id
        }]);
        
      if (error) throw error;
      
      setShowOtpModal(true);
    } catch (err) {
      console.error("Failed to generate OTP request:", err);
      alert("Failed to request deletion authorization.");
    } finally {
      setIsDeleting(false);
    }
  };

  const submitOtp = async () => {
    if (!otpInput) return;
    setIsOtpSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('delete_order_with_otp', {
        p_order_id: selectedOrder.id,
        p_otp_code: otpInput
      });
      
      if (error) {
        if (error.message.includes('Invalid or expired OTP')) {
          alert('Invalid or expired OTP. Please check with the Admin.');
        } else {
          throw error;
        }
      } else {
        setAllOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
        setShowOtpModal(false);
        setOtpInput('');
        closeModal();
      }
    } catch (err) {
      console.error("OTP deletion failed:", err);
      alert("Failed to delete record.");
    } finally {
      setIsOtpSubmitting(false);
    }
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
                    <Fragment key={order.id}>
                      <tr className="main-row">
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
                      <tr className="expenses-row">
                        <td colSpan="5">
                          <div className="expenses-inline-container">
                            <div className="expense-item">
                              <span className="expense-item-label">Injections Cost:</span>
                              <div className="expense-input-wrapper">
                                <span>Rs</span>
                                <input 
                                  type="number" 
                                  min="0"
                                  value={order.injections_cost_pkr === 0 && !order.isEditing_injections ? '' : order.injections_cost_pkr}
                                  placeholder="0"
                                  onChange={(e) => {
                                    let val = e.target.value;
                                    if (Number(val) < 0) val = '0';
                                    setAllOrders(prev => prev.map(o => o.id === order.id ? { ...o, injections_cost_pkr: val, isEditing_injections: true } : o));
                                  }}
                                  onBlur={(e) => {
                                    setAllOrders(prev => prev.map(o => o.id === order.id ? { ...o, isEditing_injections: false } : o));
                                    handleExpenseChange(order.id, 'injections_cost_pkr', e.target.value);
                                  }} 
                                />
                              </div>
                            </div>
                            
                            <div className="expense-item">
                              <span className="expense-item-label">Commission:</span>
                              <div className="expense-input-wrapper">
                                <span>Rs</span>
                                <input 
                                  type="number" 
                                  min="0"
                                  value={order.commission_pkr === 0 && !order.isEditing_commission ? '' : order.commission_pkr}
                                  placeholder="0"
                                  onChange={(e) => {
                                    let val = e.target.value;
                                    if (Number(val) < 0) val = '0';
                                    setAllOrders(prev => prev.map(o => o.id === order.id ? { ...o, commission_pkr: val, isEditing_commission: true } : o));
                                  }}
                                  onBlur={(e) => {
                                    setAllOrders(prev => prev.map(o => o.id === order.id ? { ...o, isEditing_commission: false } : o));
                                    handleExpenseChange(order.id, 'commission_pkr', e.target.value);
                                  }} 
                                />
                              </div>
                            </div>

                            <div className="expense-item">
                              <span className="expense-item-label">Reporting Cost:</span>
                              <div className="expense-input-wrapper">
                                <span>Rs</span>
                                <input 
                                  type="number" 
                                  min="0"
                                  value={order.reporting_cost_pkr === 0 && !order.isEditing_reporting ? '' : order.reporting_cost_pkr}
                                  placeholder="0"
                                  onChange={(e) => {
                                    let val = e.target.value;
                                    if (Number(val) < 0) val = '0';
                                    setAllOrders(prev => prev.map(o => o.id === order.id ? { ...o, reporting_cost_pkr: val, isEditing_reporting: true } : o));
                                  }}
                                  onBlur={(e) => {
                                    setAllOrders(prev => prev.map(o => o.id === order.id ? { ...o, isEditing_reporting: false } : o));
                                    handleExpenseChange(order.id, 'reporting_cost_pkr', e.target.value);
                                  }} 
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
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
              <div className="patient-summary" style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: '8px' }}>
                  {role === 'admin' && (
                    <button 
                      className="btn btn-sm btn-outline" 
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => {
                        if (isEditing) {
                          handleSaveEdit();
                        } else {
                          setIsEditing(true);
                        }
                      }}
                    >
                      {isEditing ? <><Check size={14} /> Save</> : <><Edit size={14} /> Edit</>}
                    </button>
                  )}
                  {!isEditing && (
                    <button 
                      className="btn btn-sm btn-outline" 
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                      onClick={handleDeleteClick}
                      disabled={isDeleting}
                    >
                      <X size={14} /> {isDeleting ? 'Processing...' : 'Delete'}
                    </button>
                  )}
                </div>
                
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '30px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Name</label>
                        <input className="form-control form-control-sm" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Phone</label>
                        <input className="form-control form-control-sm" value={editForm.phone_number} onChange={e => setEditForm({...editForm, phone_number: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Age</label>
                        <input className="form-control form-control-sm" value={editForm.age} onChange={e => setEditForm({...editForm, age: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Gender</label>
                        <select className="form-control form-control-sm" value={editForm.gender} onChange={e => setEditForm({...editForm, gender: e.target.value})}>
                          <option value="">Select</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Referred By</label>
                        <input className="form-control form-control-sm" value={editForm.referred_by} onChange={e => setEditForm({...editForm, referred_by: e.target.value})} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Visit Description</label>
                        <textarea className="form-control form-control-sm" value={editForm.visit_description} onChange={e => setEditForm({...editForm, visit_description: e.target.value})} rows="2" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: role === 'admin' ? '30px' : '0' }}>
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
                  </>
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
                  <span>Rs {isEditing ? (Number(editForm.final_total_pkr) + Number(editForm.discount_applied_pkr)) : (Number(selectedOrder.final_total_pkr) + Number(selectedOrder.discount_applied_pkr))}</span>
                </div>
                <div className="totals-row text-danger">
                  <span>Discount</span>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>- Rs</span>
                      <input type="number" className="form-control form-control-sm" style={{ width: '80px', padding: '2px 5px' }} value={editForm.discount_applied_pkr} onChange={e => setEditForm({...editForm, discount_applied_pkr: e.target.value})} />
                    </div>
                  ) : (
                    <span>- Rs {selectedOrder.discount_applied_pkr}</span>
                  )}
                </div>
                <div className="totals-row grand-total">
                  <span>Final Total</span>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span className="text-primary">Rs</span>
                      <input type="number" className="form-control form-control-sm" style={{ width: '100px', fontWeight: 'bold' }} value={editForm.final_total_pkr} onChange={e => setEditForm({...editForm, final_total_pkr: e.target.value})} />
                    </div>
                  ) : (
                    <span className="text-primary">Rs {selectedOrder.final_total_pkr}</span>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* OTP Modal for Receptionist */}
      {showOtpModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1rem', color: 'var(--danger)' }}>Authorization Required</h2>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
              A deletion request has been sent. Please ask the Admin for the 6-digit Authorization Code to proceed.
            </p>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Enter 6-digit OTP" 
              value={otpInput}
              onChange={e => setOtpInput(e.target.value)}
              style={{ fontSize: '1.25rem', letterSpacing: '0.2em', textAlign: 'center', marginBottom: '1.5rem' }}
              maxLength={6}
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => setShowOtpModal(false)} disabled={isOtpSubmitting}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--danger)' }} onClick={submitOtp} disabled={isOtpSubmitting || otpInput.length < 6}>
                {isOtpSubmitting ? 'Verifying...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
