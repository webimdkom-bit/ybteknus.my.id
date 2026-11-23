import { markAllNotificationsRead, markNotificationRead, watchNotifications } from "../../lib/firestore/repositories.js";
import { formatInAppZone } from "../../lib/utils/time.js";

let unsubscribe = null;

export function stopNotificationBadges() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export function initNotificationBadges(profile) {
  if (unsubscribe) unsubscribe();
  const buttons = document.querySelectorAll(".notification-button");
  buttons.forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    openNotificationPanel(profile);
  }));
  if (!profile?.uid) return;
  unsubscribe = watchNotifications(profile.uid, (notifications) => {
    const unread = notifications.filter((item) => !item.read).length;
    buttons.forEach((button) => {
      const dot = button.querySelector("span");
      if (!dot) return;
      dot.textContent = unread > 0 ? String(unread) : "";
      dot.style.display = unread > 0 ? "grid" : "none";
      dot.style.placeItems = "center";
      dot.style.width = unread > 0 ? "16px" : "0";
      dot.style.height = unread > 0 ? "16px" : "0";
      dot.style.borderRadius = "50%";
      dot.style.fontSize = "8px";
      dot.style.lineHeight = "1";
      dot.style.right = "0";
      dot.style.top = "0";
    });
  });
}

export async function openNotificationPanel(profile) {
  const overlay = document.createElement("div");
  overlay.className = "notification-overlay";
  overlay.innerHTML = `<section class="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title"><div class="notification-modal-head"><div><p class="eyebrow">INBOX</p><h2 id="notification-title">Notifikasi</h2><p>Aktivitas dan pengingat sesuai hak akses Anda.</p></div><div class="notification-head-actions"><button class="secondary-button" data-notify-read-all>Tandai semua dibaca</button><button class="icon-button notification-close" aria-label="Tutup">×</button></div></div><div class="notification-list"><p class="notification-empty">Memuat notifikasi...</p></div></section>`;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".notification-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  const list = overlay.querySelector(".notification-list");
  const readAll = overlay.querySelector("[data-notify-read-all]");
  let items = [];
  const stop = watchNotifications(profile.uid, (notifications) => {
    items = notifications.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    readAll.disabled = !items.some((item) => !item.read);
    list.innerHTML = items.length ? items.map((item) => `<article class="notification-row ${item.read ? "is-read" : "is-unread"}"><div class="notification-mark"></div><div class="notification-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body || "")}</span><small>${formatTime(item.createdAt)} · ${escapeHtml(item.actorName || "Sistem")}</small></div>${item.read ? "" : `<button class="secondary-button" data-notify-read="${item.id}">Tandai dibaca</button>`}</article>`).join("") : `<div class="role-empty-state"><strong>Belum ada notifikasi.</strong><span>Aktivitas penting akan muncul di sini.</span></div>`;
    list.querySelectorAll("[data-notify-read]").forEach((button) => button.addEventListener("click", async () => {
      try { await markNotificationRead(button.dataset.notifyRead); }
      catch (error) { console.warn("[notify] mark read:", error?.message || error); }
    }));
  });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) stop(); });
  overlay.querySelector(".notification-close").addEventListener("click", () => stop());
  readAll.addEventListener("click", async () => {
    try { await markAllNotificationsRead(items); }
    catch (error) { console.warn("[notify] mark all:", error?.message || error); }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatTime(value) {
  if (!value) return "-";
  return formatInAppZone(value, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
