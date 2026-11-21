(function(){const s=document.createElement("link").relList;if(s&&s.supports&&s.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))i(e);new MutationObserver(e=>{for(const n of e)if(n.type==="childList")for(const c of n.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&i(c)}).observe(document,{childList:!0,subtree:!0});function t(e){const n={};return e.integrity&&(n.integrity=e.integrity),e.referrerPolicy&&(n.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?n.credentials="include":e.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function i(e){if(e.ep)return;e.ep=!0;const n=t(e);fetch(e.href,n)}})();const u={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};const h=([a,s,t])=>{const i=document.createElementNS("http://www.w3.org/2000/svg",a);return Object.keys(s).forEach(e=>{i.setAttribute(e,String(s[e]))}),t?.length&&t.forEach(e=>{const n=h(e);i.appendChild(n)}),i},y=(a,s={})=>{const i={...u,...s};return h(["svg",i,a])};const w=(...a)=>{const s=new Set;for(const t of a)if(typeof t=="string")for(const i of t.split(/\s+/))i&&s.add(i);return[...s].join(" ")};const M=a=>{if(a==null||typeof a!="object")return!1;for(const s in a)if(Object.prototype.hasOwnProperty.call(a,s)&&(s.startsWith("aria-")||s==="role"||s==="title")&&a[s]!=null)return!0;return!1};const k=a=>{let s="",t=!1;for(const i of a){if(i==="-"||i==="_"||i<=" "){t=s.length>0;continue}s.length===0?s+=i.toLowerCase():s+=t?i.toUpperCase():i,t=!1}return s};const A=a=>{const s=k(a);return s.charAt(0).toUpperCase()+s.slice(1)};const S=a=>Array.from(a.attributes).reduce((s,t)=>(s[t.name]=t.value,s),{}),d=a=>typeof a=="string"?a.split(" ").filter(Boolean):!a||!a.class?[]:a.class&&typeof a.class=="string"?a.class.split(" ").filter(Boolean):a.class&&Array.isArray(a.class)?a.class.filter(Boolean):[],p=(a,{nameAttr:s,icons:t,attrs:i})=>{const e=a.getAttribute(s);if(e==null)return;const n=A(e),c=t[n];if(!c)return console.warn(`${a.outerHTML} icon name was not found in the provided icons object.`);const r=S(a),b=M(r)?{}:{"aria-hidden":"true"},l={...u,"data-lucide":e,...b,...i,...r},m=d(r),g=d(i),o=w("lucide",`lucide-${e}`,...m,...g);o&&Object.assign(l,{class:o});const f=y(c,l);return a.parentNode?.replaceChild(f,a)};const x=[["path",{d:"m7 7 10 10"}],["path",{d:"M17 7v10H7"}]];const C=[["path",{d:"M7 7h10v10"}],["path",{d:"M7 17 17 7"}]];const E=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"}]];const N=[["path",{d:"M10 12h4"}],["path",{d:"M10 8h4"}],["path",{d:"M14 21v-3a2 2 0 0 0-4 0v3"}],["path",{d:"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"}],["path",{d:"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"}]];const L=[["path",{d:"M8 2v3"}],["path",{d:"M16 2v3"}],["rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}],["path",{d:"M3 9h18"}],["path",{d:"M8 13h.01"}],["path",{d:"M12 13h.01"}],["path",{d:"M16 13h.01"}],["path",{d:"M8 17h.01"}],["path",{d:"M12 17h.01"}],["path",{d:"M16 17h.01"}]];const O=[["path",{d:"M20 6 9 17l-5-5"}]];const R=[["path",{d:"m6 9 6 6 6-6"}]];const P=[["path",{d:"M10.1 2.182a10 10 0 0 1 3.8 0"}],["path",{d:"M13.9 21.818a10 10 0 0 1-3.8 0"}],["path",{d:"M17.609 3.721a10 10 0 0 1 2.69 2.7"}],["path",{d:"M2.182 13.9a10 10 0 0 1 0-3.8"}],["path",{d:"M20.279 17.609a10 10 0 0 1-2.7 2.69"}],["path",{d:"M21.818 10.1a10 10 0 0 1 0 3.8"}],["path",{d:"M3.721 6.391a10 10 0 0 1 2.7-2.69"}],["path",{d:"M6.391 20.279a10 10 0 0 1-2.69-2.7"}]];const B=[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16"}]];const T=[["rect",{width:"8",height:"4",x:"8",y:"2",rx:"1",ry:"1"}],["path",{d:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"}],["path",{d:"m9 14 2 2 4-4"}]];const I=[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M12 6v6h4"}]];const q=[["circle",{cx:"12",cy:"12",r:"1"}],["circle",{cx:"19",cy:"12",r:"1"}],["circle",{cx:"5",cy:"12",r:"1"}]];const H=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{d:"M8 18v-1"}],["path",{d:"M12 18v-6"}],["path",{d:"M16 18v-3"}]];const K=[["rect",{width:"7",height:"9",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"5",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"9",x:"14",y:"12",rx:"1"}],["rect",{width:"7",height:"5",x:"3",y:"16",rx:"1"}]];const j=[["path",{d:"m16 17 5-5-5-5"}],["path",{d:"M21 12H9"}],["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}]];const U=[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]];const V=[["path",{d:"M4 5h16"}],["path",{d:"M4 12h16"}],["path",{d:"M4 19h16"}]];const G=[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]];const D=[["path",{d:"m21 21-4.34-4.34"}],["circle",{cx:"11",cy:"11",r:"8"}]];const F=[["path",{d:"M14 17H5"}],["path",{d:"M19 7h-9"}],["circle",{cx:"17",cy:"17",r:"3"}],["circle",{cx:"7",cy:"7",r:"3"}]];const W=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["path",{d:"M16 3.128a4 4 0 0 1 0 7.744"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87"}],["circle",{cx:"9",cy:"7",r:"4"}]];const Y=[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]];const v=({icons:a={},nameAttr:s="data-lucide",attrs:t={},root:i=document,inTemplates:e}={})=>{if(!Object.values(a).length)throw new Error(`Please provide an icons object.
If you want to use all the icons you can import it like:
 \`import { createIcons, icons } from 'lucide';
lucide.createIcons({icons});\``);if(typeof i>"u")throw new Error("`createIcons()` only works in a browser environment.");if(Array.from(i.querySelectorAll(`[${s}]`)).forEach(c=>p(c,{nameAttr:s,icons:a,attrs:t})),e&&Array.from(i.querySelectorAll("template")).forEach(r=>v({icons:a,nameAttr:s,attrs:t,root:r.content,inTemplates:e})),s==="data-lucide"){const c=i.querySelectorAll("[icon-name]");c.length>0&&(console.warn("[Lucide] Some icons were found with the now deprecated icon-name attribute. These will still be replaced for backwards compatibility, but will no longer be supported in v1.0 and you should switch to data-lucide"),Array.from(c).forEach(r=>p(r,{nameAttr:"icon-name",icons:a,attrs:t})))}},z=document.querySelector("#app");z.innerHTML=`
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
`;v({icons:{Menu:V,X:Y,ChevronDown:R,Bell:E,LayoutDashboard:K,Building2:N,Users:W,CalendarDays:L,Clock3:I,ClipboardCheck:T,FileBarChart2:H,Settings2:F,ArrowUpRight:C,ArrowDownRight:x,MoreHorizontal:q,MapPin:U,Check:O,AlertCircle:B,CircleDashed:P,Search:D,Plus:G,LogOut:j}});document.querySelector("[data-sidebar-open]").addEventListener("click",()=>document.querySelector("#sidebar").classList.add("open"));document.querySelector("[data-sidebar-close]").addEventListener("click",()=>document.querySelector("#sidebar").classList.remove("open"));document.querySelectorAll(".nav-item").forEach(a=>a.addEventListener("click",()=>document.querySelector("#sidebar").classList.remove("open")));
