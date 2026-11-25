# WebGIS Aksesibilitas Fasilitas Kesehatan Kota Pekanbaru

Aplikasi Sistem Informasi Geografis berbasis web (**OpenLayers + Express + MongoDB Atlas**) untuk memetakan sebaran fasilitas kesehatan, koridor akses jalan, tingkat kemudahan akses zona, serta hasil analisis spasial pengambilan keputusan di Kota Pekanbaru.

---

## Fitur Utama

- **Halaman Beranda (`/`)**: Landing page ringkas bernuansa *White – Beige – Brown* yang memperkenalkan layer peta, metode analisis spasial, status koneksi MongoDB Atlas, serta tujuan dan manfaat proyek.
- **Peta Interaktif (`/map`)**: Kanvas OpenLayers full-screen (`EPSG:4326` → `EPSG:3857`) dengan UI **iOS Liquid Glass**, switcher 3 basemap (*Jalan OSM*, *Citra Satelit Esri*, *Minimal Esri Light Gray*), legenda, dan popup interaktif.
- **4 Layer Data Spasial + Heatmap Opsional (Live dari MongoDB Atlas `2dsphere`)**:
  1. **Fasilitas Kesehatan (`Data Point`)** — `30` titik (12 Rumah Sakit, 8 Apotek, 7 Klinik, 2 Praktik Dokter, 1 Instansi Kesehatan) dengan ikon SVG dan ukuran tergraduasi.
  2. **Jalur Penghubung Wilayah (`Data Polyline`)** — `5` koridor (`J1–J5`) mengikuti geometri jalan asli Kota Pekanbaru dengan 5 warna berbeda.
  3. **Zona Akses (`Data Polygon`)** — `5` zona koridor survei (`Z1–Z5`) dengan klasifikasi `Sangat mudah`, `Mudah`, `Sedang`, dan `Sulit`.
  4. **Hasil Analisis Jangkauan (`Data Hasil Analisis`)** — `10` fitur hasil analisis:
     - **Buffer Analisis**: radius jangkauan RS (`0.6 km`, `1.5 km`, `3.0 km`).
     - **Overlay Analisis (*Difference*)**: identifikasi area di luar radius RS `3.0 km` (**100% wilayah `Z1 Rumbai`**).
     - **Spatial Query (`$geoNear`)**: jarak pusat aktivitas zona ke RS terdekat.
     - **Weighted Overlay**: prioritas intervensi dan rekomendasi penempatan RS baru di `Z1 Rumbai` (skor `7 Sulit` → `11 Mudah`).
  5. **Peta Kepadatan (`Heatmap`)** — lapisan opsional untuk seluruh fasilitas atau Rumah Sakit saja.
- **Filter Interaktif**: Checkbox kategori layer, kelas akses zona, wilayah `Z1–Z5`, jenis jalur, kategori fasilitas, komponen analisis Layer 4, dan pencarian nama fasilitas langsung via REST API.

---

## Struktur Proyek

```text
PA/
├── data/
│   ├── raw/
│   │   └── survey_faskes_pekanbaru.csv   # Data survei sumber (40 baris)
│   └── geojson/
│       ├── facilities.geojson            # 30 Point fasilitas kesehatan
│       ├── routes.geojson                # 5 LineString jalur jalan asli (J1–J5)
│       ├── zones.geojson                 # 5 Polygon zona akses (Z1–Z5)
│       ├── analysis_results.geojson      # 10 fitur output analisis Layer 4
│       └── all_features.geojson          # Gabungan 40 fitur survei
├── scripts/
│   ├── convert-csv-to-geojson.mjs        # Konversi CSV -> GeoJSON
│   ├── generate-analysis-geojson.mjs     # Generator Layer 4 (@turf/turf)
│   ├── seed-mongodb.mjs                  # Import GeoJSON + index 2dsphere ke Atlas
│   └── dev.mjs                           # Menjalankan server API + Vite dev server
├── server/
│   ├── db.js                             # Koneksi pool MongoDB Atlas
│   ├── index.js                          # Express app + static serve web/dist
│   ├── spatial.js                        # Evaluasi skor & query spasial
│   └── routes/api.js                     # Endpoint REST API (/api/*)
├── web/
│   ├── src/
│   │   ├── api.js                        # Client fetch REST API
│   │   ├── main.js                       # Router SPA (/ dan /map)
│   │   ├── map/styles.js                 # Styling OpenLayers & simbol SVG
│   │   ├── pages/
│   │   │   ├── homePage.js               # Halaman Beranda
│   │   │   └── mapPage.js                # Halaman Peta OpenLayers (Liquid Glass)
│   │   ├── styles/main.css               # Stylesheet tema web & peta
│   │   └── utils/format.js               # Helper escape HTML & badge kelas
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .env.example                          # Template konfigurasi environment
├── .gitignore
├── package.json
└── PROJECT_CONTEXT.md                    # Ringkasan progres & metodologi proyek
```

---

## Cara Menjalankan Proyek

### 1. Prasyarat
- **Node.js** (disarankan LTS v20+ / v26) dan **npm**.
- Cluster **MongoDB Atlas** dengan Network Access yang mengizinkan IP Anda (atau `0.0.0.0/0` untuk demo).

### 2. Instalasi Dependensi
Jalankan di folder `PA`:
```bash
npm run install:all
```

### 3. Konfigurasi Environment
Salin `.env.example` menjadi `.env`, lalu isi connection string MongoDB Atlas Anda *(jangan pernah meng-commit `.env` ke GitHub)*:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/?retryWrites=true&w=majority
MONGODB_DB_NAME=sig_faskes_pekanbaru
PORT=3000
```

### 4. Konversi Data, Analisis & Seed MongoDB Atlas *(opsional jika DB sudah terisi)*
```bash
npm run convert   # Konversi CSV -> GeoJSON survei
npm run analyze   # Bangkitkan Layer 4 (analysis_results.geojson)
npm run seed      # Import 4 collection + buat index 2dsphere di MongoDB Atlas
```

### 5. Menjalankan Aplikasi
- **Mode Produksi (1 server pada port `3000`):**
  ```bash
  npm run build
  npm start
  ```
  Buka `http://localhost:3000` di browser.

- **Mode Development (Express port `3000` + Vite HMR port `5173`):**
  ```bash
  npm run dev
  ```
  Buka `http://localhost:5173` di browser.

---

## Endpoint REST API

- `GET /api/health` — status koneksi MongoDB Atlas dan jumlah dokumen di 4 collection.
- `GET /api/summary` — ringkasan statistik dataset dan evaluasi zona.
- `GET /api/zones` — GeoJSON zona (`?zoneCode=Z1&accessClass=Sulit`).
- `GET /api/routes` — GeoJSON jalur penghubung (`?routeType=inter_zone`).
- `GET /api/facilities` — GeoJSON fasilitas kesehatan (`?facilitySubType=Rumah%20Sakit&zoneCode=Z2&q=Arifin`).
- `GET /api/analysis/layer` — GeoJSON Layer 4 hasil analisis (`?analysisType=buffer_rs,overlay_gap&zoneCode=Z1`).
- `GET /api/analysis/scoring` — skor aksesibilitas live (`$geoWithin`, `$geoNear`, koridor antar-zona) beserta ringkasan Layer 4.
