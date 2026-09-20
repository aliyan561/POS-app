import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { 
  Package, Plus, Minus, Search, ArrowDownToLine, 
  AlertTriangle, XCircle, CheckCircle2, X, ChevronLeft, 
  History, DollarSign, Layers, Activity, RotateCcw, 
  Edit3, Trash2, Info, ArrowUpRight, Tag, HelpCircle, ShieldCheck
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import './InventoryPage.css';

export default function InventoryPage() {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [stockStatusFilter, setStockStatusFilter] = useState('all');

  // Selected item for Detail View
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemTransactions, setItemTransactions] = useState([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUseModalOpen, setIsUseModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Forms state
  const [addForm, setAddForm] = useState({
    name: '',
    department: 'Laboratory',
    quantity: '',
    price: '',
    notes: ''
  });

  const [useForm, setUseForm] = useState({
    quantity: '1',
    notes: ''
  });

  const [restockForm, setRestockForm] = useState({
    quantity: '',
    cost: '',
    notes: '',
    syncExpense: true
  });

  const [editForm, setEditForm] = useState({
    name: '',
    department: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Fetch all inventory items
  async function fetchInventory() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory:', error);
      showToast('Failed to load inventory: ' + error.message, 'error');
    } else {
      setInventoryItems(data || []);
      // If an item is currently selected, update its reference
      if (selectedItem) {
        const updated = data?.find(i => i.id === selectedItem.id);
        if (updated) setSelectedItem(updated);
      }
    }
    setIsLoading(false);
  }

  // Fetch transactions for selected item
  async function fetchItemTransactions(itemId) {
    setIsDetailLoading(true);
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('inventory_item_id', itemId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setItemTransactions(data);
    }
    setIsDetailLoading(false);
  }

  // Open item detail view
  const handleOpenDetail = (item) => {
    setSelectedItem(item);
    fetchItemTransactions(item.id);
  };

  // Close detail view
  const handleCloseDetail = () => {
    setSelectedItem(null);
    setItemTransactions([]);
  };

  // Departments list with counts
  const departmentList = useMemo(() => {
    const depts = new Set();
    inventoryItems.forEach(i => {
      if (i.department) depts.add(i.department.trim());
    });
    return Array.from(depts).sort();
  }, [inventoryItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return inventoryItems.filter(item => {
      // Search
      const matchesSearch = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.department && item.department.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Department
      if (selectedDept !== 'All' && item.department !== selectedDept) {
        return false;
      }

      // Stock status
      const qty = item.current_quantity ?? 0;
      if (stockStatusFilter === 'in_stock' && qty <= 10) return false;
      if (stockStatusFilter === 'low_stock' && (qty <= 0 || qty > 10)) return false;
      if (stockStatusFilter === 'out_of_stock' && qty > 0) return false;

      return true;
    });
  }, [inventoryItems, searchQuery, selectedDept, stockStatusFilter]);

  // Overall KPIs
  const kpiStats = useMemo(() => {
    const totalItems = inventoryItems.length;
    let totalStockUnits = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalValuePkr = 0;

    inventoryItems.forEach(item => {
      const current = Number(item.current_quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      totalStockUnits += current;
      totalValuePkr += current * unitPrice;

      if (current <= 0) {
        outOfStockCount += 1;
      } else if (current <= 10) {
        lowStockCount += 1;
      }
    });

    return {
      totalItems,
      totalStockUnits,
      lowStockCount,
      outOfStockCount,
      totalValuePkr
    };
  }, [inventoryItems]);

  // ----------------------------------------------------
  // ACTION: ADD NEW INVENTORY ITEM
  // ----------------------------------------------------
  const handleAddItem = async (e) => {
    e.preventDefault();
    const qty = parseInt(addForm.quantity, 10);
    const price = parseFloat(addForm.price || 0);

    if (!addForm.name.trim()) {
      showToast('Item name is required', 'error');
      return;
    }
    if (isNaN(qty) || qty < 1) {
      showToast('Quantity must be at least 1', 'error');
      return;
    }
    if (isNaN(price) || price < 0) {
      showToast('Price must be a valid positive number', 'error');
      return;
    }

    setIsSubmitting(true);
    const unitPrice = qty > 0 ? (price / qty) : 0;
    const dept = addForm.department.trim() || 'General';

    try {
      // 1. Insert into inventory_items
      const { data: itemData, error: itemError } = await supabase
        .from('inventory_items')
        .insert([{
          name: addForm.name.trim(),
          department: dept,
          unit_price: Math.round(unitPrice * 100) / 100,
          total_received: qty,
          current_quantity: qty,
        }])
        .select()
        .single();

      if (itemError) throw itemError;

      // 2. Insert into inventory_transactions
      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert([{
          inventory_item_id: itemData.id,
          type: 'initial',
          quantity: qty,
          total_cost: price,
          unit_price: Math.round(unitPrice * 100) / 100,
          notes: addForm.notes.trim() || `Initial stock received (${qty} units)`
        }]);

      if (txError) throw txError;

      // 3. Insert into expenses table if price > 0
      if (price > 0) {
        const { error: expError } = await supabase
          .from('expenses')
          .insert([{
            title: `Inventory: ${addForm.name.trim()} (Initial Stock - ${qty} pcs)`,
            category: 'Inventory',
            amount_pkr: price,
            expense_date: new Date().toISOString(),
            approved_by: null
          }]);

        if (expError) {
          console.warn('Note: Expense log creation had issue:', expError);
        }
      }

      showToast(`Added "${addForm.name}" with ${qty} units to inventory!`);
      setIsAddModalOpen(false);
      setAddForm({
        name: '',
        department: 'Laboratory',
        quantity: '',
        price: '',
        notes: ''
      });
      fetchInventory();
    } catch (err) {
      console.error('Error creating inventory item:', err);
      showToast('Failed to add item: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // ACTION: USE / CONSUME STOCK
  // ----------------------------------------------------
  const handleUseSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    const useQty = parseInt(useForm.quantity, 10);
    const available = Number(selectedItem.current_quantity) || 0;

    if (isNaN(useQty) || useQty < 1) {
      showToast('Please enter a valid quantity of at least 1', 'error');
      return;
    }
    if (useQty > available) {
      showToast(`Cannot use ${useQty} units. Only ${available} available in stock!`, 'error');
      return;
    }

    setIsSubmitting(true);
    const newQuantity = available - useQty;

    try {
      // 1. Update inventory_items current_quantity
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ current_quantity: newQuantity })
        .eq('id', selectedItem.id);

      if (updateError) throw updateError;

      // 2. Insert usage transaction
      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert([{
          inventory_item_id: selectedItem.id,
          type: 'usage',
          quantity: useQty,
          total_cost: null,
          unit_price: null,
          notes: useForm.notes.trim() || `Dispensed ${useQty} units for clinical/lab use`
        }]);

      if (txError) throw txError;

      showToast(`Used ${useQty} units of ${selectedItem.name}. Remaining: ${newQuantity}`);
      setIsUseModalOpen(false);
      setUseForm({ quantity: '1', notes: '' });
      
      // Update local state and reload transactions
      setSelectedItem({ ...selectedItem, current_quantity: newQuantity });
      fetchItemTransactions(selectedItem.id);
      fetchInventory();
    } catch (err) {
      console.error('Error recording usage:', err);
      showToast('Failed to register usage: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // ACTION: RESTOCK INVENTORY
  // ----------------------------------------------------
  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;

    const restockQty = parseInt(restockForm.quantity, 10);
    const cost = parseFloat(restockForm.cost || 0);

    if (isNaN(restockQty) || restockQty < 1) {
      showToast('Restock quantity must be at least 1', 'error');
      return;
    }
    if (isNaN(cost) || cost < 0) {
      showToast('Restock cost must be a valid number', 'error');
      return;
    }

    setIsSubmitting(true);
    const unitPrice = restockQty > 0 ? (cost / restockQty) : Number(selectedItem.unit_price);
    const newTotalReceived = (Number(selectedItem.total_received) || 0) + restockQty;
    const newCurrentQty = (Number(selectedItem.current_quantity) || 0) + restockQty;

    try {
      // 1. Update inventory_items
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({
          total_received: newTotalReceived,
          current_quantity: newCurrentQty,
          unit_price: unitPrice > 0 ? Math.round(unitPrice * 100) / 100 : selectedItem.unit_price
        })
        .eq('id', selectedItem.id);

      if (updateError) throw updateError;

      // 2. Insert transaction
      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert([{
          inventory_item_id: selectedItem.id,
          type: 'restock',
          quantity: restockQty,
          total_cost: cost,
          unit_price: Math.round(unitPrice * 100) / 100,
          notes: restockForm.notes.trim() || `Restocked ${restockQty} units`
        }]);

      if (txError) throw txError;

      // 3. Insert into expenses if checked and cost > 0
      if (restockForm.syncExpense && cost > 0) {
        const { error: expError } = await supabase
          .from('expenses')
          .insert([{
            title: `Inventory: ${selectedItem.name} (Restock - ${restockQty} pcs)`,
            category: 'Inventory',
            amount_pkr: cost,
            expense_date: new Date().toISOString(),
            approved_by: null
          }]);

        if (expError) {
          console.warn('Expense record creation note:', expError);
        }
      }

      showToast(`Restocked ${restockQty} units! New Stock: ${newCurrentQty}`);
      setIsRestockModalOpen(false);
      setRestockForm({ quantity: '', cost: '', notes: '', syncExpense: true });

      // Update local state
      setSelectedItem({
        ...selectedItem,
        total_received: newTotalReceived,
        current_quantity: newCurrentQty,
        unit_price: unitPrice > 0 ? Math.round(unitPrice * 100) / 100 : selectedItem.unit_price
      });
      fetchItemTransactions(selectedItem.id);
      fetchInventory();
    } catch (err) {
      console.error('Error restocking item:', err);
      showToast('Failed to restock: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // ACTION: EDIT ITEM DETAILS
  // ----------------------------------------------------
  const handleOpenEdit = () => {
    if (!selectedItem) return;
    setEditForm({
      name: selectedItem.name,
      department: selectedItem.department || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem || !editForm.name.trim()) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          name: editForm.name.trim(),
          department: editForm.department.trim() || 'General'
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      showToast('Inventory item updated successfully');
      setSelectedItem({
        ...selectedItem,
        name: editForm.name.trim(),
        department: editForm.department.trim() || 'General'
      });
      setIsEditModalOpen(false);
      fetchInventory();
    } catch (err) {
      showToast('Failed to update: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // ACTION: DELETE ITEM
  // ----------------------------------------------------
  const handleDeleteItem = async () => {
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      // 1. Delete associated transactions first to maintain integrity
      await supabase
        .from('inventory_transactions')
        .delete()
        .eq('inventory_item_id', selectedItem.id);

      // 2. Delete the item
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', selectedItem.id);

      if (error) throw error;

      showToast(`Deleted "${selectedItem.name}" from inventory`);
      setIsDeleteConfirmOpen(false);
      handleCloseDetail();
      fetchInventory();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for stock health class
  const getStockHealthClass = (current) => {
    const qty = Number(current) || 0;
    if (qty <= 0) return 'status-out';
    if (qty <= 10) return 'status-low';
    return 'status-good';
  };

  return (
    <div className="inventory-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div 
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: toastMessage.type === 'error' ? '#ef4444' : '#10b981',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem',
            fontWeight: 500,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {toastMessage.type === 'error' ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="inventory-header">
        <div className="inventory-title-group">
          <h2>
            <Package size={28} className="text-primary" />
            Inventory Management
          </h2>
          <p>Real-time stock tracking, clinical usage logging, and automated expense sync</p>
        </div>

        <div className="inventory-header-actions">
          <button 
            className="btn-add-inventory"
            onClick={() => setIsAddModalOpen(true)}
            id="add-new-inventory-btn"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Add New Item</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="inventory-kpi-grid">
        <div className="inventory-kpi-card">
          <div className="kpi-icon-wrap kpi-icon-blue">
            <Package size={22} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Total Items</span>
            <span className="kpi-value">{kpiStats.totalItems}</span>
            <span className="kpi-sub">Distinct SKUs registered</span>
          </div>
        </div>

        <div className="inventory-kpi-card">
          <div className="kpi-icon-wrap kpi-icon-green">
            <Layers size={22} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Units in Stock</span>
            <span className="kpi-value">{kpiStats.totalStockUnits.toLocaleString()}</span>
            <span className="kpi-sub">Total physical units ready</span>
          </div>
        </div>

        <div className="inventory-kpi-card">
          <div className="kpi-icon-wrap kpi-icon-amber">
            <AlertTriangle size={22} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Low / Out of Stock</span>
            <span className="kpi-value" style={{ color: (kpiStats.lowStockCount + kpiStats.outOfStockCount) > 0 ? '#d97706' : 'inherit' }}>
              {kpiStats.lowStockCount + kpiStats.outOfStockCount}
            </span>
            <span className="kpi-sub">
              {kpiStats.outOfStockCount} out of stock, {kpiStats.lowStockCount} low
            </span>
          </div>
        </div>

        <div className="inventory-kpi-card">
          <div className="kpi-icon-wrap kpi-icon-purple">
            <DollarSign size={22} />
          </div>
          <div className="kpi-details">
            <span className="kpi-label">Stock Valuation</span>
            <span className="kpi-value">PKR {Math.round(kpiStats.totalValuePkr).toLocaleString()}</span>
            <span className="kpi-sub">Estimated on-hand value</span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Stock Filter, Department Chips */}
      <div className="inventory-toolbar">
        <div className="toolbar-search-row">
          <div className="inventory-search-box">
            <Search size={16} className="search-icon-inside" />
            <input 
              type="text" 
              className="inventory-search-input"
              placeholder="Search items by name or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select 
            className="stock-status-select"
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value)}
          >
            <option value="all">All Stock Statuses</option>
            <option value="in_stock">In Stock (&gt; 10 units)</option>
            <option value="low_stock">Low Stock (1 - 10 units)</option>
            <option value="out_of_stock">Out of Stock (0 units)</option>
          </select>
        </div>

        {departmentList.length > 0 && (
          <div className="dept-chips-row">
            <span className="dept-chips-label">Dept:</span>
            <button 
              className={`dept-chip ${selectedDept === 'All' ? 'active' : ''}`}
              onClick={() => setSelectedDept('All')}
            >
              All Items
              <span className="dept-chip-count">{inventoryItems.length}</span>
            </button>
            {departmentList.map(dept => {
              const count = inventoryItems.filter(i => i.department === dept).length;
              return (
                <button 
                  key={dept}
                  className={`dept-chip ${selectedDept === dept ? 'active' : ''}`}
                  onClick={() => setSelectedDept(dept)}
                >
                  {dept}
                  <span className="dept-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Grid View */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
          <Package size={36} className="animate-spin" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <p>Loading inventory items...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="inventory-empty-state">
          <div className="empty-icon-circle">
            <Package size={34} />
          </div>
          <h3>No inventory items found</h3>
          <p>
            {searchQuery || selectedDept !== 'All' || stockStatusFilter !== 'all'
              ? 'No items match your selected filters. Try resetting the search or filter.'
              : 'Start tracking clinical items, testing kits, syringes, and medical disposables.'}
          </p>
          <button 
            className="btn-add-inventory"
            onClick={() => setIsAddModalOpen(true)}
            style={{ marginTop: '0.5rem' }}
          >
            <Plus size={18} />
            <span>Add First Inventory Item</span>
          </button>
        </div>
      ) : (
        <div className="inventory-grid">
          {filteredItems.map(item => {
            const current = Number(item.current_quantity) || 0;
            const total = Number(item.total_received) || 0;
            const health = getStockHealthClass(current);
            const percentRemaining = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

            return (
              <div 
                key={item.id} 
                className={`inventory-card ${health}`}
                onClick={() => handleOpenDetail(item)}
              >
                <div>
                  <div className="card-top">
                    <span className="card-dept-badge">
                      {item.department || 'General'}
                    </span>
                    <span className={`status-pill ${health}`}>
                      {health === 'status-good' && 'In Stock'}
                      {health === 'status-low' && 'Low Stock'}
                      {health === 'status-out' && 'Out of Stock'}
                    </span>
                  </div>

                  <h3 className="card-title">{item.name}</h3>
                </div>

                {/* Two Numbers Box requested by user */}
                <div className="card-stats-row">
                  <div className="card-stat-box">
                    <span className="stat-box-label">When Came</span>
                    <span className="stat-box-num">
                      {total} <span className="stat-box-unit">pcs</span>
                    </span>
                  </div>
                  <div className="card-stat-box">
                    <span className="stat-box-label">Now</span>
                    <span className={`stat-box-num current-${health.replace('status-', '')}`}>
                      {current} <span className="stat-box-unit">pcs</span>
                    </span>
                  </div>
                </div>

                {/* Stock Progress Bar */}
                <div className="stock-progress-wrap">
                  <div className="progress-labels">
                    <span>Remaining Stock</span>
                    <strong>{percentRemaining}%</strong>
                  </div>
                  <div className="progress-track">
                    <div 
                      className={`progress-bar-fill fill-${health.replace('status-', '')}`}
                      style={{ width: `${percentRemaining}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==========================================================================
          DETAIL VIEW MODAL (Triggered when any item is clicked)
          ========================================================================== */}
      {selectedItem && (
        <div className="modal-overlay" onClick={handleCloseDetail}>
          <div className="detail-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="detail-header-bar">
              <div className="detail-header-left">
                <button className="btn btn-icon" onClick={handleCloseDetail} title="Back to grid">
                  <ChevronLeft size={20} />
                </button>
                <div className="detail-header-info">
                  <h2>{selectedItem.name}</h2>
                  <div className="meta-row">
                    <span className="card-dept-badge">{selectedItem.department || 'General'}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>•</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Unit Cost: <strong>PKR {Math.round(Number(selectedItem.unit_price) || 0).toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="detail-header-actions">
                <button 
                  className="btn btn-outline" 
                  onClick={handleOpenEdit} 
                  title="Edit item name or department"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <Edit3 size={15} />
                  <span>Edit</span>
                </button>
                <button 
                  className="btn btn-outline" 
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  title="Delete item"
                  style={{ padding: '0.35rem 0.6rem', color: '#ef4444' }}
                >
                  <Trash2 size={16} />
                </button>
                <button className="btn btn-icon" onClick={handleCloseDetail} title="Close">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="detail-body-scroll">
              {/* THE TWO PROMINENT HERO BOXES REQUESTED BY USER */}
              <div className="hero-two-boxes-grid">
                {/* Box 1: Total Received When They Came */}
                <div className="hero-box hero-box-received">
                  <div className="hero-box-header">
                    <span className="hero-box-tag">Total Inflow</span>
                    <div className="hero-box-icon" style={{ color: '#0284c7' }}>
                      <ArrowDownToLine size={20} />
                    </div>
                  </div>
                  <div className="hero-box-number">
                    {Number(selectedItem.total_received || 0).toLocaleString()} <span>units</span>
                  </div>
                  <div className="hero-box-caption">
                    How many they were when they came (initial + all restocks)
                  </div>
                </div>

                {/* Box 2: How Many Are In Stock Now */}
                <div className={`hero-box hero-box-current health-${getStockHealthClass(selectedItem.current_quantity).replace('status-', '')}`}>
                  <div className="hero-box-header">
                    <span className="hero-box-tag">Current Stock</span>
                    <div className="hero-box-icon" style={{ 
                      color: Number(selectedItem.current_quantity) > 10 ? '#059669' : (Number(selectedItem.current_quantity) > 0 ? '#d97706' : '#dc2626')
                    }}>
                      <Package size={20} />
                    </div>
                  </div>
                  <div className="hero-box-number" style={{ 
                    color: Number(selectedItem.current_quantity) > 10 ? '#047857' : (Number(selectedItem.current_quantity) > 0 ? '#b45309' : '#b91c1c')
                  }}>
                    {Number(selectedItem.current_quantity || 0).toLocaleString()} <span>units</span>
                  </div>
                  <div className="hero-box-caption">
                    How many are remaining in stock right now
                  </div>
                </div>
              </div>

              {/* Action Banner with "Use Item" and "Restock Item" buttons */}
              <div className="detail-actions-banner">
                <div className="banner-stats">
                  <div className="banner-stat-item">
                    <span className="lbl">Estimated Value on Hand</span>
                    <span className="val">
                      PKR {Math.round((Number(selectedItem.current_quantity) || 0) * (Number(selectedItem.unit_price) || 0)).toLocaleString()}
                    </span>
                  </div>
                  <div className="banner-stat-item">
                    <span className="lbl">Total Consumed</span>
                    <span className="val" style={{ color: '#d97706' }}>
                      {Math.max(0, (Number(selectedItem.total_received) || 0) - (Number(selectedItem.current_quantity) || 0)).toLocaleString()} units
                    </span>
                  </div>
                </div>

                <div className="banner-btn-group">
                  <button 
                    className="btn-hero-use"
                    disabled={Number(selectedItem.current_quantity) <= 0}
                    onClick={() => setIsUseModalOpen(true)}
                  >
                    <Minus size={18} />
                    <span>Use Item</span>
                  </button>

                  <button 
                    className="btn-hero-restock"
                    onClick={() => setIsRestockModalOpen(true)}
                  >
                    <Plus size={18} />
                    <span>Restock Stock</span>
                  </button>
                </div>
              </div>

              {/* Transaction Audit History Log */}
              <div className="transactions-section">
                <div className="transactions-header">
                  <h4>
                    <History size={18} className="text-primary" />
                    Transaction & Usage History
                  </h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {itemTransactions.length} movements recorded
                  </span>
                </div>

                <div className="transactions-table-card">
                  {isDetailLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading activity records...
                    </div>
                  ) : itemTransactions.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No transaction records found for this item.
                    </div>
                  ) : (
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Type</th>
                          <th>Quantity</th>
                          <th>Total Cost</th>
                          <th>Notes / Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemTransactions.map(tx => {
                          const isUsage = tx.type === 'usage';
                          const isRestock = tx.type === 'restock';
                          return (
                            <tr key={tx.id}>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.825rem' }}>
                                {tx.created_at ? format(parseISO(tx.created_at), 'MMM dd, yyyy • hh:mm a') : '—'}
                              </td>
                              <td>
                                <span className={`badge-tx badge-tx-${tx.type}`}>
                                  {isUsage && 'Dispensed'}
                                  {isRestock && 'Restocked'}
                                  {tx.type === 'initial' && 'Initial Stock'}
                                </span>
                              </td>
                              <td className={isUsage ? 'qty-delta-negative' : 'qty-delta-positive'}>
                                {isUsage ? `-${tx.quantity}` : `+${tx.quantity}`} units
                              </td>
                              <td>
                                {tx.total_cost != null && tx.total_cost > 0 ? (
                                  <strong>PKR {Math.round(Number(tx.total_cost)).toLocaleString()}</strong>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                {tx.notes || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL: ADD NEW ITEM
          ========================================================================== */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setIsAddModalOpen(false)}>
          <div className="submodal-card" onClick={(e) => e.stopPropagation()}>
            <div className="submodal-header">
              <h3>
                <Package size={20} className="text-primary" />
                Add New Inventory Item
              </h3>
              <button 
                className="btn btn-icon" 
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddItem}>
              <div className="submodal-body">
                <div className="modal-notice-banner">
                  <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    When added, this purchase will automatically be recorded under your <strong>Expenses</strong> tab in the <strong>Inventory</strong> category.
                  </span>
                </div>

                <div className="form-field-group">
                  <label>
                    Item Name <span className="req">*</span>
                  </label>
                  <input 
                    type="text"
                    required
                    className="form-field-input"
                    placeholder="e.g. Surgical Gloves (Medium), Syringes 5ml, CBC Reagents..."
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  />
                </div>

                <div className="form-field-group">
                  <label>Department / Section</label>
                  <input 
                    type="text"
                    className="form-field-input"
                    placeholder="e.g. Laboratory, Radiology, Pharmacy, Reception..."
                    value={addForm.department}
                    onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                  />
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {['Laboratory', 'Radiology', 'Pharmacy', 'Surgical', 'Reception', 'General'].map(sug => (
                      <button
                        type="button"
                        key={sug}
                        onClick={() => setAddForm({ ...addForm, department: sug })}
                        style={{
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field-group">
                    <label>
                      Quantity (Amount) <span className="req">*</span>
                    </label>
                    <input 
                      type="number"
                      min="1"
                      required
                      className="form-field-input"
                      placeholder="e.g. 100"
                      value={addForm.quantity}
                      onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                    />
                    <span className="field-calculated-preview">
                      Physical units received
                    </span>
                  </div>

                  <div className="form-field-group">
                    <label>
                      Total Price (PKR) <span className="req">*</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      step="any"
                      required
                      className="form-field-input"
                      placeholder="e.g. 15000"
                      value={addForm.price}
                      onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                    />
                    <span className="field-calculated-preview">
                      {addForm.quantity && addForm.price && Number(addForm.quantity) > 0 ? (
                        <>Unit Cost: <strong>PKR {Math.round(Number(addForm.price) / Number(addForm.quantity))}</strong>/unit</>
                      ) : (
                        'Total purchase invoice amount'
                      )}
                    </span>
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Notes / Vendor / Remarks (Optional)</label>
                  <input 
                    type="text"
                    className="form-field-input"
                    placeholder="e.g. Bought from Medico Supplies, Batch #9421"
                    value={addForm.notes}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="submodal-footer">
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Adding...' : 'Save & Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL: USE / CONSUME ITEM
          ========================================================================== */}
      {isUseModalOpen && selectedItem && (
        <div className="modal-overlay modal-submodal-overlay" onClick={() => !isSubmitting && setIsUseModalOpen(false)}>
          <div className="submodal-card" onClick={(e) => e.stopPropagation()}>
            <div className="submodal-header">
              <h3>
                <Minus size={20} style={{ color: '#d97706' }} />
                Register Usage — {selectedItem.name}
              </h3>
              <button 
                className="btn btn-icon" 
                onClick={() => setIsUseModalOpen(false)}
                disabled={isSubmitting}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUseSubmit}>
              <div className="submodal-body">
                <div className="modal-notice-banner warning">
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    Available Stock: <strong>{selectedItem.current_quantity} units</strong>.
                    Entering a quantity will deduct it from current stock.
                  </div>
                </div>

                <div className="form-field-group">
                  <label>
                    Quantity to Use <span className="req">*</span>
                  </label>
                  <input 
                    type="number"
                    min="1"
                    max={selectedItem.current_quantity}
                    required
                    className="form-field-input"
                    value={useForm.quantity}
                    onChange={(e) => setUseForm({ ...useForm, quantity: e.target.value })}
                  />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {[1, 5, 10, 20].map(n => (
                      <button
                        type="button"
                        key={n}
                        disabled={n > selectedItem.current_quantity}
                        onClick={() => setUseForm({ ...useForm, quantity: String(n) })}
                        style={{
                          fontSize: '0.75rem',
                          padding: '3px 10px',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          opacity: n > selectedItem.current_quantity ? 0.4 : 1
                        }}
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Purpose / Reason / Patient Details (Optional)</label>
                  <input 
                    type="text"
                    className="form-field-input"
                    placeholder="e.g. OPD sample collection, Ultrasound room stock, Lab test runs..."
                    value={useForm.notes}
                    onChange={(e) => setUseForm({ ...useForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="submodal-footer">
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  onClick={() => setIsUseModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ background: '#d97706', borderColor: '#d97706' }}
                  disabled={isSubmitting || Number(selectedItem.current_quantity) <= 0}
                >
                  {isSubmitting ? 'Registering...' : 'Deduct Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL: RESTOCK ITEM
          ========================================================================== */}
      {isRestockModalOpen && selectedItem && (
        <div className="modal-overlay modal-submodal-overlay" onClick={() => !isSubmitting && setIsRestockModalOpen(false)}>
          <div className="submodal-card" onClick={(e) => e.stopPropagation()}>
            <div className="submodal-header">
              <h3>
                <ArrowDownToLine size={20} style={{ color: '#059669' }} />
                Restock — {selectedItem.name}
              </h3>
              <button 
                className="btn btn-icon" 
                onClick={() => setIsRestockModalOpen(false)}
                disabled={isSubmitting}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRestockSubmit}>
              <div className="submodal-body">
                <div className="modal-notice-banner">
                  <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    Currently: <strong>{selectedItem.current_quantity} in stock</strong> (Total received so far: {selectedItem.total_received}).
                    Restocking increases both counts and auto-adds to <strong>Expenses</strong>.
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field-group">
                    <label>
                      Quantity to Add <span className="req">*</span>
                    </label>
                    <input 
                      type="number"
                      min="1"
                      required
                      className="form-field-input"
                      placeholder="e.g. 50"
                      value={restockForm.quantity}
                      onChange={(e) => setRestockForm({ ...restockForm, quantity: e.target.value })}
                    />
                    <span className="field-calculated-preview">
                      New Total Stock will be: <strong>{(Number(selectedItem.current_quantity) || 0) + (parseInt(restockForm.quantity, 10) || 0)} units</strong>
                    </span>
                  </div>

                  <div className="form-field-group">
                    <label>
                      Total Cost (PKR) <span className="req">*</span>
                    </label>
                    <input 
                      type="number"
                      min="0"
                      step="any"
                      required
                      className="form-field-input"
                      placeholder="e.g. 7500"
                      value={restockForm.cost}
                      onChange={(e) => setRestockForm({ ...restockForm, cost: e.target.value })}
                    />
                    <span className="field-calculated-preview">
                      {restockForm.quantity && restockForm.cost && Number(restockForm.quantity) > 0 ? (
                        <>Unit Cost: <strong>PKR {Math.round(Number(restockForm.cost) / Number(restockForm.quantity))}</strong>/unit</>
                      ) : (
                        'Total purchase invoice amount'
                      )}
                    </span>
                  </div>
                </div>

                <div className="form-field-group">
                  <label>Notes / Invoice / Supplier (Optional)</label>
                  <input 
                    type="text"
                    className="form-field-input"
                    placeholder="e.g. Reorder batch #120, Invoice #7782"
                    value={restockForm.notes}
                    onChange={(e) => setRestockForm({ ...restockForm, notes: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <input 
                    type="checkbox" 
                    id="syncExpenseCheckbox"
                    checked={restockForm.syncExpense}
                    onChange={(e) => setRestockForm({ ...restockForm, syncExpense: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="syncExpenseCheckbox" style={{ fontSize: '0.85rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                    Record this purchase as an Expense under <strong>Expenses &gt; Inventory</strong>
                  </label>
                </div>
              </div>

              <div className="submodal-footer">
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  onClick={() => setIsRestockModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ background: '#059669', borderColor: '#059669' }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Restocking...' : 'Confirm Restock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL: EDIT ITEM DETAILS
          ========================================================================== */}
      {isEditModalOpen && selectedItem && (
        <div className="modal-overlay modal-submodal-overlay" onClick={() => !isSubmitting && setIsEditModalOpen(false)}>
          <div className="submodal-card" onClick={(e) => e.stopPropagation()}>
            <div className="submodal-header">
              <h3>
                <Edit3 size={18} className="text-primary" />
                Edit Item Details
              </h3>
              <button 
                className="btn btn-icon" 
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSubmitting}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="submodal-body">
                <div className="form-field-group">
                  <label>
                    Item Name <span className="req">*</span>
                  </label>
                  <input 
                    type="text"
                    required
                    className="form-field-input"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>

                <div className="form-field-group">
                  <label>Department</label>
                  <input 
                    type="text"
                    className="form-field-input"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  />
                </div>
              </div>

              <div className="submodal-footer">
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL: CONFIRM DELETE
          ========================================================================== */}
      {isDeleteConfirmOpen && selectedItem && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setIsDeleteConfirmOpen(false)}>
          <div className="submodal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="submodal-header">
              <h3 style={{ color: '#ef4444' }}>
                <Trash2 size={20} />
                Delete Inventory Item
              </h3>
              <button 
                className="btn btn-icon" 
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isSubmitting}
              >
                <X size={20} />
              </button>
            </div>

            <div className="submodal-body">
              <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: '1.4' }}>
                Are you sure you want to delete <strong>{selectedItem.name}</strong> from inventory?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                This will delete the item and all its usage/restock transaction logs. Any previously recorded expense entries in the Expenses tab will remain preserved.
              </p>
            </div>

            <div className="submodal-footer">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleDeleteItem}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
