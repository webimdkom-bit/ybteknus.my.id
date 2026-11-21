# PRODUCT REQUIREMENTS DOCUMENT (PRD)

## Aplikasi Manajemen Bisnis, Karyawan, Absensi, dan Tugas

**Versi:** 1.0\
**Status:** Final -- Acuan Pengembangan\
**Tanggal:** 21 November 2026\
**Jenis Produk:** Web Application / Multi-Tenant SaaS

------------------------------------------------------------------------

# 1. Ringkasan Produk

## 1.1 Latar Belakang

Aplikasi ini dirancang sebagai platform manajemen operasional yang
memungkinkan satu pemilik mengelola beberapa bisnis berbeda melalui satu
dashboard terintegrasi.

Setiap bisnis memiliki data karyawan, jadwal kerja, absensi, pengajuan,
tugas, laporan, dan pengaturan masing-masing. Pemilik dapat memantau
seluruh bisnis secara terpusat maupun melihat aktivitas setiap bisnis
secara terpisah.

Aplikasi juga dirancang agar dapat dikembangkan menjadi layanan SaaS
yang mendukung banyak organisasi atau Owner secara independen.

## 1.2 Tujuan Produk

1.  Mempermudah pengelolaan beberapa bisnis dalam satu aplikasi.
2.  Memusatkan pengelolaan data karyawan dan kehadiran.
3.  Mengotomatisasi pencatatan absensi berbasis GPS.
4.  Mempermudah pengelolaan jadwal, izin, cuti, dan lembur.
5.  Memfasilitasi pembagian tugas secara bertingkat.
6.  Memantau hasil pekerjaan dan laporan setiap karyawan.
7.  Menyediakan laporan operasional yang mudah dipahami.
8.  Menjaga keamanan dan pemisahan data antarorganisasi dan bisnis.

## 1.3 Pengguna Sasaran

-   Pemilik usaha yang mengelola beberapa bisnis.
-   Pengelola atau Admin operasional.
-   Karyawan yang membutuhkan fasilitas absensi dan pelaporan pekerjaan.

# 2. Konsep dan Arsitektur Multi-Business

## 2.1 Struktur Organisasi

Aplikasi menggunakan pendekatan multi-tenant.

Struktur dasar:

`Organization → Owner → Businesses → Admins dan Employees`

Satu Organization dapat memiliki satu Owner dan beberapa bisnis. Setiap
bisnis memiliki pengelolaan operasional tersendiri.

Sistem harus mendukung banyak Organization yang tidak saling mengakses
data satu sama lain.

## 2.2 Pengelolaan Bisnis

Owner dapat:

-   Membuat bisnis baru.
-   Mengubah informasi bisnis.
-   Mengaktifkan atau menonaktifkan bisnis.
-   Mengatur lokasi absensi.
-   Mengelola Admin dan karyawan.
-   Melihat laporan seluruh bisnis.
-   Memindahkan karyawan antarbisnis.

Setiap bisnis mempunyai identitas, lokasi, konfigurasi absensi,
karyawan, jadwal, tugas, dan laporan masing-masing.

## 2.3 Mode Dashboard Owner

Dashboard Owner menyediakan dua mode:

**All Businesses** - Rekap seluruh bisnis. - Jumlah bisnis dan
karyawan. - Statistik kehadiran. - Pengajuan yang menunggu
persetujuan. - Ringkasan tugas dan laporan. - Perbandingan performa
antarbisnis.

**Selected Business** - Informasi dan statistik satu bisnis. - Daftar
karyawan. - Absensi dan jadwal. - Pengajuan. - Tugas dan laporan. -
Pengaturan bisnis.

Pemilihan bisnis dilakukan melalui dropdown pada sidebar.

## 2.4 Pemindahan Karyawan

Pemindahan karyawan hanya dapat dilakukan Owner.

Ketentuan: - Karyawan hanya memiliki satu keanggotaan bisnis aktif. -
Riwayat absensi dan pekerjaan lama tetap tersimpan. - Data historis
tetap terhubung dengan bisnis dan periode asal. - Pemindahan tidak boleh
mengubah laporan historis.

# 3. Role dan Hak Akses

Sistem memiliki tiga role utama.

## 3.1 Owner

Owner mempunyai kewenangan penuh terhadap Organization dan seluruh
bisnis di dalamnya.

