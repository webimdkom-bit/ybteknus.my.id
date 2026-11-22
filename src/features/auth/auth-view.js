import { listOpenBusinesses } from "../../lib/firestore/repositories.js";
import { registerEmployee, resetPassword, signIn } from "./auth-service.js";

export function renderAuthScreen(app) {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-intro">
        <div class="brand-lockup auth-brand"><div class="brand-mark">YB</div><div><strong>YB TECH</strong><span>OPERATIONS OS</span></div></div>
        <div class="auth-statement"><p class="eyebrow">BUSINESS OPERATIONS, IN ONE VIEW</p><h1>Run the work.<br><em>Not the chaos.</em></h1><p>Kelola bisnis, people, absensi, dan tugas dari satu ruang kerja yang tenang.</p></div>
        <div class="auth-note"><span>01</span><p>Multi-business workspace<br><strong>Built for the moving parts.</strong></p></div>
      </section>
      <section class="auth-card-wrap"><div class="auth-card">
        <div class="auth-card-head"><p class="eyebrow">WELCOME BACK</p><h2 id="auth-title">Masuk ke workspace</h2><p id="auth-subtitle">Gunakan akun Anda untuk melanjutkan.</p></div>
        <div class="auth-tabs"><button class="auth-tab active" data-auth-mode="login">Masuk</button><button class="auth-tab" data-auth-mode="register">Daftar employee</button></div>
        <form id="auth-form" class="auth-form">
          <div class="field field-register"><label for="auth-name">Nama lengkap</label><input id="auth-name" name="name" autocomplete="name" placeholder="Nama Anda" /></div>
          <div class="field field-register"><label for="auth-phone">Nomor telepon</label><input id="auth-phone" name="phone" type="tel" autocomplete="tel" placeholder="08xxxxxxxxxx" /></div>
          <div class="field field-register"><label for="auth-position">Jabatan / posisi</label><input id="auth-position" name="position" placeholder="Contoh: Staff operasional" /></div>
          <div class="field field-register"><label for="auth-identity">Identitas karyawan <span>(opsional)</span></label><input id="auth-identity" name="identityNumber" placeholder="Nomor identitas" /></div>
          <div class="field field-register"><label for="auth-photo">URL foto profil <span>(opsional)</span></label><input id="auth-photo" name="photoURL" type="url" placeholder="https://..." /></div>
          <div class="field"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="nama@perusahaan.com" required /></div>
          <div class="field"><label for="auth-password">Password</label><div class="password-control"><input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="Minimal 6 karakter" required minlength="6" /><button class="password-toggle" type="button" data-password-toggle="auth-password" aria-label="Lihat password" aria-pressed="false">Lihat</button></div></div>
          <button class="auth-link password-reset" type="button">Lupa password?</button>
          <div class="field field-register"><label for="auth-password-confirmation">Konfirmasi password</label><div class="password-control"><input id="auth-password-confirmation" name="passwordConfirmation" type="password" autocomplete="new-password" placeholder="Ulangi password" minlength="6" /><button class="password-toggle" type="button" data-password-toggle="auth-password-confirmation" aria-label="Lihat konfirmasi password" aria-pressed="false">Lihat</button></div></div>
          <div class="field field-register"><label for="auth-business">Pilih bisnis</label><select id="auth-business" name="businessId" required><option value="">Memuat bisnis aktif...</option></select></div>
          <p class="auth-error" id="auth-error" role="alert"></p>
          <button class="primary-button auth-submit" type="submit"><span id="auth-submit-label">Masuk</span><span class="button-arrow">→</span></button>
        </form>
        <p class="auth-footer">Dengan melanjutkan, Anda menyetujui kebijakan akses internal perusahaan.</p>
      </div></section>
    </main>
  `;

  let mode = "login";
  const form = app.querySelector("#auth-form");
  const error = app.querySelector("#auth-error");
  const businessSelect = app.querySelector("#auth-business");
  const passwordReset = app.querySelector(".password-reset");
  const passwordConfirmation = app.querySelector("#auth-password-confirmation");
  const passwordToggles = app.querySelectorAll("[data-password-toggle]");
  const setMode = (nextMode) => {
    mode = nextMode;
    app.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
    app.querySelectorAll(".field-register").forEach((field) => field.classList.toggle("is-visible", mode === "register"));
    app.querySelector("#auth-title").textContent = mode === "login" ? "Masuk ke workspace" : "Daftar sebagai employee";
    app.querySelector("#auth-subtitle").textContent = mode === "login" ? "Gunakan akun perusahaan Anda untuk melanjutkan." : "Akun baru perlu disetujui Owner sebelum digunakan.";
    app.querySelector("#auth-submit-label").textContent = mode === "login" ? "Masuk" : "Kirim pendaftaran";
    app.querySelector("#auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
    businessSelect.required = mode === "register";
    passwordConfirmation.required = mode === "register";
    passwordReset.hidden = mode !== "login";
    passwordToggles.forEach((toggle) => {
      const input = app.querySelector(`#${toggle.dataset.passwordToggle}`);
      input.type = "password";
      toggle.textContent = "Lihat";
      toggle.setAttribute("aria-label", `Lihat ${input.id === "auth-password" ? "password" : "konfirmasi password"}`);
      toggle.setAttribute("aria-pressed", "false");
    });
  };
  app.querySelectorAll("[data-auth-mode]").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.authMode)));
  passwordToggles.forEach((toggle) => toggle.addEventListener("click", () => {
    const input = app.querySelector(`#${toggle.dataset.passwordToggle}`);
    const isVisible = input.type === "text";
    input.type = isVisible ? "password" : "text";
    toggle.textContent = isVisible ? "Lihat" : "Sembunyikan";
    toggle.setAttribute("aria-label", `${isVisible ? "Lihat" : "Sembunyikan"} ${input.id === "auth-password" ? "password" : "konfirmasi password"}`);
    toggle.setAttribute("aria-pressed", String(!isVisible));
  }));
  setMode("login");

  passwordReset.addEventListener("click", async () => {
    const email = app.querySelector("#auth-email").value;
    if (!email) {
      error.textContent = "Masukkan email terlebih dahulu untuk reset password.";
      return;
    }
    try {
      await resetPassword(email);
      error.classList.add("is-success");
      error.textContent = "Link reset password sudah dikirim ke email Anda.";
    } catch (resetError) {
      error.classList.remove("is-success");
      error.textContent = humanizeAuthError(resetError);
    }
  });

  listOpenBusinesses().then((businesses) => {
    businessSelect.innerHTML = businesses.length
      ? `<option value="">Pilih bisnis tujuan</option>${businesses.map((business) => `<option value="${business.id}">${business.name}${business.city ? ` · ${business.city}` : ""}</option>`).join("")}`
      : `<option value="">Belum ada bisnis yang menerima pendaftaran</option>`;
    businessSelect.dataset.businesses = JSON.stringify(businesses);
  }).catch((loadError) => {
    console.error("Failed to load open businesses", loadError);
    businessSelect.innerHTML = `<option value="">Gagal memuat bisnis</option>`;
    error.textContent = humanizeFirestoreError(loadError);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    error.classList.remove("is-success");
    const data = Object.fromEntries(new FormData(form));
    if (mode === "register" && data.password !== data.passwordConfirmation) {
      error.textContent = "Konfirmasi password tidak sama.";
      return;
    }
    if (mode === "register" && (!data.phone?.trim() || !data.position?.trim())) {
      error.textContent = "Nomor telepon dan jabatan wajib diisi.";
      return;
    }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.querySelector("#auth-submit-label").textContent = "Memproses...";
    try {
      if (mode === "login") await signIn(data.email, data.password);
      if (mode === "register") {
        const businesses = JSON.parse(businessSelect.dataset.businesses || "[]");
        const business = businesses.find((item) => item.id === data.businessId);
        if (!business) throw new Error("Pilih bisnis tujuan terlebih dahulu.");
        await registerEmployee({ ...data, business });
      }
    } catch (submissionError) {
      error.textContent = humanizeAuthError(submissionError);
      submit.disabled = false;
      submit.querySelector("#auth-submit-label").textContent = mode === "login" ? "Masuk" : "Kirim pendaftaran";
    }
  });
}

function humanizeAuthError(error) {
  const messages = {
    "auth/invalid-credential": "Email atau password tidak sesuai.",
    "auth/invalid-login-credentials": "Email atau password tidak sesuai.",
    "auth/user-not-found": "Akun dengan email tersebut belum terdaftar.",
    "auth/wrong-password": "Password tidak sesuai.",
    "auth/email-already-in-use": "Email tersebut sudah terdaftar.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/invalid-email": "Format email belum benar.",
    "auth/user-disabled": "Akun ini dinonaktifkan.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.",
  };
  return messages[error?.code] || error?.message || "Terjadi kesalahan. Coba lagi.";
}

function humanizeFirestoreError(error) {
  if (error?.code === "permission-denied") return "Bisnis belum bisa dibaca. Publish Firestore Rules terbaru terlebih dahulu.";
  if (error?.code === "failed-precondition") return "Index Firestore belum tersedia. Publish Firestore Indexes terbaru terlebih dahulu.";
  return error?.message || "Daftar bisnis gagal dimuat.";
}
