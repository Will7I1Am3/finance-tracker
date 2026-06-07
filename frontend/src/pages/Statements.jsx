import { useState, useEffect } from "react";
import { getStatements, deleteStatement } from "../api/statements";
import { getCards } from "../api/cards";
import StatementCard from "../components/StatementCard";
import PeriodSelector from "../components/PeriodSelector";
import { useDataRefresh } from "../DataRefreshContext";
import styles from "./Statements.module.css";

export default function Statements() {
  const { refreshKey } = useDataRefresh();
  const [statements, setStatements] = useState([]);
  const [cards, setCards] = useState([]);
  const [filterCard, setFilterCard] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ start: "", end: "" });

  useEffect(() => {
    getCards().then(setCards).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getStatements(filterCard || undefined)
      .then(data => setStatements([...data].sort((a, b) => b.period_start.localeCompare(a.period_start))))
      .catch(() => setError("Failed to load statements."))
      .finally(() => setLoading(false));
  }, [filterCard, refreshKey]);

  const { start, end } = range;
  const filtered = start && end
    ? statements.filter(s => s.period_start >= start && s.period_start <= end)
    : statements;

  function toggleExpand(id) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this statement and all its transactions?")) return;
    setError("");
    try {
      await deleteStatement(id);
      setStatements(prev => prev.filter(s => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleStatementUpdate(updated) {
    setStatements(prev => prev.map(s => (s.id === updated.id ? { ...s, ...updated } : s)));
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <h1>Statements</h1>
          {!loading && (
            <p className={styles.count}>
              {filtered.length} statement{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className={styles.controls}>
          <select
            value={filterCard}
            onChange={e => { setFilterCard(e.target.value); setExpandedId(null); }}
          >
            <option value="">All cards</option>
            {cards.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <PeriodSelector onChange={setRange} />
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.muted}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className={styles.muted}>No statements found.</p>
      ) : (
        <div className={styles.list}>
          {filtered.map(s => (
            <StatementCard
              key={s.id}
              s={s}
              cards={cards}
              isExpanded={expandedId === s.id}
              onToggle={() => toggleExpand(s.id)}
              onDelete={handleDelete}
              onStatementUpdate={handleStatementUpdate}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
