# Project Context & Handoff — WebGIS Aksesibilitas Fasilitas Kesehatan (Pekanbaru)

> Gunakan dokumen ini sebagai pegangan konteks proyek ketika melanjutkan pengembangan laporan atau presentasi (BAB 1–4 & PPT).

---

## 1. Course & Project Requirements (Ketentuan Proyek SIG)
- **Topik / Studi Kasus:** Aksesibilitas Fasilitas Kesehatan di Kota Pekanbaru (klasifikasi zona: `Sangat mudah`, `Mudah`, `Sedang`, `Sulit`).
- **Jadwal Presentasi:** **9 & 16 Desember 2026**
- **Ketentuan Teknis & Akademik:**
  1. **Map Engine:** **OpenLayers** (`ol`) *(tanpa Leaflet)* dengan `{ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }`.
  2. **Filtering:** Data spasial dapat difilter dengan **checkbox** & pencarian kategori.
  3. **Home / Landing Page:** Tersedia halaman awal (`/`) sebagai pengantar yang bersih sebelum membuka peta (`/map`).
  4. **Data Visualization:** Pembedaan simbol/ikon SVG tergraduasi, warna kontras, legenda, dan popup klik fitur.
  5. **4 Layer Wajib (+ Heatmap Opsional):**
     - **a. Data Point:** `facilities` (30 fasilitas kesehatan)
     - **b. Data Polyline:** `routes` (5 koridor jalur jalan `J1–J5`)
     - **c. Data Polygon:** `zones` (5 zona koridor survei `Z1–Z5`)
     - **d. Data Hasil Analisis:** `analysis_results` (10 fitur output analisis spasial untuk pengambilan keputusan)
     - *(Opsional)* Layer **Heatmap** kepadatan faskes (`ol/layer/Heatmap`).
  6. **Database:** **MongoDB Atlas** dengan indeks spasial `2dsphere` di seluruh collection, diakses melalui Backend REST API (kredensial `.env` hanya di backend).
  7. **Laporan Akhir:** Laporan lengkap hingga **BAB 4 (Hasil Implementasi dan Pembahasan)** + **Slide PPT**.

---

## 2. Current Progress (Completed & Verified)

### Step 1: Dataset Survei, Jalur Jalan Asli, Analisis Layer 4 & MongoDB Atlas — **DONE**
- **Data Survei Sumber:** `data/raw/survey_faskes_pekanbaru.csv` (40 baris survei; geometri koridor `J1–J5` telah diperbarui mengikuti jaringan jalan asli OpenStreetMap/OSRM pada `[longitude, latitude]`).
- **Script Konversi & Generator:**
  - `scripts/convert-csv-to-geojson.mjs` (`npm run convert`) menghasilkan:
    - `data/geojson/facilities.geojson` — **30 Point** (`12` Rumah Sakit, `8` Apotek, `7` Klinik, `2` Praktik Dokter, `1` Instansi Kesehatan)
    - `data/geojson/routes.geojson` — **5 LineString** mengikuti ruas jalan asli (`J1`: `8.56 km`, `J2`: `2.43 km`, `J3`: `7.95 km`, `J4`: `5.02 km` bertipe `inter_zone`; `J5`: `3.79 km` bertipe `intra_zone`)
    - `data/geojson/zones.geojson` — **5 Polygon** zona koridor survei (`Z1–Z5`)
    - `data/geojson/all_features.geojson` — gabungan 40 fitur survei
  - `scripts/generate-analysis-geojson.mjs` (`npm run analyze`) menghasilkan **Layer 4 eksplisit**:
    - `data/geojson/analysis_results.geojson` — **10 fitur**:
      - `3` fitur `buffer_rs` (radius `0.6 km`, `1.5 km`, `3.0 km` mengelilingi 12 RS)
      - `1` fitur `overlay_gap` (*difference* zona terhadap buffer RS `3.0 km` → `100%` wilayah `Z1 Rumbai` seluas `3.16 km²` belum terjangkau RS)
      - `5` fitur `nearest_hospital_link` (vektor jarak pusat aktivitas `Z1–Z5` ke RS terdekat)
      - `1` fitur `weighted_priority` (rekomendasi titik RS baru di pusat `Z1 Rumbai`: menaikkan skor dari `7 Sulit` → `11 Mudah`)
- **Database Seeding (`scripts/seed-mongodb.mjs` / `npm run seed`):**
  - Cluster MongoDB Atlas `giskel2`, database `sig_faskes_pekanbaru` terisi 4 collection dengan indeks `2dsphere`: `zones` (`5`), `routes` (`5`), `facilities` (`30`), `analysis_results` (`10`).

### Step 2: Backend REST API (`server/`) — **DONE**
- `server/db.js` — singleton koneksi MongoDB Atlas melalui `MONGODB_URI` di `.env`.
- `server/spatial.js` — perhitungan skor zona dinamis (`$geoWithin`, `$geoNear`, jarak antar-zona `isInterZone: true`).
- `server/routes/api.js` — REST API endpoints:
  - `GET /api/health`
  - `GET /api/summary`
  - `GET /api/zones` (filter `zoneCode`, `accessClass`)
  - `GET /api/routes` (filter `routeType`, `zoneCode`, `isInterZone`)
  - `GET /api/facilities` (filter `zoneCode`, `facilitySubType`, `facilityType`, `isHospital`, `q`)
  - `GET /api/analysis/layer` (filter `analysisType`, `zoneCode` langsung dari `analysis_results`)
  - `GET /api/analysis/scoring` (evaluasi skor live + ringkasan Layer 4)
