import express from 'express';
import { getDb } from '../db.js';
import {
  computeZoneAnalytics,
  toFeatureCollection,
  toGeoJsonFeature,
} from '../spatial.js';

const router = express.Router();

function parseCsvParam(val) {
  if (!val) return [];
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

router.get('/health', async (_req, res, next) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const [zones, routes, facilities, analysis_results] = await Promise.all([
      db.collection('zones').countDocuments(),
      db.collection('routes').countDocuments(),
      db.collection('facilities').countDocuments(),
      db.collection('analysis_results').countDocuments(),
    ]);
    res.json({
      ok: true,
      database: db.databaseName,
      collections: { zones, routes, facilities, analysis_results },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/summary', async (_req, res, next) => {
  try {
    const db = await getDb();
    const [{ zoneResults, routes }, facilities, analysisDocs] = await Promise.all([
      computeZoneAnalytics(db),
      db.collection('facilities').find({}).toArray(),
      db.collection('analysis_results').find({}).sort({ 'properties.surveyId': 1 }).toArray(),
    ]);

    const subTypeCounts = {};
    let hospitalCount = 0;
    for (const f of facilities) {
      const sub = f.properties?.facilitySubType || 'Lainnya';
      subTypeCounts[sub] = (subTypeCounts[sub] || 0) + 1;
      if (f.properties?.isHospital) hospitalCount++;
    }

    const classCounts = {};
    for (const z of zoneResults) {
      classCounts[z.accessClass] = (classCounts[z.accessClass] || 0) + 1;
    }

    const analysisTypeCounts = {};
    for (const a of analysisDocs) {
      const t = a.properties?.analysisType || 'other';
      analysisTypeCounts[t] = (analysisTypeCounts[t] || 0) + 1;
    }

    res.json({
      project: {
        title: 'WebGIS Aksesibilitas Fasilitas Kesehatan Kota Pekanbaru',
        studyArea: 'Kota Pekanbaru, Riau (5 Zona Layanan)',
        engine: 'OpenLayers + Express + MongoDB Atlas (2dsphere)',
      },
      totals: {
        zones: zoneResults.length,
        routes: routes.length,
        interZoneRoutes: routes.filter((r) => r.properties?.isInterZone).length,
        intraZoneRoutes: routes.filter((r) => !r.properties?.isInterZone).length,
        facilities: facilities.length,
        hospitals: hospitalCount,
        nonHospitals: facilities.length - hospitalCount,
        analysisFeatures: analysisDocs.length,
      },
      subTypeCounts,
      classCounts,
      analysisTypeCounts,
      zones: zoneResults.map(({ doc, ...rest }) => rest),
      routes: routes.map((r) => r.properties),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/zones', async (req, res, next) => {
  try {
    const db = await getDb();
    const { zoneResults } = await computeZoneAnalytics(db);

    const zoneCodes = parseCsvParam(req.query.zoneCode);
    const accessClasses = parseCsvParam(req.query.accessClass);

    const filtered = zoneResults.filter((z) => {
      if (zoneCodes.length && !zoneCodes.includes(z.zoneCode)) return false;
      if (accessClasses.length && !accessClasses.includes(z.accessClass)) return false;
      return true;
    });

    const features = filtered.map((z) =>
      toGeoJsonFeature(z.doc, {
        facilityCountLive: z.facilityCount,
        hospitalCountLive: z.hospitalCount,
        nearestHospitalKm: z.nearestHospitalKm,
        nearestHospitalName: z.nearestHospitalName,
        minInterZoneRouteKm: z.minInterZoneRouteKm,
        shortestRouteCode: z.shortestRouteCode,
        criteria: z.criteria,
        score: z.totalScore,
        accessClass: z.accessClass,
        analysisCenter: z.analysisCenter,
      })
    );

    res.json(toFeatureCollection('zones', features));
  } catch (err) {
    next(err);
  }
});

router.get('/routes', async (req, res, next) => {
  try {
    const db = await getDb();
    const filter = {};

    const routeTypes = parseCsvParam(req.query.routeType);
    const zoneCodes = parseCsvParam(req.query.zoneCode);
    if (routeTypes.length) {
      filter['properties.routeType'] = { $in: routeTypes };
    }
    if (req.query.isInterZone === 'true') {
      filter['properties.isInterZone'] = true;
    } else if (req.query.isInterZone === 'false') {
      filter['properties.isInterZone'] = false;
    }
    if (zoneCodes.length) {
      filter['properties.connectedZones'] = { $in: zoneCodes };
    }

    const docs = await db.collection('routes').find(filter).sort({ 'properties.surveyId': 1 }).toArray();
    res.json(toFeatureCollection('routes', docs.map((d) => toGeoJsonFeature(d))));
  } catch (err) {
    next(err);
  }
});

router.get('/facilities', async (req, res, next) => {
  try {
    const db = await getDb();
    const filter = {};

    const zoneCodes = parseCsvParam(req.query.zoneCode);
    const subTypes = parseCsvParam(req.query.facilitySubType);
    const facilityTypes = parseCsvParam(req.query.facilityType);

    if (zoneCodes.length) {
      filter['properties.zoneCode'] = { $in: zoneCodes };
    }
    if (subTypes.length) {
      filter['properties.facilitySubType'] = { $in: subTypes };
    }
    if (facilityTypes.length) {
      filter['properties.facilityType'] = { $in: facilityTypes };
    }
    if (req.query.isHospital === 'true') {
      filter['properties.isHospital'] = true;
    } else if (req.query.isHospital === 'false') {
      filter['properties.isHospital'] = false;
    }
    if (req.query.q && String(req.query.q).trim()) {
      const escaped = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['properties.name'] = { $regex: escaped, $options: 'i' };
    }

    const docs = await db.collection('facilities').find(filter).sort({ 'properties.surveyId': 1 }).toArray();
    res.json(toFeatureCollection('facilities', docs.map((d) => toGeoJsonFeature(d))));
  } catch (err) {
    next(err);
  }
});

router.get('/analysis/layer', async (req, res, next) => {
  try {
    const db = await getDb();
    const filter = {};

    const analysisTypes = parseCsvParam(req.query.analysisType);
    const zoneCodes = parseCsvParam(req.query.zoneCode);

    if (analysisTypes.length) {
      filter['properties.analysisType'] = { $in: analysisTypes };
    }
    if (zoneCodes.length) {
      filter.$or = [
        { 'properties.zoneCode': { $in: zoneCodes } },
        { 'properties.intersectingZones': { $in: zoneCodes } },
      ];
    }

    const docs = await db
      .collection('analysis_results')
      .find(filter)
      .sort({ 'properties.surveyId': 1 })
      .toArray();

    res.json(toFeatureCollection('analysis_results', docs.map((d) => toGeoJsonFeature(d))));
  } catch (err) {
    next(err);
  }
});

router.get('/analysis/scoring', async (_req, res, next) => {
  try {
    const db = await getDb();
    const [{ zoneResults }, analysisDocs] = await Promise.all([
      computeZoneAnalytics(db),
      db.collection('analysis_results').find({}).sort({ 'properties.surveyId': 1 }).toArray(),
    ]);

    const priorityZones = zoneResults.filter((z) => z.hospitalCount === 0 || z.totalScore <= 10);
    const bufferRings = analysisDocs
      .filter((d) => d.properties?.analysisType === 'buffer_rs')
      .map((d) => d.properties)
      .sort((a, b) => a.radiusKm - b.radiusKm);
    const overlayGaps = analysisDocs
      .filter((d) => d.properties?.analysisType === 'overlay_gap')
      .map((d) => d.properties);
    const nearestLinks = analysisDocs
      .filter((d) => d.properties?.analysisType === 'nearest_hospital_link')
      .map((d) => d.properties);
    const recommendations = analysisDocs
      .filter((d) => d.properties?.analysisType === 'weighted_priority')
      .map((d) => d.properties);

    res.json({
      zones: zoneResults.map(({ doc, ...rest }) => rest),
      analysisSummary: {
        totalFeatures: analysisDocs.length,
        bufferRings,
        overlayGaps,
        nearestLinks,
        recommendations,
      },
      insights: {
        highestZone: zoneResults.reduce((a, b) => (b.totalScore > a.totalScore ? b : a), zoneResults[0]),
        lowestZone: zoneResults.reduce((a, b) => (b.totalScore < a.totalScore ? b : a), zoneResults[0]),
        zeroHospitalZones: zoneResults.filter((z) => z.hospitalCount === 0).map((z) => z.name),
        priorityZones: priorityZones.map((z) => ({
          zoneCode: z.zoneCode,
          name: z.name,
          totalScore: z.totalScore,
          accessClass: z.accessClass,
          reason:
            z.hospitalCount === 0
              ? `Memiliki ${z.facilityCount} faskes non-RS tetapi 0 Rumah Sakit (${z.nearestHospitalKm} km ke RS terdekat).`
              : `Skor ${z.totalScore} (${z.accessClass}).`,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
