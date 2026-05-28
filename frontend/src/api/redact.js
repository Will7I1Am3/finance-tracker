const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function _handleError(res) {
  const err = await res.json().catch(() => ({ detail: res.statusText }));
  throw new Error(err.detail || "Request failed");
}

export async function previewPdf(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE_URL}/redact/preview`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) await _handleError(res);
  return res.json(); // { pages: [{ image, width, height }] }
}

export async function applyRedactions(file, rectangles) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("rectangles", JSON.stringify(rectangles));
  const res = await fetch(`${BASE_URL}/redact/apply`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) await _handleError(res);
  return res.blob(); // PDF bytes
}