- `server/index.js` — menjalankan Express API + menyajikan hasil build frontend (`web/dist`) pada port `3000`.

### Step 3: Frontend WebGIS (`web/` — `Vite + OpenLayers`) — **DONE**
- **Halaman Beranda / Landing Page (`/`):**
  - Skema warna **White – Beige – Brown** yang bersih dan lapang sebagai portal pengantar menuju peta OpenLayers.
  - Menampilkan status database MongoDB Atlas, dua kartu daftar ringkas (*Layer Tersedia di Peta* & *Analisis Spasial yang Digunakan*), bagian **Tujuan dan Manfaat**, serta **Footer**.
- **Halaman Peta Interaktif (`/map`):**
  - Kanvas peta OpenLayers full-screen dengan antarmuka **Apple iOS Liquid Glass** (kapsul atas untuk navigasi & basemap switcher `Jalan / Satelit / Minimal`, dock bawah `Layer | Filter | Analisis | Ringkasan`, side sheet mengambang, kartu legenda, dan popup detail).
  - Basemap **Minimal** menggunakan **Esri World Light Gray Canvas** (`World_Light_Gray_Base` + `World_Light_Gray_Reference`, tanpa API key).
  - **5 warna polyline berbeda** (`J1` Biru, `J2` Oranye, `J3` Magenta, `J4` Hijau, `J5` Ungu putus-putus) dan warna zona terang (`Sangat mudah`, `Mudah`, `Sedang`, `Sulit`).
  - Label antarmuka ramah orang awam (`Fasilitas Kesehatan`, `Jalur Penghubung Wilayah`, `Zona Akses`, `Hasil Analisis Jangkauan`) disertai tooltip halus untuk penandaan teknis `a–d`.

---

## 3. Exact Scoring Formula & Live Baseline

Setiap zona dievaluasi pada **4 kriteria** (skor `1–4` per kriteria, total `4–16`):

| Criterion | Score `4` | Score `3` | Score `2` | Score `1` |
| :--- | :--- | :--- | :--- | :--- |
| **1. Jumlah fasilitas** (`$geoWithin` zone) | `>= 9` | `5–8` | `3–4` | `< 3` |
| **2. Jumlah RS** (`isHospital: true` `$geoWithin` zone) | `>= 3` | `2` | `1` | `0` |
| **3. Jarak pusat zona ke RS terdekat** (`$geoNear`) | `<= 0.6 km` | `<= 1.5 km` | `<= 3 km` | `> 3 km` |
| **4. Keterhubungan antar-zona** (`isInterZone: true`) | `<= 2 km` | `<= 4 km` | `<= 6 km` | `> 6 km` |

- **Klasifikasi Total Skor:** `14–16` (**Sangat mudah**), `11–13` (**Mudah**), `8–10` (**Sedang**), `4–7` (**Sulit**).
- **Aturan Koridor `J5`:** `J5 (Koridor dalam Rumbai)` bertipe `intra_zone` (`isInterZone: false`) dan dikecualikan dari jarak antar-zona; keterhubungan `Z1` dihitung dari `J1` (`8.56 km`, skor `1`).
- **Skor Zona Saat Ini (dengan jalur jalan asli OSRM):**
  - `Z2 Pusat-selatan`: Total **15** (`Sangat mudah`) — 9 faskes (4), 3 RS (4), 0.11 km (4), `J2` 2.43 km (3)
  - `Z3 Pusat-utara`: Total **14** (`Sangat mudah`) — 5 faskes (3), 4 RS (4), 0.14 km (4), `J2` 2.43 km (3)
  - `Z4 Selatan`: Total **12** (`Mudah`) — 3 faskes (2), 3 RS (4), 0.54 km (4), `J4` 5.02 km (2)
  - `Z5 Barat (Tampan)`: Total **11** (`Mudah`) — 3 faskes (2), 2 RS (3), 0.49 km (4), `J4` 5.02 km (2)
  - `Z1 Rumbai`: Total **7** (`Sulit`) — 10 faskes (4), **0 RS** (1), 5.71 km (1), `J1` 8.56 km (1)

> **Catatan Metodologis untuk Laporan (BAB 1 / 3 / 4):**
> Poligon `Z1–Z5` adalah **zona koridor survei** (`~1.92–3.23 km²`), bukan batas administratif kecamatan penuh. Pada `Z1 Rumbai`, survei terfokus di koridor utama Jl. Umban Sari & sekitarnya sehingga tidak mencakup fasilitas rujukan di ruas lain kawasan Rumbai; hal ini perlu dijelaskan secara jujur sebagai batasan ruang lingkup survei pada laporan dan presentasi.

---

## 4. Next Step (Remaining)
- **Step 4:** Menyusun Laporan Akhir (**BAB 1–4**) dan **PPT Presentasi** untuk tanggal **9 & 16 Desember 2026**.