Hak akses: - Mengelola seluruh bisnis. - Mengelola Admin. - Menyetujui
atau menolak registrasi karyawan. - Memindahkan karyawan. - Mengatur
lokasi GPS. - Mengatur jadwal dan kebijakan absensi. - Mengelola
tugas. - Melihat seluruh laporan. - Menyetujui laporan akhir tugas. -
Mengelola hak akses Admin. - Melihat audit trail.

## 3.2 Admin

Admin adalah pengguna yang ditunjuk Owner untuk mengelola operasional
bisnis tertentu.

Ketentuan: - Dapat ditugaskan pada satu atau beberapa bisnis. - Hak
akses dikonfigurasi secara terpisah untuk setiap bisnis. - Tidak dapat
membuat bisnis. - Tidak dapat mengangkat Admin lain. - Tidak dapat
menyetujui registrasi karyawan. - Tidak dapat memindahkan karyawan. -
Tidak dapat mengubah konfigurasi lokasi GPS bisnis. - Tidak dapat
memberikan akses Owner.

Contoh izin Admin: - Mengelola data karyawan. - Mengelola jadwal. -
Melihat absensi. - Menyetujui izin dan cuti. - Menyetujui koreksi
absensi. - Mengelola lembur. - Melihat laporan. - Membuat dan
mendelegasikan tugas. - Memeriksa laporan pekerjaan.

Setiap izin harus dapat diaktifkan atau dinonaktifkan oleh Owner untuk
masing-masing bisnis.

Admin hanya dapat bertindak dalam bisnis yang menjadi tanggung jawabnya.

## 3.3 Employee

Employee merupakan pengguna yang terdaftar sebagai karyawan pada satu
bisnis.

Hak akses: - Melihat profil sendiri. - Melihat jadwal kerja. - Melakukan
check-in dan check-out. - Melihat riwayat absensi sendiri. - Mengajukan
izin dan cuti. - Mengajukan koreksi absensi. - Mengajukan atau melihat
informasi lembur sesuai kebijakan. - Melihat tugas yang diberikan. -
Mengisi checklist pekerjaan. - Mengirim laporan pekerjaan. - Mengunggah
bukti pekerjaan. - Melihat status pengajuan dan tugas sendiri.

Employee tidak dapat mengakses data karyawan lain atau bisnis lain.

## 3.4 Matriks Hak Akses

  Fitur                      Owner          Admin         Employee
  -------------------------- -------------- ------------- ----------
  Mengelola bisnis           Ya             Tidak         Tidak
  Mengelola Admin            Ya             Tidak         Tidak
  Menyetujui registrasi      Ya             Tidak         Tidak
  Memindahkan karyawan       Ya             Tidak         Tidak
  Mengatur lokasi GPS        Ya             Tidak         Tidak
  Mengelola karyawan         Ya             Sesuai izin   Tidak
  Mengelola jadwal           Ya             Sesuai izin   Tidak
  Melihat absensi            Semua bisnis   Sesuai izin   Sendiri
  Menyetujui izin/cuti       Ya             Sesuai izin   Tidak
  Menyetujui koreksi         Ya             Sesuai izin   Tidak
  Mengelola lembur           Ya             Sesuai izin   Tidak
  Membuat tugas              Ya             Sesuai izin   Tidak
  Menerima tugas             Ya             Ya            Ya
  Melihat laporan tugas      Semua bisnis   Sesuai izin   Sendiri
  Menyetujui laporan akhir   Ya             Tidak         Tidak

Hak akses Admin bersifat granular dan berlaku per bisnis.

# 4. Registrasi dan Manajemen Pengguna

## 4.1 Registrasi Employee

Employee dapat mendaftar melalui halaman registrasi.

Alur: 1. Pengguna mengisi formulir pendaftaran. 2. Pengguna membuat akun
melalui Firebase Authentication. 3. Pengguna memilih bisnis yang masih
aktif dan menerima pendaftaran. 4. Sistem membuat data registrasi
berstatus Pending. 5. Owner memeriksa permohonan. 6. Owner menyetujui
atau menolak. 7. Jika disetujui, pengguna memperoleh akses sebagai
Employee pada bisnis tersebut.

Status registrasi: - Pending - Approved - Rejected - Suspended

Pengguna yang belum disetujui tidak dapat mengakses fitur operasional
karyawan.

## 4.2 Manajemen Karyawan

