import { useRef, useState, useEffect, useCallback } from "react";
import { getCards } from "../api/cards";
import { previewPdf, applyRedactions } from "../api/redact";
import { uploadStatement, saveStatement } from "../api/statements";
import { useDataRefresh } from "../DataRefreshContext";
import styles from "./Upload.module.css";

const CATEGORIES = [
  "Food", "Groceries", "Shopping", "Gas", "Transportation",
  "Entertainment", "Travel", "Education", "Health/Medical", "Subscriptions",
  "Installments", "Misc",
];

export default function Upload({ onPhaseChange, onClose } = {}) {
  const { triggerRefresh } = useDataRefresh();
  // phases: pick | loading | annotate | applying | preview | saving | done
  const [phase, setPhase] = useState("pick");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [cards, setCards] = useState([]);

  // Annotate phase
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [rects, setRects] = useState({});
  const [drawing, setDrawing] = useState(null);

  // Preview phase
  const [extraction, setExtraction] = useState(null);
  const [previewPeriodStart, setPreviewPeriodStart] = useState("");
  const [previewPeriodEnd, setPreviewPeriodEnd] = useState("");
  const [previewBalance, setPreviewBalance] = useState("");
  const [previewCardMode, setPreviewCardMode] = useState("");
  const [previewCardInput, setPreviewCardInput] = useState("");
  const [txns, setTxns] = useState([]);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    getCards().then(setCards).catch(() => {});
  }, []);

  useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);

  // ── Canvas drawing ──────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const r of rects[currentPage] || []) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    if (drawing) {
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);
      const w = Math.abs(drawing.currentX - drawing.startX);
      const h = Math.abs(drawing.currentY - drawing.startY);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(220,50,50,0.9)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    }
  }, [rects, currentPage, drawing]);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || phase !== "annotate") return;

    function sync() {
      const { width, height } = img.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      redraw();
    }

    if (img.complete) sync();
    img.addEventListener("load", sync);
    window.addEventListener("resize", sync);
    return () => {
      img.removeEventListener("load", sync);
      window.removeEventListener("resize", sync);
    };
  }, [phase, currentPage, redraw]);

  useEffect(() => { redraw(); }, [redraw]);

  function getCanvasPos(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function handleMouseDown(e) {
    e.preventDefault();
    const { x, y } = getCanvasPos(e);
    setDrawing({ startX: x, startY: y, currentX: x, currentY: y });
  }

  function handleMouseMove(e) {
    if (!drawing) return;
    const { x, y } = getCanvasPos(e);
    setDrawing(d => ({ ...d, currentX: x, currentY: y }));
  }

  function handleMouseUp(e) {
    if (!drawing) return;
    const { x, y } = getCanvasPos(e);
    const w = Math.abs(x - drawing.startX);
    const h = Math.abs(y - drawing.startY);

    if (w > 5 && h > 5) {
      setRects(prev => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), {
          x: Math.min(drawing.startX, x),
          y: Math.min(drawing.startY, y),
          w,
          h,
        }],
      }));
    } else {
      // Click: remove box under cursor
      const { x: cx, y: cy } = getCanvasPos(e);
      setRects(prev => ({
        ...prev,
        [currentPage]: (prev[currentPage] || []).filter(
          r => !(cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h)
        ),
      }));
    }
    setDrawing(null);
  }

  // ── File load ───────────────────────────────────────────────────────────────

  async function handleFileSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setPhase("loading");
    setError("");
    try {
      const data = await previewPdf(file);
      setPages(data.pages);
      setCurrentPage(0);
      setRects({});
      setPhase("annotate");
    } catch (err) {
      setError(err.message);
      setPhase("pick");
    }
  }

  // ── Coordinate scaling ──────────────────────────────────────────────────────

  function buildPdfRects() {
    const canvas = canvasRef.current;
    const all = [];
    for (const [pageIdx, pageRects] of Object.entries(rects)) {
      const idx = parseInt(pageIdx);
      const page = pages[idx];
      if (!page || !canvas) continue;
      const scaleX = page.width / canvas.width;
      const scaleY = page.height / canvas.height;
      for (const r of pageRects) {
        all.push({ page: idx, x: r.x * scaleX, y: r.y * scaleY, w: r.w * scaleX, h: r.h * scaleY });
      }
    }
    return all;
  }

  // ── Extract transactions ────────────────────────────────────────────────────

  async function handleExtract() {
    setPhase("applying");
    setError("");

    try {
      const pdfRects = buildPdfRects();
      let uploadFile = file;
      let originalHash = null;

      if (pdfRects.length > 0) {
        setStatus("Applying redactions…");
        const hashBuf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        originalHash = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, "0")).join("");
        const blob = await applyRedactions(file, pdfRects);
        uploadFile = new File([blob], file.name, { type: "application/pdf" });
      }

      setStatus("Extracting transactions…");
      const fd = new FormData();
      fd.append("file", uploadFile);
      if (originalHash) fd.append("original_hash", originalHash);
      const result = await uploadStatement(fd);

      const freshCards = await getCards().catch(() => cards);
      setCards(freshCards);
      setExtraction(result);
      setPreviewPeriodStart(result.period_start || "");
      setPreviewPeriodEnd(result.period_end || "");
      setPreviewBalance(result.statement_balance);
      setTxns(result.transactions.map((t, i) => ({ ...t, _key: i })));
      const matched = freshCards.find(c => c.name === result.card_name);
      if (matched) setPreviewCardMode(result.card_name);
      else { setPreviewCardMode("__new__"); setPreviewCardInput(result.card_name); }

      setStatus("");
      setPhase("preview");
    } catch (err) {
      setError(err.message);
      setPhase("annotate");
      setStatus("");
    }
  }

  // ── Download redacted PDF ───────────────────────────────────────────────────

  async function handleDownload() {
    setPhase("applying");
    setStatus("Applying redactions…");
    setError("");
    try {
      const blob = await applyRedactions(file, buildPdfRects());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `redacted_${file.name}`;
      a.click();
      URL.revokeObjectURL(url);
      setPhase("annotate");
      setStatus("");
    } catch (err) {
      setError(err.message);
      setPhase("annotate");
      setStatus("");
    }
  }

  // ── Save confirmed statement ────────────────────────────────────────────────

  const previewCardName = previewCardMode === "__new__"
    ? previewCardInput.trim()
    : previewCardMode;

  async function handleSave() {
    if (!previewCardName) return;
    setPhase("saving");
    setError("");
    try {
      await saveStatement({
        pdf_hash: extraction.pdf_hash,
        card_name: previewCardName,
        period_start: previewPeriodStart,
        period_end: previewPeriodEnd,
        statement_balance: previewBalance,
        transactions: txns.map(({ _key, ...t }) => t),
      });
      triggerRefresh();
      getCards().then(setCards).catch(() => {});
      setPhase("done");
    } catch (err) {
      setError(err.message);
      setPhase("preview");
    }
  }

  function updateTxn(i, field, value) {
    setTxns(prev => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  }
  function removeTxn(i) {
    setTxns(prev => prev.filter((_, idx) => idx !== i));
  }
  function addTxn() {
    setTxns(prev => [...prev, {
      _key: Date.now(),
      date: previewPeriodEnd || "",
      description: "",
      category: "Misc",
      location: "",
      amount: "",
    }]);
  }

  function reset() {
    setPhase("pick");
    setFile(null);
    setPages([]);
    setRects({});
    setExtraction(null);
    setPreviewPeriodStart("");
    setPreviewPeriodEnd("");
    setTxns([]);
    setError("");
    setStatus("");
  }

  const txnSum = txns.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
  const balanceMismatch = previewBalance && Math.abs(txnSum - parseFloat(previewBalance)) > 0.01;
  const canSave = !!previewCardName && !!previewPeriodStart && !!previewPeriodEnd
    && txns.every(t => !!t.date);
  const totalRects = Object.values(rects).reduce((sum, arr) => sum + arr.length, 0);

  // ── Render: done ────────────────────────────────────────────────────────────

  if (phase === "done") {
    return (
      <div className={styles.done}>
        <h1>Saved</h1>
        <p>{txns.length} transactions imported for <strong>{previewCardName}</strong>.</p>
        <div className={styles.actions}>
          <button className={styles.primary} onClick={reset}>Upload Another</button>
          {onClose && <button className={styles.ghost} onClick={onClose}>Close</button>}
        </div>
      </div>
    );
  }

  // ── Render: preview / saving ────────────────────────────────────────────────

  if (phase === "preview" || phase === "saving") {
    return (
      <div className={styles.page}>
        <div className={styles.previewHeader}>
          <h1>Review Extraction</h1>
          <div className={styles.meta}>
            <span className={styles.cardField}>
              <strong>Card:</strong>
              <select value={previewCardMode} onChange={e => setPreviewCardMode(e.target.value)}>
                {cards.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                <option value="__new__">New card…</option>
              </select>
              {previewCardMode === "__new__" && (
                <input
                  value={previewCardInput}
                  onChange={e => setPreviewCardInput(e.target.value)}
                  placeholder="Card name"
                />
              )}
            </span>
            <span className={styles.periodField}>
              <strong>Period:</strong>
              <input
                type="date"
                className={styles.dateInput}
                value={previewPeriodStart}
                onChange={e => setPreviewPeriodStart(e.target.value)}
              />
              →
              <input
                type="date"
                className={styles.dateInput}
                value={previewPeriodEnd}
                onChange={e => setPreviewPeriodEnd(e.target.value)}
              />
            </span>
            <span className={styles.balanceField}>
              <strong>Statement balance: $</strong>
              <input
                className={styles.balanceInput}
                value={previewBalance}
                onChange={e => setPreviewBalance(e.target.value)}
              />
            </span>
            <span><strong>Transaction sum:</strong> ${txnSum.toFixed(2)}</span>
            {balanceMismatch && (
              <span className={styles.mismatch}>
                ⚠ Mismatch by ${Math.abs(txnSum - parseFloat(previewBalance)).toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th><th>Description</th><th>Category</th>
                <th>Loc</th><th>Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={t._key}>
                  <td>
                    <input type="date" className={styles.dateInput}
                      value={t.date}
                      onChange={e => updateTxn(i, "date", e.target.value)} />
                  </td>
                  <td>
                    <input className={styles.wide} value={t.description}
                      onChange={e => updateTxn(i, "description", e.target.value)} />
                  </td>
                  <td>
                    <select value={t.category} onChange={e => updateTxn(i, "category", e.target.value)}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <input className={styles.loc} value={t.location} placeholder="—"
                      onChange={e => updateTxn(i, "location", e.target.value)} />
                  </td>
                  <td>
                    <input className={styles.amount} value={t.amount}
                      onChange={e => updateTxn(i, "amount", e.target.value)} />
                  </td>
                  <td>
                    <button className={styles.removeBtn} onClick={() => removeTxn(i)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className={styles.addRow} onClick={addTxn}>+ Add transaction</button>

        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button
            className={styles.primary}
            onClick={handleSave}
            disabled={phase === "saving" || !canSave}
            title={!canSave ? "Fill in all required dates before saving" : undefined}
          >
            {phase === "saving" ? "Saving…" : `Confirm & Save (${txns.length} transactions)`}
          </button>
          <button className={styles.ghost} onClick={reset}>Discard</button>
        </div>
      </div>
    );
  }

  // ── Render: pick / loading ──────────────────────────────────────────────────

  if (phase === "pick" || phase === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.pickCard}>
          <h1>Upload Statement</h1>
          <p className={styles.subtitle}>
            Transaction extraction is powered by an AI model. Before sending your
            statement, you can black out any sensitive information — account numbers,
            your name, or address. Even without redacting, the AI is instructed to
            ignore and never return sensitive fields.
          </p>
          <form className={styles.form} onSubmit={handleFileSubmit}>
            <label className={styles.fileLabel}>
              <span>PDF Statement</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setFile(e.target.files[0] || null)}
                required
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.primary} disabled={phase === "loading"}>
              {phase === "loading" ? "Rendering pages…" : "Load PDF →"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: annotate / applying ─────────────────────────────────────────────

  const page = pages[currentPage];
  const isApplying = phase === "applying";

  const pageNav = (
    <span className={styles.pageNav}>
      <button className={styles.navBtn} onClick={() => setCurrentPage(p => p - 1)}
        disabled={currentPage === 0 || isApplying}>‹</button>
      <span>Page {currentPage + 1} / {pages.length}</span>
      <button className={styles.navBtn} onClick={() => setCurrentPage(p => p + 1)}
        disabled={currentPage === pages.length - 1 || isApplying}>›</button>
    </span>
  );

  return (
    <div className={styles.page}>
      <div className={styles.infoBar}>
        <strong>Optional:</strong> drag to draw a black box over anything you want to hide
        from the AI — account numbers, your name, address, etc. The AI is already instructed
        to ignore sensitive fields, but redacting gives you full control. Click any box to remove it.
        When ready, hit <em>Extract transactions</em>.
      </div>
      <div className={styles.toolbar}>
        <span className={styles.filename}>{file.name}</span>
        {pageNav}
        <span className={styles.hint}>
          {isApplying
            ? status
            : totalRects === 0
              ? "Drag to draw a redaction box · Click a box to remove it"
              : `${totalRects} box${totalRects !== 1 ? "es" : ""} across ${Object.keys(rects).length} page${Object.keys(rects).length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className={styles.canvasWrap}>
        <img
          ref={imgRef}
          className={styles.pageImg}
          src={`data:image/png;base64,${page.image}`}
          alt={`Page ${currentPage + 1}`}
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className={`${styles.overlay}${isApplying ? ` ${styles.overlayBusy}` : ""}`}
          onMouseDown={isApplying ? undefined : handleMouseDown}
          onMouseMove={isApplying ? undefined : handleMouseMove}
          onMouseUp={isApplying ? undefined : handleMouseUp}
          onMouseLeave={isApplying ? undefined : handleMouseUp}
        />
      </div>

      <div className={styles.bottomNav}>{pageNav}</div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.annotateActions}>
        <button className={styles.ghost} onClick={reset} disabled={isApplying}>
          ← Change file
        </button>
        <div className={styles.actionRight}>
          {totalRects > 0 && (
            <button className={styles.secondary} onClick={handleDownload} disabled={isApplying}>
              Download redacted PDF
            </button>
          )}
          <button className={styles.primary} onClick={handleExtract} disabled={isApplying}>
            {isApplying ? status : "Extract transactions →"}
          </button>
        </div>
      </div>
    </div>
  );
}
