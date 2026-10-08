import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { Users, TrendingUp, Calendar, X, Trophy, Search, ChevronRight, Award } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, isWithinInterval } from 'date-fns';
import './ReferredByPage.css';

const TIME_PRESETS = [
  { key: 'all',        label: 'All Time' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_30',    label: 'Last 30 Days' },
  { key: 'last_7',     label: 'Last 7 Days' },
];

function getDateRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last_week': {
      const lastWeek = subWeeks(now, 1);
      return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
    }
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_30':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case 'last_7':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    default:
      return null;
  }
}

const MEDAL_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];
const MEDAL_LABELS = ['1st', '2nd', '3rd'];
const MEDAL_ICONS = ['🥇', '🥈', '🥉'];

export default function ReferredByPage() {
  const [allOrders, setAllOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timePreset, setTimePreset] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Doctor drill-down modal
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [modalSearch, setModalSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_date,
        final_total_pkr,
        patients (
          id,
          name,
          phone_number,
          age,
          gender,
          referred_by
        )
      `)
      .order('order_date', { ascending: false });

    if (error) console.error('Error fetching data:', error);
    else if (data) setAllOrders(data);
    setIsLoading(false);
  }

  // Filter orders by time range
  const filteredOrders = useMemo(() => {
    const range = getDateRange(timePreset);
    if (!range) return allOrders;
    return allOrders.filter(order => {
      const date = parseISO(order.order_date);
      return isWithinInterval(date, { start: range.start, end: range.end });
    });
  }, [allOrders, timePreset]);

  // Build doctor stats from filtered orders
  const doctorStats = useMemo(() => {
    const map = {};
    for (const order of filteredOrders) {
      const raw = order.patients?.referred_by;
      if (!raw || !raw.trim()) continue;
      const name = raw.trim();
      if (!map[name]) {
        map[name] = { name, patientCount: 0, totalRevenue: 0, orders: [] };
      }
      map[name].patientCount += 1;
      map[name].totalRevenue += Number(order.final_total_pkr || 0);
      map[name].orders.push(order);
    }
    return Object.values(map).sort((a, b) => b.patientCount - a.patientCount);
  }, [filteredOrders]);

  const topThree = doctorStats.slice(0, 3);

  const filteredDoctors = useMemo(() => {
    if (!searchQuery.trim()) return doctorStats;
    const q = searchQuery.toLowerCase();
    return doctorStats.filter(d => d.name.toLowerCase().includes(q));
  }, [doctorStats, searchQuery]);

  // Total stats
  const totalPatients = filteredOrders.filter(o => o.patients?.referred_by?.trim()).length;
  const totalRevenue = doctorStats.reduce((s, d) => s + d.totalRevenue, 0);

  // Modal patients filtered by search
  const modalPatients = useMemo(() => {
    if (!selectedDoctor) return [];
    if (!modalSearch.trim()) return selectedDoctor.orders;
    const q = modalSearch.toLowerCase();
    return selectedDoctor.orders.filter(o =>
      o.patients?.name?.toLowerCase().includes(q) ||
      o.patients?.phone_number?.includes(q)
    );
  }, [selectedDoctor, modalSearch]);

  return (
    <div className="referred-layout">
      {/* Header + Time Filters */}
      <div className="referred-header-row">
        <div>
          <h2 className="referred-title">Referred By</h2>
          <p className="referred-subtitle">Track patient referrals from doctors</p>
        </div>
        <div className="time-filter-group">
          {TIME_PRESETS.map(p => (
            <button
              key={p.key}
              className={`filter-btn ${timePreset === p.key ? 'active' : ''}`}
              onClick={() => setTimePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="referred-loading">
          <div className="spinner" />
          <p>Loading referral data...</p>
        </div>
      ) : (
        <>
          {/* Summary Stat Cards */}
          <div className="referred-summary-cards">
            <div className="ref-stat-card">
              <div className="ref-stat-icon blue">
                <Users size={22} />
              </div>
              <div>
                <div className="ref-stat-label">Referred Patients</div>
                <div className="ref-stat-value">{totalPatients}</div>
              </div>
            </div>
            <div className="ref-stat-card">
              <div className="ref-stat-icon green">
                <TrendingUp size={22} />
              </div>
              <div>
                <div className="ref-stat-label">Referred Revenue</div>
                <div className="ref-stat-value">Rs {totalRevenue.toLocaleString()}</div>
              </div>
            </div>
            <div className="ref-stat-card">
              <div className="ref-stat-icon purple">
                <Award size={22} />
              </div>
              <div>
                <div className="ref-stat-label">Referring Doctors</div>
                <div className="ref-stat-value">{doctorStats.length}</div>
              </div>
            </div>
          </div>

          {/* Top 3 Podium */}
          {topThree.length > 0 && (
            <div className="top-doctors-section">
              <div className="section-title">
                <Trophy size={18} />
                Top Referring Doctors
              </div>
              <div className="podium-grid">
                {topThree.map((doc, idx) => (
                  <div
                    key={doc.name}
                    className={`podium-card rank-${idx + 1}`}
                    style={{ '--medal-color': MEDAL_COLORS[idx] }}
                    onClick={() => { setSelectedDoctor(doc); setModalSearch(''); }}
                  >
                    <div className="podium-medal">{MEDAL_ICONS[idx]}</div>
                    <div className="podium-rank">{MEDAL_LABELS[idx]}</div>
                    <div className="podium-name">{doc.name}</div>
                    <div className="podium-stats">
                      <span className="podium-patients">{doc.patientCount} patients</span>
                      <span className="podium-revenue">Rs {doc.totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="podium-view-btn">View Patients <ChevronRight size={14} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Doctors Table */}
          <div className="card referred-table-card">
            <div className="card-header flex-between">
              <span>All Referring Doctors</span>
              <div className="search-bar" style={{ width: '260px' }}>
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search doctor..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="card-body p-0">
              {filteredDoctors.length === 0 ? (
                <div className="empty-state">
                  {doctorStats.length === 0
                    ? 'No referral data found for this period.'
                    : 'No doctors match your search.'}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table referred-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Doctor Name</th>
                        <th className="text-center">Patients Referred</th>
                        <th className="text-right">Total Revenue</th>
                        <th className="text-right">Avg. per Patient</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDoctors.map((doc, idx) => (
                        <tr
                          key={doc.name}
                          className="referred-row"
                          onClick={() => { setSelectedDoctor(doc); setModalSearch(''); }}
                        >
                          <td className="rank-cell">
                            {idx < 3 ? (
                              <span className="rank-badge" style={{ background: MEDAL_COLORS[idx] + '22', color: MEDAL_COLORS[idx] }}>
                                {MEDAL_ICONS[idx]}
                              </span>
                            ) : (
                              <span className="rank-num">{idx + 1}</span>
                            )}
                          </td>
                          <td>
                            <span className="doctor-name">{doc.name}</span>
                          </td>
                          <td className="text-center">
                            <div className="patient-count-cell">
                              <div
                                className="count-bar"
                                style={{
                                  width: `${Math.round((doc.patientCount / doctorStats[0].patientCount) * 100)}%`
                                }}
                              />
                              <span className="count-label">{doc.patientCount}</span>
                            </div>
                          </td>
                          <td className="text-right font-semibold text-primary">
                            Rs {doc.totalRevenue.toLocaleString()}
                          </td>
                          <td className="text-right text-muted">
                            Rs {Math.round(doc.totalRevenue / doc.patientCount).toLocaleString()}
                          </td>
                          <td className="text-right">
                            <span className="view-link">
                              View <ChevronRight size={14} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Doctor Drill-down Modal */}
      {selectedDoctor && (
        <div className="modal-overlay" onClick={() => setSelectedDoctor(null)}>
          <div className="modal-content referred-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{selectedDoctor.name}</h2>
                <p className="modal-subtitle">
                  {selectedDoctor.patientCount} patients · Rs {selectedDoctor.totalRevenue.toLocaleString()} total
                </p>
              </div>
              <button className="close-btn" onClick={() => setSelectedDoctor(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {/* Search inside modal */}
              <div className="search-bar mb-4" style={{ width: '100%' }}>
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by patient name or phone..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                />
              </div>

              <div className="modal-patients-list">
                {modalPatients.length === 0 ? (
                  <div className="empty-state">No patients match your search.</div>
                ) : (
                  modalPatients.map((order, i) => (
                    <div key={order.id} className="modal-patient-row">
                      <div className="mp-index">{i + 1}</div>
                      <div className="mp-info">
                        <div className="mp-name">{order.patients?.name || 'N/A'}</div>
                        <div className="mp-meta">
                          {order.patients?.age && <span>{order.patients.age} yrs</span>}
                          {order.patients?.gender && <span>{order.patients.gender}</span>}
                          {order.patients?.phone_number && <span>{order.patients.phone_number}</span>}
                          <span className="mp-date">
                            <Calendar size={12} />
                            {format(parseISO(order.order_date), 'dd MMM yyyy')}
                          </span>
                        </div>
                      </div>
                      <div className="mp-amount">
                        Rs {Number(order.final_total_pkr).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Modal Totals */}
              <div className="modal-totals-row">
                <span>{modalPatients.length} patient{modalPatients.length !== 1 ? 's' : ''}</span>
                <span className="modal-total-amount">
                  Rs {modalPatients.reduce((s, o) => s + Number(o.final_total_pkr || 0), 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
