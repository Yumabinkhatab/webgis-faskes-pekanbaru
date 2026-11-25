import 'ol/ol.css';
import './styles/main.css';
import { fetchHealth } from './api.js';
import { renderHomePage } from './pages/homePage.js';
import { renderMapPage } from './pages/mapPage.js';

const appEl = document.getElementById('app');

appEl.innerHTML = `
  <div class="app-shell is-web-view" id="app-shell">
    <header class="web-topbar">
      <a href="/" class="brand" id="brand-link">
        <div class="brand-mark">SIG</div>
        <div>
          <div class="brand-title">WebGIS Faskes Pekanbaru</div>
          <div class="brand-sub">Pemetaan Aksesibilitas Fasilitas Kesehatan</div>
        </div>
      </a>
      <nav class="nav-links">
        <button class="nav-btn" data-route="/">Beranda</button>
        <button class="nav-btn" data-route="/map">Peta Interaktif</button>
      </nav>
      <div class="db-pill" id="db-status-pill" title="Status koneksi database spasial">
        <span class="db-dot"></span>
        <span>Menghubungkan MongoDB Atlas...</span>
      </div>
    </header>

    <main id="page-root" style="flex: 1; display: flex; flex-direction: column;"></main>

    <footer class="web-footer">
      <div class="web-footer-inner">
        <span><strong>WebGIS Aksesibilitas Fasilitas Kesehatan Kota Pekanbaru</strong></span>
        <span>OpenLayers &bull; Express REST API &bull; MongoDB Atlas (<code>2dsphere</code>)</span>
      </div>
    </footer>
  </div>
`;

const appShell = document.getElementById('app-shell');
const pageRoot = document.getElementById('page-root');
const dbStatusPill = document.getElementById('db-status-pill');
let activeCleanup = null;
let lastHealthData = null;

function updateActiveNav(pathname) {
  const isMap = pathname === '/map';
  appShell.classList.toggle('is-map-view', isMap);
  appShell.classList.toggle('is-web-view', !isMap);

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-route') === pathname);
  });
}

export function navigate(targetPath) {
  if (window.location.pathname + window.location.search === targetPath) return;
  window.history.pushState({}, '', targetPath);
  renderCurrentRoute();
}

async function renderCurrentRoute() {
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }

  const pathname = window.location.pathname === '/map' ? '/map' : '/';
  updateActiveNav(pathname);

  if (pathname === '/map') {
    activeCleanup = await renderMapPage(pageRoot, { navigate, health: lastHealthData });
  } else {
    await renderHomePage(pageRoot, { navigate, health: lastHealthData });
  }
}

document.getElementById('brand-link').addEventListener('click', (e) => {
  e.preventDefault();
  navigate('/');
});

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    navigate(btn.getAttribute('data-route'));
  });
});

window.addEventListener('popstate', () => {
  renderCurrentRoute();
});

async function refreshHealthBadge() {
  try {
    const health = await fetchHealth();
    lastHealthData = health;
    dbStatusPill.classList.remove('error');
    dbStatusPill.innerHTML = `
      <span class="db-dot"></span>
      <span>MongoDB Atlas &bull; ${escapeText(health.database)}</span>
    `;
  } catch (err) {
    dbStatusPill.classList.add('error');
    dbStatusPill.innerHTML = `
      <span class="db-dot"></span>
      <span>Database Offline</span>
    `;
  }
}

function escapeText(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

refreshHealthBadge().then(renderCurrentRoute);
