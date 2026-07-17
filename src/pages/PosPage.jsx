import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Plus, Minus, Trash2, Printer, Edit2, X, ChevronRight } from 'lucide-react';
import './PosPage.css';
import logoImg from '../../assets/with-text-logo.png';
import { useAuth } from '../AuthContext';

export default function PosPage() {
  const { role } = useAuth();
  const [services, setServices] = useState([]);
  const [basket, setBasket] = useState([]);
  const [patient, setPatient] = useState({ name: '', phone_number: '', visit_description: '', age: '', gender: '', referred_by: '' });
  const [phoneError, setPhoneError] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState('amount');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [receiptId, setReceiptId] = useState(null);

  // Service Modals State
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [isEditServiceModalOpen, setIsEditServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({ service_name: '', price_pkr: '', parent_id: '' });
  const [isServiceSubmitting, setIsServiceSubmitting] = useState(false);

  // Sub-type Selection Modal State
  const [subTypeModalOpen, setSubTypeModalOpen] = useState(false);
  const [selectedParentService, setSelectedParentService] = useState(null);

  useEffect(() => {
    fetchServices();
  }, []);

  async function fetchServices() {
    setIsLoadingServices(true);
    const { data, error } = await supabase.from('services').select('*').order('price_pkr', { ascending: true });
    if (data) setServices(data);
    if (error) console.error("Error fetching services:", error);
    setIsLoadingServices(false);
  }

  // Handle reliable printing using effect and requestAnimationFrame
  useEffect(() => {
    if (orderSuccess && receiptId) {
      // Double rAF ensures the browser has finished painting the new state
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print();
          
          setOrderSuccess(false);
          setReceiptId(null);
          setPatient({ name: '', phone_number: '', visit_description: '', age: '', gender: '', referred_by: '' });
          setBasket([]);
          setDiscountValue('');
          setDiscountType('amount');
        });
      });
    }
  }, [orderSuccess, receiptId]);

  const parentServices = services.filter(s => !s.parent_id);

  const handleServiceClick = (service) => {
    const children = services.filter(s => s.parent_id === service.id);
    if (children.length > 0) {
      setSelectedParentService(service);
      setSubTypeModalOpen(true);
    } else {
      addToBasket(service);
    }
  };

  const addToBasket = (service) => {
    setBasket((prev) => {
      const existing = prev.find(item => item.id === service.id);
      if (existing) {
        return prev.map(item => item.id === service.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      // If it has a parent, attach the parent name for the basket UI
      let serviceName = service.service_name;
      if (service.parent_id) {
        const parent = services.find(s => s.id === service.parent_id);
        if (parent) serviceName = `${parent.service_name} (${service.service_name})`;
      }
      return [...prev, { ...service, service_name: serviceName, quantity: 1 }];
    });
    setSubTypeModalOpen(false); // Close modal if open
  };

  const updateQuantity = (id, delta) => {
    setBasket(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }));
  };

  const removeFromBasket = (id) => {
    setBasket(prev => prev.filter(item => item.id !== id));
  };

  // Service Management Logic
  const handleAddServiceSubmit = async (e) => {
    e.preventDefault();
    if (!serviceForm.service_name || !serviceForm.price_pkr) return;
    setIsServiceSubmitting(true);
    
    const insertData = {
      service_name: serviceForm.service_name,
      price_pkr: Number(serviceForm.price_pkr),
      parent_id: serviceForm.parent_id || null
    };

    const { error } = await supabase.from('services').insert([insertData]);

    setIsServiceSubmitting(false);
    if (error) {
      alert("Failed to add service");
      console.error(error);
    } else {
      setIsAddServiceModalOpen(false);
      setServiceForm({ service_name: '', price_pkr: '', parent_id: '' });
      fetchServices();
    }
  };

  const openEditModal = (service, e) => {
    e.stopPropagation();
    setEditingService(service);
    setServiceForm({ 
      service_name: service.service_name, 
      price_pkr: service.price_pkr,
      parent_id: service.parent_id || ''
    });
    setIsEditServiceModalOpen(true);
  };

  const handleEditServiceSubmit = async (e) => {
    e.preventDefault();
    if (!serviceForm.service_name || !serviceForm.price_pkr || !editingService) return;
    setIsServiceSubmitting(true);
    
    const { error } = await supabase.from('services').update({
      service_name: serviceForm.service_name,
      price_pkr: Number(serviceForm.price_pkr),
      parent_id: serviceForm.parent_id || null
    }).eq('id', editingService.id);

    setIsServiceSubmitting(false);
    if (error) {
      alert("Failed to update service");
      console.error(error);
    } else {
      setIsEditServiceModalOpen(false);
      setEditingService(null);
      setServiceForm({ service_name: '', price_pkr: '', parent_id: '' });
      fetchServices();
      
      // Update basket items if edited
      setBasket(prev => prev.map(item => {
        if (item.id === editingService.id) {
          let serviceName = serviceForm.service_name;
          if (serviceForm.parent_id) {
            const parent = services.find(s => s.id === serviceForm.parent_id);
            if (parent) serviceName = `${parent.service_name} (${serviceForm.service_name})`;
          }
          return { ...item, service_name: serviceName, price_pkr: serviceForm.price_pkr };
        }
        return item;
      }));
    }
  };

  const subtotal = basket.reduce((sum, item) => sum + (Number(item.price_pkr) * item.quantity), 0);
  const numericDiscount = Number(discountValue) || 0;
  const discountAmount = discountType === 'percentage' 
    ? (subtotal * (numericDiscount / 100)) 
    : numericDiscount;
  const finalTotal = Math.max(0, Math.round(subtotal - discountAmount));

  const handleCheckout = async () => {
    if (!patient.name || basket.length === 0) return;
    
    // Validate Phone Number if provided
    if (patient.phone_number && !/^03\d{2}-\d{7}$/.test(patient.phone_number)) {
      setPhoneError('Please enter a valid 11-digit mobile number (e.g., 0300-1234567)');
      return;
    }
    setPhoneError('');
    setIsSubmitting(true);

    try {
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .insert([{
          name: patient.name,
          phone_number: patient.phone_number,
          visit_description: patient.visit_description,
          age: patient.age ? Number(patient.age) : null,
          gender: patient.gender || null,
          referred_by: patient.referred_by || null
        }])
        .select()
        .single();

      if (patientError) throw patientError;

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{
          patient_id: patientData.id,
          discount_applied_pkr: Math.round(discountAmount),
          final_total_pkr: finalTotal
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = basket.map(item => ({
        order_id: orderData.id,
        service_id: item.id,
        quantity: item.quantity
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) {
        // Rollback: delete order and patient to prevent ghost records
        await supabase.from('orders').delete().eq('id', orderData.id);
        await supabase.from('patients').delete().eq('id', patientData.id);
        throw itemsError;
      }

      const generatedReceiptId = orderData.id.substring(0, 8).toUpperCase();
      setReceiptId(generatedReceiptId);
      setOrderSuccess(true);
      
    } catch (error) {
      console.error("Checkout failed:", error);
      alert("Failed to process order. Check console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pos-layout">
      {/* Column 1: Live Receipt Preview */}
      <div className="pos-receipt-col">
        <div className="receipt-preview-wrapper">
          <div id="print-receipt">
            <div className="receipt-header">
              <img src={logoImg} alt="Prime Diagnostic Centre Logo" className="receipt-logo" style={{ margin: '0 auto 10px auto', display: 'block', maxWidth: '100%' }} />
              <h2>Prime Diagnostic Centre</h2>
              <p>0314-1117447</p>
              <p><strong>Customer Slip</strong></p>
            </div>
            <div className="receipt-details">
              <p><strong>Receipt #:</strong> {receiptId || 'Pending'}</p>
              <p><strong>Date:</strong> {new Date().toLocaleString()}</p>
              <p><strong>Patient:</strong> {patient.name || 'N/A'}</p>
              {(patient.age || patient.gender) && (
                <p>
                  {patient.age && <span><strong>Age:</strong> {patient.age} &nbsp;&nbsp;</span>}
                  {patient.gender && <span><strong>Gender:</strong> {patient.gender}</span>}
                </p>
              )}
              {patient.referred_by && <p><strong>Referred by:</strong> {patient.referred_by}</p>}
              {patient.phone_number && <p><strong>Phone:</strong> {patient.phone_number}</p>}
            </div>
            <table className="receipt-items">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {basket.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.service_name}</td>
                    <td>{item.quantity}</td>
                    <td>Rs {Number(item.price_pkr) * item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="receipt-totals">
              <p>Subtotal: <span>Rs {subtotal}</span></p>
              <p>Discount: <span>Rs {Math.round(discountAmount)} {discountType === 'percentage' && discountValue ? `(${discountValue}%)` : ''}</span></p>
              <h3>Total: <span>Rs {finalTotal}</span></h3>
            </div>
            <div className="receipt-footer">
              <p>Please collect your reports between 3:30 PM to 5:30 PM on reporting date</p>
              <p>We wish you good health</p>
              <div style={{ borderTop: '1px dashed #000', margin: '15px 0' }}></div>
              <p style={{ textAlign: 'center', fontSize: '11px', lineHeight: '1.4' }}>Ground Floor, Bhagwandas Building, Opp. Civil Hospital Karachi (emergency gate)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Column 2: Patient & Services */}
      <div className="pos-middle-col no-print">
        <div className="card mb-4">
          <div className="card-header">Patient Details</div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="John Doe"
                value={patient.name}
                onChange={e => setPatient({...patient, name: e.target.value})}
              />
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Age</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="e.g. 35"
                  value={patient.age}
                  onChange={e => setPatient({...patient, age: e.target.value})}
                  min="0"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Gender</label>
                <select 
                  className="form-control" 
                  value={patient.gender}
                  onChange={e => setPatient({...patient, gender: e.target.value})}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Phone Number</label>
                <input 
                  type="text" 
                  className={`form-control ${phoneError ? 'is-invalid' : ''}`} 
                  placeholder="0300-1234567"
                  value={patient.phone_number}
                  onChange={e => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 4) {
                      val = val.substring(0, 4) + '-' + val.substring(4, 11);
                    }
                    setPatient({...patient, phone_number: val});
                    if (phoneError) setPhoneError('');
                  }}
                />
                {phoneError && <div className="text-danger" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem' }}>{phoneError}</div>}
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">Referred By</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Dr. Smith"
                  value={patient.referred_by}
                  onChange={e => setPatient({...patient, referred_by: e.target.value})}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Visit Description / Notes</label>
              <textarea 
                className="form-control" 
                rows="2"
                placeholder="Routine checkup..."
                value={patient.visit_description}
                onChange={e => setPatient({...patient, visit_description: e.target.value})}
              ></textarea>
            </div>
          </div>
        </div>

        <div className="card flex-1" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="card-header">Available Services</div>
          <div className="card-body p-0" style={{ overflowY: 'auto' }}>
            {isLoadingServices ? (
              <div className="loading-spinner-container">
                <div className="spinner"></div>
                <p>Loading services...</p>
              </div>
            ) : (
              <div className="services-grid">
              {parentServices.map(service => {
                const hasChildren = services.some(s => s.parent_id === service.id);
                return (
                  <button 
                    key={service.id} 
                    className="service-card"
                    onClick={() => handleServiceClick(service)}
                  >
                    <div className="service-card-header">
                      <span className="service-name">{service.service_name}</span>
                      {role === 'admin' && (
                        <button className="edit-service-btn" onClick={(e) => openEditModal(service, e)}>
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                    {hasChildren ? (
                      <span className="service-price text-muted" style={{fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px'}}>
                        Select Sub-type <ChevronRight size={14} />
                      </span>
                    ) : (
                      <span className="service-price">Rs {service.price_pkr}</span>
                    )}
                  </button>
                );
              })}
              {/* Add New Service Button */}
              {role === 'admin' && (
                <button 
                  className="service-card add-service-card"
                  onClick={() => {
                    setServiceForm({ service_name: '', price_pkr: '', parent_id: '' });
                    setIsAddServiceModalOpen(true);
                  }}
                >
                  <div className="add-service-icon">
                    <Plus size={24} />
                  </div>
                  <span className="service-name">Add New Service</span>
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Column 3: Basket */}
      <div className="pos-right-col no-print">
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header flex-between">
            <span>Basket</span>
            <span className="badge">{basket.length} items</span>
          </div>
          <div className="basket-items" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {basket.length === 0 ? (
              <div className="empty-basket">Basket is empty</div>
            ) : (
              basket.map(item => (
                <div key={item.id} className="basket-item">
                  <div className="item-info">
                    <span className="item-name">{item.service_name}</span>
                    <span className="item-price">Rs {item.price_pkr}</span>
                  </div>
                  <div className="item-actions">
                    <button className="qty-btn" onClick={() => updateQuantity(item.id, -1)}><Minus size={14}/></button>
                    <span className="qty-val">{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQuantity(item.id, 1)}><Plus size={14}/></button>
                    <button className="delete-btn" onClick={() => removeFromBasket(item.id)}><Trash2 size={16}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="basket-summary">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>Rs {subtotal}</span>
            </div>
            <div className="summary-row discount-row" style={{ alignItems: 'center' }}>
              <span>Discount</span>
              <div style={{ display: 'flex', gap: '0.5rem', width: '130px' }}>
                <select 
                  className="form-control" 
                  value={discountType}
                  onChange={e => setDiscountType(e.target.value)}
                  style={{ width: '55px', padding: '0.25rem', paddingRight: '0.1rem', fontSize: '0.85rem' }}
                >
                  <option value="amount">Rs</option>
                  <option value="percentage">%</option>
                </select>
                <input 
                  type="number" 
                  className="discount-input" 
                  value={discountValue} 
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || Number(val) >= 0) {
                      setDiscountValue(val);
                    }
                  }}
                  min="0"
                  placeholder="0"
                  style={{ flex: 1, width: '100%' }}
                />
              </div>
            </div>
            <div className="summary-row total-row">
              <span>Total</span>
              <span>Rs {finalTotal}</span>
            </div>
            
            <button 
              className="btn btn-primary checkout-btn" 
              onClick={handleCheckout}
              disabled={isSubmitting || basket.length === 0 || !patient.name}
            >
              {isSubmitting ? 'Processing...' : (
                <>
                  <Printer size={18} />
                  Print Receipt & Checkout
                </>
              )}
            </button>
            {orderSuccess && <div className="success-msg">Order completed!</div>}
          </div>
        </div>
      </div>

      {/* Sub-type Selection Modal */}
      {subTypeModalOpen && selectedParentService && (
        <div className="modal-overlay" onClick={() => setSubTypeModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Select {selectedParentService.service_name} Sub-type</h2>
              <button className="close-btn" onClick={() => setSubTypeModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body p-0">
              <div className="services-grid" style={{ padding: '1.5rem' }}>
                {services.filter(s => s.parent_id === selectedParentService.id).map(subService => (
                  <button 
                    key={subService.id} 
                    className="service-card"
                    onClick={() => addToBasket(subService)}
                  >
                    <div className="service-card-header">
                      <span className="service-name">{subService.service_name}</span>
                      {role === 'admin' && (
                        <button className="edit-service-btn" onClick={(e) => openEditModal(subService, e)}>
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                    <span className="service-price">Rs {subService.price_pkr}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Service Modals */}
      {(isAddServiceModalOpen || isEditServiceModalOpen) && (
        <div className="modal-overlay" onClick={() => {
          setIsAddServiceModalOpen(false);
          setIsEditServiceModalOpen(false);
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isAddServiceModalOpen ? 'Add New Service' : 'Edit Service'}</h2>
              <button 
                className="close-btn" 
                onClick={() => {
                  setIsAddServiceModalOpen(false);
                  setIsEditServiceModalOpen(false);
                }}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={isAddServiceModalOpen ? handleAddServiceSubmit : handleEditServiceSubmit} className="modal-body">
              <div className="form-group">
                <label className="form-label">Service Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={serviceForm.service_name}
                  onChange={e => setServiceForm({...serviceForm, service_name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Price (PKR)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={serviceForm.price_pkr}
                  onChange={e => setServiceForm({...serviceForm, price_pkr: e.target.value})}
                  required
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Parent Category (Optional)</label>
                <select 
                  className="form-control"
                  value={serviceForm.parent_id}
                  onChange={e => setServiceForm({...serviceForm, parent_id: e.target.value})}
                >
                  <option value="">None (Top Level Service)</option>
                  {parentServices
                    .filter(s => !editingService || s.id !== editingService.id)
                    .map(s => (
                    <option key={s.id} value={s.id}>{s.service_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  className="btn btn-outline"
                  onClick={() => {
                    setIsAddServiceModalOpen(false);
                    setIsEditServiceModalOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isServiceSubmitting}
                >
                  {isServiceSubmitting ? 'Saving...' : 'Save Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
