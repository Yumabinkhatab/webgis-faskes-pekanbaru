import Map from 'ol/Map';
import View from 'ol/View';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import TileLayer from 'ol/layer/Tile';
import LayerGroup from 'ol/layer/Group';
import VectorLayer from 'ol/layer/Vector';
import HeatmapLayer from 'ol/layer/Heatmap';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import { defaults as defaultControls, ScaleLine } from 'ol/control';
import { fromLonLat } from 'ol/proj';
import {
  fetchAnalysisLayer,
  fetchFacilities,
  fetchRoutes,
  fetchScoring,
  fetchZones,
} from '../api.js';
import {
  ACCESS_CLASS_COLORS,
  ANALYSIS_TYPE_META,
  FACILITY_SYMBOL_META,
  ROUTE_COLOR_META,
  analysisStyleFunction,
  facilityStyleFunction,
  routeStyleFunction,
  zoneStyleFunction,
} from '../map/styles.js';
import { classBadgeHtml, escapeHtml } from '../utils/format.js';

const ALL_CLASSES = ['Sangat mudah', 'Mudah', 'Sedang', 'Sulit'];
const ALL_ZONES = [
  { code: 'Z1', label: 'Z1 Rumbai' },
  { code: 'Z2', label: 'Z2 Pusat-selatan' },
  { code: 'Z3', label: 'Z3 Pusat-utara' },
  { code: 'Z4', label: 'Z4 Selatan' },
  { code: 'Z5', label: 'Z5 Barat (Tampan)' },
];
const ALL_ROUTE_TYPES = [
  { value: 'inter_zone', label: 'Jalur Antar Wilayah (J1–J4)' },
  { value: 'intra_zone', label: 'Jalur Dalam Rumbai (J5)' },
];
const ALL_SUBTYPES = [
  'Rumah Sakit',
  'Klinik',
  'Apotek',
  'Praktik Dokter',
  'Instansi Kesehatan',
];
const ALL_ANALYSIS_TYPES = [
  'buffer_rs',
  'overlay_gap',
  'nearest_hospital_link',
  'weighted_priority',
];

const geojsonFormat = new GeoJSON({
  dataProjection: 'EPSG:4326',
  featureProjection: 'EPSG:3857',
});

