import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GEOJSON_DIR = path.join(ROOT_DIR, 'data', 'geojson');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'sig_faskes_pekanbaru';

if (!MONGODB_URI || MONGODB_URI.includes('<username>')) {
  console.error('Error: MONGODB_URI belum dikonfigurasi di file .env.');
  console.error('Salin .env.example menjadi .env lalu isi connection string MongoDB Atlas Anda.');
  process.exit(1);
}

function loadGeoJsonFeatures(filename) {
  const filePath = path.join(GEOJSON_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `File ${filePath} tidak ditemukan. Jalankan "npm run convert" dan "npm run analyze" terlebih dahulu.`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parsed.features;
}

async function seedCollection(db, collectionName, features) {
  const collection = db.collection(collectionName);
  await collection.deleteMany({});
  const result = await collection.insertMany(features);

  // Indeks spasial 2dsphere wajib untuk query $geoWithin, $geoIntersects, dan $nearSphere
  await collection.createIndex({ geometry: '2dsphere' });
  await collection.createIndex({ 'properties.surveyId': 1 }, { unique: true });

  return result.insertedCount;
}

async function verifySpatialQueries(db) {
  const zonesCol = db.collection('zones');
  const facilitiesCol = db.collection('facilities');

  const z1 = await zonesCol.findOne({ 'properties.zoneCode': 'Z1' });
  if (!z1) return;

  const insideZ1 = await facilitiesCol.countDocuments({
    geometry: { $geoWithin: { $geometry: z1.geometry } },
  });

  const nearestHospital = await facilitiesCol
    .find({
      'properties.isHospital': true,
      geometry: {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: z1.properties.centroid },
        },
      },
    })
    .limit(1)
    .toArray();

  const analysisCount = await db.collection('analysis_results').countDocuments();

  console.log('\n=== Verifikasi Spatial Query MongoDB Atlas ===');
  console.log(`- Query $geoWithin pada Z1 Rumbai : ${insideZ1} fasilitas ditemukan`);
  if (nearestHospital[0]) {
    console.log(
      `- Query $nearSphere RS terdekat dari pusat Z1 : ${nearestHospital[0].properties.name} (${nearestHospital[0].properties.zoneLabel})`
    );
  }
  console.log(`- Collection analysis_results tersedia : ${analysisCount} fitur analisis`);
}

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const zones = loadGeoJsonFeatures('zones.geojson');
    const routes = loadGeoJsonFeatures('routes.geojson');
    const facilities = loadGeoJsonFeatures('facilities.geojson');
    const analysisResults = loadGeoJsonFeatures('analysis_results.geojson');

    const zonesCount = await seedCollection(db, 'zones', zones);
    const routesCount = await seedCollection(db, 'routes', routes);
    const facilitiesCount = await seedCollection(db, 'facilities', facilities);
    const analysisCount = await seedCollection(db, 'analysis_results', analysisResults);

    await db.collection('facilities').createIndex({ 'properties.zoneCode': 1 });
    await db.collection('facilities').createIndex({ 'properties.isHospital': 1 });
    await db.collection('analysis_results').createIndex({ 'properties.analysisType': 1 });

    console.log(`=== Import ke MongoDB Atlas (${DB_NAME}) Berhasil ===`);
    console.log(`- Collection "zones"            : ${zonesCount} dokumen (index 2dsphere aktif)`);
    console.log(`- Collection "routes"           : ${routesCount} dokumen (index 2dsphere aktif)`);
    console.log(`- Collection "facilities"       : ${facilitiesCount} dokumen (index 2dsphere aktif)`);
    console.log(`- Collection "analysis_results" : ${analysisCount} dokumen (index 2dsphere aktif)`);

    await verifySpatialQueries(db);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Gagal mengimpor data ke MongoDB Atlas:', err.message);
  process.exit(1);
});
