import { useState, useEffect } from "react";
import { getTransactions } from "../api/transactions";
import { useTheme } from "../ThemeContext";
import { useDataRefresh } from "../DataRefreshContext";
import { getPeriodBounds, getPeriodLabel, makePeriodNav } from "../utils/period";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
  PieChart, Pie,
} from "recharts";
import styles from "./Dashboard.module.css";

const PALETTE = [
  "#6875F5", "#3EADCF", "#3ABDA0", "#F5A855", "#F06060",
  "#A78BFA", "#FB923C", "#34D399", "#F472B6", "#38BDF8",
];

const CHART = {
  dark:  { tick:"#5E6785", bg:"#161927", border:"#272D42", label:"#DCE0EF", cursor:"rgba(104,117,245,0.08)" },
  light: { tick:"#8B91A8", bg:"#FFFFFF",  border:"#D4D8EB", label:"#1A1D2E", cursor:"rgba(84,102,240,0.08)"  },
};

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className={styles.toggleGroup}>
      {options.map(o => (
        <button
          key={o.value}
          className={value === o.value ? `${styles.toggleBtn} ${styles.toggleActive}` : styles.toggleBtn}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChartBlock({ data, metric, chartType, c }) {
  const key    = metric;
  const fmt    = v => metric === "spend" ? `$${Number(v).toFixed(2)}` : String(v);
  const fmtSh  = v => metric === "spend" ? `$${Number(v).toFixed(0)}` : String(v);
  const tipLabel = metric === "spend" ? "Spent" : "Transactions";
  const tipStyle = { background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 13 };
  const labelStyle = { color: c.label, fontWeight: 600 };
  const rotated = data.length > 5;
  const coloredData = data.map((d, i) => ({ ...d, fill: PALETTE[i % PALETTE.length] }));

  if (chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={coloredData} margin={{ top: 28, right: 16, bottom: rotated ? 70 : 20, left: 8 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: c.tick, fontSize: 12 }}
            angle={rotated ? -38 : 0}
            textAnchor={rotated ? "end" : "middle"}
            interval={0}
          />
          <YAxis
            tick={{ fill: c.tick, fontSize: 12 }}
            tickFormatter={v => metric === "spend" ? `$${v}` : String(v)}
            width={metric === "spend" ? 68 : 36}
          />
          <Tooltip
            formatter={v => [fmt(v), tipLabel]}
            contentStyle={tipStyle}
            labelStyle={labelStyle}
            cursor={{ fill: c.cursor }}
          />
          <Bar dataKey={key} radius={[5, 5, 0, 0]}>
            <LabelList
              dataKey={key}
              position="top"
              formatter={fmtSh}
              style={{ fill: c.tick, fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const RADIAN = Math.PI / 180;
  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
      <div style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        lineHeight: 1.6,
      }}>
        <div style={{ color: c.label, fontWeight: 600 }}>{name}</div>
        <div style={{ color: c.tick }}>{fmt(value)}</div>
      </div>
    );
  };

  const renderPieLabel = ({ cx, cy: pcy, midAngle, innerRadius, outerRadius, percent, value, name }) => {
    if (percent < 0.04) return null;
    const angle = -midAngle * RADIAN;

    // Outer label line + text
    const lx1 = cx + outerRadius * Math.cos(angle);
    const ly1 = pcy + outerRadius * Math.sin(angle);
    const lx2 = cx + (outerRadius + 18) * Math.cos(angle);
    const ly2 = pcy + (outerRadius + 18) * Math.sin(angle);
    const tx   = cx + (outerRadius + 22) * Math.cos(angle);
    const ty   = pcy + (outerRadius + 22) * Math.sin(angle);
    const anchor = tx > cx ? "start" : "end";

    // Inner percent (only for large enough slices to avoid clipping)
    const ir = (innerRadius + outerRadius) / 2;
    const ix = cx + ir * Math.cos(angle);
    const iy = pcy + ir * Math.sin(angle);

    return (
      <g>
        <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={c.tick} strokeWidth={1} opacity={0.5} />
        <text x={tx} y={ty - 7} textAnchor={anchor} fill={c.tick} fontSize={13}>
          {name}
        </text>
        <text x={tx} y={ty + 9} textAnchor={anchor} fill={c.tick} fontSize={13} opacity={0.75}>
          {fmtSh(value)}
        </text>
        {percent >= 0.07 && (
          <text
            x={ix} y={iy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize={12}
            fontWeight={700}
          >
            {(percent * 100).toFixed(1)}%
          </text>
        )}
      </g>
    );
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={420}>
        <PieChart>
          <Pie
            data={coloredData}
            dataKey={key}
            nameKey="name"
            cx="50%"
            cy="47%"
            outerRadius={120}
            label={renderPieLabel}
            labelLine={false}
          />
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className={styles.pieLegend}>
        {coloredData.map(d => (
          <div key={d.name} className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: d.fill }} />
            <span className={styles.legendLabel}>{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { theme } = useTheme();
  const c = CHART[theme] || CHART.dark;
  const { refreshKey } = useDataRefresh();

  const now = new Date();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");

  const [periodMode, setPeriodMode] = useState("month");
  const [anchor, setAnchor]         = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { goBack, goForward, isAtNow } = makePeriodNav(anchor, setAnchor);

  const [catType,    setCatType]    = useState("bar");
  const [catMetric,  setCatMetric]  = useState("spend");
  const [cardType,   setCardType]   = useState("bar");
  const [cardMetric, setCardMetric] = useState("spend");
  const [selectedCard, setSelectedCard] = useState(null);

  useEffect(() => {
    getTransactions()
      .then(setTransactions)
      .catch(() => setError("Failed to load data."))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const { start, end } = getPeriodBounds(periodMode, anchor);
  const filtered = transactions.filter(t => t.date >= start && t.date <= end);
  const totalSpend = filtered.reduce((s, t) => s + parseFloat(t.amount), 0);

  const catMap = {};
  for (const t of filtered) {
    if (!catMap[t.category]) catMap[t.category] = { spend: 0, count: 0 };
    catMap[t.category].spend += parseFloat(t.amount);
    catMap[t.category].count += 1;
  }
  const catData = Object.entries(catMap)
    .map(([name, v]) => ({ name, spend: parseFloat(v.spend.toFixed(2)), count: v.count }))
    .sort((a, b) => b.spend - a.spend);

  const cardAggMap = {};
  for (const t of filtered) {
    if (!cardAggMap[t.card_name]) cardAggMap[t.card_name] = { spend: 0, count: 0 };
    cardAggMap[t.card_name].spend += parseFloat(t.amount);
    cardAggMap[t.card_name].count += 1;
  }
  const cardData = Object.entries(cardAggMap)
    .map(([name, v]) => ({ name, spend: parseFloat(v.spend.toFixed(2)), count: v.count }))
    .sort((a, b) => b.spend - a.spend);

  const cardTxns = selectedCard
    ? [...filtered.filter(t => t.card_name === selectedCard)].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  if (loading) return <p className={styles.muted}>Loading…</p>;
  if (error)   return <p className={styles.error}>{error}</p>;
  if (transactions.length === 0) {
    return (
      <div className={styles.page}>
        <h1>Dashboard</h1>
        <p className={styles.muted}>No data yet — upload a statement to get started.</p>
      </div>
    );
  }

  const periodModes = [
    { v: "month",    l: "Month" },
    { v: "3months",  l: "3 Mo"  },
    { v: "12months", l: "Year"  },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Dashboard</h1>
        <div className={styles.periodControls}>
          <div className={styles.modeGroup}>
            {periodModes.map(({ v, l }) => (
              <button
                key={v}
                className={periodMode === v ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
                onClick={() => setPeriodMode(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className={styles.navGroup}>
            <button className={styles.navBtn} onClick={goBack}>‹</button>
            <span className={styles.periodLabel}>{getPeriodLabel(periodMode, anchor)}</span>
            <button className={styles.navBtn} onClick={goForward} disabled={isAtNow}>›</button>
          </div>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Total Spend</div>
          <div className={styles.statValue}>${totalSpend.toFixed(2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Transactions</div>
          <div className={styles.statValue}>{filtered.length}</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.muted}>No transactions in this period — try a different range.</p>
      ) : (
        <>
          {/* Cards section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>By Card</h2>
              <div className={styles.chartControls}>
                <ToggleGroup
                  options={[{ value: "spend", label: "Spend" }, { value: "count", label: "# Txns" }]}
                  value={cardMetric}
                  onChange={setCardMetric}
                />
                <ToggleGroup
                  options={[{ value: "bar", label: "Bar" }, { value: "pie", label: "Pie" }]}
                  value={cardType}
                  onChange={setCardType}
                />
              </div>
            </div>

            <div className={styles.cardTiles}>
              {cardData.map((item, i) => {
                const isSelected = selectedCard === item.name;
                return (
                  <button
                    key={item.name}
                    className={`${styles.cardTile} ${isSelected ? styles.cardTileSelected : ""}`}
                    onClick={() => setSelectedCard(prev => prev === item.name ? null : item.name)}
                  >
                    <div className={styles.tileAccent} style={{ background: PALETTE[i % PALETTE.length] }} />
                    <div className={styles.tileName}>{item.name}</div>
                    <div className={styles.tileSpend}>${item.spend.toFixed(2)}</div>
                    <div className={styles.tileCount}>{item.count} txn{item.count !== 1 ? "s" : ""}</div>
                  </button>
                );
              })}
            </div>

            {selectedCard && (
              <div className={styles.cardDetail}>
                <div className={styles.cardDetailHeader}>
                  <span className={styles.cardDetailTitle}>
                    {selectedCard}
                    <span className={styles.cardDetailSub}>
                      {" "}— {cardTxns.length} transactions · ${cardTxns.reduce((s, t) => s + parseFloat(t.amount), 0).toFixed(2)}
                    </span>
                  </span>
                  <button className={styles.closeBtn} onClick={() => setSelectedCard(null)}>✕</button>
                </div>
                <div className={styles.detailTableWrap}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Loc</th>
                        <th className={styles.amountTh}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardTxns.map(t => (
                        <tr key={t.id}>
                          <td className={styles.dateTd}>{t.date}</td>
                          <td>{t.description}</td>
                          <td><span className={styles.badge}>{t.category}</span></td>
                          <td className={styles.mutedTd}>{t.location || "—"}</td>
                          <td className={styles.amountTd}>${t.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className={styles.chartWrap}>
              <ChartBlock data={cardData} metric={cardMetric} chartType={cardType} c={c} />
            </div>
          </div>

          {/* Categories section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>By Category</h2>
              <div className={styles.chartControls}>
                <ToggleGroup
                  options={[{ value: "spend", label: "Spend" }, { value: "count", label: "# Txns" }]}
                  value={catMetric}
                  onChange={setCatMetric}
                />
                <ToggleGroup
                  options={[{ value: "bar", label: "Bar" }, { value: "pie", label: "Pie" }]}
                  value={catType}
                  onChange={setCatType}
                />
              </div>
            </div>
            <div className={styles.chartWrap}>
              <ChartBlock data={catData} metric={catMetric} chartType={catType} c={c} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