Data karyawan minimal: - Nama lengkap. - Email. - Nomor telepon. - Foto
profil. - Identitas karyawan. - Bisnis tempat bekerja. - Jabatan atau
posisi. - Tanggal bergabung. - Status keaktifan.

Data tambahan dapat dikembangkan sesuai kebutuhan.

# 5. Modul Absensi

## 5.1 Metode Absensi

Absensi menggunakan GPS melalui browser pada perangkat pengguna.

Aktivitas: - Check-in. - Check-out.

Sistem menyimpan: - Waktu dari server. - Koordinat GPS. - Akurasi GPS. -
Lokasi bisnis. - Jarak dari titik lokasi bisnis. - Status validasi
lokasi. - Identitas pengguna dan bisnis.

GPS digunakan sebagai validasi lokasi, bukan sebagai jaminan mutlak
bahwa lokasi tidak dapat dimanipulasi.

## 5.2 Pengaturan Lokasi

Owner mengatur: - Koordinat lokasi bisnis. - Radius maksimal absensi. -
Nama lokasi. - Status lokasi aktif.

Karyawan dapat melakukan absensi normal jika berada dalam radius yang
ditentukan.

## 5.3 Absensi di Luar Lokasi

Absensi di luar lokasi hanya dapat dilakukan dengan izin khusus.

Pengajuan memuat: - Karyawan. - Bisnis. - Tanggal atau rentang waktu. -
Alasan. - Jenis tindakan yang diizinkan. - Waktu berlaku. - Status
pengajuan.

Izin dapat berupa satu kali atau berlaku untuk beberapa tanggal.

Owner menjadi pemberi persetujuan.

## 5.4 Jadwal dan Shift

Sistem menggunakan pengaturan shift fleksibel.

Owner atau Admin dengan izin yang sesuai dapat: - Membuat shift. -
Mengatur jam masuk dan pulang. - Mengatur istirahat. - Mengatur hari
kerja. - Menetapkan toleransi keterlambatan. - Menugaskan shift kepada
karyawan. - Mengatur jadwal individual.

Perubahan jadwal harus mempunyai tanggal efektif agar tidak mengubah
perhitungan absensi historis.

## 5.5 Perhitungan Keterlambatan

Formula dasar:

`Keterlambatan = max(0, waktu check-in - jam masuk terjadwal - toleransi)`

Sistem harus membedakan: - Selisih keterlambatan aktual. - Keterlambatan
setelah toleransi.

Perhitungan waktu pulang lebih awal juga harus tersedia.

## 5.6 Status Kehadiran

Status yang dikelola: - Hadir. - Terlambat. - Pulang lebih awal. -
Izin. - Cuti. - Lembur. - Alpa. - Hari libur. - Belum lengkap.

Status akhir Alpa ditentukan setelah shift berakhir apabila tidak ada
check-in dan tidak ada pengajuan izin/cuti yang disetujui.

Pengajuan yang masih Pending harus ditampilkan secara terpisah dan tidak
langsung dianggap sebagai pengajuan yang disetujui.

Owner dapat melakukan koreksi status dengan alasan dan catatan audit.

## 5.7 Pengajuan Izin dan Cuti

Employee dapat mengajukan: - Izin. - Cuti. - Ketidakhadiran khusus.

Data pengajuan: - Jenis pengajuan. - Tanggal. - Durasi. - Alasan. -
Dokumen pendukung jika diperlukan. - Status persetujuan.

Persetujuan dilakukan Owner atau Admin yang mempunyai izin khusus.

## 5.8 Lembur

Sistem mendukung: - Pencatatan lembur. - Pengajuan lembur. - Persetujuan
lembur. - Perhitungan durasi lembur. - Riwayat lembur.

Durasi setelah jam kerja tidak otomatis dianggap sebagai lembur yang
disetujui.

## 5.9 Koreksi Absensi

Employee dapat mengajukan koreksi absensi.

Data: - Tanggal absensi. - Data awal. - Data yang diminta. - Alasan. -
Bukti pendukung. - Status persetujuan.

Persetujuan dilakukan Owner atau Admin yang mempunyai izin khusus.

Data asli tidak dihapus. Sistem menyimpan riwayat perubahan, pengguna
yang melakukan perubahan, waktu, dan alasan.

## 5.10 Laporan Absensi

Laporan tersedia berdasarkan: - Harian. - Bulanan. - Per karyawan. - Per
bisnis. - Seluruh bisnis.

