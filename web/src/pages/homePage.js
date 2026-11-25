export function renderHomePage(container, { navigate }) {
  container.innerHTML = `
    <div class="home-container">
      <section class="landing-hero">
        <h1>WebGIS Aksesibilitas Fasilitas Kesehatan Kota Pekanbaru</h1>
        <p>
          Portal peta interaktif berbasis OpenLayers yang menyajikan persebaran fasilitas kesehatan,
          jalur penghubung wilayah, tingkat kemudahan akses zona, serta hasil analisis spasial
          secara langsung dari MongoDB Atlas.
        </p>
        <div class="hero-actions">
          <button id="cta-open-map" class="btn btn-brown">Buka Peta Interaktif &rarr;</button>
        </div>
      </section>

      <section class="overview-grid">
        <article class="web-card">
          <h2>Layer Tersedia di Peta</h2>
          <p class="web-card-sub">
            Empat layer utama data survei dan analisis spasial yang dapat langsung dieksplorasi pada peta.
          </p>
          <ul class="clean-list">
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Fasilitas Kesehatan</span>
                  <span class="subtle-tech-tag" title="Ketentuan a: Data Point">Data Point (30)</span>
                </div>
                <div class="list-desc">Lokasi Rumah Sakit, Klinik, Apotek, Praktik Dokter, dan Instansi Kesehatan.</div>
              </div>
            </li>
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Jalur Penghubung Wilayah</span>
                  <span class="subtle-tech-tag" title="Ketentuan b: Data Polyline">Data Polyline (5)</span>
                </div>
                <div class="list-desc">Koridor akses penghubung antar zona maupun jalur dalam wilayah Rumbai.</div>
              </div>
            </li>
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Zona Akses</span>
                  <span class="subtle-tech-tag" title="Ketentuan c: Data Polygon">Data Polygon (5)</span>
                </div>
                <div class="list-desc">Klasifikasi wilayah akses Sangat mudah, Mudah, Sedang, hingga Sulit.</div>
              </div>
            </li>
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Hasil Analisis Jangkauan</span>
                  <span class="subtle-tech-tag" title="Ketentuan d: Data Hasil Analisis">Data Hasil Analisis (10)</span>
                </div>
                <div class="list-desc">Area jangkauan RS, wilayah defisit layanan, jarak RS terdekat, dan rekomendasi prioritas.</div>
              </div>
            </li>
          </ul>
        </article>

        <article class="web-card">
          <h2>Analisis Spasial yang Digunakan</h2>
          <p class="web-card-sub">
            Metode analisis geografis untuk mendukung pengambilan keputusan pemerataan layanan kesehatan.
          </p>
          <ul class="clean-list">
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Buffer Analisis</span>
                  <span class="subtle-tech-tag">Radius 0,6 / 1,5 / 3,0 km</span>
                </div>
                <div class="list-desc">Mengukur area jangkauan pelayanan di sekitar seluruh titik Rumah Sakit.</div>
              </div>
            </li>
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Overlay Analisis</span>
                  <span class="subtle-tech-tag">Gap Layanan RS</span>
                </div>
                <div class="list-desc">Mengidentifikasi wilayah yang berada di luar radius 3 km Rumah Sakit (Rumbai).</div>
              </div>
            </li>
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Spatial Query</span>
                  <span class="subtle-tech-tag">$geoWithin &amp; $geoNear</span>
                </div>
                <div class="list-desc">Menghitung jumlah fasilitas per zona serta jarak eksak pusat zona ke RS terdekat.</div>
              </div>
            </li>
            <li class="clean-list-item">
              <span class="list-dot"></span>
              <div>
                <div class="list-title-row">
                  <span class="list-title">Weighted Overlay</span>
                  <span class="subtle-tech-tag">Skoring &amp; Prioritas</span>
                </div>
                <div class="list-desc">Penilaian 4 kriteria aksesibilitas dan penentuan prioritas penempatan RS baru.</div>
              </div>
            </li>
          </ul>
        </article>
      </section>

      <section id="purpose-section" class="web-card beige-tint">
        <h2>Tujuan dan Manfaat Pembuatan Web &amp; Peta OpenLayers</h2>
        <p class="purpose-text">
          <strong>Tujuan:</strong> Aplikasi web dan peta interaktif OpenLayers ini dibuat sebagai wadah
          visualisasi data spasial yang terhubung langsung ke MongoDB Atlas untuk memetakan sebaran
          fasilitas kesehatan, koridor penghubung, serta tingkat kemudahan akses di lima zona wilayah
          Kota Pekanbaru secara informatif dan mudah dijelajahi.
        </p>
        <p class="purpose-text">
          <strong>Manfaat:</strong> Bagi masyarakat umum, peta ini memudahkan pencarian informasi lokasi
          fasilitas kesehatan dan kondisi keterjangkauannya dengan tampilan yang ramah dan jelas.
          Sementara bagi pengambil keputusan maupun perencana wilayah, hasil analisis spasial yang
          ditampilkan membantu mengidentifikasi kesenjangan layanan—seperti wilayah Rumbai yang belum
          memiliki Rumah Sakit—sebagai dasar rekomendasi pembangunan fasilitas kesehatan baru.
        </p>
      </section>
    </div>
  `;

  container.querySelector('#cta-open-map')?.addEventListener('click', () => navigate('/map'));
}
