import { escapeHtml, safeUrl } from "../../lib/utils/html.js";

const ROLE_LABELS = Object.freeze({ owner: "Owner", admin: "Admin", employee: "Staf" });

export function profileRoleLabel(profile) {
  return ROLE_LABELS[profile?.role] || "Staf";
}

export function profileInitials(name = "User") {
  return String(name || "User").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function profilePhotoUrl(profile) {
  return safeUrl(profile?.photoURL);
}

export function profileAvatarContent(profile) {
  const url = profilePhotoUrl(profile);
  return url ? `<img src="${url}" alt="" data-profile-image />` : escapeHtml(profileInitials(profile?.displayName));
}

export function profileAvatarMarkup(profile, className = "") {
  return `<span class="profile-avatar ${className}" data-profile-avatar>${profileAvatarContent(profile)}</span>`;
}

export function profileIdentityMarkup(profile) {
  return `<div class="sidebar-profile">
    ${profileAvatarMarkup(profile, "sidebar-profile-avatar")}
    <div class="sidebar-profile-copy"><strong data-profile-name>${escapeHtml(profile?.displayName || "User")}</strong><span data-profile-role>${profileRoleLabel(profile)}</span></div>
    <button class="icon-button profile-edit-button" data-open-profile aria-label="Edit profil"><i data-lucide="settings-2"></i></button>
    <button class="icon-button sidebar-close" data-sidebar-close aria-label="Tutup menu"><i data-lucide="x"></i></button>
  </div>`;
}