Format ekspor: - PDF. - Excel.

# 6. Modul Manajemen Tugas

## 6.1 Tujuan

Modul ini digunakan untuk membagikan pekerjaan, memantau progres,
mengumpulkan hasil, dan mengevaluasi penyelesaian pekerjaan.

## 6.2 Hierarki Delegasi

Alur utama:

`Owner → Admin → Employee`

Owner dapat memberikan tugas kepada: - Admin. - Employee. - Beberapa
penerima sekaligus. - Penerima dalam bisnis tertentu. - Penerima dari
beberapa bisnis yang dipilih.

Admin dapat membuat tugas turunan untuk Employee dalam bisnis yang
ditugaskan kepadanya dan hanya jika memiliki izin membuat tugas.

Admin tidak dapat: - Memberikan tugas kepada pengguna di luar bisnis
tanggung jawabnya. - Memperluas ruang lingkup tugas induk. - Mengubah
deadline tugas induk secara sepihak. - Memberikan tugas kepada Admin
lain pada versi pertama.

## 6.3 Data Tugas

Setiap tugas mempunyai: - Judul. - Bisnis. - Kategori. - Deskripsi. -
Instruksi. - Penerima. - Prioritas. - Deadline. - Checklist. - Format
laporan. - Persyaratan bukti. - Lampiran. - Status persetujuan.

Kategori awal: - Operasional. - Kebersihan. - Administrasi. - Pelayanan
pelanggan. - Inventaris. - Perawatan. - Proyek. - Lainnya.

Kategori dapat dikelola Owner.

Prioritas: - Low. - Normal. - High. - Urgent.

## 6.4 Format Pekerjaan

Tugas dapat menggunakan satu atau kombinasi format: - Tugas sederhana. -
Checklist. - Laporan tertulis. - Bukti foto. - Bukti dokumen.

## 6.5 Penugasan Individual

Jika tugas diberikan kepada beberapa orang, setiap penerima mendapatkan
penugasan individual.

Masing-masing wajib: - Mengerjakan tugas sendiri. - Mengisi checklist
sendiri. - Membuat laporan sendiri. - Mengunggah bukti sendiri. -
Mengirim hasil sendiri.

Tidak menggunakan laporan kelompok bersama.

## 6.6 Status Tugas

Status proses: - Assigned. - In Progress. - Submitted. - Revision. -
Approved. - Cancelled.

Status waktu: - Pending. - On Time. - Late. - Overdue.

Status waktu dihitung berdasarkan deadline dan waktu pengiriman.

Status waktu tidak menggantikan status proses pekerjaan.

## 6.7 Laporan Pekerjaan

Setiap laporan berisi: - Deskripsi hasil pekerjaan. - Checklist. -
Lampiran. - Foto atau dokumen. - Waktu pengiriman. - Status
pemeriksaan. - Catatan pemeriksa.

Riwayat laporan dan revisi tidak boleh ditimpa.

Owner atau Admin dengan izin yang sesuai dapat memeriksa laporan
individual, menyetujui, atau meminta revisi.

## 6.8 Tugas Bertingkat

Setiap tugas turunan mempunyai relasi terhadap tugas induk.

Data relasi: - parentTaskId. - rootTaskId. - createdBy. - assignedBy. -
assignedTo. - organizationId. - businessId.

Contoh:

Owner membuat tugas untuk Admin A.

Admin A membagi tugas menjadi tiga pekerjaan untuk tiga Employee.

Setiap Employee mengirim laporan masing-masing.

Admin A memeriksa hasil, kemudian membuat laporan akhir kepada Owner.

Owner memeriksa laporan akhir dan memberikan persetujuan.

## 6.9 Aturan Status Tugas Induk

Tugas induk tetap berstatus In Progress sampai: 1. Semua tugas turunan
selesai dan disetujui. 2. Admin menyusun laporan akhir. 3. Admin
mengirim laporan akhir kepada Owner. 4. Owner menyetujui laporan akhir.

Persentase progres dihitung otomatis berdasarkan jumlah tugas turunan
yang telah disetujui.

Contoh:

2 dari 3 tugas disetujui = 67%.

Tugas yang masih membutuhkan revisi tidak dihitung selesai.

Tugas induk tidak boleh otomatis selesai hanya karena semua tugas
turunan telah selesai.

