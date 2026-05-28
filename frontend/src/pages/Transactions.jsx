import { useState, useEffect } from "react";
import { getTransactions } from "../api/transactions";
import { getPeriodBounds, getPeriodLabel, makePeriodNav } from "../utils/period";
import { useDataRefresh } from "../DataRefreshContext";
import styles from "./Transactions.module.css";

export default function Transactions() {
  const { refreshKey } = useDataRefresh();
  const now = new Date();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");

  const [periodMode, setPeriodMode] = useState("month");
  const [anchor, setAnchor]         = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { goBack, goForward, isAtNow } = makePeriodNav(anchor, setAnchor);

  useEffect(() => {
    getTransactions()
      .then(setTransactions)
      .catch(() => setError("Failed to load transactions."))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const { start, end } = getPeriodBounds(periodMode, anchor);
  const filtered = [...transactions.filter(t => t.date >= start && t.date <= end)]
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalSpend = filtered.reduce((s, t) => s + parseFloat(t.amount), 0);

  const periodModes = [
    { v: "month",    l: "Month" },
    { v: "3months",  l: "3 Mo"  },
    { v: "12months", l: "Year"  },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Transactions</h1>
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

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : transactions.length === 0 ? (
        <p className={styles.muted}>No transactions yet — upload a statement to get started.</p>
      ) : filtered.length === 0 ? (
        <p className={styles.muted}>No transactions in this period — try a different range.</p>
      ) : (
        <>
          <div className={styles.summary}>
            <span className={styles.summaryCount}>{filtered.length} transactions</span>
            <span className={styles.summaryDot}>·</span>
            <span className={styles.summaryTotal}>${totalSpend.toFixed(2)} total</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Card</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Loc</th>
                  <th className={styles.amountTh}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td className={styles.dateTd}>{t.date}</td>
                    <td className={styles.cardTd}>{t.card_name}</td>
                    <td>{t.description}</td>
                    <td><span className={styles.badge}>{t.category}</span></td>
                    <td className={styles.mutedTd}>{t.location || "—"}</td>
                    <td className={styles.amountTd}>${t.amount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.footRow}>
                  <td colSpan={5} className={styles.footLabel}>Total</td>
                  <td className={styles.footAmount}>${totalSpend.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
