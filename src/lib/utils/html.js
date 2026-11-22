export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function safeUrl(value) {
  const url = String(value ?? "").trim();
  return /^(https?:)?\/\//i.test(url) ? escapeHtml(url) : "";
}