## 6.10 Monitoring Tugas

Owner: - Melihat semua tugas. - Memantau seluruh progres. - Melihat
seluruh laporan dan lampiran. - Memeriksa laporan akhir Admin. -
Menyetujui atau meminta revisi.

Admin: - Melihat tugas dalam bisnis yang ditugaskan. - Membuat tugas
turunan sesuai izin. - Memeriksa laporan Employee. - Membuat laporan
akhir.

Employee: - Melihat tugas sendiri. - Memperbarui progres. - Mengisi
checklist. - Mengirim laporan. - Melihat status pemeriksaan.

# 7. Notifikasi

Versi pertama menggunakan notifikasi dalam aplikasi.

Jenis notifikasi: - Registrasi karyawan baru. - Persetujuan atau
penolakan registrasi. - Jadwal kerja. - Pengajuan izin/cuti. -
Persetujuan atau penolakan pengajuan. - Pengajuan koreksi. - Informasi
lembur. - Tugas baru. - Deadline mendekat. - Tugas terlambat. - Laporan
dikirim. - Permintaan revisi. - Laporan disetujui.

Notifikasi harus disesuaikan dengan role dan hak akses pengguna.

# 8. Manajemen File dan Dokumen

## 8.1 Cloudinary

Cloudinary menjadi layanan utama untuk menyimpan file.

Digunakan untuk: - Foto profil. - Logo bisnis. - Bukti absensi jika
kelak diperlukan. - Dokumen izin dan cuti. - Lampiran tugas. - Foto
hasil pekerjaan. - Dokumen laporan.

Firebase Storage tidak digunakan.

## 8.2 Metadata File

Firestore menyimpan informasi file, bukan konten file.

Metadata minimal: - fileName. - resourceType. - format. -
cloudinaryPublicId. - secureUrl atau referensi akses. - uploadedBy. -
uploadedAt. - organizationId. - businessId. - kategori file. -
klasifikasi akses.

## 8.3 Keamanan File

File dibedakan menjadi: - Publik: logo bisnis dan foto profil sesuai
kebijakan. - Privat: dokumen internal, surat izin, dan dokumen sensitif.

Dokumen privat harus menggunakan mekanisme akses terkontrol, misalnya
signed URL atau authenticated delivery.

URL yang tidak dipublikasikan bukan pengganti kontrol akses.

## 8.4 Netlify Functions

Operasi yang memerlukan API Secret dilakukan di backend melalui Netlify
Functions.

Environment variables: - CLOUDINARY_CLOUD_NAME. - CLOUDINARY_API_KEY. -
CLOUDINARY_API_SECRET.

API Secret tidak boleh disimpan atau dikirim ke frontend.

Fungsi backend minimal: - Membuat signature upload. - Memvalidasi
identitas dan hak akses. - Memvalidasi jenis serta ukuran file. -
Menghapus file setelah otorisasi. - Mengelola akses file privat sesuai
kebutuhan.

# 9. Dashboard

## 9.1 Dashboard Owner

Menampilkan: - Jumlah bisnis. - Jumlah karyawan. - Jumlah karyawan
hadir. - Jumlah terlambat. - Jumlah alpa. - Pengajuan yang menunggu. -
Tugas berjalan. - Tugas terlambat. - Laporan yang menunggu
persetujuan. - Ringkasan performa bisnis.

Data dapat difilter berdasarkan bisnis dan periode.

## 9.2 Dashboard Admin

Menampilkan informasi sesuai bisnis dan izin: - Jumlah karyawan. -
Statistik kehadiran. - Jadwal. - Pengajuan. - Tugas. - Laporan. -
Pekerjaan yang membutuhkan tindakan.

## 9.3 Dashboard Employee

Menampilkan: - Jadwal hari ini. - Status absensi. - Tombol
check-in/check-out. - Riwayat kehadiran. - Pengajuan pribadi. - Tugas
aktif. - Deadline. - Status laporan pekerjaan. - Notifikasi.

# 10. Audit Trail

Aktivitas penting harus dicatat dan tidak dapat diubah oleh pengguna
biasa.

Contoh aktivitas: - Pengguna login dan perubahan status akun. - Bisnis
dibuat atau dinonaktifkan. - Karyawan disetujui. - Karyawan
dipindahkan. - Jadwal diubah. - Absensi dikoreksi. - Pengajuan disetujui
atau ditolak. - Tugas dibuat dan didelegasikan. - Laporan dikirim. -
Revisi diminta. - Laporan disetujui. - File diunggah atau dihapus. - Hak
akses Admin berubah.

