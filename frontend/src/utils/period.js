const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function getPeriodBounds(mode, anchor) {
  const end = new Date(anchor.year, anchor.month + 1, 0);
  const n = mode === "month" ? 0 : mode === "3months" ? 2 : 11;
  const start = new Date(anchor.year, anchor.month - n, 1);
  const pad2 = v => String(v).padStart(2, "0");
  return {
    start: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-01`,
    end:   `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
  };
}

export function getPeriodLabel(mode, anchor) {
  if (mode === "month") return `${MONTHS[anchor.month]} ${anchor.year}`;
  const n = mode === "3months" ? 2 : 11;
  const s = new Date(anchor.year, anchor.month - n, 1);
  const sm = s.getMonth(), sy = s.getFullYear();
  const em = anchor.month, ey = anchor.year;
  if (sy === ey) return `${MONTHS[sm]} – ${MONTHS[em]} ${ey}`;
  return `${MONTHS[sm]} ${sy} – ${MONTHS[em]} ${ey}`;
}

export function makePeriodNav(anchor, setAnchor) {
  const now = new Date();
  const goBack = () =>
    setAnchor(p => { const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const goForward = () =>
    setAnchor(p => { const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const isAtNow = anchor.year === now.getFullYear() && anchor.month === now.getMonth();
  return { goBack, goForward, isAtNow };
}
