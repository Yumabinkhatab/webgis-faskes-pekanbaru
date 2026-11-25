import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const INPUT_CSV = path.join(ROOT_DIR, 'data', 'raw', 'survey_faskes_pekanbaru.csv');
const OUTPUT_DIR = path.join(ROOT_DIR, 'data', 'geojson');

/**
 * Parse a single CSV line supporting quoted fields and escaped quotes.
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? '';
    });
    return row;
  });
}

/**
 * Parse KML-style coordinate string ("lon,lat,0 lon,lat,0 ...") into 2D [lon, lat] pairs.
 */
function parseCoordinates(coordString) {
  return coordString
    .split(/\s+/)
    .filter(Boolean)
    .map((triplet) => {
      const parts = triplet.split(',').map(Number);
      const [lon, lat] = parts;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new Error(`Invalid coordinate pair: "${triplet}"`);
      }
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        throw new Error(`Out-of-bounds coordinate: [${lon}, ${lat}]`);
      }
      return [lon, lat];
    });
}

/**
 * Signed shoelace area; positive means counter-clockwise (RFC 7946 exterior ring).
 */
function signedRingArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/**
 * Ensure polygon ring is closed and counter-clockwise for RFC 7946 & MongoDB 2dsphere.
 */
function normalizePolygonRing(coords) {
  if (coords.length < 3) {
    throw new Error('Polygon ring must have at least 3 distinct points.');
  }
  const ring = coords.map(([lon, lat]) => [lon, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  if (signedRingArea(ring) < 0) {
    ring.reverse();
  }
  return ring;
}

/**
 * Haversine distance in kilometers between two [lon, lat] points.
 */
function haversineKm([lon1, lat1], [lon2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineLengthKm(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineKm(coords[i], coords[i + 1]);
  }
  return Number(total.toFixed(2));
}

function cleanText(text) {
  return text
    .replace(/Pusat-selitalan/gi, 'Pusat-selatan')
    .replace(/Rumah sakit awap Bros Pekanbaru/gi, 'Rumah Sakit Awal Bros Pekanbaru')
    .replace(/kantor Kedeputian BPJS kesehatan wilayah ll/gi, 'Kantor Kedeputian BPJS Kesehatan Wilayah II')
    .replace(/Rumah sakit/g, 'Rumah Sakit')
    .trim();
}

function inferFacilitySubType(name, rawType) {
  if (rawType.toLowerCase() === 'rumah sakit') return 'Rumah Sakit';
  const lower = name.toLowerCase();
  if (lower.includes('puskesmas')) return 'Puskesmas';
  if (lower.includes('apotek') || lower.includes('apotik')) return 'Apotek';
  if (lower.includes('klinik') || lower.includes('clinic')) return 'Klinik';
  if (lower.includes('dokter') || lower.includes('praktek') || lower.includes('praktik')) {
    return 'Praktik Dokter';
  }
  return 'Instansi Kesehatan';
}

function parseZoneFeature(row) {
  const ring = normalizePolygonRing(parseCoordinates(row.Coordinates));
  const [zoneCode, ...rest] = row.Name.split(' - ')[0].split(' ');
  const zoneName = rest.join(' ').trim();

  // Parse "Jumlah fasilitas: 10; RS: 0; Skor: 7; Kelas: Sulit"
  const metrics = {};
  row.Description.split(';').forEach((part) => {
    const [k, v] = part.split(':').map((s) => s.trim());
    if (k && v !== undefined) metrics[k.toLowerCase()] = v;
  });

  // Compute approximate centroid from ring vertices (excluding closing duplicate)
  const uniquePts = ring.slice(0, -1);
  const centroid = uniquePts.reduce(
    (acc, [lon, lat]) => [acc[0] + lon / uniquePts.length, acc[1] + lat / uniquePts.length],
    [0, 0]
  );

  return {
    type: 'Feature',
    properties: {
      surveyId: Number(row.ID),
      layerGroup: 'zones',
      category: row.Category,
      zoneCode,
      zoneName,
      name: `${zoneCode} ${zoneName}`,
      label: row.Name,
      totalFacilities: Number(metrics['jumlah fasilitas']),
      hospitalCount: Number(metrics['rs']),
      score: Number(metrics['skor']),
      accessClass: metrics['kelas'],
      centroid: [Number(centroid[0].toFixed(6)), Number(centroid[1].toFixed(6))],
    },
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };
}

function parseRouteFeature(row) {
  const coords = parseCoordinates(row.Coordinates);
  const routeCode = row.Name.split(' ')[0];
  const zoneMatches = row.Name.match(/Z\d/g) ?? [];
  const isInterZone = routeCode !== 'J5';
  const connectedZones = routeCode === 'J5' ? ['Z1'] : zoneMatches;

  return {
    type: 'Feature',
    properties: {
      surveyId: Number(row.ID),
      layerGroup: 'routes',
      category: row.Category,
      routeCode,
      name: row.Name,
      routeType: isInterZone ? 'inter_zone' : 'intra_zone',
      isInterZone,
      connectedZones,
      lengthKm: lineLengthKm(coords),
    },
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}

function parseFacilityFeature(row) {
  const [coordsPoint] = parseCoordinates(row.Coordinates);
  const cleanedName = cleanText(row.Name);
  const cleanedDesc = cleanText(row.Description);
  const [zonePart, typePart] = cleanedDesc.split('|').map((s) => s.trim());
  const zoneCode = zonePart.split(' ')[0];
  const isHospital = typePart.toLowerCase() === 'rumah sakit';

  return {
    type: 'Feature',
    properties: {
      surveyId: Number(row.ID),
      layerGroup: 'facilities',
      category: row.Category,
      name: cleanedName,
      zoneCode,
      zoneLabel: zonePart,
      facilityType: typePart,
      facilitySubType: inferFacilitySubType(cleanedName, typePart),
      isHospital,
      latitude: coordsPoint[1],
      longitude: coordsPoint[0],
    },
    geometry: {
      type: 'Point',
      coordinates: coordsPoint,
    },
  };
}

function toFeatureCollection(name, features) {
  return {
    type: 'FeatureCollection',
    name,
    features,
  };
}

function main() {
  if (!fs.existsSync(INPUT_CSV)) {
    throw new Error(`Input CSV not found at ${INPUT_CSV}`);
  }

  const rawCsv = fs.readFileSync(INPUT_CSV, 'utf8');
  const rows = parseCsv(rawCsv);

  const zones = [];
  const routes = [];
  const facilities = [];

  for (const row of rows) {
    switch (row.Geometry_Type) {
      case 'Polygon':
        zones.push(parseZoneFeature(row));
        break;
      case 'LineString':
        routes.push(parseRouteFeature(row));
        break;
      case 'Point':
        facilities.push(parseFacilityFeature(row));
        break;
      default:
        throw new Error(`Unknown Geometry_Type "${row.Geometry_Type}" on row ID ${row.ID}`);
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const outputs = [
    ['zones.geojson', toFeatureCollection('survey_zones', zones)],
    ['routes.geojson', toFeatureCollection('survey_routes', routes)],
    ['facilities.geojson', toFeatureCollection('survey_facilities', facilities)],
    ['all_features.geojson', toFeatureCollection('survey_all_features', [...zones, ...routes, ...facilities])],
  ];

  for (const [filename, collection] of outputs) {
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(collection, null, 2) + '\n', 'utf8');
  }

  console.log('=== Konversi CSV -> GeoJSON Berhasil ===');
  console.log(`Polygons (zones.geojson)      : ${zones.length} fitur`);
  console.log(`LineStrings (routes.geojson)  : ${routes.length} fitur`);
  console.log(`Points (facilities.geojson)   : ${facilities.length} fitur`);
  console.log(`Combined (all_features.geojson): ${zones.length + routes.length + facilities.length} fitur`);
  console.log('\nRingkasan panjang jalur (km):');
  routes.forEach((r) => {
    console.log(`- ${r.properties.routeCode} (${r.properties.routeType}): ${r.properties.lengthKm} km`);
  });
}

main();