Data audit minimal: - actorId. - organizationId. - businessId. -
action. - targetType. - targetId. - timestamp. - metadata perubahan yang
relevan.

# 11. Arsitektur Teknologi

## 11.1 Frontend

-   HTML5.
-   JavaScript modern menggunakan ES Modules.
-   Tailwind CSS.
-   Responsive Web Design.
-   Komponen antarmuka modular.

Frontend harus dapat digunakan melalui desktop, tablet, dan smartphone.

## 11.2 Backend dan Infrastruktur

  Komponen              Teknologi
  --------------------- -------------------------------
  Frontend              HTML5, JavaScript ES Modules
  CSS                   Tailwind CSS
  Authentication        Firebase Authentication
  Database              Cloud Firestore
  File Storage          Cloudinary
  Backend Functions     Netlify Functions
  Hosting               Netlify
  Server-side secrets   Netlify Environment Variables

## 11.3 Database

Cloud Firestore digunakan untuk menyimpan: - Organization. - Business. -
User profile. - Membership. - Admin permissions. - Employee data. -
Shift dan schedule. - Attendance. - Leave dan permission requests. -
Overtime. - Attendance corrections. - Tasks. - Task assignments. - Task
submissions. - Notifications. - File metadata. - Audit logs.

Struktur database harus dirancang untuk mendukung pemisahan data
antar-Organization dan antar-bisnis.

## 11.4 Keamanan Backend

Operasi sensitif tidak boleh hanya mengandalkan validasi frontend.

Validasi hak akses harus dilakukan melalui mekanisme server-side yang
tepercaya dan Firestore Security Rules.

Netlify Functions digunakan untuk operasi yang membutuhkan kredensial
rahasia atau proses server-side.

Firebase Authentication digunakan untuk identitas pengguna.

Token autentikasi harus diverifikasi sebelum backend memproses
permintaan yang memerlukan otorisasi.

# 12. Persyaratan Non-Fungsional

## 12.1 Keamanan

-   Isolasi data antar-Organization.
-   Pembatasan akses antar-bisnis.
-   Role-based access control.
-   Validasi otorisasi di backend.
-   Firebase Security Rules.
-   API Secret tidak boleh berada di frontend.
-   Audit trail untuk aktivitas penting.
-   Validasi file upload.
-   Proteksi terhadap akses langsung yang tidak berhak.

## 12.2 Performa

-   Antarmuka responsif.
-   Pemuatan data secara bertahap.
-   Pagination untuk daftar panjang.
-   Query Firestore yang efisien.
-   Penggunaan indeks yang sesuai.
-   Optimasi gambar dan aset.

## 12.3 Kompatibilitas

Aplikasi harus mendukung browser modern: - Google Chrome. - Microsoft
Edge. - Mozilla Firefox. - Safari.

Fitur GPS memerlukan izin lokasi dari browser dan koneksi aman HTTPS.

## 12.4 Skalabilitas

Arsitektur harus dapat dikembangkan untuk: - Banyak Organization. -
Banyak bisnis per Organization. - Banyak pengguna. - Banyak data
absensi. - Banyak tugas dan laporan. - Penambahan modul di masa
mendatang.

## 12.5 Integritas Data

-   Riwayat absensi tidak boleh hilang akibat perubahan jadwal.
-   Pemindahan karyawan tidak menghapus data historis.
-   Revisi laporan harus menyimpan versi sebelumnya.
-   Perubahan data penting harus memiliki audit trail.
-   Perhitungan status dan progres harus konsisten.

# 13. Ruang Lingkup MVP

Versi pertama mencakup:

1.  Multi-tenant Organization dan multi-business.
2.  Autentikasi dan registrasi.
3.  Role Owner, Admin, Employee.
4.  Pengaturan hak akses Admin.
5.  Manajemen bisnis dan karyawan.
6.  Manajemen shift dan jadwal.
7.  Absensi GPS.
8.  Izin absensi luar lokasi.
9.  Pengajuan izin dan cuti.
10. Pengajuan koreksi absensi.
11. Pengelolaan lembur.
12. Rekap dan ekspor laporan absensi.
13. Manajemen tugas.
14. Delegasi tugas bertingkat.
15. Checklist dan laporan individual.
16. Persetujuan laporan dan revisi.
17. Notifikasi dalam aplikasi.
18. Manajemen file Cloudinary.
19. Audit trail.
20. Dashboard sesuai role.

