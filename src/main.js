import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/bebas-neue/400.css";
import "./styles/main.css";
import { createIcons, Menu, X, ChevronDown, Bell, LayoutDashboard, Building2, Users, CalendarDays, Clock3, ClipboardCheck, FileBarChart2, Settings2, ArrowUpRight, ArrowDownRight, MoreHorizontal, MapPin, Check, AlertCircle, CircleDashed, Search, Plus, LogOut } from "lucide";

const app = document.querySelector("#app");

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
        <button class="business-switcher" type="button"><span><i data-lucide="building-2"></i> Semua bisnis</span><i data-lucide="chevron-down"></i></button>
      </div>

      <nav class="main-nav" aria-label="Navigasi utama">
        <a class="nav-item active" href="#overview"><i data-lucide="layout-dashboard"></i><span>Overview</span><b>01</b></a>
        <a class="nav-item" href="#businesses"><i data-lucide="building-2"></i><span>Bisnis</span><b>02</b></a>
        <a class="nav-item" href="#people"><i data-lucide="users"></i><span>People</span><b>03</b></a>
        <a class="nav-item" href="#attendance"><i data-lucide="clock-3"></i><span>Absensi</span><b>04</b></a>
        <a class="nav-item" href="#tasks"><i data-lucide="clipboard-check"></i><span>Tugas</span><b>05</b></a>
        <a class="nav-item" href="#reports"><i data-lucide="file-bar-chart-2"></i><span>Laporan</span><b>06</b></a>
      </nav>

      <div class="sidebar-bottom">
        <a class="nav-item" href="#settings"><i data-lucide="settings-2"></i><span>Pengaturan</span></a>
        <div class="profile-mini">
          <div class="avatar">RA</div>
          <div><strong>Raka Aditya</strong><span>Owner · YB Tech</span></div>
          <button class="icon-button" aria-label="Keluar"><i data-lucide="log-out"></i></button>
        </div>
      </div>
    </aside>

    <div class="content-wrap">
      <header class="topbar">
        <button class="icon-button menu-trigger" data-sidebar-open aria-label="Buka menu"><i data-lucide="menu"></i></button>
        <div class="breadcrumb"><span>Workspace</span><i data-lucide="chevron-down"></i><strong>Overview</strong></div>
        <div class="topbar-actions">
          <button class="date-filter"><i data-lucide="calendar-days"></i><span>21 Nov 2026</span><i data-lucide="chevron-down"></i></button>
          <button class="icon-button notification-button" aria-label="Notifikasi"><i data-lucide="bell"></i><span></span></button>
          <div class="avatar avatar-top">RA</div>
        </div>
      </header>

      <main class="dashboard" id="overview">
        <section class="hero-row">
          <div>
            <p class="eyebrow">SATURDAY · 21 NOVEMBER 2026</p>
            <h1>Good morning,<br><em>Raka.</em></h1>
            <p class="hero-copy">Semua yang perlu Anda tahu tentang operasional hari ini, dalam satu pandangan.</p>
          </div>
          <button class="primary-button"><i data-lucide="plus"></i> Buat tugas baru</button>
        </section>

        <section class="metric-grid" aria-label="Ringkasan metrik">
          <article class="metric-card metric-dark">
            <div class="metric-head"><span>KEHADIRAN HARI INI</span><i data-lucide="clock-3"></i></div>
            <div class="metric-value">92<span>%</span></div>
            <div class="metric-foot"><span class="trend positive"><i data-lucide="arrow-up-right"></i> 4.8%</span><span>vs kemarin</span></div>
          </article>
          <article class="metric-card">
            <div class="metric-head"><span>PEOPLE AKTIF</span><i data-lucide="users"></i></div>
            <div class="metric-value">48</div>
            <div class="metric-foot"><span class="trend neutral">4 bisnis</span><span>total anggota</span></div>
          </article>
          <article class="metric-card metric-lime">
            <div class="metric-head"><span>TUGAS BERJALAN</span><i data-lucide="clipboard-check"></i></div>
            <div class="metric-value">31</div>
            <div class="metric-foot"><span class="trend dark-trend"><i data-lucide="arrow-down-right"></i> 2</span><span>sejak kemarin</span></div>
          </article>
          <article class="metric-card">
            <div class="metric-head"><span>MENUNGGU REVIEW</span><i data-lucide="alert-circle"></i></div>
            <div class="metric-value">07</div>
            <div class="metric-foot"><span class="trend warning">Perlu aksi</span><span>laporan masuk</span></div>
          </article>
        </section>

        <section class="content-grid">
          <article class="panel attendance-panel">
            <div class="panel-heading"><div><h2>Attendance pulse</h2><p>Performa kehadiran lintas bisnis</p></div><button class="text-button">Lihat laporan <i data-lucide="arrow-up-right"></i></button></div>
            <div class="chart-wrap">
              <div class="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div>
              <div class="chart-area"><div class="chart-grid-lines"><i></i><i></i><i></i><i></i><i></i></div><svg class="attendance-chart" viewBox="0 0 640 210" preserveAspectRatio="none" aria-label="Grafik kehadiran mingguan"><path class="chart-fill" d="M0 136 C40 122 48 126 82 104 S132 124 164 88 S216 105 246 76 S300 83 330 54 S380 69 414 48 S466 75 496 42 S548 54 578 31 S620 35 640 18 L640 210 L0 210Z"></path><path class="chart-line" d="M0 136 C40 122 48 126 82 104 S132 124 164 88 S216 105 246 76 S300 83 330 54 S380 69 414 48 S466 75 496 42 S548 54 578 31 S620 35 640 18"></path><circle cx="578" cy="31" r="5"></circle></svg><div class="chart-x"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div></div>
            </div>
            <div class="chart-legend"><span><i class="legend-dot lime"></i>Hadir</span><span><i class="legend-dot navy"></i>Target 90%</span><strong>92% <small>rata-rata</small></strong></div>
          </article>

          <article class="panel business-panel">
            <div class="panel-heading"><div><h2>Business health</h2><p>Ringkasan hari ini</p></div><button class="icon-button"><i data-lucide="more-horizontal"></i></button></div>
            <div class="business-list">
              <div class="business-row"><div class="business-icon orange">K</div><div class="business-info"><strong>Kopi Koma</strong><span><i data-lucide="map-pin"></i> Bandung · 14 people</span></div><div class="health-score"><b>96%</b><span>Excellent</span></div></div>
              <div class="business-row"><div class="business-icon blue">N</div><div class="business-info"><strong>Nusa Studio</strong><span><i data-lucide="map-pin"></i> Jakarta · 18 people</span></div><div class="health-score"><b>91%</b><span>On track</span></div></div>
              <div class="business-row"><div class="business-icon green">S</div><div class="business-info"><strong>Sora Goods</strong><span><i data-lucide="map-pin"></i> Surabaya · 09 people</span></div><div class="health-score"><b>88%</b><span>On track</span></div></div>
              <div class="business-row"><div class="business-icon purple">A</div><div class="business-info"><strong>Atelier 27</strong><span><i data-lucide="map-pin"></i> Bali · 07 people</span></div><div class="health-score"><b>74%</b><span class="health-alert">Needs care</span></div></div>
            </div>
          </article>
        </section>

        <section class="bottom-grid">
          <article class="panel activity-panel">
            <div class="panel-heading"><div><h2>Recent activity</h2><p>Aktivitas terbaru dari semua bisnis</p></div><button class="filter-button">Semua aktivitas <i data-lucide="chevron-down"></i></button></div>
            <div class="activity-table"><div class="activity-header"><span>AKTIVITAS</span><span>OLEH</span><span>WAKTU</span><span>STATUS</span></div>
              <div class="activity-row"><div class="activity-event"><span class="event-icon check"><i data-lucide="check"></i></span><div><strong>Laporan tugas disetujui</strong><span>Inventory check · Kopi Koma</span></div></div><span class="person">Nadia Putri</span><span class="time">09:42</span><span class="status-pill done">Approved</span></div>
              <div class="activity-row"><div class="activity-event"><span class="event-icon pending"><i data-lucide="circle-dashed"></i></span><div><strong>Pengajuan cuti baru</strong><span>24–26 Nov · Nusa Studio</span></div></div><span class="person">Fajar Ramadhan</span><span class="time">09:18</span><span class="status-pill review">Review</span></div>
              <div class="activity-row"><div class="activity-event"><span class="event-icon task"><i data-lucide="clipboard-check"></i></span><div><strong>Tugas baru dibuat</strong><span>Merchandise restock · Sora Goods</span></div></div><span class="person">Raka Aditya</span><span class="time">08:56</span><span class="status-pill assigned">Assigned</span></div>
            </div>
          </article>
          <aside class="quick-panel"><div class="quick-label">QUICK ACTIONS</div><h2>Keep the<br><em>momentum.</em></h2><p>Beberapa hal yang bisa Anda selesaikan sekarang.</p><button class="quick-action"><span class="quick-action-icon"><i data-lucide="users"></i></span><span><strong>Review registrations</strong><small>3 karyawan menunggu</small></span><i data-lucide="arrow-up-right"></i></button><button class="quick-action"><span class="quick-action-icon"><i data-lucide="file-bar-chart-2"></i></span><span><strong>Check pending reports</strong><small>7 laporan perlu review</small></span><i data-lucide="arrow-up-right"></i></button></aside>
        </section>
      </main>
    </div>
  </div>
`;

createIcons({ icons: { Menu, X, ChevronDown, Bell, LayoutDashboard, Building2, Users, CalendarDays, Clock3, ClipboardCheck, FileBarChart2, Settings2, ArrowUpRight, ArrowDownRight, MoreHorizontal, MapPin, Check, AlertCircle, CircleDashed, Search, Plus, LogOut } });

document.querySelector("[data-sidebar-open]").addEventListener("click", () => document.querySelector("#sidebar").classList.add("open"));
document.querySelector("[data-sidebar-close]").addEventListener("click", () => document.querySelector("#sidebar").classList.remove("open"));
document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => document.querySelector("#sidebar").classList.remove("open")));
