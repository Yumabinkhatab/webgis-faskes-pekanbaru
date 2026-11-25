import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  area,
  buffer,
  cleanCoords,
  difference,
  featureCollection,
  intersect,
  rewind,
  union,
} from '@turf/turf';
import {
  computeMeanCenter,
  haversineKm,
  round2,
  scoreZoneMetrics,
  toFeatureCollection,
} from '../server/spatial.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GEOJSON_DIR = path.join(ROOT_DIR, 'data', 'geojson');
const OUTPUT_FILE = path.join(GEOJSON_DIR, 'analysis_results.geojson');

function loadFeatures(filename) {
  const filePath = path.join(GEOJSON_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File ${filePath} tidak ditemukan. Jalankan "npm run convert" terlebih dahulu.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')).features;
}

function sanitizeGeometry(feature) {
  return rewind(cleanCoords(feature), { reverse: false });
}

function main() {
  const zones = loadFeatures('zones.geojson');
  const routes = loadFeatures('routes.geojson');
  const facilities = loadFeatures('facilities.geojson');
  const hospitals = facilities.filter((f) => f.properties?.isHospital);
  const interZoneRoutes = routes.filter((r) => r.properties?.isInterZone === true);

  let nextSurveyId = 101;
  const analysisFeatures = [];

  // Precompute zone baseline analytics from survey GeoJSON
  const zoneInfos = zones.map((zone) => {
    const code = zone.properties.zoneCode;
    const zoneFacilities = facilities.filter((f) => f.properties.zoneCode === code);
    const facilityCount = zoneFacilities.length;
    const hospitalCount = zoneFacilities.filter((f) => f.properties.isHospital).length;
    const demandCenter = computeMeanCenter(
      zoneFacilities.map((f) => f.geometry.coordinates),
      zone.properties.centroid
    );

    const nearestHospital = hospitals
      .map((h) => ({
        hospital: h,
        distanceKm: round2(haversineKm(demandCenter, h.geometry.coordinates)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    const shortestRoute = interZoneRoutes
      .filter((r) => r.properties.connectedZones?.includes(code))
      .sort((a, b) => a.properties.lengthKm - b.properties.lengthKm)[0];

    const minInterZoneRouteKm = shortestRoute ? round2(shortestRoute.properties.lengthKm) : 999;
    const scoring = scoreZoneMetrics({
      facilityCount,
      hospitalCount,
      nearestHospitalKm: nearestHospital.distanceKm,
      minInterZoneRouteKm,
    });

    return {
      zone,
      code,
      name: zone.properties.name,
      zoneName: zone.properties.zoneName,
      zoneAreaKm2: round2(area(zone) / 1_000_000),
      facilityCount,
      hospitalCount,
      demandCenter,
      nearestHospital,
      minInterZoneRouteKm,
      shortestRouteCode: shortestRoute?.properties?.routeCode ?? '-',
      scoring,
    };
  });

  // 1. Buffer Analisis Jangkauan Rumah Sakit (0.6 km, 1.5 km, 3.0 km)
  const radiiKm = [3.0, 1.5, 0.6];
  const dissolvedByRadius = new Map();

  for (const radiusKm of radiiKm) {
    const individualBuffers = hospitals
      .map((h) => buffer(h, radiusKm, { units: 'kilometers', steps: 48 }))
      .filter(Boolean);

    const merged =
      individualBuffers.length === 1
        ? individualBuffers[0]
        : union(featureCollection(individualBuffers));
    const cleanMerged = sanitizeGeometry(merged);
    dissolvedByRadius.set(radiusKm, cleanMerged);

    const intersectingZones = [];
    const uncoveredZones = [];
    const zoneCoverage = zoneInfos.map((zi) => {
      const inter = intersect(featureCollection([zi.zone, cleanMerged]));
      const coveredKm2 = inter ? round2(area(inter) / 1_000_000) : 0;
      const pct = Math.min(100, Number(((coveredKm2 / (zi.zoneAreaKm2 || 1)) * 100).toFixed(1)));
      if (coveredKm2 > 0) intersectingZones.push(zi.code);
      else uncoveredZones.push(zi.code);
      return { zoneCode: zi.code, coveredKm2, coveragePct: pct };
    });

    analysisFeatures.push({
      type: 'Feature',
      properties: {
        surveyId: nextSurveyId++,
        layerGroup: 'analysis_results',
        analysisType: 'buffer_rs',
        analysisLabel: 'Buffer Jangkauan RS',
        name: `Buffer Jangkauan RS (${radiusKm} km)`,
        radiusKm,
        sourceCount: hospitals.length,
        intersectingZones,
        uncoveredZones,
        zoneCoverage,
        summary: `Cakupan radius ${radiusKm} km dari ${hospitals.length} Rumah Sakit. Zona tidak tercover: ${uncoveredZones.join(', ') || 'Tidak ada'}.`,
      },
      geometry: cleanMerged.geometry,
    });
  }

  // 2. Overlay Analisis: Service Gap Area di luar Buffer RS 3.0 km (difference)
  const buffer3Km = dissolvedByRadius.get(3.0);
  for (const zi of zoneInfos) {
    const gapFeature = difference(featureCollection([zi.zone, buffer3Km]));
    if (!gapFeature) continue;

    const cleanGap = sanitizeGeometry(gapFeature);
    const gapKm2 = round2(area(cleanGap) / 1_000_000);
    if (gapKm2 <= 0) continue;

    const gapPct = Math.min(100, Number(((gapKm2 / (zi.zoneAreaKm2 || 1)) * 100).toFixed(1)));
    analysisFeatures.push({
      type: 'Feature',
      properties: {
        surveyId: nextSurveyId++,
        layerGroup: 'analysis_results',
        analysisType: 'overlay_gap',
        analysisLabel: 'Overlay Gap Layanan RS (> 3 km)',
        name: `Gap Layanan RS — ${zi.name}`,
        zoneCode: zi.code,
        zoneName: zi.zoneName,
        uncoveredKm2: gapKm2,
        zoneAreaKm2: zi.zoneAreaKm2,
        uncoveredPct: gapPct,
        summary: `${gapPct}% wilayah ${zi.name} (${gapKm2} km²) berada di luar radius 3.0 km dari seluruh Rumah Sakit.`,
      },
      geometry: cleanGap.geometry,
    });
  }

  // 3. Spatial Query: Garis Jarak Pusat Aktivitas Zona ke RS Terdekat
  for (const zi of zoneInfos) {
    const targetHospital = zi.nearestHospital.hospital;
    const distKm = zi.nearestHospital.distanceKm;
    analysisFeatures.push({
      type: 'Feature',
      properties: {
        surveyId: nextSurveyId++,
        layerGroup: 'analysis_results',
        analysisType: 'nearest_hospital_link',
        analysisLabel: 'Spatial Query: RS Terdekat per Zona',
        name: `Akses RS Terdekat — ${zi.code} ke ${targetHospital.properties.name}`,
        zoneCode: zi.code,
        zoneName: zi.zoneName,
        targetHospitalName: targetHospital.properties.name,
        distanceKm: distKm,
        c3Score: zi.scoring.criteria.c3_nearestHospital,
        summary: `Jarak pusat ${zi.name} ke RS terdekat (${targetHospital.properties.name}) adalah ${distKm} km (Skor C3 = ${zi.scoring.criteria.c3_nearestHospital}).`,
      },
      geometry: {
        type: 'LineString',
        coordinates: [zi.demandCenter, targetHospital.geometry.coordinates],
      },
    });
  }

  // 4. Weighted Overlay & Prioritas Intervensi: Rekomendasi Lokasi RS Baru di Z1 Rumbai
  const z1 = zoneInfos.find((zi) => zi.code === 'Z1');
  if (z1) {
    const afterScoring = scoreZoneMetrics({
      facilityCount: z1.facilityCount + 1,
      hospitalCount: z1.hospitalCount + 1,
      nearestHospitalKm: 0,
      minInterZoneRouteKm: z1.minInterZoneRouteKm,
    });

    analysisFeatures.push({
      type: 'Feature',
      properties: {
        surveyId: nextSurveyId++,
        layerGroup: 'analysis_results',
        analysisType: 'weighted_priority',
        analysisLabel: 'Weighted Overlay: Prioritas Intervensi',
        name: 'Rekomendasi Lokasi RS Baru — Pusat Z1 Rumbai',
        zoneCode: z1.code,
        zoneName: z1.zoneName,
        priorityRank: 1,
        beforeScore: z1.scoring.totalScore,
        beforeClass: z1.scoring.accessClass,
        afterScore: afterScoring.totalScore,
        afterClass: afterScoring.accessClass,
        scoreDelta: afterScoring.totalScore - z1.scoring.totalScore,
        longitude: z1.demandCenter[0],
        latitude: z1.demandCenter[1],
        summary: `Z1 Rumbai adalah prioritas utama (10 faskes non-RS, 0 RS). Penambahan 1 RS di pusat Z1 menaikkan skor dari ${z1.scoring.totalScore} (${z1.scoring.accessClass}) menjadi ${afterScoring.totalScore} (${afterScoring.accessClass}).`,
      },
      geometry: {
        type: 'Point',
        coordinates: z1.demandCenter,
      },
    });
  }

  const collection = toFeatureCollection('survey_analysis_results', analysisFeatures);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2) + '\n', 'utf8');

  console.log('=== Generate Layer 4 (analysis_results.geojson) Berhasil ===');
  console.log(`Total fitur analisis: ${analysisFeatures.length}`);
  const counts = analysisFeatures.reduce((acc, f) => {
    acc[f.properties.analysisType] = (acc[f.properties.analysisType] || 0) + 1;
    return acc;
  }, {});
  console.log('Rincian kategori:', counts);
}

main();
