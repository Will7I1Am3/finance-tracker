import { useState, useEffect } from "react";
import { getCards, addCard, updateCard, deleteCard } from "../api/cards";
import styles from "./Cards.module.css";

export default function Cards() {
  const [cards, setCards] = useState([]);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCards()
      .then(setCards)
      .catch(() => setError("Failed to load cards."))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError("");
    try {
      const card = await addCard(newName.trim());
      setCards(prev => [...prev, card]);
      setNewName("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdate(id) {
    if (!editName.trim()) return;
    setError("");
    try {
      const updated = await updateCard(id, editName.trim());
      setCards(prev => prev.map(c => (c.id === id ? updated : c)));
      setEditId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this card? This will fail if statements exist for it.")) return;
    setError("");
    try {
      await deleteCard(id);
      setCards(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className={styles.muted}>Loading…</p>;

  return (
    <div className={styles.page}>
      <h1>Cards</h1>
      {error && <p className={styles.error}>{error}</p>}

      <ul className={styles.list}>
        {cards.length === 0 && (
          <li className={styles.muted}>No cards yet. Add one below.</li>
        )}
        {cards.map(c => (
          <li key={c.id} className={styles.row}>
            {editId === c.id ? (
              <div className={styles.editRow}>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleUpdate(c.id);
                    if (e.key === "Escape") setEditId(null);
                  }}
                  autoFocus
                />
                <button className={styles.primary} onClick={() => handleUpdate(c.id)}>Save</button>
                <button className={styles.ghost} onClick={() => setEditId(null)}>Cancel</button>
              </div>
            ) : (
              <>
                <span className={styles.name}>{c.name}</span>
                <div className={styles.actions}>
                  <button
                    className={styles.ghost}
                    onClick={() => { setEditId(c.id); setEditName(c.name); setError(""); }}
                  >
                    Edit
                  </button>
                  <button className={styles.danger} onClick={() => handleDelete(c.id)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <form className={styles.addForm} onSubmit={handleAdd}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New card name…"
        />
        <button type="submit" className={styles.primary}>Add Card</button>
      </form>
    </div>
  );
}