export async function renderMapPage(container, { navigate, health }) {
  const focusZone = new URLSearchParams(window.location.search).get('focus');

  const dbTooltip = health?.ok
    ? `MongoDB Atlas (${health.database}): ${health.collections.facilities} Point, ${health.collections.routes} Polyline, ${health.collections.zones} Polygon, ${health.collections.analysis_results} Hasil Analisis`
    : 'Terhubung ke MongoDB Atlas (2dsphere)';

  container.innerHTML = `
    <div class="map-viewport">
      <div id="ol-map"></div>

      <!-- Top Left Floating Liquid Glass Capsule -->
      <div class="map-top-left liquid-glass">
        <button class="glass-home-btn" id="btn-back-home">&larr; Beranda</button>
        <div class="map-title-group">
          <span class="map-title-text">Peta Akses Faskes Pekanbaru</span>
          <span class="glass-db-dot" title="${escapeHtml(dbTooltip)}"></span>
        </div>
      </div>

      <!-- Top Right Floating Liquid Glass Basemap + Legend Switcher -->
      <div class="map-top-right liquid-glass">
        <div id="basemap-switcher" style="display:flex;align-items:center;gap:0.15rem;">
          <button class="glass-seg-btn active" data-basemap="osm">Jalan</button>
          <button class="glass-seg-btn" data-basemap="satellite">Satelit</button>
          <button class="glass-seg-btn" data-basemap="light">Minimal</button>
        </div>
        <span class="glass-divider"></span>
        <button class="glass-seg-btn" id="btn-toggle-legend">Legenda</button>
      </div>

      <!-- Floating Liquid Glass Side Sheet (Driven by Bottom Dock) -->
      <aside class="glass-sheet liquid-glass-elevated" id="glass-sheet">
        <div class="glass-sheet-header">
          <h3 id="sheet-title">Lapisan Peta</h3>
          <button class="glass-close-btn" id="btn-close-sheet" title="Sembunyikan panel">&times;</button>
        </div>

        <div class="glass-sheet-body" id="sheet-layers">
          <div class="glass-card">
            <h4 class="glass-card-title">Tampilan Layer Peta</h4>
            <div class="glass-check-list">
              <label class="glass-check-item" title="Ketentuan a: Data Point">
                <input type="checkbox" id="toggle-facilities" checked />
                <div>
                  <span>Fasilitas Kesehatan (<span id="lbl-cnt-facilities">30</span>)</span>
                  <span class="glass-sub-hint">RS, klinik, apotek &amp; praktik • Data Point</span>
                </div>
              </label>
              <label class="glass-check-item" title="Ketentuan b: Data Polyline">
                <input type="checkbox" id="toggle-routes" checked />
                <div>
                  <span>Jalur Penghubung Wilayah (<span id="lbl-cnt-routes">5</span>)</span>
                  <span class="glass-sub-hint">Rute akses wilayah • Data Polyline</span>
                </div>
              </label>
              <label class="glass-check-item" title="Ketentuan c: Data Polygon">
                <input type="checkbox" id="toggle-zones" checked />
                <div>
                  <span>Zona Akses (<span id="lbl-cnt-zones">5</span>)</span>
                  <span class="glass-sub-hint">Tingkat kemudahan wilayah • Data Polygon</span>
                </div>
              </label>
              <label class="glass-check-item" title="Ketentuan d: Data Hasil Analisis">
                <input type="checkbox" id="toggle-analysis" checked />
                <div>
                  <span>Hasil Analisis Jangkauan (<span id="lbl-cnt-analysis">10</span>)</span>
                  <span class="glass-sub-hint">Radius, gap &amp; prioritas RS • Data Hasil Analisis</span>
                </div>
              </label>
              <label class="glass-check-item" title="Layer Opsional: Density Heatmap">
                <input type="checkbox" id="toggle-heatmap" />
                <div>
                  <span>Peta Kepadatan Fasilitas</span>
                  <span class="glass-sub-hint">Sebaran konsentrasi (Heatmap)</span>
                </div>
              </label>
            </div>
            <div id="heatmap-mode-box" style="margin-top: 0.65rem; display: none;">
              <div style="font-size: 0.72rem; color: rgba(255,255,255,0.72); margin-bottom: 0.3rem;">Sumber Kepadatan:</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem;">
                <button class="glass-seg-btn active" data-heat="all" style="background: rgba(255,255,255,0.18);">Semua (30)</button>
                <button class="glass-seg-btn" data-heat="hospitals">RS Saja (12)</button>
              </div>
            </div>
          </div>

          <div class="glass-card">
            <h4 class="glass-card-title">
              <span>Komponen Analisis Jangkauan</span>
              <span id="analysis-count-pill" class="mono">10</span>
            </h4>
            <div class="glass-check-list" id="filter-analysis">
              ${ALL_ANALYSIS_TYPES.map(
                (t) => `
                <label class="glass-check-item" title="${escapeHtml(ANALYSIS_TYPE_META[t].techHint)}">
                  <input type="checkbox" value="${escapeHtml(t)}" checked />
                  <span class="color-swatch" style="background: ${ANALYSIS_TYPE_META[t].color};"></span>
                  <div>
                    <span>${escapeHtml(ANALYSIS_TYPE_META[t].label)}</span>
                    <span class="glass-sub-hint">${escapeHtml(ANALYSIS_TYPE_META[t].hint)}</span>
                  </div>
                </label>
              `
              ).join('')}
            </div>
          </div>
        </div>

        <div class="glass-sheet-body" id="sheet-filter" style="display: none;">
          <div class="glass-card">
            <h4 class="glass-card-title">
              <span>Cari &amp; Saring Fasilitas</span>
              <span id="facilities-count-pill" class="mono">30</span>
            </h4>
            <input
              type="text"
              id="facility-search"
              class="glass-input"
              placeholder="Ketik nama RS / klinik / apotek..."
              style="margin-bottom: 0.55rem;"
            />
            <div class="glass-check-list" id="filter-subtypes">
              ${ALL_SUBTYPES.map(
                (sub) => `
                <label class="glass-check-item">
                  <input type="checkbox" value="${escapeHtml(sub)}" checked />
                  <span class="color-swatch" style="background: ${FACILITY_SYMBOL_META[sub].color};"></span>
                  <span>${escapeHtml(sub)}</span>
                </label>
              `
              ).join('')}
            </div>
          </div>

          <div class="glass-card">
            <h4 class="glass-card-title">
              <span>Tingkat Kemudahan Zona</span>
              <span id="zones-count-pill" class="mono">5</span>
            </h4>
            <div class="glass-check-list" id="filter-classes">
              ${ALL_CLASSES.map(
                (cls) => `
                <label class="glass-check-item">
                  <input type="checkbox" value="${escapeHtml(cls)}" checked />
                  <span class="color-swatch" style="background: ${ACCESS_CLASS_COLORS[cls].badge};"></span>
                  <span>${escapeHtml(cls)}</span>
                </label>
              `
              ).join('')}
            </div>
          </div>

          <div class="glass-card">
            <h4 class="glass-card-title">Pilih Wilayah (Z1–Z5)</h4>
            <div class="glass-check-list" id="filter-zones">
              ${ALL_ZONES.map(
                (z) => `
                <label class="glass-check-item">
                  <input type="checkbox" value="${escapeHtml(z.code)}" checked />
                  <span>${escapeHtml(z.label)}</span>
                </label>
              `
              ).join('')}
            </div>
          </div>

          <div class="glass-card">
            <h4 class="glass-card-title">
              <span>Jenis Jalur Penghubung</span>
              <span id="routes-count-pill" class="mono">5</span>
            </h4>
            <div class="glass-check-list" id="filter-routes">
              ${ALL_ROUTE_TYPES.map(
                (rt) => `
                <label class="glass-check-item">
                  <input type="checkbox" value="${escapeHtml(rt.value)}" checked />
                  <span>${escapeHtml(rt.label)}</span>
                </label>
              `
              ).join('')}
            </div>
          </div>

          <button class="glass-btn" id="reset-filters-btn" style="width: 100%;">
            Kembalikan Semua Filter
          </button>
        </div>

        <div class="glass-sheet-body" id="sheet-analysis" style="display: none;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem;">
            <button class="glass-btn primary" id="btn-show-all-l4">Tampilkan Semua</button>
            <button class="glass-btn" id="btn-focus-z1-gap">Sorot Area Rumbai</button>
          </div>
          <div id="layer4-detail-cards" style="display: flex; flex-direction: column; gap: 0.65rem;">
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.72);">Memuat analisis...</div>
          </div>
        </div>

        <div class="glass-sheet-body" id="sheet-summary" style="display: none;">
          <div id="decision-panel-body" style="display: flex; flex-direction: column; gap: 0.65rem;">
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.72);">Memuat ringkasan...</div>
          </div>
        </div>
      </aside>

      <!-- Floating Liquid Glass Legend (Top Right) -->
      <div class="legend-glass liquid-glass hidden" id="legend-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
          <strong style="font-size:0.82rem;">Legenda Peta</strong>
          <button class="glass-close-btn" id="btn-close-legend" style="width:22px;height:22px;font-size:0.8rem;">&times;</button>
        </div>
        <div style="font-weight: 700; color: rgba(255,255,255,0.75); margin-top: 0.25rem;">Zona Akses</div>
        ${ALL_CLASSES.map(
          (c) => `
          <div class="legend-row">
            <span class="color-swatch" style="background: ${ACCESS_CLASS_COLORS[c].badge}; margin-top:0;"></span>
            <span>${escapeHtml(c)}</span>
          </div>
        `
        ).join('')}
        <div style="font-weight: 700; color: rgba(255,255,255,0.75); margin-top: 0.55rem;">Jalur Penghubung (J1–J5)</div>
        ${Object.values(ROUTE_COLOR_META)
          .map(
            (r) => `
          <div class="legend-row">
            <span class="legend-line ${r.dashed ? 'dashed' : ''}" style="border-top-color: ${r.color};"></span>
            <span>${escapeHtml(r.label)}</span>
          </div>
        `
          )
          .join('')}
        <div style="font-weight: 700; color: rgba(255,255,255,0.75); margin-top: 0.55rem;">Fasilitas Kesehatan</div>
        ${ALL_SUBTYPES.map(
          (sub) => `
          <div class="legend-row">
            <span class="color-swatch" style="border-radius: 50%; background: ${FACILITY_SYMBOL_META[sub].color}; width: ${sub === 'Rumah Sakit' ? '13px' : '9px'}; height: ${sub === 'Rumah Sakit' ? '13px' : '9px'}; margin-top:0;"></span>
            <span>${escapeHtml(sub)}</span>
          </div>
        `
        ).join('')}
        <div style="font-weight: 700; color: rgba(255,255,255,0.75); margin-top: 0.55rem;">Hasil Analisis Jangkauan</div>
        <div class="legend-row">
          <span class="color-swatch" style="background: rgba(16,185,129,0.5); border: 1.5px dashed #34d399; margin-top:0;"></span>
          <span>Radius RS (0,6 / 1,5 / 3 km)</span>
        </div>
        <div class="legend-row">
          <span class="color-swatch" style="background: rgba(244,63,94,0.45); border: 1.5px dashed #fb7185; margin-top:0;"></span>
          <span>Belum Terjangkau RS (&gt; 3 km)</span>
        </div>
        <div class="legend-row">
          <span class="legend-line dashed" style="border-top-color: #f43f5e;"></span>
          <span>Jarak ke RS Terdekat</span>
        </div>
        <div class="legend-row">
          <span class="color-swatch" style="border-radius: 50%; background: #10b981; border: 2px solid #fef08a; width: 13px; height: 13px; margin-top:0;"></span>
          <span>Usulan Lokasi RS Baru</span>
        </div>
      </div>

      <!-- Bottom-Center Apple iOS Liquid Glass Dock -->
      <div class="liquid-dock-wrap">
        <button class="dock-action-pill liquid-glass" id="btn-zoom-fit" title="Kembalikan tampilan ke seluruh Kota Pekanbaru">
          <span>&#8982;</span>
          <span id="dock-status-label">Zoom Pekanbaru &bull; 30 Faskes</span>
        </button>

        <nav class="dock-bar liquid-glass" id="liquid-dock">
          <button class="dock-item active" data-sheet="layers">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <span>Layer</span>
          </button>
          <button class="dock-item" data-sheet="filter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span>Filter</span>
          </button>
          <button class="dock-item" data-sheet="analysis">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="12"/></svg>
            <span>Analisis</span>
          </button>
          <button class="dock-item" data-sheet="summary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
            <span>Ringkasan</span>
          </button>
        </nav>
      </div>

      <!-- Liquid Glass Click Popup -->
      <div id="map-popup" class="ol-popup liquid-glass-elevated" style="display: none;">
        <button id="popup-closer" class="ol-popup-closer" title="Tutup">&times;</button>
        <div id="popup-content"></div>
      </div>
    </div>
  `;

  let activeSheet = 'layers';
  let heatmapMode = 'all';
  let activeAbortController = null;
  let baselineScoring = null;

  // Basemaps
  const osmLayer = new TileLayer({ source: new OSM(), visible: true });
  const satelliteLayer = new TileLayer({
    source: new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles &copy; Esri',
      maxZoom: 19,
    }),
    visible: false,
  });
  const lightLayer = new LayerGroup({
    visible: false,
    layers: [
      new TileLayer({
        source: new XYZ({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          attributions: 'Tiles &copy; Esri',
          maxZoom: 16,
        }),
      }),
      new TileLayer({
        source: new XYZ({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
          maxZoom: 16,
        }),
      }),
    ],
  });

  // Vector Sources & Layers
  const zonesSource = new VectorSource();
  const analysisSource = new VectorSource();
  const routesSource = new VectorSource();
  const facilitiesSource = new VectorSource();
  const heatmapSource = new VectorSource();

  const zonesLayer = new VectorLayer({
    source: zonesSource,
    style: zoneStyleFunction,
    zIndex: 10,
  });

  const analysisLayer = new VectorLayer({
    source: analysisSource,
    style: analysisStyleFunction,
    zIndex: 15,
  });

  const routesLayer = new VectorLayer({
    source: routesSource,
    style: routeStyleFunction,
    zIndex: 25,
  });

  const heatmapLayer = new HeatmapLayer({
    source: heatmapSource,
    blur: 22,
    radius: 16,
    visible: false,
    zIndex: 30,
  });

  const facilitiesLayer = new VectorLayer({
    source: facilitiesSource,
    style: facilityStyleFunction,
    zIndex: 40,
  });

  const popupEl = container.querySelector('#map-popup');
  const popupContentEl = container.querySelector('#popup-content');
  const popupOverlay = new Overlay({
    element: popupEl,
    autoPan: { animation: { duration: 220 } },
  });

  const map = new Map({
    target: 'ol-map',
    layers: [
      osmLayer,
      satelliteLayer,
      lightLayer,
      zonesLayer,
      analysisLayer,
      routesLayer,
      heatmapLayer,
      facilitiesLayer,
    ],
    overlays: [popupOverlay],
    controls: defaultControls().extend([new ScaleLine({ units: 'metric' })]),
    view: new View({
      center: fromLonLat([101.43, 0.51]),
      zoom: 12,
    }),
  });

  function closePopup() {
    popupOverlay.setPosition(undefined);
    popupEl.style.display = 'none';
  }

  container.querySelector('#popup-closer').addEventListener('click', closePopup);

  const SHEET_TITLES = {
    layers: 'Lapisan Peta',
    filter: 'Saring Data Peta',
    analysis: 'Hasil Analisis Jangkauan',
    summary: 'Ringkasan Wilayah',
  };

  function openSheet(sheetName) {
    const sheetEl = container.querySelector('#glass-sheet');
    if (activeSheet === sheetName && !sheetEl.classList.contains('hidden')) {
      sheetEl.classList.add('hidden');
      container.querySelectorAll('#liquid-dock .dock-item').forEach((b) => b.classList.remove('active'));
      activeSheet = null;
      return;
    }

    activeSheet = sheetName;
    sheetEl.classList.remove('hidden');
    container.querySelector('#sheet-title').textContent = SHEET_TITLES[sheetName] || 'Panel';

    ['layers', 'filter', 'analysis', 'summary'].forEach((key) => {
      container.querySelector(`#sheet-${key}`).style.display = key === sheetName ? 'flex' : 'none';
    });

    container.querySelectorAll('#liquid-dock .dock-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-sheet') === sheetName);
    });
  }

  function getCheckedValues(selector) {
    return Array.from(container.querySelectorAll(`${selector} input:checked`)).map((i) => i.value);
  }

  function syncHeatmapSource() {
    const features = facilitiesSource.getFeatures();
    heatmapSource.clear();
    if (heatmapMode === 'hospitals') {
      heatmapSource.addFeatures(features.filter((f) => f.get('isHospital')));
    } else {
      heatmapSource.addFeatures(features);
    }
  }

  async function loadFilteredLayers() {
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();
    const { signal } = activeAbortController;

    const selectedClasses = getCheckedValues('#filter-classes');
    const selectedZones = getCheckedValues('#filter-zones');
    const selectedRouteTypes = getCheckedValues('#filter-routes');
    const selectedSubTypes = getCheckedValues('#filter-subtypes');
    const selectedAnalysisTypes = getCheckedValues('#filter-analysis');
    const searchQuery = container.querySelector('#facility-search').value.trim();

    const zonesPromise =
      selectedClasses.length && selectedZones.length
        ? fetchZones({ accessClass: selectedClasses, zoneCode: selectedZones }, signal)
        : Promise.resolve({ type: 'FeatureCollection', features: [] });

    const routesPromise = selectedRouteTypes.length
      ? fetchRoutes({ routeType: selectedRouteTypes }, signal)
      : Promise.resolve({ type: 'FeatureCollection', features: [] });

    const facilitiesPromise =
      selectedSubTypes.length && selectedZones.length
        ? fetchFacilities(
            {
              facilitySubType: selectedSubTypes,
              zoneCode: selectedZones,
              q: searchQuery,
            },
            signal
          )
        : Promise.resolve({ type: 'FeatureCollection', features: [] });

    const analysisPromise =
      selectedAnalysisTypes.length && selectedZones.length
        ? fetchAnalysisLayer({ analysisType: selectedAnalysisTypes, zoneCode: selectedZones }, signal)
        : Promise.resolve({ type: 'FeatureCollection', features: [] });

    try {
      const [zonesGeo, routesGeo, facilitiesGeo, analysisGeo] = await Promise.all([
        zonesPromise,
        routesPromise,
        facilitiesPromise,
        analysisPromise,
      ]);

      zonesSource.clear();
      zonesSource.addFeatures(geojsonFormat.readFeatures(zonesGeo));
      container.querySelector('#zones-count-pill').textContent = String(zonesGeo.features.length);
      container.querySelector('#lbl-cnt-zones').textContent = String(zonesGeo.features.length);

      routesSource.clear();
      routesSource.addFeatures(geojsonFormat.readFeatures(routesGeo));
      container.querySelector('#routes-count-pill').textContent = String(routesGeo.features.length);
      container.querySelector('#lbl-cnt-routes').textContent = String(routesGeo.features.length);

      facilitiesSource.clear();
      facilitiesSource.addFeatures(geojsonFormat.readFeatures(facilitiesGeo));
      container.querySelector('#facilities-count-pill').textContent = String(
        facilitiesGeo.features.length
      );
      container.querySelector('#lbl-cnt-facilities').textContent = String(
        facilitiesGeo.features.length
      );

      analysisSource.clear();
      analysisSource.addFeatures(geojsonFormat.readFeatures(analysisGeo));
      container.querySelector('#analysis-count-pill').textContent = String(analysisGeo.features.length);
      container.querySelector('#lbl-cnt-analysis').textContent = String(analysisGeo.features.length);

      container.querySelector('#dock-status-label').textContent =
        `Zoom Pekanbaru • ${facilitiesGeo.features.length} Faskes • ${zonesGeo.features.length} Zona`;

      syncHeatmapSource();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Gagal memuat layer:', err);
      }
    }
  }

  function fitMapToZones(zoneCode = null) {
    const features = zonesSource.getFeatures();
    if (!features.length) return;
    if (zoneCode) {
      const target = features.find((f) => f.get('zoneCode') === zoneCode);
      if (target) {
        map.getView().fit(target.getGeometry().getExtent(), {
          padding: [90, 90, 120, 90],
          duration: 450,
          maxZoom: 14,
        });
        return;
      }
    }
    map.getView().fit(zonesSource.getExtent(), {
      padding: [80, 80, 120, 80],
      duration: 450,
    });
  }

  function isolateAnalysisType(targetType) {
    container.querySelectorAll('#filter-analysis input[type="checkbox"]').forEach((cb) => {
      cb.checked = targetType === 'all' ? true : cb.value === targetType;
    });
    const analysisToggle = container.querySelector('#toggle-analysis');
    analysisToggle.checked = true;
    analysisLayer.setVisible(true);
    loadFilteredLayers();
  }

  function renderAnalysisAndDecisionPanels() {
    if (!baselineScoring) return;
    const { zones, analysisSummary, insights } = baselineScoring;
    const { bufferRings, overlayGaps, nearestLinks, recommendations } = analysisSummary;

    const detailContainer = container.querySelector('#layer4-detail-cards');
    const gapZ1 = overlayGaps[0];
    const recZ1 = recommendations[0];

    detailContainer.innerHTML = `
      <div class="glass-card">
        <h4 class="glass-card-title">
          <span title="Buffer Analisis 0.6 / 1.5 / 3.0 km">Radius Jangkauan RS</span>
          <button class="glass-btn isolate-l4-btn" data-type="buffer_rs" style="padding:0.2rem 0.5rem;font-size:0.7rem;">Sorot</button>
        </h4>
        <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.77rem;">
          ${bufferRings
            .map(
              (r) => `
            <div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:0.42rem 0.55rem;">
              <div><strong>Radius ${r.radiusKm} km</strong> &bull; ${r.sourceCount} RS</div>
              <div style="color:rgba(255,255,255,0.72);font-size:0.73rem;">
                Terjangkau: ${escapeHtml(r.intersectingZones.join(', '))} &bull; Belum: <strong style="color:#fda4af;">${escapeHtml(r.uncoveredZones.join(', ') || '-')}</strong>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="glass-card" style="border-color: rgba(251,113,133,0.45);">
        <h4 class="glass-card-title" style="color: #fecdd3;">
          <span title="Overlay Difference terhadap buffer RS 3 km">Wilayah Belum Terjangkau RS</span>
          <button class="glass-btn isolate-l4-btn" data-type="overlay_gap" style="padding:0.2rem 0.5rem;font-size:0.7rem;">Sorot</button>
        </h4>
        <p style="margin: 0; font-size: 0.78rem; color: rgba(255,255,255,0.88);">
          ${escapeHtml(gapZ1?.summary || 'Seluruh zona terjangkau dalam radius 3 km.')}
        </p>
      </div>

      <div class="glass-card">
        <h4 class="glass-card-title">
          <span title="Spatial Query ($geoNear)">Jarak ke RS Terdekat</span>
          <button class="glass-btn isolate-l4-btn" data-type="nearest_hospital_link" style="padding:0.2rem 0.5rem;font-size:0.7rem;">Sorot</button>
        </h4>
        <div style="display: flex; flex-direction: column; gap: 0.32rem; font-size: 0.75rem;">
          ${nearestLinks
            .map(
              (l) => `
            <div style="display:flex;justify-content:space-between;gap:0.4rem;border-bottom:1px dashed rgba(255,255,255,0.16);padding-bottom:0.22rem;">
              <span><strong>${escapeHtml(l.zoneCode)}</strong> &rarr; ${escapeHtml(l.targetHospitalName)}</span>
              <span class="mono"><strong>${l.distanceKm} km</strong></span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="glass-card" style="border-color: rgba(52,211,153,0.45);">
        <h4 class="glass-card-title" style="color: #a7f3d0;">
          <span title="Weighted Overlay Prioritas">Rekomendasi RS Baru</span>
          <button class="glass-btn isolate-l4-btn" data-type="weighted_priority" style="padding:0.2rem 0.5rem;font-size:0.7rem;">Sorot</button>
        </h4>
        <p style="margin: 0; font-size: 0.78rem; color: rgba(255,255,255,0.88);">
          ${escapeHtml(recZ1?.summary || '')}
        </p>
      </div>
    `;

    detailContainer.querySelectorAll('.isolate-l4-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        isolateAnalysisType(btn.getAttribute('data-type'));
      });
    });

    const summaryBody = container.querySelector('#decision-panel-body');
    const ring3km = bufferRings.find((r) => r.radiusKm === 3) || bufferRings[bufferRings.length - 1];

    summaryBody.innerHTML = `
      <div class="glass-card" style="border-color: rgba(251,113,133,0.45);">
        <h4 class="glass-card-title" style="color: #fecdd3;">Temuan Utama</h4>
        <p style="margin: 0; font-size: 0.78rem; color: rgba(255,255,255,0.9);">
          ${insights.priorityZones.map((p) => escapeHtml(p.reason)).join('<br/>')}
        </p>
      </div>

      ${
        ring3km
          ? `<div class="glass-card">
               <h4 class="glass-card-title">Cakupan Radius RS 3 km</h4>
               <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
                 ${ring3km.zoneCoverage
                   .map(
                     (zc) => `
                   <span class="badge ${zc.coveragePct > 0 ? 'badge-mudah' : 'badge-sulit'}" style="font-size: 0.7rem;">
                     ${escapeHtml(zc.zoneCode)}: ${zc.coveragePct}%
                   </span>
                 `
                   )
                   .join('')}
               </div>
             </div>`
          : ''
      }

      ${
        recZ1
          ? `<div class="glass-card" style="border-color: rgba(52,211,153,0.45);">
               <h4 class="glass-card-title" style="color: #a7f3d0;">Dampak Usulan RS Baru (Z1)</h4>
               <div style="font-size: 0.8rem; font-weight: 700;">
                 Z1 Rumbai: ${recZ1.beforeScore} (${escapeHtml(recZ1.beforeClass)}) &rarr;
                 <span style="color:#6ee7b7;">${recZ1.afterScore} (${escapeHtml(recZ1.afterClass)})</span>
               </div>
             </div>`
          : ''
      }

      <div>
        <div style="font-size: 0.74rem; font-weight: 800; text-transform: uppercase; color: rgba(255,255,255,0.76); margin-bottom: 0.4rem;">
          Daftar Zona Akses (Klik untuk Zoom)
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.42rem;">
          ${zones
            .map(
              (z) => `
            <div class="glass-zone-card" data-focus-zone="${escapeHtml(z.zoneCode)}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;margin-bottom:0.25rem;">
                <strong style="font-size:0.83rem;">${escapeHtml(z.name)}</strong>
                ${classBadgeHtml(z.accessClass)}
              </div>
              <div style="font-size:0.74rem;color:rgba(255,255,255,0.75);display:flex;flex-wrap:wrap;gap:0.5rem;">
                <span>Skor: <strong class="mono">${z.totalScore}/16</strong></span>
                <span>Faskes: <strong>${z.facilityCount}</strong></span>
                <span>RS: <strong>${z.hospitalCount}</strong></span>
                <span>RS terdekat: <strong>${z.nearestHospitalKm} km</strong></span>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    summaryBody.querySelectorAll('.glass-zone-card').forEach((card) => {
      card.addEventListener('click', () => {
        fitMapToZones(card.getAttribute('data-focus-zone'));
      });
    });
  }

  function getClickPriority(feature, layer) {
    if (layer === facilitiesLayer) return 1;
    if (layer === analysisLayer) {
      const t = feature.get('analysisType');
      if (t === 'weighted_priority') return 2;
      if (t === 'nearest_hospital_link') return 3;
      if (t === 'overlay_gap') return 5;
      return 7;
    }
    if (layer === routesLayer) return 4;
    if (layer === zonesLayer) return 6;
    return 99;
  }

  map.on('singleclick', (evt) => {
    const hits = [];
    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature, layer) => {
        if (layer !== heatmapLayer) {
          hits.push({ feature, layer });
        }
      },
      { hitTolerance: 6 }
    );

    if (!hits.length) {
      closePopup();
      return;
    }

    hits.sort((a, b) => getClickPriority(a.feature, a.layer) - getClickPriority(b.feature, b.layer));
    const { feature, layer } = hits[0];
    const props = feature.getProperties();

    if (layer === facilitiesLayer) {
      popupContentEl.innerHTML = `
        <div class="popup-title">${escapeHtml(props.name)}</div>
        <div class="popup-kv"><span>Kategori</span><strong>${escapeHtml(props.facilitySubType)}</strong></div>
        <div class="popup-kv"><span>Kelompok</span><strong>${escapeHtml(props.facilityType)}</strong></div>
        <div class="popup-kv"><span>Wilayah</span><strong>${escapeHtml(props.zoneLabel)}</strong></div>
        <div class="popup-kv"><span>Koordinat</span><span class="mono">${Number(props.latitude).toFixed(5)}, ${Number(props.longitude).toFixed(5)}</span></div>
      `;
    } else if (layer === routesLayer) {
      popupContentEl.innerHTML = `
        <div class="popup-title">${escapeHtml(props.name)}</div>
        <div class="popup-kv"><span>Kode Jalur</span><strong class="mono">${escapeHtml(props.routeCode)}</strong></div>
        <div class="popup-kv"><span>Jenis</span><strong>${props.isInterZone ? 'Penghubung Antar Wilayah' : 'Jalur Dalam Rumbai'}</strong></div>
        <div class="popup-kv"><span>Panjang</span><strong class="mono">${props.lengthKm} km</strong></div>
        <div class="popup-kv"><span>Wilayah</span><strong>${escapeHtml((props.connectedZones || []).join(', '))}</strong></div>
      `;
    } else if (layer === zonesLayer) {
      popupContentEl.innerHTML = `
        <div class="popup-title">${escapeHtml(props.name)}</div>
        <div class="popup-kv"><span>Tingkat Akses</span>${classBadgeHtml(props.accessClass)}</div>
        <div class="popup-kv"><span>Skor Total</span><strong class="mono">${props.score} / 16</strong></div>
        <div class="popup-kv"><span>Jumlah Faskes / RS</span><strong class="mono">${props.facilityCountLive} / ${props.hospitalCountLive} RS</strong></div>
        <div class="popup-kv"><span>Jarak RS Terdekat</span><strong class="mono">${props.nearestHospitalKm} km</strong></div>
        <div class="popup-kv"><span>Jalur Terdekat</span><strong class="mono">${props.minInterZoneRouteKm} km (${escapeHtml(props.shortestRouteCode)})</strong></div>
      `;
    } else if (layer === analysisLayer) {
      const friendlyType = ANALYSIS_TYPE_META[props.analysisType]?.label || props.analysisLabel;
      popupContentEl.innerHTML = `
        <div class="popup-title">${escapeHtml(props.name)}</div>
        <div class="popup-kv"><span>Analisis</span><strong>${escapeHtml(friendlyType)}</strong></div>
        ${props.radiusKm ? `<div class="popup-kv"><span>Radius Jangkauan</span><strong class="mono">${props.radiusKm} km</strong></div>` : ''}
        ${props.uncoveredPct !== undefined ? `<div class="popup-kv"><span>Belum Terjangkau</span><strong class="mono">${props.uncoveredPct}% (${props.uncoveredKm2} km²)</strong></div>` : ''}
        ${props.distanceKm !== undefined ? `<div class="popup-kv"><span>Jarak RS Terdekat</span><strong class="mono">${props.distanceKm} km</strong></div>` : ''}
        ${props.beforeScore !== undefined ? `<div class="popup-kv"><span>Perubahan Skor</span><strong style="color:#6ee7b7;">${props.beforeScore} (${escapeHtml(props.beforeClass)}) &rarr; ${props.afterScore} (${escapeHtml(props.afterClass)})</strong></div>` : ''}
        <p style="margin: 0.45rem 0 0; font-size: 0.76rem; color: rgba(255,255,255,0.8);">${escapeHtml(props.summary)}</p>
      `;
    }

    popupEl.style.display = 'block';
    popupOverlay.setPosition(evt.coordinate);
  });

  // UI Bindings
  container.querySelector('#btn-back-home').addEventListener('click', () => navigate('/'));

  container.querySelectorAll('#liquid-dock .dock-item').forEach((btn) => {
    btn.addEventListener('click', () => openSheet(btn.getAttribute('data-sheet')));
  });

  container.querySelector('#btn-close-sheet').addEventListener('click', () => {
    container.querySelector('#glass-sheet').classList.add('hidden');
    container.querySelectorAll('#liquid-dock .dock-item').forEach((b) => b.classList.remove('active'));
    activeSheet = null;
  });

  container.querySelectorAll('#basemap-switcher .glass-seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bm = btn.getAttribute('data-basemap');
      container.querySelectorAll('#basemap-switcher .glass-seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      osmLayer.setVisible(bm === 'osm');
      satelliteLayer.setVisible(bm === 'satellite');
      lightLayer.setVisible(bm === 'light');
    });
  });

  const legendBtn = container.querySelector('#btn-toggle-legend');
  const legendCard = container.querySelector('#legend-card');
  legendBtn.addEventListener('click', () => {
    const willOpen = legendCard.classList.contains('hidden');
    legendCard.classList.toggle('hidden', !willOpen);
    legendBtn.classList.toggle('active', willOpen);
  });
  container.querySelector('#btn-close-legend').addEventListener('click', () => {
    legendCard.classList.add('hidden');
    legendBtn.classList.remove('active');
  });

  container.querySelector('#toggle-zones').addEventListener('change', (e) => zonesLayer.setVisible(e.target.checked));
  container.querySelector('#toggle-routes').addEventListener('change', (e) => routesLayer.setVisible(e.target.checked));
  container.querySelector('#toggle-facilities').addEventListener('change', (e) => facilitiesLayer.setVisible(e.target.checked));
  container.querySelector('#toggle-analysis').addEventListener('change', (e) => analysisLayer.setVisible(e.target.checked));
  container.querySelector('#toggle-heatmap').addEventListener('change', (e) => {
    heatmapLayer.setVisible(e.target.checked);
    container.querySelector('#heatmap-mode-box').style.display = e.target.checked ? 'block' : 'none';
  });

  container.querySelectorAll('#heatmap-mode-box .glass-seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      heatmapMode = btn.getAttribute('data-heat');
      container.querySelectorAll('#heatmap-mode-box .glass-seg-btn').forEach((b) => {
        const isAct = b === btn;
        b.classList.toggle('active', isAct);
        b.style.background = isAct ? 'rgba(255,255,255,0.18)' : 'transparent';
      });
      syncHeatmapSource();
    });
  });

  ['#filter-analysis', '#filter-classes', '#filter-zones', '#filter-routes', '#filter-subtypes'].forEach((sel) => {
    container.querySelector(sel).addEventListener('change', loadFilteredLayers);
  });

  let searchTimer = null;
  container.querySelector('#facility-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadFilteredLayers, 220);
  });

  container.querySelector('#reset-filters-btn').addEventListener('click', () => {
    container.querySelectorAll('#glass-sheet input[type="checkbox"]').forEach((cb) => {
      if (cb.id === 'toggle-heatmap') {
        cb.checked = false;
        heatmapLayer.setVisible(false);
        container.querySelector('#heatmap-mode-box').style.display = 'none';
      } else {
        cb.checked = true;
      }
    });
    zonesLayer.setVisible(true);
    routesLayer.setVisible(true);
    facilitiesLayer.setVisible(true);
    analysisLayer.setVisible(true);
    container.querySelector('#facility-search').value = '';
    loadFilteredLayers();
  });

  container.querySelector('#btn-show-all-l4').addEventListener('click', () => isolateAnalysisType('all'));
  container.querySelector('#btn-focus-z1-gap').addEventListener('click', () => {
    isolateAnalysisType('overlay_gap');
    fitMapToZones('Z1');
  });

  container.querySelector('#btn-zoom-fit').addEventListener('click', () => fitMapToZones());

  // Load All 4 Layers from MongoDB Atlas
  await Promise.all([
    loadFilteredLayers(),
    fetchScoring()
      .then((data) => {
        baselineScoring = data;
        renderAnalysisAndDecisionPanels();
      })
      .catch((err) => {
        container.querySelector('#decision-panel-body').innerHTML = `
          <div class="glass-card" style="color:#fecdd3;">Gagal memuat ringkasan: ${escapeHtml(err.message)}</div>
        `;
      }),
  ]);

  fitMapToZones(focusZone || null);

  return () => {
    clearTimeout(searchTimer);
    if (activeAbortController) activeAbortController.abort();
    map.setTarget(null);
  };
}
