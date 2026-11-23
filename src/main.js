import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/bebas-neue/400.css";
import "./styles/main.css";
import "./lib/firebase/firebase.js";
import { subscribeToAuth, signOutUser } from "./features/auth/auth-service.js";
import { renderAuthScreen } from "./features/auth/auth-view.js";
import { openScheduleManager } from "./features/schedules/schedule-view.js";
import { openAttendancePanel, openLocationSettings } from "./features/attendance/attendance-view.js";
import { openBusinessManager } from "./features/businesses/business-view.js";
import { openRegistrationManager } from "./features/users/registration-view.js";
import { openOwnerManager } from "./features/owners/owner-view.js";
import { openAdminManager } from "./features/admins/admin-view.js";
import { openEmployeeManager } from "./features/employees/employee-view.js";
import { openRequestManager } from "./features/requests/request-view.js";
import { openTaskManager } from "./features/tasks/task-view.js";
import { openAuditViewer } from "./features/audit-trail/audit-view.js";
import { openReportViewer } from "./features/reports/report-view.js";
import { initNotificationBadges, stopNotificationBadges } from "./features/notifications/notification-view.js";
import { syncDeadlineNotifications } from "./features/notifications/notification-service.js";
import { logAuditSafe } from "./features/audit-trail/index.js";
import { loadAdminDashboardData, loadOwnerDashboardData } from "./features/dashboard/dashboard-service.js";
import { createOrganization, getBusiness, getShift, getUserProfile, listAttendance, listBusinessesForOrganization, listEmployeeSchedules, listMembershipsForUser, updateUserProfile } from "./lib/firestore/repositories.js";
import { formatInAppZone, getDateKey } from "./lib/utils/time.js";
import { createIcons, Menu, X, ChevronDown, Bell, LayoutDashboard, Building2, Users, UserCog, FileText, CalendarDays, Clock3, ClipboardCheck, FileBarChart2, Settings2, ArrowUpRight, ArrowDownRight, MoreHorizontal, MapPin, Check, AlertCircle, CircleDashed, Search, Plus, LogOut, ShieldCheck } from "lucide";

const app = document.querySelector("#app");
const auditedLogins = new Set();

function renderDashboard(profile) {
  if (profile?.role === "employee") {
    renderEmployeeDashboard(profile);
    return;
  }
  if (profile?.role === "admin") {
    renderAdminDashboard(profile);
    return;
  }
  if (profile?.role !== "owner") {
    renderUnknownRoleState(profile);
    return;
  }
  renderOwnerDashboard(profile);
}

