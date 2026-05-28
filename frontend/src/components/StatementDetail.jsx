import { useState, useEffect } from "react";
import { getStatement } from "../api/statements";
import { updateTransaction, deleteTransaction, createTransaction } from "../api/transactions";
import styles from "../pages/Statements.module.css";

const CATEGORIES = [
  "Food", "Groceries", "Shopping", "Gas", "Transportation",
  "Entertainment", "Travel", "Education", "Health/Medical", "Subscriptions",
  "Installments", "Misc",
];

export default function StatementDetail({ statementId, statementBalance, periodEnd, onError }) {
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [editState, setEditState] = useState(null);
  const [addState, setAddState] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDetailLoading(true);
    getStatement(statementId)
      .then(setDetail)
      .catch(() => onError("Failed to load statement detail."))
      .finally(() => setDetailLoading(false));
  }, [statementId]);

  function startEdit(t) {
    setAddState(null);
    setEditState({
      txnId: t.id,
      description: t.description,
      category: t.category,
      location: t.location,
      amount: t.amount,
    });
  }

  async function handleSaveEdit() {
    if (!editState) return;
    setSaving(true);
    onError("");
    try {
      const res = await updateTransaction(editState.txnId, {
        description: editState.description,
        category: editState.category,
        location: editState.location,
        amount: editState.amount,
      });
      const { transaction_sum, statement_balance: _sb, ...txnData } = res;
      setDetail(prev => ({
        ...prev,
        transaction_sum,
        transactions: prev.transactions.map(t =>
          t.id === editState.txnId ? { ...t, ...txnData } : t
        ),
      }));
      setEditState(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTxn(txnId) {
    if (!window.confirm("Remove this transaction?")) return;
    onError("");
    try {
      const res = await deleteTransaction(txnId);
      setDetail(prev => ({
        ...prev,
        transaction_sum: res.transaction_sum,
        transactions: prev.transactions.filter(t => t.id !== txnId),
      }));
    } catch (err) {
      onError(err.message);
    }
  }

  function startAdd() {
    setEditState(null);
    setAddState({ date: periodEnd, description: "", category: "Misc", location: "", amount: "" });
  }

  async function handleAddTxn() {
    if (!addState.description.trim() || !addState.amount) return;
    setSaving(true);
    onError("");
    try {
      const res = await createTransaction(detail.id, {
        date: addState.date,
        description: addState.description,
        category: addState.category,
        location: addState.location,
        amount: addState.amount,
      });
      const { transaction_sum, statement_balance: _sb, ...txnData } = res;
      setDetail(prev => ({
        ...prev,
        transaction_sum,
        transactions: [...prev.transactions, txnData],
      }));
      setAddState(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (detailLoading) return <p className={styles.muted}>Loading…</p>;
  if (!detail) return null;

  const mismatch = Math.abs(detail.transaction_sum - parseFloat(statementBalance)) > 0.01;

  return (
    <>
      <div className={styles.metaBar}>
        <span>Balance: <strong>${statementBalance}</strong></span>
        <span>Sum: <strong>${detail.transaction_sum.toFixed(2)}</strong></span>
        <span>{detail.transactions.length} transactions</span>
        {mismatch && (
          <span className={styles.mismatch}>
            ⚠ Mismatch: ${Math.abs(detail.transaction_sum - parseFloat(statementBalance)).toFixed(2)}
          </span>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Loc</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {detail.transactions.map(t =>
              editState?.txnId === t.id ? (
                <tr key={t.id} className={styles.editRow}>
                  <td className={styles.dateTd}>{t.date}</td>
                  <td>
                    <input
                      className={styles.wide}
                      value={editState.description}
                      onChange={e => setEditState(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </td>
                  <td>
                    <select
                      value={editState.category}
                      onChange={e => setEditState(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      className={styles.loc}
                      value={editState.location}
                      onChange={e => setEditState(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <input
                      className={styles.amountInput}
                      value={editState.amount}
                      onChange={e => setEditState(prev => ({ ...prev, amount: e.target.value }))}
                    />
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button className={styles.primary} onClick={handleSaveEdit} disabled={saving}>
                        {saving ? "…" : "Save"}
                      </button>
                      <button className={styles.ghost} onClick={() => setEditState(null)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td className={styles.dateTd}>{t.date}</td>
                  <td>{t.description}</td>
                  <td><span className={styles.badge}>{t.category}</span></td>
                  <td className={styles.locTd}>{t.location || "—"}</td>
                  <td className={styles.amountTd}>${t.amount}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button className={styles.ghost} onClick={() => startEdit(t)}>Edit</button>
                      <button className={styles.danger} onClick={() => handleDeleteTxn(t.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {addState && (
              <tr className={styles.editRow}>
                <td>
                  <input
                    className={styles.loc}
                    value={addState.date}
                    onChange={e => setAddState(prev => ({ ...prev, date: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    className={styles.wide}
                    value={addState.description}
                    onChange={e => setAddState(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Description"
                    autoFocus
                  />
                </td>
                <td>
                  <select
                    value={addState.category}
                    onChange={e => setAddState(prev => ({ ...prev, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    className={styles.loc}
                    value={addState.location}
                    onChange={e => setAddState(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="—"
                  />
                </td>
                <td>
                  <input
                    className={styles.amountInput}
                    value={addState.amount}
                    onChange={e => setAddState(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button className={styles.primary} onClick={handleAddTxn} disabled={saving}>
                      {saving ? "…" : "Add"}
                    </button>
                    <button className={styles.ghost} onClick={() => setAddState(null)}>Cancel</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button className={styles.addRow} onClick={startAdd}>+ Add transaction</button>
    </>
  );
}
