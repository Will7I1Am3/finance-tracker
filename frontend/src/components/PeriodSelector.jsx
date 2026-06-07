import { useState, useEffect, useRef } from "react";
import { getPeriodBounds, getPeriodLabel, makePeriodNav } from "../utils/period";
import styles from "./PeriodSelector.module.css";

const MODES = [
  { v: "month",    l: "Month" },
  { v: "3months",  l: "3 Mo"  },
  { v: "12months", l: "Year"  },
  { v: "custom",   l: "Custom" },
];

export default function PeriodSelector({ onChange }) {
  const now = new Date();
  const [mode, setMode]     = useState("month");
  const [anchor, setAnchor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { goBack, goForward, isAtNow } = makePeriodNav(anchor, setAnchor);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const initialized = useRef(false);

  // Fire onChange whenever the resolved range changes (preset modes + nav)
  useEffect(() => {
    if (mode === "custom") return;
    const bounds = getPeriodBounds(mode, anchor);
    if (!initialized.current) {
      initialized.current = true;
      onChange({ start: bounds.start, end: bounds.end });
      return;
    }
    onChange({ start: bounds.start, end: bounds.end });
  }, [mode, anchor]);

  function handleModeChange(next) {
    if (next === "custom") {
      const bounds = getPeriodBounds(mode === "custom" ? "month" : mode, anchor);
      setCustomStart(bounds.start);
      setCustomEnd(bounds.end);
      onChange({ start: bounds.start, end: bounds.end });
    }
    setMode(next);
  }

  function handleCustomStart(val) {
    setCustomStart(val);
    onChange({ start: val, end: customEnd });
  }

  function handleCustomEnd(val) {
    setCustomEnd(val);
    onChange({ start: customStart, end: val });
  }

  return (
    <div className={styles.periodControls}>
      <div className={styles.modeGroup}>
        {MODES.map(({ v, l }) => (
          <button
            key={v}
            className={mode === v ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
            onClick={() => handleModeChange(v)}
          >
            {l}
          </button>
        ))}
      </div>

      {mode === "custom" ? (
        <div className={styles.customRange}>
          <input
            type="date"
            className={styles.dateInput}
            value={customStart}
            max={customEnd || undefined}
            onChange={e => handleCustomStart(e.target.value)}
          />
          <span className={styles.rangeSep}>–</span>
          <input
            type="date"
            className={styles.dateInput}
            value={customEnd}
            min={customStart || undefined}
            onChange={e => handleCustomEnd(e.target.value)}
          />
        </div>
      ) : (
        <div className={styles.navGroup}>
          <button className={styles.navBtn} onClick={goBack}>‹</button>
          <span className={styles.periodLabel}>{getPeriodLabel(mode, anchor)}</span>
          <button className={styles.navBtn} onClick={goForward} disabled={isAtNow}>›</button>
        </div>
      )}
    </div>
  );
}