function renderOwnerDashboard(profile) {
  const firstName = profile?.displayName?.split(" ")[0] || "there";
  const roleLabel = profile?.role === "owner" ? "Owner" : profile?.role === "admin" ? "Admin" : "Employee";
  const roleView = {
    owner: { title: "Semua yang perlu Anda tahu", subtitle: "Semua yang perlu Anda tahu tentang seluruh operasional hari ini, dalam satu pandangan.", people: "PEOPLE AKTIF", peopleValue: "48", peopleFoot: "4 bisnis" },
    admin: { title: "Operasional bisnis Anda", subtitle: "Pantau people, jadwal, dan pekerjaan yang membutuhkan tindakan.", people: "PEOPLE DI BISNIS", peopleValue: "24", peopleFoot: "2 bisnis" },
    employee: { title: "Ruang kerja Anda", subtitle: "Lihat jadwal, absensi, dan pekerjaan yang perlu diselesaikan hari ini.", people: "TUGAS SAYA", peopleValue: "05", peopleFoot: "aktif hari ini" },
  }[profile?.role] || { title: "Workspace", subtitle: "Ringkasan operasional Anda.", people: "PEOPLE AKTIF", peopleValue: "—", peopleFoot: "workspace" };
  app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand-lockup">
        <div class="brand-mark">YB</div>
        <div>
          <strong>YB TECH</strong>
          <span>OPERATIONS OS</span>
        </div>
        <button class="icon-button sidebar-close" data-sidebar-close aria-label="Tutup menu"><i data-lucide="x"></i></button>
      </div>

      <div class="workspace-select">
        <span>WORKSPACE</span>
        <button class="business-switcher" type="button" data-business-switcher><span><i data-lucide="building-2"></i> <b data-business-switcher-label>Semua bisnis</b></span><i data-lucide="chevron-down"></i></button><div class="business-switcher-menu" data-business-switcher-menu hidden></div>
      </div>

      <nav class="main-nav" aria-label="Navigasi utama">
        <a class="nav-item active" href="#overview"><i data-lucide="layout-dashboard"></i><span>Overview</span><b>01</b></a>
        <a class="nav-item" href="#businesses" data-open-businesses><i data-lucide="building-2"></i><span>Bisnis</span><b>02</b></a>
       <a class="nav-item" href="#people" data-open-registrations><i data-lucide="users"></i><span>Registrasi</span><b>03</b></a>
        ${profile?.role === "owner" ? '<a class="nav-item" href="#owners" data-open-owners><i data-lucide="users"></i><span>Owners</span><b>04</b></a>' : ""}
        ${profile?.role === "owner" ? '<a class="nav-item" href="#admins" data-open-admins><i data-lucide="user-cog"></i><span>Admins</span><b>05</b></a>' : ""}
       <a class="nav-item" href="#requests" data-open-requests><i data-lucide="file-text"></i><span>Pengajuan</span><b>${profile?.role === "owner" ? "06" : "04"}</b></a>
       <a class="nav-item" href="#attendance" data-open-attendance><i data-lucide="clock-3"></i><span>Absensi GPS</span><b>${profile?.role === "owner" ? "07" : "05"}</b></a>
       <a class="nav-item" href="#schedules" data-open-schedules><i data-lucide="calendar-days"></i><span>Jadwal & shift</span><b>${profile?.role === "owner" ? "07" : "05"}</b></a>
       <a class="nav-item" href="#tasks" data-open-tasks><i data-lucide="clipboard-check"></i><span>Tugas</span><b>${profile?.role === "owner" ? "08" : "06"}</b></a>
        <a class="nav-item" href="#reports" data-open-reports><i data-lucide="file-bar-chart-2"></i><span>Laporan</span><b>${profile?.role === "owner" ? "09" : "07"}</b></a>
        <a class="nav-item" href="#audit" data-open-audit><i data-lucide="shield-check"></i><span>Audit trail</span><b>10</b></a>
        <a class="nav-item" href="#organization" data-create-organization><i data-lucide="building-2"></i><span>Organization</span><b>11</b></a>
      </nav>

      <div class="sidebar-bottom">
        <a class="nav-item" href="#settings" data-open-location><i data-lucide="settings-2"></i><span>Lokasi & radius</span></a>
        <div class="profile-mini">
          <div class="avatar">${initials(profile?.displayName)}</div>
          <div><strong>${profile?.displayName || "User"}</strong><span>${roleLabel} · YB Tech</span></div>
          <button class="icon-button" data-sign-out aria-label="Keluar"><i data-lucide="log-out"></i></button>
        </div>
      </div>
    </aside>

    <div class="content-wrap">
      <header class="topbar">
        <button class="icon-button menu-trigger" data-sidebar-open aria-label="Buka menu"><i data-lucide="menu"></i></button>
        <div class="breadcrumb"><span>Workspace</span><i data-lucide="chevron-down"></i><strong>Overview</strong></div>
        <div class="topbar-actions">
          <button class="date-filter"><i data-lucide="calendar-days"></i><span data-dashboard-date>Memuat tanggal...</span><i data-lucide="chevron-down"></i></button>
          <button class="icon-button notification-button" aria-label="Notifikasi"><i data-lucide="bell"></i><span></span></button>
          <div class="avatar avatar-top">${initials(profile?.displayName)}</div>
        </div>
      </header>

      <main class="dashboard" id="overview">
        <section class="hero-row">
          <div>
            <p class="eyebrow" data-dashboard-eyebrow>Memuat tanggal...</p>
            <h1>Good morning,<br><em>${firstName}.</em></h1>
            <p class="hero-copy" data-dashboard-scope>${roleView.subtitle}</p>
          </div>
          <button class="primary-button"><i data-lucide="plus"></i> Buat tugas baru</button>
        </section>

        <section class="metric-grid" aria-label="Ringkasan metrik">
          <article class="metric-card metric-dark">
            <div class="metric-head"><span>KEHADIRAN HARI INI</span><i data-lucide="clock-3"></i></div>
            <div class="metric-value" data-metric-attendance>—</div>
            <div class="metric-foot"><span class="trend positive" data-metric-attendance-foot><i data-lucide="arrow-up-right"></i> 0 orang hadir</span><span>data hari ini</span></div>
          </article>
          <article class="metric-card">
            <div class="metric-head"><span>${roleView.people}</span><i data-lucide="users"></i></div>
            <div class="metric-value" data-metric-people>—</div>
            <div class="metric-foot"><span class="trend neutral" data-metric-people-foot>${roleView.peopleFoot}</span><span>${profile?.role === "employee" ? "penugasan" : "total anggota"}</span></div>
          </article>
          <article class="metric-card metric-lime">
            <div class="metric-head"><span>TUGAS BERJALAN</span><i data-lucide="clipboard-check"></i></div>
            <div class="metric-value" data-metric-tasks>—</div>
            <div class="metric-foot"><span class="trend dark-trend" data-metric-tasks-foot><i data-lucide="arrow-down-right"></i> 0 tugas</span><span>sedang berjalan</span></div>
          </article>
          <article class="metric-card">
            <div class="metric-head"><span>MENUNGGU REVIEW</span><i data-lucide="alert-circle"></i></div>
            <div class="metric-value" data-metric-reviews>—</div>
            <div class="metric-foot"><span class="trend warning" data-metric-reviews-foot>Perlu aksi</span><span>laporan masuk</span></div>
          </article>
        </section>

        <section class="content-grid">
          <article class="panel attendance-panel">
            <div class="panel-heading"><div><h2>Attendance pulse</h2><p>Performa kehadiran lintas bisnis</p></div><button class="text-button">Lihat laporan <i data-lucide="arrow-up-right"></i></button></div>
            <div class="chart-wrap">
              <div class="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div>
              <div class="chart-area"><div class="chart-grid-lines"><i></i><i></i><i></i><i></i><i></i></div><svg class="attendance-chart" viewBox="0 0 640 210" preserveAspectRatio="none" aria-label="Grafik kehadiran mingguan"><path class="chart-fill" data-chart-fill d="M0 210 L640 210 L0 210Z"></path><path class="chart-line" data-chart-line d="M0 210 L640 210"></path><circle cx="578" cy="31" r="5"></circle></svg><div class="chart-x"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div></div>
            </div>
            <div class="chart-legend"><span><i class="legend-dot lime"></i>Hadir</span><span><i class="legend-dot navy"></i>Target 90%</span><strong data-chart-legend>— <small>rata-rata 7 hari</small></strong></div>
          </article>

          <article class="panel business-panel">
            <div class="panel-heading"><div><h2>Business health</h2><p>Ringkasan hari ini</p></div><button class="icon-button"><i data-lucide="more-horizontal"></i></button></div>
            <div class="business-list" data-business-list><div class="role-empty-state"><strong>Memuat bisnis...</strong><span>Ringkasan performa akan muncul di sini.</span></div></div>
          </article>
        </section>

        <section class="bottom-grid">
          <article class="panel activity-panel">
            <div class="panel-heading"><div><h2>Recent activity</h2><p>Aktivitas terbaru dari semua bisnis</p></div><button class="filter-button">Semua aktivitas <i data-lucide="chevron-down"></i></button></div>
            <div class="activity-table" data-activity-list><div class="role-empty-state"><strong>Memuat aktivitas...</strong><span>Aktivitas terbaru akan muncul di sini.</span></div></div>
          </article>
          <aside class="quick-panel"><div class="quick-label">QUICK ACTIONS</div><h2>Keep the<br><em>momentum.</em></h2><p>Beberapa hal yang bisa Anda selesaikan sekarang.</p><button class="quick-action" data-open-registrations><span class="quick-action-icon"><i data-lucide="users"></i></span><span><strong>Review registrations</strong><small data-quick-registrations>0 karyawan menunggu</small></span><i data-lucide="arrow-up-right"></i></button><button class="quick-action" data-open-tasks><span class="quick-action-icon"><i data-lucide="file-bar-chart-2"></i></span><span><strong>Check pending reports</strong><small data-quick-reports>0 laporan perlu review</small></span><i data-lucide="arrow-up-right"></i></button></aside>
        </section>
      </main>
    </div>
  </div>
  `;

  renderDashboardIcons();
  wireBusinessSwitcher(profile, () => refreshDashboard(profile));
  initNotificationBadges(profile);
  refreshDashboard(profile);

  document.querySelector("[data-sidebar-open]").addEventListener("click", () => document.querySelector("#sidebar").classList.add("open"));
  document.querySelector("[data-sidebar-close]").addEventListener("click", () => document.querySelector("#sidebar").classList.remove("open"));
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => document.querySelector("#sidebar").classList.remove("open")));
  document.querySelector("[data-open-schedules]").addEventListener("click", (event) => {
    event.preventDefault();
    openScheduleManager({ profile });
  });
  document.querySelector("[data-open-businesses]").addEventListener("click", (event) => {
    event.preventDefault();
    if (profile.role === "owner") openBusinessManager({ profile });
  });
  document.querySelectorAll("[data-open-registrations]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    if (profile.role === "owner") openRegistrationManager({ profile });
  }));
  document.querySelector("[data-open-owners]")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (profile.role === "owner") openOwnerManager({ profile });
  });
  document.querySelector("[data-open-admins]")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (profile.role === "owner") openAdminManager({ profile });
  });
  document.querySelectorAll("[data-open-requests]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openRequestManager({ profile }); }));
  document.querySelectorAll("[data-open-tasks]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openTaskManager({ profile }); }));
  document.querySelector("[data-open-attendance]").addEventListener("click", (event) => {
    event.preventDefault();
    if (profile.role === "employee") openAttendancePanel({ profile });
    else if (profile.role === "owner") openLocationSettings({ profile });
  });
  document.querySelector("[data-open-location]").addEventListener("click", (event) => {
    event.preventDefault();
    if (profile.role === "owner") openLocationSettings({ profile });
  });
  document.querySelector("[data-open-audit]")?.addEventListener("click", (event) => { event.preventDefault(); openAuditViewer({ profile }); });
  document.querySelector("[data-open-reports]")?.addEventListener("click", (event) => { event.preventDefault(); openReportViewer({ profile }); });
  document.querySelector("[data-create-organization]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const name = window.prompt("Nama organization baru:");
    if (!name?.trim()) return;
    try {
      const organizationId = crypto.randomUUID();
      await createOrganization(organizationId, { name: name.trim(), ownerId: profile.uid, status: "active" });
      logAuditSafe({ profile, action: "organization_created", targetType: "organization", targetId: organizationId, metadata: { name: name.trim() } });
      window.alert(`Organization "${name.trim()}" dibuat. Akun aktif tetap menggunakan workspace saat ini.`);
    } catch (error) { window.alert(error.message); }
  });
  document.querySelector("[data-sign-out]").addEventListener("click", () => signOutUser());
}

function renderAdminDashboard(profile) {
  const firstName = profile?.displayName?.split(" ")[0] || "there";
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand-lockup"><div class="brand-mark">YB</div><div><strong>YB TECH</strong><span>OPERATIONS OS</span></div><button class="icon-button sidebar-close" data-sidebar-close aria-label="Tutup menu"><i data-lucide="x"></i></button></div>
        <div class="workspace-select"><span>WORKSPACE ADMIN</span><button class="business-switcher" type="button" data-business-switcher><span><i data-lucide="building-2"></i> <b data-business-switcher-label>Bisnis ditugaskan</b></span><i data-lucide="chevron-down"></i></button><div class="business-switcher-menu" data-business-switcher-menu hidden></div></div>
        <nav class="main-nav" aria-label="Navigasi admin">
          <a class="nav-item active" href="#overview"><i data-lucide="layout-dashboard"></i><span>Overview</span><b>01</b></a>
          <a class="nav-item" href="#people" data-open-employees><i data-lucide="users"></i><span>Karyawan</span><b>02</b></a>
          <a class="nav-item" href="#requests" data-open-requests><i data-lucide="file-text"></i><span>Pengajuan</span><b>03</b></a>
          <a class="nav-item" href="#schedules" data-open-schedules><i data-lucide="calendar-days"></i><span>Jadwal & shift</span><b>04</b></a>
          <a class="nav-item" href="#tasks" data-open-tasks><i data-lucide="clipboard-check"></i><span>Tugas</span><b>05</b></a>
          <a class="nav-item" href="#reports" data-open-reports><i data-lucide="file-bar-chart-2"></i><span>Laporan</span><b>06</b></a>
          <a class="nav-item" href="#audit" data-open-audit><i data-lucide="shield-check"></i><span>Audit trail</span><b>07</b></a>
        </nav>
        <div class="sidebar-bottom"><div class="profile-mini"><div class="avatar">${initials(profile?.displayName)}</div><div><strong>${profile?.displayName || "User"}</strong><span>Admin · YB Tech</span></div><button class="icon-button" data-sign-out aria-label="Keluar"><i data-lucide="log-out"></i></button></div></div>
      </aside>
      <div class="content-wrap"><header class="topbar"><button class="icon-button menu-trigger" data-sidebar-open aria-label="Buka menu"><i data-lucide="menu"></i></button><div class="breadcrumb"><span>Workspace</span><i data-lucide="chevron-down"></i><strong>Admin overview</strong></div><div class="topbar-actions"><button class="date-filter"><i data-lucide="calendar-days"></i><span data-dashboard-date>Memuat tanggal...</span><i data-lucide="chevron-down"></i></button><button class="icon-button notification-button" aria-label="Notifikasi"><i data-lucide="bell"></i><span></span></button><div class="avatar avatar-top">${initials(profile?.displayName)}</div></div></header>
        <main class="dashboard role-dashboard admin-dashboard" id="overview">
          <section class="hero-row"><div><p class="eyebrow">ADMIN OPERATIONS</p><h1>Good morning,<br><em>${firstName}.</em></h1><p class="hero-copy">Pantau pekerjaan dan jadwal bisnis yang menjadi tanggung jawab Anda.</p></div><button class="primary-button" data-open-schedules><i data-lucide="calendar-days"></i> Kelola jadwal</button></section>
          <section class="metric-grid" aria-label="Ringkasan admin"><article class="metric-card metric-dark"><div class="metric-head"><span>KEHADIRAN HARI INI</span><i data-lucide="clock-3"></i></div><div class="metric-value" data-metric-attendance>—</div><div class="metric-foot"><span class="trend neutral" data-metric-attendance-foot>Bisnis Anda</span><span>data hari ini</span></div></article><article class="metric-card"><div class="metric-head"><span>PEOPLE DI BISNIS</span><i data-lucide="users"></i></div><div class="metric-value" data-metric-people>—</div><div class="metric-foot"><span class="trend neutral" data-metric-people-foot>Terpantau</span><span>sesuai akses</span></div></article><article class="metric-card metric-lime"><div class="metric-head"><span>TUGAS BERJALAN</span><i data-lucide="clipboard-check"></i></div><div class="metric-value" data-metric-tasks>—</div><div class="metric-foot"><span class="trend dark-trend" data-metric-tasks-foot>Operasional</span><span>hari ini</span></div></article><article class="metric-card"><div class="metric-head"><span>PERLU AKSI</span><i data-lucide="alert-circle"></i></div><div class="metric-value" data-metric-reviews>—</div><div class="metric-foot"><span class="trend warning" data-metric-reviews-foot>Review</span><span>sesuai izin</span></div></article></section>
          <section class="content-grid"><article class="panel"><div class="panel-heading"><div><h2>Ruang kerja Admin</h2><p>Data mengikuti bisnis dan izin yang diberikan Owner.</p></div></div><div class="admin-dashboard-detail" data-admin-detail><div class="role-empty-state"><strong>Memuat data...</strong><span>Menyiapkan ringkasan bisnis yang ditugaskan.</span></div></div></article><aside class="quick-panel"><div class="quick-label">ADMIN SCOPE</div><h2>Focus on<br><em>execution.</em></h2><p>Anda hanya dapat bekerja pada bisnis yang menjadi tanggung jawab Anda.</p></aside></section>
        </main>
      </div>
    </div>
  `;
  renderDashboardIcons();
  wireDashboardChrome();
  wireBusinessSwitcher(profile, () => refreshDashboard(profile));
  initNotificationBadges(profile);
  refreshDashboard(profile);
  document.querySelectorAll("[data-open-schedules]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openScheduleManager({ profile }); }));
  document.querySelector("[data-open-employees]")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (profile.role === "admin") openEmployeeManager({ profile });
  });
  document.querySelector("[data-open-requests]")?.addEventListener("click", (event) => { event.preventDefault(); openRequestManager({ profile }); });
  document.querySelector("[data-open-tasks]")?.addEventListener("click", (event) => { event.preventDefault(); openTaskManager({ profile }); });
  document.querySelector("[data-open-audit]")?.addEventListener("click", (event) => { event.preventDefault(); openAuditViewer({ profile }); });
  document.querySelector("[data-open-reports]")?.addEventListener("click", (event) => { event.preventDefault(); openReportViewer({ profile }); });
}

