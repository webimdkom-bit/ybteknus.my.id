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

const busyStates = new WeakMap();
const regionStates = new WeakMap();

export function setBusy(element, label) {
  if (!element) return () => {};
  const current = busyStates.get(element);
  if (current) return current.restore;
  const html = element.innerHTML;
  const disabled = element.disabled;
  const restore = () => {
    if (busyStates.get(element)?.restore !== restore) return;
    element.innerHTML = html;
    element.disabled = disabled;
    element.classList.remove("is-busy");
    element.removeAttribute("aria-busy");
    busyStates.delete(element);
  };
  busyStates.set(element, { restore });
  element.classList.add("is-busy");
  element.setAttribute("aria-busy", "true");
  element.disabled = true;
  element.textContent = label;
  return restore;
}

export function updateBusyLabel(element, label) {
  if (busyStates.has(element)) element.textContent = label;
}

export function setRegionBusy(element) {
  if (!element) return () => {};
  const current = regionStates.get(element);
  if (current) return current.restore;
  const restore = () => {
    if (regionStates.get(element)?.restore !== restore) return;
    element.classList.remove("is-region-busy");
    element.removeAttribute("aria-busy");
    regionStates.delete(element);
  };
  regionStates.set(element, { restore });
  element.classList.add("is-region-busy");
  element.setAttribute("aria-busy", "true");
  return restore;
}

export async function openWithBusy(button, loader, label = "Menyiapkan tautan...") {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  const restore = setBusy(button, label);
  try {
    const url = await loader();
    if (!url) {
      popup?.close();
      return;
    }
    if (popup) popup.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) {
    popup?.close();
    throw error;
  } finally {
    restore();
  }
}
