import { useState } from "react";
import Upload from "../pages/Upload";
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
  const meta = PHASE_META[phase] ?? PHASE_META.pick;

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