function renderEmployeeDashboard(profile) {
  const firstName = profile?.displayName?.split(" ")[0] || "there";
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand-lockup"><div class="brand-mark">YB</div><div><strong>YB TECH</strong><span>OPERATIONS OS</span></div><button class="icon-button sidebar-close" data-sidebar-close aria-label="Tutup menu"><i data-lucide="x"></i></button></div>
        <div class="workspace-select"><span>MY WORKSPACE</span><div class="employee-business-label"><i data-lucide="building-2"></i> Bisnis saya</div></div>
        <nav class="main-nav" aria-label="Navigasi employee">
          <a class="nav-item active" href="#overview"><i data-lucide="layout-dashboard"></i><span>Overview</span><b>01</b></a>
          <a class="nav-item" href="#attendance" data-open-attendance><i data-lucide="clock-3"></i><span>Absensi</span><b>02</b></a>
          <a class="nav-item" href="#schedule"><i data-lucide="calendar-days"></i><span>Jadwal</span><b>03</b></a>
          <a class="nav-item" href="#requests" data-open-requests><i data-lucide="file-text"></i><span>Pengajuan</span><b>04</b></a>
          <a class="nav-item" href="#tasks" data-open-tasks><i data-lucide="clipboard-check"></i><span>Tugas saya</span><b>05</b></a>
        </nav>
        <div class="sidebar-bottom"><div class="profile-mini"><div class="avatar">${initials(profile?.displayName)}</div><div><strong>${profile?.displayName || "User"}</strong><span>Employee · YB Tech</span></div><button class="icon-button" data-sign-out aria-label="Keluar"><i data-lucide="log-out"></i></button></div></div>
      </aside>
      <div class="content-wrap"><header class="topbar"><button class="icon-button menu-trigger" data-sidebar-open aria-label="Buka menu"><i data-lucide="menu"></i></button><div class="breadcrumb"><span>Workspace</span><i data-lucide="chevron-down"></i><strong>My overview</strong></div><div class="topbar-actions"><button class="date-filter"><i data-lucide="calendar-days"></i><span>21 Nov 2026</span></button><button class="icon-button notification-button" aria-label="Notifikasi"><i data-lucide="bell"></i><span></span></button><div class="avatar avatar-top">${initials(profile?.displayName)}</div></div></header>
        <main class="dashboard role-dashboard employee-dashboard" id="overview">
          <section class="hero-row"><div><p class="eyebrow">MY WORKDAY</p><h1>Good morning,<br><em>${firstName}.</em></h1><p class="hero-copy">Lihat jadwal, absensi, dan tugas yang perlu Anda selesaikan hari ini.</p></div><button class="primary-button" data-open-attendance><i data-lucide="clock-3"></i> Buka absensi</button></section>
          <section class="employee-action-grid"><article class="employee-attendance-card metric-dark"><div><p class="eyebrow">ABSENSI HARI INI</p><h2 data-employee-attendance-status>Memuat status...</h2><p>Aktifkan GPS untuk melakukan check-in di lokasi bisnis.</p></div><button class="primary-button" data-open-attendance>Check-in sekarang <span>→</span></button></article><article class="panel employee-schedule-card"><div class="panel-heading"><div><h2>Jadwal hari ini</h2><p>Shift dan jam kerja Anda</p></div><i data-lucide="calendar-days"></i></div><div class="role-empty-state" data-employee-schedule><strong>Memuat jadwal...</strong><span>Jadwal akan muncul setelah Owner atau Admin menetapkan shift.</span></div></article></section>
          <section class="content-grid"><article class="panel"><div class="panel-heading"><div><h2>Riwayat absensi</h2><p>Aktivitas absensi terbaru Anda</p></div></div><div class="employee-attendance-history" data-employee-attendance-history><div class="role-empty-state"><strong>Memuat riwayat...</strong></div></div></article><aside class="quick-panel"><div class="quick-label">MY PROFILE</div><h2>${firstName}<br><em>at work.</em></h2><div class="employee-profile-summary"><strong>${profile?.displayName || "Employee"}</strong><span>${escapeHtml(profile?.email || "Email belum tersedia")}</span><span data-employee-business>Bisnis sedang dimuat...</span></div></aside></section>
        </main>
      </div>
    </div>
  `;
  renderDashboardIcons();
  wireDashboardChrome();
  initNotificationBadges(profile);
  document.querySelectorAll("[data-open-attendance]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); openAttendancePanel({ profile }); }));
  document.querySelector("[data-open-requests]")?.addEventListener("click", (event) => { event.preventDefault(); openRequestManager({ profile }); });
  document.querySelector("[data-open-tasks]")?.addEventListener("click", (event) => { event.preventDefault(); openTaskManager({ profile }); });
  loadEmployeeDashboardData(profile);
}

async function loadEmployeeDashboardData(profile) {
  const scheduleElement = document.querySelector("[data-employee-schedule]");
  const statusElement = document.querySelector("[data-employee-attendance-status]");
  const historyElement = document.querySelector("[data-employee-attendance-history]");
  const businessElement = document.querySelector("[data-employee-business]");
  const businessId = profile.businessIds?.[0];
  const today = getLocalDateKey();
  if (!businessId) {
    scheduleElement.innerHTML = "<strong>Belum ada bisnis.</strong><span>Hubungi Owner untuk mendapatkan penempatan bisnis.</span>";
    statusElement.textContent = "Belum terdaftar";
    historyElement.innerHTML = "<div class=\"role-empty-state\"><strong>Belum ada riwayat.</strong><span>Akun belum memiliki bisnis aktif.</span></div>";
    return;
  }
  try {
    const [business, schedules, attendance] = await Promise.all([
      getBusiness(businessId),
      listEmployeeSchedules(profile.uid),
      listAttendance(profile.uid),
    ]);
    businessElement.textContent = business?.name || "Bisnis aktif";
    const todaySchedule = schedules.find((schedule) => schedule.businessId === businessId && schedule.date === today && schedule.status !== "cancelled");
    const todayShift = todaySchedule ? await getShift(todaySchedule.shiftId) : null;
    scheduleElement.innerHTML = todayShift
      ? `<strong>${escapeHtml(todayShift.name)}</strong><span>${escapeHtml(todayShift.startTime)} – ${escapeHtml(todayShift.endTime)} · toleransi ${todayShift.toleranceMinutes || 0} menit</span>`
      : "<strong>Belum ada jadwal hari ini.</strong><span>Owner atau Admin belum menetapkan shift untuk tanggal ini.</span>";

    const todayAttendance = attendance.filter((event) => event.businessId === businessId && getAttendanceDate(event) === today).sort((a, b) => getAttendanceTime(a).localeCompare(getAttendanceTime(b)));
    const checkIn = todayAttendance.find((event) => event.type === "check-in");
    const checkOut = todayAttendance.find((event) => event.type === "check-out");
    statusElement.textContent = checkOut ? checkOut.attendanceStatus || "Tercatat" : checkIn ? "Sudah check-in" : "Belum check-in";
    const history = attendance.filter((event) => event.businessId === businessId).sort((a, b) => `${getAttendanceDate(b)}${getAttendanceTime(b)}`.localeCompare(`${getAttendanceDate(a)}${getAttendanceTime(a)}`)).slice(0, 8);
    historyElement.innerHTML = history.length ? history.map((event) => `<div class="employee-history-row"><div><strong>${event.type === "check-in" ? "Check-in" : "Check-out"}</strong><span>${formatDateLabel(getAttendanceDate(event))} · ${getAttendanceTime(event) || "waktu tersimpan"}</span></div><b>${escapeHtml(event.attendanceStatus || "tercatat")}</b></div>`).join("") : "<div class=\"role-empty-state\"><strong>Belum ada riwayat.</strong><span>Aktivitas check-in dan check-out Anda akan tampil di sini.</span></div>";
  } catch (error) {
    scheduleElement.innerHTML = `<strong>Data belum tersedia.</strong><span>${escapeHtml(error.message)}</span>`;
    historyElement.innerHTML = `<div class="role-empty-state"><strong>Riwayat gagal dimuat.</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function getLocalDateKey(date = new Date()) {
  return getDateKey(date);
}

function getAttendanceDate(event) {
  return event.attendanceDate || event.clientRecordedAt?.slice(0, 10) || "";
}

function getAttendanceTime(event) {
  return event.recordedTime || event.clientRecordedAt?.slice(11, 16) || "";
}

function formatDateLabel(value) {
  if (!value) return "Tanggal tidak tersedia";
  return formatInAppZone(`${value}T00:00:00+07:00`, { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function buildChartPaths(series) {
  const step = 640 / Math.max(1, series.length - 1);
  const points = series.map((item, index) => ({ x: Math.round(index * step), y: Math.round(210 - (Number(item.percent) || 0) * 1.9) }));
  if (!points.length) return { line: "M0 210 L640 210", fill: "M0 210 L640 210 L0 210Z" };
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  const fill = `${line} L640 210 L0 210Z`;
  return { line, fill };
}

function applyDashboardData(viewModel) {
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  };
  const metrics = viewModel.metrics;
  setText("[data-dashboard-date]", viewModel.generatedAt);
  setText("[data-dashboard-eyebrow]", viewModel.generatedAt.toUpperCase());
  setText("[data-metric-attendance]", `${metrics.attendancePercent}%`);
  setText("[data-metric-attendance-foot]", `${metrics.attendanceHadir} orang hadir · ${metrics.late} terlambat · ${metrics.alpa} alpa`);
  setText("[data-metric-people]", metrics.people);
  setText("[data-metric-people-foot]", `${metrics.businesses} bisnis`);
  setText("[data-metric-tasks]", metrics.runningTasks);
  setText("[data-metric-tasks-foot]", `${metrics.overdueTasks} terlambat`);
  setText("[data-metric-reviews]", metrics.pendingReviews);
  setText("[data-metric-reviews-foot]", `${metrics.pendingRequests} pengajuan menunggu`);
  setText("[data-quick-registrations]", `${metrics.pendingRegistrations} karyawan menunggu`);
  setText("[data-quick-reports]", `${metrics.pendingReviews} laporan perlu review`);

  const average = viewModel.chartSeries.length
    ? Math.round(viewModel.chartSeries.reduce((total, item) => total + (Number(item.percent) || 0), 0) / viewModel.chartSeries.length)
    : 0;
  setText("[data-chart-legend]", `${average}% rata-rata 7 hari`);
  const paths = buildChartPaths(viewModel.chartSeries);
  const fill = document.querySelector("[data-chart-fill]");
  const line = document.querySelector("[data-chart-line]");
  if (fill) fill.setAttribute("d", paths.fill);
  if (line) line.setAttribute("d", paths.line);

  const statusClass = (status) => (["approved", "done"].includes(status) ? "done" : ["review", "pending"].includes(status) ? "review" : "assigned");
  const businessColors = ["orange", "blue", "green", "purple"];
  const healthRows = viewModel.businessHealth.map((business, index) => `<div class="business-row"><div class="business-icon ${businessColors[index % businessColors.length]}">${escapeHtml(business.name.charAt(0))}</div><div class="business-info"><strong>${escapeHtml(business.name)}</strong><span><i data-lucide="map-pin"></i> ${escapeHtml(business.city)} · ${business.people} people</span></div><div class="health-score"><b>${business.score}%</b><span class="${business.score < 75 ? "health-alert" : ""}">${escapeHtml(business.label)}</span></div></div>`).join("");
  const activityRows = viewModel.activity.map((item) => `<div class="activity-row"><div class="activity-event"><span class="event-icon ${statusClass(item.status)}"><i data-lucide="check"></i></span><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></div></div><span class="person">Sistem</span><span class="time">${escapeHtml(item.time)}</span><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div>`).join("");

  const businessList = document.querySelector("[data-business-list]");
  if (businessList) businessList.innerHTML = healthRows || `<div class="role-empty-state"><strong>Belum ada bisnis aktif.</strong><span>Buat bisnis untuk melihat performa.</span></div>`;
  const activityList = document.querySelector("[data-activity-list]");
  if (activityList) activityList.innerHTML = activityRows
    ? `<div class="activity-header"><span>AKTIVITAS</span><span>OLEH</span><span>WAKTU</span><span>STATUS</span></div>${activityRows}`
    : `<div class="role-empty-state"><strong>Belum ada aktivitas.</strong><span>Aktivitas akan muncul setelah ada transaksi.</span></div>`;
  const adminDetail = document.querySelector("[data-admin-detail]");
  if (adminDetail) adminDetail.innerHTML = `<div class="role-empty-state"><strong>${metrics.businesses} bisnis terpantau.</strong><span>Hadir ${metrics.attendancePercent}%, ${metrics.runningTasks} tugas berjalan, ${metrics.pendingReviews} laporan perlu review.</span></div>${healthRows ? `<div class="business-list">${healthRows}</div>` : ""}`;
  renderDashboardIcons();
}

async function refreshDashboard(profile) {
  try {
    const viewModel = profile.role === "admin"
      ? await loadAdminDashboardData(profile)
      : await loadOwnerDashboardData(profile);
    applyDashboardData(viewModel);
    syncDeadlineNotifications(profile);
  } catch (error) {
    console.warn("[dashboard] gagal memuat data:", error?.message || error);
    const activityList = document.querySelector("[data-activity-list]");
    if (activityList) activityList.innerHTML = `<div class="role-empty-state"><strong>Data belum tersedia.</strong><span>${escapeHtml(error?.message || "Coba muat ulang halaman.")}</span></div>`;
    const adminDetail = document.querySelector("[data-admin-detail]");
    if (adminDetail) adminDetail.innerHTML = `<div class="role-empty-state"><strong>Data belum tersedia.</strong><span>${escapeHtml(error?.message || "Coba muat ulang halaman.")}</span></div>`;
  }
}

function renderUnknownRoleState(profile) {
  app.innerHTML = `<main class="auth-shell pending-shell"><section class="auth-card pending-card"><p class="eyebrow">ROLE NOT CONFIGURED</p><h1>Access<br><em>pending.</em></h1><p>Role akun ${escapeHtml(profile?.email || "ini")} belum dikonfigurasi. Hubungi Owner perusahaan.</p><button class="primary-button" data-sign-out>Kembali ke login</button></section></main>`;
  app.querySelector("[data-sign-out]").addEventListener("click", () => signOutUser());
}

function wireDashboardChrome() {
  document.querySelector("[data-sidebar-open]")?.addEventListener("click", () => document.querySelector("#sidebar").classList.add("open"));
  document.querySelector("[data-sidebar-close]")?.addEventListener("click", () => document.querySelector("#sidebar").classList.remove("open"));
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => document.querySelector("#sidebar").classList.remove("open")));
  document.querySelector("[data-sign-out]")?.addEventListener("click", () => signOutUser());
}

function renderDashboardIcons() {
  createIcons({ icons: { Menu, X, ChevronDown, Bell, LayoutDashboard, Building2, Users, UserCog, FileText, CalendarDays, Clock3, ClipboardCheck, FileBarChart2, Settings2, ArrowUpRight, ArrowDownRight, MoreHorizontal, MapPin, Check, AlertCircle, CircleDashed, Search, Plus, LogOut, ShieldCheck } });
}

async function wireBusinessSwitcher(profile, onScopeChange) {
  const button = document.querySelector("[data-business-switcher]");
  const menu = document.querySelector("[data-business-switcher-menu]");
  const label = document.querySelector("[data-business-switcher-label]");
  if (!button || !menu || !label) return;
  try {
    const businesses = await listBusinessesForOrganization(profile.organizationId);
    const activeBusinesses = businesses.filter((business) => business.status !== "inactive");
    menu.innerHTML = `<button type="button" data-business-scope="">All businesses<span>Ringkasan seluruh organization</span></button>${activeBusinesses.map((business) => `<button type="button" data-business-scope="${business.id}">${escapeHtml(business.name)}<span>${escapeHtml(business.city || "Kota belum diatur")}</span></button>`).join("")}`;
    button.addEventListener("click", (event) => { event.stopPropagation(); menu.hidden = !menu.hidden; });
    menu.querySelectorAll("[data-business-scope]").forEach((option) => option.addEventListener("click", () => {
      const business = activeBusinesses.find((item) => item.id === option.dataset.businessScope);
      label.textContent = business?.name || "Semua bisnis";
      const breadcrumb = document.querySelector(".breadcrumb strong");
      if (breadcrumb) breadcrumb.textContent = business?.name || "Overview";
      const scopeCopy = document.querySelector("[data-dashboard-scope]");
      if (scopeCopy) scopeCopy.textContent = business ? `Ringkasan operasional ${business.name} dalam satu pandangan.` : "Semua yang perlu Anda tahu tentang seluruh operasional hari ini, dalam satu pandangan.";
      profile.selectedBusinessId = option.dataset.businessScope || null;
      menu.hidden = true;
      if (typeof onScopeChange === "function") onScopeChange();
    }));
    document.addEventListener("click", (event) => { if (!menu.contains(event.target) && event.target !== button) menu.hidden = true; });
  } catch (error) {
    menu.innerHTML = `<span class="business-switcher-error">${escapeHtml(error.message)}</span>`;
  }
}

function renderPendingState(profile) {
  app.innerHTML = `<main class="auth-shell pending-shell"><section class="auth-card pending-card"><div class="brand-mark">YB</div><p class="eyebrow">REGISTRATION RECEIVED</p><h1>Almost<br><em>there.</em></h1><p>Halo ${profile?.displayName || ""}, pendaftaran Anda sedang menunggu persetujuan Owner. Anda akan dapat masuk setelah status akun disetujui.</p><button class="primary-button" data-sign-out>Keluar dari akun</button></section></main>`;
  app.querySelector("[data-sign-out]").addEventListener("click", () => signOutUser());
}

function renderInactiveState() {
  app.innerHTML = `<main class="auth-shell pending-shell"><section class="auth-card pending-card"><div class="brand-mark">YB</div><p class="eyebrow">ACCESS REMOVED</p><h1>No longer<br><em>active.</em></h1><p>Akses Owner Anda sudah dinonaktifkan. Hubungi Owner aktif perusahaan jika ini tidak sesuai.</p><button class="primary-button" data-sign-out>Kembali ke login</button></section></main>`;
  app.querySelector("[data-sign-out]").addEventListener("click", () => signOutUser());
}

function initials(name = "User") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

subscribeToAuth(async (user) => {
  if (!user) {
    stopNotificationBadges();
    renderAuthScreen(app);
    return;
  }
  try {
    const profile = await getUserProfile(user.uid);
    if (!profile) {
      renderAuthScreen(app);
      return;
    }
    if (profile.status === "inactive" || profile.status === "suspended") {
      renderInactiveState();
      return;
    }
    if (profile.role === "admin") {
      try {
        const memberships = await listMembershipsForUser(profile.uid, profile.organizationId);
        const businessIds = [...new Set(memberships.filter((item) => item.status !== "inactive").map((item) => item.businessId))];
        const permissions = [...new Set(memberships.flatMap((item) => item.permissions || []))];
        const stale = JSON.stringify(businessIds) !== JSON.stringify(profile.businessIds || [])
          || JSON.stringify(permissions) !== JSON.stringify(profile.permissions || []);
        if (stale) await updateUserProfile(profile.uid, { businessIds, permissions });
        profile.businessIds = businessIds;
        profile.permissions = permissions;
      } catch (syncError) { console.warn("[auth] admin access sync:", syncError?.message || syncError); }
    }
    if (profile.status !== "active") {
      renderPendingState(profile);
      return;
    }
    if (!auditedLogins.has(profile.uid)) {
      auditedLogins.add(profile.uid);
      logAuditSafe({ profile, action: "login", targetType: "user", targetId: profile.uid });
    }
    renderDashboard(profile);
  } catch (error) {
    app.innerHTML = `<main class="auth-shell pending-shell"><section class="auth-card pending-card"><p class="eyebrow">WORKSPACE ERROR</p><h1>Could not<br><em>load.</em></h1><p>${escapeHtml(error.message)}</p><button class="primary-button" data-sign-out>Keluar</button></section></main>`;
    app.querySelector("[data-sign-out]").addEventListener("click", () => signOutUser());
  }
});
