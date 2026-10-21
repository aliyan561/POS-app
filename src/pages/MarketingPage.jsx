import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { 
  Briefcase, Plus, Search, Filter, Download, Calendar, 
  CheckCircle2, Clock, AlertCircle, HelpCircle, XCircle, 
  X, Stethoscope, Phone, Building2, ChevronRight, UserCheck, 
  Eye, RefreshCw, FileText, Check, Settings
} from 'lucide-react';
import { format, parseISO, isToday, isBefore, startOfDay } from 'date-fns';
import './MarketingPage.css';

const DEPARTMENTS = {
  'Surgery': ['General Surgery', 'Laparoscopic Surgery', 'Vascular Surgery', 'Plastic Surgery', 'Pediatric Surgery'],
  'Medicine': ['Internal Medicine', 'Pulmonology', 'Gastroenterology', 'Nephrology', 'Endocrinology'],
  'Orthopaedics': ['Joint Replacement', 'Spine Surgery', 'Sports Medicine', 'Trauma'],
  'Neurology': ['General Neurology', 'Stroke Clinic', 'Epilepsy & Neuro'],
  'Neurosurgery': ['Brain Surgery', 'Spine & Nerve Surgery'],
  'ENT': ['Otology', 'Rhinology', 'Head & Neck', 'Laryngology'],
  'Cardiology': ['Interventional Cardiology', 'Clinical Cardiology', 'Electrophysiology'],
  'Gynaecology': ['Obstetrics & Gynaecology', 'Maternal & Fetal', 'Infertility'],
  'Paediatrics': ['General Paediatrics', 'Neonatology', 'Pediatric Critical Care'],
  'Urology': ['Endourology', 'Andrology', 'Kidney Stone & Prostate'],
  'Other': ['General Practice', 'Dermatology', 'Psychiatry', 'Ophthalmology', 'Oncology']
};

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_SERVICES = [
  'CT Scan', 'Ultrasound', 'Echocardiography (Echo)', 
  'X-ray', 'ECG', 'Laboratory Tests', 'Doppler', 'Mammography'
];

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState('visits'); // 'visits' | 'doctors'
  const [visits, setVisits] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [repFilter, setRepFilter] = useState('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Modal States
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDoctorTimeline, setSelectedDoctorTimeline] = useState(null);

  // Form State
  const initialForm = {
    // Doctor Details
    isNewDoctor: true,
    selectedDoctorId: '',
    doctor_name: '',
    hospital_clinic: '',
    department: 'Surgery',
    speciality: 'General Surgery',
    custom_speciality: '',
    contact_number: '',
    days_available: ['Monday', 'Wednesday', 'Friday'],
    visiting_time_start: '18:00',
    visiting_time_end: '21:00',

    // Visit Schedule & Rep
    visit_date: format(new Date(), 'yyyy-MM-dd'),
    representative_name: '',

    // Services Offered
    services_offered: ['CT Scan', 'Ultrasound'],

    // Status & Conditional Fields
    status: 'Awaited',
    visit_remarks: '',

    // Onboarded
    onboarding_date: format(new Date(), 'yyyy-MM-dd'),
    services_agreed: [],

    // Query Generated
    query_details: '',
    person_responsible: '',
    resolution_status: 'Pending',

    // Awaited
    pending_decision_reason: '',

    // No Response
    no_response_reason: '',

    // Follow-up
    next_follow_up_date: '',
    follow_up_action: '',
    follow_up_remarks: ''
  };

  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setIsLoading(true);
    try {
      // 1. Fetch Visits
      const { data: visitsData, error: visitsErr } = await supabase
        .from('marketing_visits')
        .select('*')
        .order('created_at', { ascending: false });

      if (visitsErr) console.error('Error fetching visits:', visitsErr);
      else setVisits(visitsData || []);

      // 2. Fetch Doctors
      const { data: doctorsData, error: doctorsErr } = await supabase
        .from('marketing_doctors')
        .select('*')
        .order('name', { ascending: true });

      if (doctorsErr) console.error('Error fetching doctors:', doctorsErr);
      else setDoctors(doctorsData || []);

      // 3. Fetch Services
      const { data: servicesData } = await supabase
        .from('marketing_services')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (servicesData && servicesData.length > 0) {
        setServices(servicesData.map(s => s.name));
      } else {
        setServices(DEFAULT_SERVICES);
      }

      // 4. Fetch Employees (Marketing Reps)
      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, name, role')
        .order('name', { ascending: true });

      if (employeesData) {
        setEmployees(employeesData);
        // Default rep if available
        if (employeesData.length > 0 && !formData.representative_name) {
          setFormData(prev => ({ ...prev, representative_name: employeesData[0].name }));
        }
      }
    } catch (err) {
      console.error('Error in fetchInitialData:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle doctor selection in modal
  function handleDoctorSelect(docId) {
    if (!docId) {
      setFormData(prev => ({ ...prev, isNewDoctor: true, selectedDoctorId: '' }));
      return;
    }
    const doc = doctors.find(d => d.id === docId);
    if (doc) {
      setFormData(prev => ({
        ...prev,
        isNewDoctor: false,
        selectedDoctorId: doc.id,
        doctor_name: doc.name,
        hospital_clinic: doc.hospital_clinic || '',
        department: doc.department || 'Surgery',
        speciality: doc.speciality || '',
        contact_number: doc.contact_number || '',
        days_available: doc.days_available || [],
        visiting_time_start: doc.visiting_time_start ? doc.visiting_time_start.slice(0, 5) : '18:00',
        visiting_time_end: doc.visiting_time_end ? doc.visiting_time_end.slice(0, 5) : '21:00'
      }));
    }
  }

  // Toggle Day Available pill
  function toggleDay(day) {
    setFormData(prev => {
      const days = [...prev.days_available];
      const idx = days.indexOf(day);
      if (idx > -1) days.splice(idx, 1);
      else days.push(day);
      return { ...prev, days_available: days };
    });
  }

  // Toggle Service checkbox
  function toggleService(serviceName, field = 'services_offered') {
    setFormData(prev => {
      const list = [...prev[field]];
      const idx = list.indexOf(serviceName);
      if (idx > -1) list.splice(idx, 1);
      else list.push(serviceName);
      return { ...prev, [field]: list };
    });
  }

  // Save Visit
  async function handleSubmitVisit(e) {
    e.preventDefault();
    if (!formData.doctor_name.trim()) {
      alert('Please provide the Doctor Name');
      return;
    }
    if (!formData.representative_name.trim()) {
      alert('Please specify the Marketing Representative');
      return;
    }

    setIsSubmitting(true);
    try {
      let doctorId = formData.selectedDoctorId;

      const specialityFinal = formData.speciality === 'Other' 
        ? formData.custom_speciality || 'Other' 
        : formData.speciality;

      // 1. If new doctor, insert into marketing_doctors
      if (formData.isNewDoctor || !doctorId) {
        const { data: newDoc, error: docErr } = await supabase
          .from('marketing_doctors')
          .insert([{
            name: formData.doctor_name.trim(),
            hospital_clinic: formData.hospital_clinic.trim(),
            department: formData.department,
            speciality: specialityFinal,
            contact_number: formData.contact_number.trim(),
            days_available: formData.days_available,
            visiting_time_start: formData.visiting_time_start || null,
            visiting_time_end: formData.visiting_time_end || null,
            current_status: formData.status
          }])
          .select()
          .single();

        if (docErr) throw docErr;
        doctorId = newDoc.id;
      } else {
        // Update existing doctor profile details
        await supabase
          .from('marketing_doctors')
          .update({
            hospital_clinic: formData.hospital_clinic.trim(),
            department: formData.department,
            speciality: specialityFinal,
            contact_number: formData.contact_number.trim(),
            days_available: formData.days_available,
            visiting_time_start: formData.visiting_time_start || null,
            visiting_time_end: formData.visiting_time_end || null,
            current_status: formData.status
          })
          .eq('id', doctorId);
      }

      // 2. Insert Visit Record
      const visitPayload = {
        doctor_id: doctorId,
        doctor_name: formData.doctor_name.trim(),
        hospital_clinic: formData.hospital_clinic.trim(),
        department: formData.department,
        speciality: specialityFinal,
        visit_date: formData.visit_date,
        representative_name: formData.representative_name.trim(),
        services_offered: formData.services_offered,
        status: formData.status,
        visit_remarks: formData.visit_remarks.trim(),

        // Conditional
        onboarding_date: formData.status === 'Onboarded' ? formData.onboarding_date : null,
        services_agreed: formData.status === 'Onboarded' ? formData.services_agreed : [],
        query_details: formData.status === 'Query Generated' ? formData.query_details.trim() : null,
        person_responsible: formData.status === 'Query Generated' ? formData.person_responsible.trim() : null,
        resolution_status: formData.status === 'Query Generated' ? formData.resolution_status : 'Pending',
        pending_decision_reason: formData.status === 'Awaited' ? formData.pending_decision_reason.trim() : null,
        no_response_reason: formData.status === 'No Response' ? formData.no_response_reason.trim() : null,

        next_follow_up_date: formData.next_follow_up_date || null,
        follow_up_action: formData.follow_up_action.trim() || null,
        follow_up_remarks: formData.follow_up_remarks.trim() || null
      };

      const { error: visitErr } = await supabase
        .from('marketing_visits')
        .insert([visitPayload]);

      if (visitErr) throw visitErr;

      // Reset and refresh
      setIsVisitModalOpen(false);
      setFormData(initialForm);
      await fetchInitialData();
    } catch (err) {
      console.error('Error submitting visit:', err);
      alert('Failed to save visit: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Quick Resolve Query
  async function handleResolveQuery(visitId) {
    try {
      const { error } = await supabase
        .from('marketing_visits')
        .update({ resolution_status: 'Resolved' })
        .eq('id', visitId);

      if (error) throw error;
      setVisits(prev => prev.map(v => v.id === visitId ? { ...v, resolution_status: 'Resolved' } : v));
    } catch (err) {
      alert('Error updating query: ' + err.message);
    }
  }

  // KPIs Calculations
  const stats = useMemo(() => {
    const today = startOfDay(new Date());

    let onboarded = 0;
    let queriesUnresolved = 0;
    let awaited = 0;
    let noResponse = 0;
    let followUpsDueToday = 0;
    let followUpsOverdue = 0;

    visits.forEach(v => {
      if (v.status === 'Onboarded') onboarded++;
      if (v.status === 'Awaited') awaited++;
      if (v.status === 'No Response') noResponse++;
      if (v.status === 'Query Generated' && v.resolution_status !== 'Resolved') queriesUnresolved++;

      if (v.next_follow_up_date) {
        try {
          const fDate = parseISO(v.next_follow_up_date);
          if (isToday(fDate)) followUpsDueToday++;
          else if (isBefore(fDate, today) && v.status !== 'Onboarded') followUpsOverdue++;
        } catch (_) {}
      }
    });

    return {
      totalVisits: visits.length,
      totalDoctors: doctors.length,
      onboarded,
      queriesUnresolved,
      awaited,
      noResponse,
      followUpsDueToday,
      followUpsOverdue
    };
  }, [visits, doctors]);

  // Filtered Visits
  const filteredVisits = useMemo(() => {
    const today = startOfDay(new Date());
    return visits.filter(v => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
        v.doctor_name?.toLowerCase().includes(q) ||
        v.hospital_clinic?.toLowerCase().includes(q) ||
        v.representative_name?.toLowerCase().includes(q) ||
        v.visit_record_id?.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter;
      const matchesDept = departmentFilter === 'ALL' || v.department === departmentFilter;
      const matchesRep = repFilter === 'ALL' || v.representative_name === repFilter;

      let matchesOverdue = true;
      if (overdueOnly) {
        if (!v.next_follow_up_date) return false;
        try {
          const fDate = parseISO(v.next_follow_up_date);
          matchesOverdue = isToday(fDate) || isBefore(fDate, today);
        } catch (_) {
          matchesOverdue = false;
        }
      }

      return matchesSearch && matchesStatus && matchesDept && matchesRep && matchesOverdue;
    });
  }, [visits, searchQuery, statusFilter, departmentFilter, repFilter, overdueOnly]);

  // Filtered Doctors
  const filteredDoctors = useMemo(() => {
    return doctors.filter(d => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
        d.name?.toLowerCase().includes(q) ||
        d.hospital_clinic?.toLowerCase().includes(q) ||
        d.contact_number?.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'ALL' || d.current_status === statusFilter;
      const matchesDept = departmentFilter === 'ALL' || d.department === departmentFilter;

      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [doctors, searchQuery, statusFilter, departmentFilter]);

  // Export to Excel / CSV
  function exportToCSV() {
    if (filteredVisits.length === 0) {
      alert('No visits to export');
      return;
    }

    const headers = [
      'Visit ID', 'Visit Date', 'Marketing Rep', 'Doctor Name', 
      'Hospital/Clinic', 'Department', 'Speciality', 'Status', 
      'Services Offered', 'Query / Details', 'Resolution Status', 
      'Next Follow-up Date', 'Follow-up Remarks'
    ];

    const rows = filteredVisits.map(v => [
      v.visit_record_id || '',
      v.visit_date || '',
      `"${v.representative_name || ''}"`,
      `"${v.doctor_name || ''}"`,
      `"${v.hospital_clinic || ''}"`,
      `"${v.department || ''}"`,
      `"${v.speciality || ''}"`,
      `"${v.status || ''}"`,
      `"${(v.services_offered || []).join(', ')}"`,
      `"${(v.query_details || v.pending_decision_reason || v.no_response_reason || v.visit_remarks || '').replace(/"/g, '""')}"`,
      `"${v.resolution_status || ''}"`,
      v.next_follow_up_date || '',
      `"${(v.follow_up_remarks || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PDC_Marketing_Visits_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Helper for Status Badge
  function renderStatusPill(status) {
    switch (status) {
      case 'Onboarded':
        return <span className="status-pill status-onboarded"><CheckCircle2 size={13} /> Onboarded</span>;
      case 'Query Generated':
        return <span className="status-pill status-query"><HelpCircle size={13} /> Query Generated</span>;
      case 'Awaited':
        return <span className="status-pill status-awaited"><Clock size={13} /> Awaited</span>;
      case 'No Response':
        return <span className="status-pill status-no-response"><XCircle size={13} /> No Response</span>;
      default:
        return <span className="status-pill">{status}</span>;
    }
  }

  // Doctor Timeline History
  const doctorVisitHistory = useMemo(() => {
    if (!selectedDoctorTimeline) return [];
    return visits.filter(v => v.doctor_id === selectedDoctorTimeline.id);
  }, [selectedDoctorTimeline, visits]);

  return (
    <div className="marketing-container">
      {/* Top Header */}
      <div className="marketing-header">
        <div className="marketing-title-group">
          <h1><Briefcase size={26} color="var(--primary)" /> Marketing Visit Management</h1>
          <p>Register doctors, record field visit schedules, pitches, and follow-up pipelines.</p>
        </div>

        <div className="marketing-header-actions">
          <button className="btn btn-outline" onClick={exportToCSV} title="Download CSV Report">
            <Download size={16} /> Export Excel / CSV
          </button>
          <button className="btn btn-primary" onClick={() => { setFormData(initialForm); setIsVisitModalOpen(true); }}>
            <Plus size={18} /> Record Visit / Add Doctor
          </button>
        </div>
      </div>

      {/* Follow-up Alerts Bar */}
      {(stats.followUpsOverdue > 0 || stats.followUpsDueToday > 0) && (
        <div className={`alerts-banner ${stats.followUpsOverdue > 0 ? 'has-overdue' : ''}`}>
          <div className="alert-content">
            <AlertCircle size={22} color={stats.followUpsOverdue > 0 ? 'var(--danger)' : '#f59e0b'} />
            <div>
              <strong>Action Required: </strong>
              {stats.followUpsOverdue > 0 && (
                <span>
                  <span className="alert-badge-count urgent">{stats.followUpsOverdue} Overdue</span> follow-ups! 
                </span>
              )}
              {stats.followUpsDueToday > 0 && (
                <span style={{ marginLeft: '0.4rem' }}>
                  <span className="alert-badge-count warning">{stats.followUpsDueToday} Due Today</span>.
                </span>
              )}
            </div>
          </div>
          <button 
            className="btn btn-outline" 
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderColor: '#f59e0b' }}
            onClick={() => { setOverdueOnly(!overdueOnly); setActiveTab('visits'); }}
          >
            {overdueOnly ? 'Show All Visits' : 'View Due Follow-ups'}
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="marketing-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-wrap" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
            <Stethoscope size={22} />
          </div>
          <div>
            <div className="kpi-val">{stats.totalDoctors}</div>
            <div className="kpi-lbl">Registered Doctors</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <Briefcase size={22} />
          </div>
          <div>
            <div className="kpi-val">{stats.totalVisits}</div>
            <div className="kpi-lbl">Visits Recorded</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="kpi-val">{stats.onboarded}</div>
            <div className="kpi-lbl">Onboarded Doctors</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <HelpCircle size={22} />
          </div>
          <div>
            <div className="kpi-val">{stats.queriesUnresolved}</div>
            <div className="kpi-lbl">Open Queries</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap" style={{ background: '#fffbeb', color: '#d97706' }}>
            <Clock size={22} />
          </div>
          <div>
            <div className="kpi-val">{stats.awaited}</div>
            <div className="kpi-lbl">Awaiting Response</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap" style={{ background: '#fef2f2', color: '#dc2626' }}>
            <XCircle size={22} />
          </div>
          <div>
            <div className="kpi-val">{stats.noResponse}</div>
            <div className="kpi-lbl">No Response Cases</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="marketing-tabs">
        <button 
          className={`tab-btn ${activeTab === 'visits' ? 'active' : ''}`}
          onClick={() => setActiveTab('visits')}
        >
          <FileText size={17} /> Visit Log & Follow-ups
          <span className="tab-count">{visits.length}</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'doctors' ? 'active' : ''}`}
          onClick={() => setActiveTab('doctors')}
        >
          <UserCheck size={17} /> Doctor Directory
          <span className="tab-count">{doctors.length}</span>
        </button>
      </div>

      {/* Toolbar / Search & Filters */}
      <div className="marketing-toolbar">
        <div className="search-box-wrapper">
          <Search size={16} />
          <input 
            type="text" 
            placeholder={activeTab === 'visits' ? "Search doctor, clinic, rep, visit ID..." : "Search doctor name, hospital, phone..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-selects">
          <select 
            className="filter-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Onboarded">Onboarded</option>
            <option value="Query Generated">Query Generated</option>
            <option value="Awaited">Awaited</option>
            <option value="No Response">No Response</option>
          </select>

          <select 
            className="filter-select"
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
          >
            <option value="ALL">All Departments</option>
            {Object.keys(DEPARTMENTS).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {activeTab === 'visits' && (
            <select 
              className="filter-select"
              value={repFilter}
              onChange={e => setRepFilter(e.target.value)}
            >
              <option value="ALL">All Representatives</option>
              {Array.from(new Set(visits.map(v => v.representative_name).filter(Boolean))).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}

          <button 
            className="btn btn-outline" 
            style={{ padding: '0.45rem 0.65rem' }}
            onClick={fetchInitialData}
            title="Refresh Data"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Tab 1: Visits Table */}
      {activeTab === 'visits' && (
        <div className="table-card">
          <table className="marketing-table">
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Visit Date</th>
                <th>Doctor & Hospital</th>
                <th>Department</th>
                <th>Representative</th>
                <th>Services Pitched</th>
                <th>Outcome Status</th>
                <th>Follow-up Due</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    Loading visit records...
                  </td>
                </tr>
              ) : filteredVisits.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No visit records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredVisits.map(v => {
                  let isFollowUpOverdue = false;
                  if (v.next_follow_up_date) {
                    try {
                      isFollowUpOverdue = isBefore(parseISO(v.next_follow_up_date), startOfDay(new Date())) && v.status !== 'Onboarded';
                    } catch (_) {}
                  }

                  return (
                    <tr key={v.id}>
                      <td style={{ fontWeight: '700', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        {v.visit_record_id || 'MVR-—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: '600' }}>{v.visit_date}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{v.doctor_name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{v.hospital_clinic || 'Private Clinic'}</div>
                      </td>
                      <td>
                        <div>{v.department}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{v.speciality}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '500' }}>{v.representative_name}</div>
                      </td>
                      <td>
                        <div className="services-tag-list">
                          {(v.services_offered || []).map((s, idx) => (
                            <span key={idx} className="service-mini-tag">{s}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {renderStatusPill(v.status)}
                        {v.status === 'Query Generated' && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.76rem' }}>
                            <span style={{ 
                              color: v.resolution_status === 'Resolved' ? 'var(--success)' : 'var(--danger)', 
                              fontWeight: '600' 
                            }}>
                              [{v.resolution_status || 'Pending'}]
                            </span>
                            {v.query_details && <span style={{ marginLeft: '0.3rem', color: 'var(--text-muted)' }}>{v.query_details.slice(0, 30)}...</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {v.next_follow_up_date ? (
                          <span style={{ 
                            color: isFollowUpOverdue ? 'var(--danger)' : 'var(--text-main)', 
                            fontWeight: isFollowUpOverdue ? '700' : '500',
                            display: 'flex', alignItems: 'center', gap: '0.3rem'
                          }}>
                            {isFollowUpOverdue && <AlertCircle size={14} color="var(--danger)" />}
                            {v.next_follow_up_date}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {v.status === 'Query Generated' && v.resolution_status !== 'Resolved' && (
                          <button 
                            className="btn btn-outline" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--success)', color: 'var(--success)' }}
                            onClick={() => handleResolveQuery(v.id)}
                            title="Mark Query as Resolved"
                          >
                            <Check size={12} /> Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Doctor Directory */}
      {activeTab === 'doctors' && (
        <div className="table-card">
          <table className="marketing-table">
            <thead>
              <tr>
                <th>Doctor Name</th>
                <th>Hospital / Clinic</th>
                <th>Department & Speciality</th>
                <th>Contact</th>
                <th>OPD Days Available</th>
                <th>Visiting Hours</th>
                <th>Current Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    Loading doctor directory...
                  </td>
                </tr>
              ) : filteredDoctors.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No doctors found matching filters.
                  </td>
                </tr>
              ) : (
                filteredDoctors.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{doc.name}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Building2 size={14} color="var(--text-muted)" />
                        <span>{doc.hospital_clinic || 'Private Practice'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600' }}>{doc.department}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{doc.speciality || 'General'}</div>
                    </td>
                    <td>
                      {doc.contact_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Phone size={13} color="var(--primary)" />
                          <span>{doc.contact_number}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', maxWidth: '200px' }}>
                        {(doc.days_available || []).map((d, i) => (
                          <span key={i} className="service-mini-tag" style={{ background: '#f1f5f9' }}>{d.slice(0, 3)}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {doc.visiting_time_start ? (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {doc.visiting_time_start.slice(0, 5)} – {doc.visiting_time_end ? doc.visiting_time_end.slice(0, 5) : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Flexible</span>
                      )}
                    </td>
                    <td>
                      {renderStatusPill(doc.current_status || 'Awaited')}
                    </td>
                    <td>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={() => setSelectedDoctorTimeline(doc)}
                      >
                        <Eye size={13} /> Visit History
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: Record Visit / Add Doctor */}
      {isVisitModalOpen && (
        <div className="marketing-modal-backdrop" onClick={() => setIsVisitModalOpen(false)}>
          <div className="marketing-modal" onClick={e => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <h2><Briefcase size={20} color="var(--primary)" /> Record Visit / Register Doctor</h2>
              <button className="btn-close" onClick={() => setIsVisitModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitVisit} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="marketing-modal-body">
                
                {/* Section 1: Doctor Profile */}
                <div>
                  <div className="form-section-title">1. Doctor & Facility Information</div>
                  
                  <div className="form-grid-2" style={{ marginBottom: '0.75rem' }}>
                    <div className="form-field">
                      <label>Doctor Selection</label>
                      <select 
                        value={formData.selectedDoctorId}
                        onChange={e => handleDoctorSelect(e.target.value)}
                      >
                        <option value="">+ Register New Doctor</option>
                        {doctors.map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.hospital_clinic || d.department})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-field">
                      <label>Doctor Name *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Dr. Muhammad Tariq"
                        value={formData.doctor_name}
                        onChange={e => setFormData({ ...formData, doctor_name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-grid-3" style={{ marginBottom: '0.75rem' }}>
                    <div className="form-field">
                      <label>Hospital / Clinic Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. City Hospital / Tariq Clinic"
                        value={formData.hospital_clinic}
                        onChange={e => setFormData({ ...formData, hospital_clinic: e.target.value })}
                      />
                    </div>

                    <div className="form-field">
                      <label>Department *</label>
                      <select 
                        value={formData.department}
                        onChange={e => {
                          const dept = e.target.value;
                          const defaultSpec = DEPARTMENTS[dept]?.[0] || 'General';
                          setFormData({ ...formData, department: dept, speciality: defaultSpec });
                        }}
                      >
                        {Object.keys(DEPARTMENTS).map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-field">
                      <label>Speciality</label>
                      <select 
                        value={formData.speciality}
                        onChange={e => setFormData({ ...formData, speciality: e.target.value })}
                      >
                        {(DEPARTMENTS[formData.department] || []).map(spec => (
                          <option key={spec} value={spec}>{spec}</option>
                        ))}
                        <option value="Other">Other (Custom)</option>
                      </select>
                    </div>
                  </div>

                  {formData.speciality === 'Other' && (
                    <div className="form-field" style={{ marginBottom: '0.75rem' }}>
                      <label>Custom Speciality Name</label>
                      <input 
                        type="text"
                        placeholder="Specify speciality..."
                        value={formData.custom_speciality}
                        onChange={e => setFormData({ ...formData, custom_speciality: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="form-grid-3">
                    <div className="form-field">
                      <label>Contact Number</label>
                      <input 
                        type="text" 
                        placeholder="0300-1234567"
                        value={formData.contact_number}
                        onChange={e => setFormData({ ...formData, contact_number: e.target.value })}
                      />
                    </div>

                    <div className="form-field">
                      <label>Visiting Start Time</label>
                      <input 
                        type="time" 
                        value={formData.visiting_time_start}
                        onChange={e => setFormData({ ...formData, visiting_time_start: e.target.value })}
                      />
                    </div>

                    <div className="form-field">
                      <label>Visiting End Time</label>
                      <input 
                        type="time" 
                        value={formData.visiting_time_end}
                        onChange={e => setFormData({ ...formData, visiting_time_end: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-field" style={{ marginTop: '0.75rem' }}>
                    <label>Days Normally Available (Doctor's OPD Schedule)</label>
                    <div className="days-selector">
                      {DAYS_OF_WEEK.map(day => (
                        <button 
                          key={day}
                          type="button"
                          className={`day-pill-btn ${formData.days_available.includes(day) ? 'selected' : ''}`}
                          onClick={() => toggleDay(day)}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section 2: Visit Schedule */}
                <div>
                  <div className="form-section-title">2. Visit Schedule & Marketing Rep</div>
                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Actual Visit Date *</label>
                      <input 
                        type="date" 
                        value={formData.visit_date}
                        onChange={e => setFormData({ ...formData, visit_date: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-field">
                      <label>Marketing Representative *</label>
                      {employees.length > 0 ? (
                        <input 
                          type="text"
                          list="marketing-reps"
                          placeholder="Select or enter representative..."
                          value={formData.representative_name}
                          onChange={e => setFormData({ ...formData, representative_name: e.target.value })}
                          required
                        />
                      ) : (
                        <input 
                          type="text" 
                          placeholder="Staff name..."
                          value={formData.representative_name}
                          onChange={e => setFormData({ ...formData, representative_name: e.target.value })}
                          required
                        />
                      )}
                      <datalist id="marketing-reps">
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.name}>{emp.name} ({emp.role || 'Staff'})</option>
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* Section 3: Services Offered */}
                <div>
                  <div className="form-section-title">3. PDC Services Offered / Pitched</div>
                  <div className="services-checkbox-grid">
                    {services.map(svc => (
                      <label key={svc} className="service-check-item">
                        <input 
                          type="checkbox"
                          checked={formData.services_offered.includes(svc)}
                          onChange={() => toggleService(svc, 'services_offered')}
                        />
                        <span>{svc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Section 4: Visit Outcome Status */}
                <div>
                  <div className="form-section-title">4. Visit Outcome & Status</div>
                  
                  <div className="form-field" style={{ marginBottom: '0.85rem' }}>
                    <label>Visit Status *</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="Onboarded">1. Onboarded (Doctor agreed to refer patients)</option>
                      <option value="Query Generated">2. Query Generated (Raised question on price, test, turnaround)</option>
                      <option value="Awaited">3. Awaited (Decision pending / follow-up requested)</option>
                      <option value="No Response">4. No Response (Doctor busy / clinic closed)</option>
                    </select>
                  </div>

                  {/* Dynamic Fields for Onboarded */}
                  {formData.status === 'Onboarded' && (
                    <div className="outcome-custom-box box-onboarded">
                      <div style={{ fontWeight: '700', color: '#065f46', fontSize: '0.88rem' }}>
                        🎉 Onboarding Details
                      </div>
                      <div className="form-grid-2">
                        <div className="form-field">
                          <label>Onboarding Date</label>
                          <input 
                            type="date" 
                            value={formData.onboarding_date}
                            onChange={e => setFormData({ ...formData, onboarding_date: e.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label>Agreed Services</label>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Selected in Pitch: {formData.services_offered.join(', ') || 'None selected'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Fields for Query Generated */}
                  {formData.status === 'Query Generated' && (
                    <div className="outcome-custom-box box-query">
                      <div style={{ fontWeight: '700', color: '#1e40af', fontSize: '0.88rem' }}>
                        ❓ Query Details
                      </div>
                      <div className="form-field">
                        <label>Doctor's Question / Demand</label>
                        <textarea 
                          rows="2"
                          placeholder="e.g. Asking for CT contrast report delivery within 2 hours, or asking for special discount structure..."
                          value={formData.query_details}
                          onChange={e => setFormData({ ...formData, query_details: e.target.value })}
                        />
                      </div>
                      <div className="form-grid-2">
                        <div className="form-field">
                          <label>Person Responsible</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Marketing Manager / Lab Incharge"
                            value={formData.person_responsible}
                            onChange={e => setFormData({ ...formData, person_responsible: e.target.value })}
                          />
                        </div>
                        <div className="form-field">
                          <label>Resolution Status</label>
                          <select 
                            value={formData.resolution_status}
                            onChange={e => setFormData({ ...formData, resolution_status: e.target.value })}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Fields for Awaited */}
                  {formData.status === 'Awaited' && (
                    <div className="outcome-custom-box box-awaited">
                      <div style={{ fontWeight: '700', color: '#92400e', fontSize: '0.88rem' }}>
                        ⏳ Pending Decision Notes
                      </div>
                      <div className="form-field">
                        <label>Reason Pending</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Doctor evaluating test catalogue, asked to visit after 1 week..."
                          value={formData.pending_decision_reason}
                          onChange={e => setFormData({ ...formData, pending_decision_reason: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Dynamic Fields for No Response */}
                  {formData.status === 'No Response' && (
                    <div className="outcome-custom-box box-no-response">
                      <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '0.88rem' }}>
                        ❌ No Response Details
                      </div>
                      <div className="form-field">
                        <label>Reason for No Response</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Clinic closed / In operation theatre / Did not meet..."
                          value={formData.no_response_reason}
                          onChange={e => setFormData({ ...formData, no_response_reason: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 5: Follow-up & Remarks */}
                <div>
                  <div className="form-section-title">5. Next Follow-up & Remarks</div>
                  <div className="form-grid-2" style={{ marginBottom: '0.75rem' }}>
                    <div className="form-field">
                      <label>Next Follow-up Date</label>
                      <input 
                        type="date" 
                        value={formData.next_follow_up_date}
                        onChange={e => setFormData({ ...formData, next_follow_up_date: e.target.value })}
                      />
                    </div>

                    <div className="form-field">
                      <label>Follow-up Action</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Deliver referral pads, follow up on query..."
                        value={formData.follow_up_action}
                        onChange={e => setFormData({ ...formData, follow_up_action: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label>General Visit Remarks</label>
                    <textarea 
                      rows="2"
                      placeholder="Enter any additional observations or comments..."
                      value={formData.visit_remarks}
                      onChange={e => setFormData({ ...formData, visit_remarks: e.target.value })}
                    />
                  </div>
                </div>

              </div>

              <div className="marketing-modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsVisitModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Visit Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Doctor Visit History Timeline */}
      {selectedDoctorTimeline && (
        <div className="marketing-modal-backdrop" onClick={() => setSelectedDoctorTimeline(null)}>
          <div className="marketing-modal" style={{ maxWidth: '650px' }} onClick={e => e.stopPropagation()}>
            <div className="marketing-modal-header">
              <div>
                <h2>{selectedDoctorTimeline.name}</h2>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {selectedDoctorTimeline.hospital_clinic} • {selectedDoctorTimeline.department} ({selectedDoctorTimeline.speciality})
                </div>
              </div>
              <button className="btn-close" onClick={() => setSelectedDoctorTimeline(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="marketing-modal-body" style={{ maxHeight: '60vh' }}>
              <div style={{ marginBottom: '1rem', background: 'var(--secondary)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>Current Status:</strong> {renderStatusPill(selectedDoctorTimeline.current_status || 'Awaited')}</span>
                  <span><strong>Contact:</strong> {selectedDoctorTimeline.contact_number || 'N/A'}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  <strong>OPD Schedule:</strong> {(selectedDoctorTimeline.days_available || []).join(', ') || 'N/A'} 
                  {selectedDoctorTimeline.visiting_time_start && ` (${selectedDoctorTimeline.visiting_time_start.slice(0, 5)} - ${selectedDoctorTimeline.visiting_time_end?.slice(0, 5)})`}
                </div>
              </div>

              <div className="form-section-title">Complete Visit Timeline ({doctorVisitHistory.length} visits)</div>
              
              {doctorVisitHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                  No historical visits logged for this doctor yet.
                </div>
              ) : (
                <div style={{ marginTop: '1rem' }}>
                  {doctorVisitHistory.map((v, idx) => (
                    <div key={v.id || idx} className="timeline-item">
                      <div className="timeline-dot" />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontWeight: '700', color: 'var(--primary)', marginRight: '0.5rem' }}>
                            {v.visit_record_id || 'Visit'}
                          </span>
                          <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{v.visit_date}</span>
                        </div>
                        {renderStatusPill(v.status)}
                      </div>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Visited by <strong>{v.representative_name}</strong>
                      </div>

                      {v.services_offered && v.services_offered.length > 0 && (
                        <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {v.services_offered.map((s, si) => (
                            <span key={si} className="service-mini-tag">{s}</span>
                          ))}
                        </div>
                      )}

                      {v.visit_remarks && (
                        <div style={{ fontSize: '0.82rem', marginTop: '0.35rem', fontStyle: 'italic' }}>
                          "{v.visit_remarks}"
                        </div>
                      )}

                      {v.query_details && (
                        <div style={{ fontSize: '0.8rem', background: '#eff6ff', padding: '0.35rem 0.6rem', borderRadius: '4px', marginTop: '0.35rem' }}>
                          <strong>Query:</strong> {v.query_details} [{v.resolution_status || 'Pending'}]
                        </div>
                      )}

                      {v.next_follow_up_date && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: '0.3rem' }}>
                          📅 Next follow-up: {v.next_follow_up_date} {v.follow_up_action ? `(${v.follow_up_action})` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="marketing-modal-footer">
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => {
                  setSelectedDoctorTimeline(null);
                  handleDoctorSelect(selectedDoctorTimeline.id);
                  setIsVisitModalOpen(true);
                }}
              >
                <Plus size={16} /> Log Another Visit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
