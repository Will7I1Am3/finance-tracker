import { useState, useEffect } from "react";
import { getTransactions } from "../api/transactions";
import { useDataRefresh } from "../DataRefreshContext";
import PeriodSelector from "../components/PeriodSelector";
import styles from "./Transactions.module.css";

export default function Transactions() {
  const { refreshKey } = useDataRefresh();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [range, setRange]               = useState({ start: "", end: "" });

  useEffect(() => {
    getTransactions()
      .then(setTransactions)
      .catch(() => setError("Failed to load transactions."))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const { start, end } = range;
  const filtered = start && end
    ? [...transactions.filter(t => t.date >= start && t.date <= end)].sort((a, b) => b.date.localeCompare(a.date))
    : [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  const totalSpend = filtered.reduce((s, t) => s + parseFloat(t.amount), 0);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>Transactions</h1>
        <PeriodSelector onChange={setRange} />
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