## 13.1 Di Luar Ruang Lingkup MVP

Fitur berikut tidak termasuk dalam versi pertama: - Payroll dan
penggajian otomatis. - Perhitungan pajak karyawan. - Akuntansi dan
pembukuan. - Manajemen inventaris lengkap. - Aplikasi Android/iOS
native. - Integrasi mesin fingerprint. - Integrasi perangkat absensi
fisik. - Notifikasi WhatsApp otomatis. - Integrasi payment gateway. -
Sistem HRIS lanjutan. - Analitik bisnis tingkat lanjut.

Fitur di luar ruang lingkup dapat dimasukkan ke versi berikutnya melalui
revisi PRD.

# 14. Kriteria Penerimaan Produk

Produk MVP dinyatakan memenuhi persyaratan apabila:

1.  Owner dapat membuat dan mengelola beberapa bisnis.
2.  Data setiap bisnis terpisah dengan benar.
3.  Owner dapat berpindah antara mode seluruh bisnis dan bisnis
    terpilih.
4.  Employee dapat mendaftar dan memilih bisnis aktif.
5.  Registrasi memerlukan persetujuan Owner.
6.  Admin hanya dapat mengakses bisnis dan fitur sesuai izin.
7.  Employee tidak dapat mengakses data pengguna lain.
8.  Karyawan dapat melakukan absensi GPS.
9.  Sistem dapat menghitung keterlambatan berdasarkan shift dan
    toleransi.
10. Pengajuan izin, cuti, koreksi, dan lembur dapat diproses sesuai hak
    akses.
11. Riwayat absensi tetap konsisten setelah perubahan jadwal atau
    pemindahan karyawan.
12. Owner dapat membuat dan mendelegasikan tugas kepada Admin maupun
    Employee.
13. Admin yang memiliki izin dapat membuat tugas turunan untuk Employee.
14. Setiap penerima tugas mempunyai laporan individual.
15. Sistem dapat menghitung progres tugas induk berdasarkan tugas
    turunan yang disetujui.
16. Tugas induk memerlukan laporan akhir Admin dan persetujuan Owner.
17. File dapat diunggah ke Cloudinary tanpa mengekspos API Secret.
18. File privat hanya dapat diakses oleh pengguna yang berwenang.
19. Notifikasi muncul sesuai aktivitas dan hak akses.
20. Aktivitas penting tersimpan dalam audit trail.
21. Pengujian keamanan membuktikan bahwa pengguna tidak dapat membaca
    atau mengubah data di luar kewenangannya.

# 15. Prinsip Pengembangan

Pengembangan harus mengikuti prinsip berikut:

1.  Keamanan dan isolasi data menjadi prioritas utama.
2.  Hak akses harus diterapkan di backend, bukan hanya menyembunyikan
    menu frontend.
3.  Setiap bisnis memiliki konfigurasi dan data operasional independen.
4.  Riwayat transaksi dan aktivitas harus dapat ditelusuri.
5.  Antarmuka harus sederhana, modern, dan responsif.
6.  Struktur kode harus modular dan mudah dipelihara.
7.  Fitur dikembangkan bertahap sesuai prioritas MVP.
8.  Setiap modul harus diuji sebelum dinyatakan selesai.
9.  Penambahan fitur baru tidak boleh merusak fondasi sistem.
10. Perubahan kebutuhan harus dicatat melalui revisi dokumen PRD.

# 16. Status Dokumen

**PRD Versi 1.0: FINAL**

Dokumen ini merupakan acuan kebutuhan produk dan ruang lingkup
pengembangan MVP.

Keputusan dalam PRD 1.0 menjadi dasar untuk tahapan berikutnya: -
Perancangan arsitektur sistem. - Perancangan database Firestore. -
Perancangan alur pengguna (user flow). - Perancangan UI/UX. - Penyusunan
struktur proyek. - Implementasi frontend dan backend. - Pengujian
fungsional dan keamanan.

Fitur baru, perubahan proses bisnis, dan pengembangan lanjutan akan
dicatat dalam PRD versi berikutnya.

**Akhir Dokumen PRD 1.0**
