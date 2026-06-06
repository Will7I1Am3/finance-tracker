import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";
import { useSettings } from "../SettingsContext";
import { useDataRefresh } from "../DataRefreshContext";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  getAdminStats,
  getAdminUsers,
  getSiteActivity,
  getUserSignups,
  getSiteCosts,
  getUserActivity,
  resetUserUsage,
  deleteUser,
} from "../api/admin";
import styles from "./Admin.module.css";

const CHART = {
  dark:  { tick: "#5E6785", bg: "#161927", border: "#272D42", label: "#DCE0EF", cursor: "rgba(104,117,245,0.08)" },
  light: { tick: "#8B91A8", bg: "#FFFFFF",  border: "#D4D8EB", label: "#1A1D2E", cursor: "rgba(84,102,240,0.08)" },
};

const RANGES = [
  { value: "7d",  label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

function RangeToggle({ value, onChange }) {
  return (
    <div className={styles.rangeToggle}>
      {RANGES.map(r => (
        <button
          key={r.value}
          className={value === r.value ? `${styles.rangeBtn} ${styles.rangeBtnActive}` : styles.rangeBtn}
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function ActivityChart({ data, dataKey, color, c, yFormatter }) {
  if (!data.length) return <p className={styles.muted}>No data for this range.</p>;
  const isCost = !!yFormatter;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: c.tick, fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis
          tick={{ fill: c.tick, fontSize: 11 }}
          allowDecimals={isCost}
          width={isCost ? 58 : 30}
          tickFormatter={yFormatter}
        />
        <Tooltip
          contentStyle={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13 }}
          labelStyle={{ color: c.label, fontWeight: 600 }}
          cursor={{ stroke: c.border, strokeWidth: 1 }}
          formatter={yFormatter ? (v) => [yFormatter(v)] : undefined}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const fmtCost = (v) => `$${Number(v).toFixed(4)}`;

function fmtTs(ts, tz) {
  if (!ts) return null;
  return new Date(ts + "Z").toLocaleDateString("en-US", {
    timeZone: tz,
    year: "numeric", month: "short", day: "numeric",
  });
}

function UserDrillDown({ user, c, tz, refreshKey, onClose, onResetDone, onDeleteDone }) {
  const [range, setRange] = useState("7d");
  const [activity, setActivity] = useState([]);
  const [loadingAct, setLoadingAct] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoadingAct(true);
    getUserActivity(user.id, range, tz)
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setLoadingAct(false));
  }, [user.id, range, tz, refreshKey]);

  const handleReset = async () => {
    setResetting(true);
    setError("");
    try {
      await resetUserUsage(user.id);
      onResetDone(user.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete all data for ${user.email}? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await deleteUser(user.id);
      onDeleteDone(user.id);
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div className={styles.drillDown}>
      <div className={styles.drillHeader}>
        <span className={styles.drillEmail}>{user.email}</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.drillStats}>
        <div className={styles.drillStat}>
          <div className={styles.drillStatLabel}>Uploads today</div>
          <div className={styles.drillStatValue}>{user.uploads_today}</div>
        </div>
        <div className={styles.drillStat}>
          <div className={styles.drillStatLabel}>Uploads total</div>
          <div className={styles.drillStatValue}>{user.uploads_total}</div>
        </div>
        <div className={styles.drillStat}>
          <div className={styles.drillStatLabel}>Statements</div>
          <div className={styles.drillStatValue}>{user.statement_count}</div>
        </div>
        <div className={styles.drillStat}>
          <div className={styles.drillStatLabel}>Est. cost</div>
          <div className={styles.drillStatValue}>${user.estimated_cost.toFixed(4)}</div>
        </div>
        <div className={styles.drillStat}>
          <div className={styles.drillStatLabel}>Last active</div>
          <div className={styles.drillStatValue}>{user.last_active ?? "Never"}</div>
        </div>
        <div className={styles.drillStat}>
          <div className={styles.drillStatLabel}>Signed up</div>
          <div className={styles.drillStatValue}>
            {user.created_at ? fmtTs(user.created_at, tz) : "Before tracking"}
          </div>
        </div>
      </div>

      <div className={styles.drillChartHeader}>
        <span className={styles.drillChartTitle}>Upload history</span>
        <RangeToggle value={range} onChange={setRange} />
      </div>
      {loadingAct ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <ActivityChart data={activity} dataKey="uploads" color="#6875F5" c={c} />
      )}

      {error && <p className={styles.errorMsg}>{error}</p>}

      <div className={styles.drillActions}>
        <button
          className={styles.resetBtn}
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? "Resetting…" : "Reset today's limit"}
        </button>
        <button
          className={styles.deleteBtn}
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete user"}
        </button>
      </div>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { resolvedTimezone } = useSettings();
  const { refreshKey } = useDataRefresh();
  const c = CHART[theme] || CHART.dark;

  const [stats, setStats]         = useState(null);
  const [users, setUsers]         = useState([]);
  const [activity, setActivity]   = useState([]);
  const [signups, setSignups]     = useState([]);
  const [costs, setCosts]         = useState([]);
  const [actRange, setActRange]   = useState("7d");
  const [sigRange, setSigRange]   = useState("7d");
  const [costRange, setCostRange] = useState("7d");
  const [search, setSearch]       = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expandedId, setExpandedId]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (user && !user.is_admin) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    Promise.all([getAdminStats(resolvedTimezone), getAdminUsers(search, resolvedTimezone)])
      .then(([s, u]) => { setStats(s); setUsers(u); })
      .catch(() => setError("Failed to load admin data."))
      .finally(() => setLoading(false));
  }, [refreshKey, resolvedTimezone]);

  useEffect(() => {
    getSiteActivity(actRange, resolvedTimezone).then(setActivity).catch(() => setActivity([]));
  }, [actRange, resolvedTimezone, refreshKey]);

  useEffect(() => {
    getUserSignups(sigRange, resolvedTimezone).then(setSignups).catch(() => setSignups([]));
  }, [sigRange, resolvedTimezone, refreshKey]);

  useEffect(() => {
    getSiteCosts(costRange, resolvedTimezone).then(setCosts).catch(() => setCosts([]));
  }, [costRange, resolvedTimezone, refreshKey]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    getAdminUsers(searchInput.trim(), resolvedTimezone).then(setUsers).catch(() => {});
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearch("");
    getAdminUsers("", resolvedTimezone).then(setUsers).catch(() => {});
  };

  const handleResetDone = useCallback((userId) => {
    setUsers(prev =>
      prev.map(u => u.id === userId ? { ...u, uploads_today: 0 } : u)
    );
  }, []);

  const handleDeleteDone = useCallback((userId) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    setExpandedId(null);
  }, []);

  if (!user?.is_admin) return null;
  if (loading) return <p className={styles.muted}>Loading…</p>;
  if (error)   return <p className={styles.errorMsg}>{error}</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Admin</h1>

      {/* KPI strip */}
      <div className={styles.kpiRow}>
        {[
          { label: "Total Users",        value: stats.total_users },
          { label: "Uploads",              value: stats.total_llm_calls },
          { label: "Statements Saved",   value: stats.total_statements },
          { label: "Save Rate",          value: stats.save_rate != null ? `${stats.save_rate}%` : "—" },
          { label: "Active This Week",   value: stats.active_this_week },
        ].map(({ label, value }) => (
          <div key={label} className={styles.kpi}>
            <div className={styles.kpiLabel}>{label}</div>
            <div className={styles.kpiValue}>{value}</div>
          </div>
        ))}
      </div>

      {/* 2×2 chart grid */}
      <div className={styles.chartsGrid}>
        {/* Top left: New Signups */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>New Signups</h2>
            <RangeToggle value={sigRange} onChange={setSigRange} />
          </div>
          <ActivityChart data={signups} dataKey="new_users" color="#3ABDA0" c={c} />
        </div>

        {/* Top right: Upload Activity */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Upload Activity</h2>
            <RangeToggle value={actRange} onChange={setActRange} />
          </div>
          <ActivityChart data={activity} dataKey="uploads" color="#6875F5" c={c} />
        </div>

        {/* Bottom left: Cost per Day */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Cost per Day</h2>
            <RangeToggle value={costRange} onChange={setCostRange} />
          </div>
          <ActivityChart data={costs} dataKey="cost_day" color="#F59E0B" c={c} yFormatter={fmtCost} />
        </div>

        {/* Bottom right: Cumulative Cost */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Cumulative Cost</h2>
            <RangeToggle value={costRange} onChange={setCostRange} />
          </div>
          <ActivityChart data={costs} dataKey="cost_cumulative" color="#EC4899" c={c} yFormatter={fmtCost} />
        </div>
      </div>

      {/* User management */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Users</h2>
          <form className={styles.searchForm} onSubmit={handleSearch}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search by email…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            <button className={styles.searchBtn} type="submit">Search</button>
            {search && (
              <button className={styles.clearBtn} type="button" onClick={handleClearSearch}>
                Clear
              </button>
            )}
          </form>
        </div>

        {users.length === 0 ? (
          <p className={styles.muted}>No users found.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Uploads today</th>
                  <th>Uploads total</th>
                  <th>Statements</th>
                  <th>Est. cost</th>
                  <th>Last active</th>
                  <th>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <>
                    <tr
                      key={u.id}
                      className={`${styles.userRow} ${expandedId === u.id ? styles.userRowExpanded : ""}`}
                      onClick={() => setExpandedId(prev => prev === u.id ? null : u.id)}
                    >
                      <td className={styles.emailTd}>{u.email}</td>
                      <td>{u.uploads_today}</td>
                      <td>{u.uploads_total}</td>
                      <td>{u.statement_count}</td>
                      <td>${u.estimated_cost.toFixed(4)}</td>
                      <td className={styles.mutedTd}>{u.last_active ?? "—"}</td>
                      <td className={styles.mutedTd}>
                        {u.created_at ? fmtTs(u.created_at, resolvedTimezone) : "—"}
                      </td>
                    </tr>
                    {expandedId === u.id && (
                      <tr key={`${u.id}-detail`} className={styles.detailRow}>
                        <td colSpan={7} className={styles.detailCell}>
                          <UserDrillDown
                            user={u}
                            c={c}
                            tz={resolvedTimezone}
                            refreshKey={refreshKey}
                            onClose={() => setExpandedId(null)}
                            onResetDone={handleResetDone}
                            onDeleteDone={handleDeleteDone}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
