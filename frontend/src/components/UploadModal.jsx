import { useState, useEffect } from "react";
import Upload from "../pages/Upload";
import { getUploadUsage } from "../api/statements";
import styles from "./UploadModal.module.css";

const PHASE_META = {
  pick:     { title: "Upload Statement",  step: "Step 1 of 3 — Select PDF" },
  loading:  { title: "Upload Statement",  step: "Step 1 of 3 — Loading…" },
  annotate: { title: "Annotate PDF",      step: "Step 2 of 3 — Optional redaction" },
  applying: { title: "Annotate PDF",      step: "Step 2 of 3 — Applying redactions…" },
  preview:  { title: "Review Extraction", step: "Step 3 of 3 — Edit & confirm" },
  saving:   { title: "Review Extraction", step: "Step 3 of 3 — Saving…" },
  done:     { title: "Statement Saved",   step: "Complete" },
};

export default function UploadModal({ onClose }) {
  const [phase, setPhase] = useState("pick");
  const [usage, setUsage] = useState(null);
  const meta = PHASE_META[phase] ?? PHASE_META.pick;

  useEffect(() => {
    getUploadUsage().then(setUsage).catch(() => {});
  }, []);

  useEffect(() => {
    if (phase === "preview") {
      getUploadUsage().then(setUsage).catch(() => {});
    }
  }, [phase]);

  const remaining = usage ? usage.limit - usage.used : null;
  const usageClass =
    remaining === null ? styles.usage
    : remaining === 0  ? styles.usageDanger
    : remaining <= 2   ? styles.usageWarn
    : styles.usage;

  function handleClose() {
    if (phase === "pick" || phase === "done") {
      onClose();
    } else if (window.confirm("Cancel upload? Your progress will be lost.")) {
      onClose();
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>{meta.title}</span>
            <span className={styles.step}>{meta.step}</span>
            {usage && (
              <span className={usageClass}>
                {usage.used} / {usage.limit} uploads today
              </span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={handleClose}>× Close</button>
        </div>
      </div>
      <div className={styles.container}>
        <Upload
          onPhaseChange={setPhase}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
