import { useState } from "react";
import { updateStatement } from "../api/statements";
import StatementDetail from "./StatementDetail";
import styles from "../pages/Statements.module.css";

export default function StatementCard({ s, cards, isExpanded, onToggle, onDelete, onStatementUpdate, onError }) {
  const [editStmt, setEditStmt] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEditStmt(e) {
    e.stopPropagation();
    setEditStmt({
      id: s.id,
      card_name: s.card_name,
      period_start: s.period_start,
      period_end: s.period_end,
      statement_balance: s.statement_balance,
    });
  }

  async function handleSaveStmt(e) {
    e.stopPropagation();
    setSaving(true);
    onError("");
    try {
      const updated = await updateStatement(editStmt.id, {
        card_name: editStmt.card_name,
        period_start: editStmt.period_start,
        period_end: editStmt.period_end,
        statement_balance: editStmt.statement_balance,
      });
      onStatementUpdate(updated);
      setEditStmt(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.card}>
      <div
        className={`${styles.cardHeader} ${isExpanded ? styles.cardHeaderOpen : ""}`}
        onClick={editStmt ? undefined : onToggle}
        style={editStmt ? { cursor: "default" } : undefined}
      >
        {editStmt ? (
          <div className={styles.editStmtForm} onClick={e => e.stopPropagation()}>
            <select
              value={editStmt.card_name}
              onChange={e => setEditStmt(prev => ({ ...prev, card_name: e.target.value }))}
            >
              {cards.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <input
              type="date"
              className={styles.dateInput}
              value={editStmt.period_start}
              onChange={e => setEditStmt(prev => ({ ...prev, period_start: e.target.value }))}
            />
            <span className={styles.arrow}>→</span>
            <input
              type="date"
              className={styles.dateInput}
              value={editStmt.period_end}
              onChange={e => setEditStmt(prev => ({ ...prev, period_end: e.target.value }))}
            />
            <span className={styles.balancePrefix}>$</span>
            <input
              className={styles.balanceInput}
              value={editStmt.statement_balance}
              onChange={e => setEditStmt(prev => ({ ...prev, statement_balance: e.target.value }))}
            />
            <div className={styles.cardActions}>
              <button
                className={styles.primary}
                onClick={handleSaveStmt}
                disabled={saving || !editStmt.period_start || !editStmt.period_end}
                title={(!editStmt.period_start || !editStmt.period_end) ? "Both period dates are required" : undefined}
              >
                {saving ? "…" : "Save"}
              </button>
              <button className={styles.ghost} onClick={e => { e.stopPropagation(); setEditStmt(null); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{s.card_name}</span>
              <span className={styles.period}>{s.period_start} → {s.period_end}</span>
              <span className={styles.balance}>${s.statement_balance}</span>
            </div>
            <div className={styles.cardActions}>
              <button className={styles.ghost} onClick={startEditStmt}>Edit</button>
              <button className={styles.danger} onClick={e => { e.stopPropagation(); onDelete(s.id); }}>Delete</button>
              <span className={styles.chevron}>{isExpanded ? "▲" : "▼"}</span>
            </div>
          </>
        )}
      </div>

      {isExpanded && (
        <div className={styles.detail}>
          <StatementDetail
            statementId={s.id}
            statementBalance={s.statement_balance}
            periodEnd={s.period_end}
            onError={onError}
          />
        </div>
      )}
    </div>
  );
}
