const EARTH_RADIUS_KM = 6371;

export function round2(value) {
  return Number(Number(value).toFixed(2));
}

export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeMeanCenter(coordsList, fallback = [101.44, 0.51]) {
  if (!coordsList.length) return fallback;
  const sum = coordsList.reduce(
    (acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat],
    [0, 0]
  );
  return [
    Number((sum[0] / coordsList.length).toFixed(6)),
    Number((sum[1] / coordsList.length).toFixed(6)),
  ];
}

export function scoreFacilityCount(count) {
  if (count >= 9) return 4;
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  return 1;
}

export function scoreHospitalCount(count) {
  if (count >= 3) return 4;
  if (count === 2) return 3;
  if (count === 1) return 2;
  return 1;
}

export function scoreNearestHospitalKm(km) {
  if (km <= 0.6) return 4;
  if (km <= 1.5) return 3;
  if (km <= 3) return 2;
  return 1;
}

export function scoreConnectivityKm(km) {
  if (km <= 2) return 4;
  if (km <= 4) return 3;
  if (km <= 6) return 2;
  return 1;
}

export function classifyTotalScore(totalScore) {
  if (totalScore >= 14) return 'Sangat mudah';
  if (totalScore >= 11) return 'Mudah';
  if (totalScore >= 8) return 'Sedang';
  return 'Sulit';
}

export function scoreZoneMetrics({
  facilityCount,
  hospitalCount,
  nearestHospitalKm,
  minInterZoneRouteKm,
}) {
  const c1 = scoreFacilityCount(facilityCount);
  const c2 = scoreHospitalCount(hospitalCount);
  const c3 = scoreNearestHospitalKm(nearestHospitalKm);
  const c4 = scoreConnectivityKm(minInterZoneRouteKm);
  const totalScore = c1 + c2 + c3 + c4;
  return {
    criteria: {
      c1_facilities: c1,
      c2_hospitals: c2,
      c3_nearestHospital: c3,
      c4_connectivity: c4,
    },
    totalScore,
    accessClass: classifyTotalScore(totalScore),
  };
}

export function toGeoJsonFeature(doc, extraProps = {}) {
  return {
    type: 'Feature',
    id: doc.properties?.surveyId ?? String(doc._id),
    properties: {
      ...doc.properties,
      ...extraProps,
    },
    geometry: doc.geometry,
  };
}

export function toFeatureCollection(name, features) {
  return {
    type: 'FeatureCollection',
    name,
    features,
  };
}

/**
 * Compute live baseline accessibility scores for all zones directly from MongoDB Atlas
 * using $geoWithin, $geoNear, and inter-zone routes (excluding intra-zone J5).
 */
export async function computeZoneAnalytics(db) {
  const zonesCol = db.collection('zones');
  const facilitiesCol = db.collection('facilities');
  const routesCol = db.collection('routes');

  const [zones, routes] = await Promise.all([
    zonesCol.find({}).sort({ 'properties.zoneCode': 1 }).toArray(),
    routesCol.find({}).sort({ 'properties.routeCode': 1 }).toArray(),
  ]);

  const interZoneRoutes = routes.filter((r) => r.properties?.isInterZone === true);

  const zoneResults = await Promise.all(
    zones.map(async (zone) => {
      const zoneCode = zone.properties.zoneCode;
      const facilitiesInZone = await facilitiesCol
        .find({ geometry: { $geoWithin: { $geometry: zone.geometry } } })
        .toArray();

      const facilityCount = facilitiesInZone.length;
      const hospitalCount = facilitiesInZone.filter((f) => f.properties?.isHospital).length;

      // Survey zone demand center matches the mean center of facilities in the zone
      const analysisCenter = computeMeanCenter(
        facilitiesInZone.map((f) => f.geometry.coordinates),
        zone.properties.centroid
      );

      const nearestHospitalRes = await facilitiesCol
        .aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: analysisCenter },
              distanceField: 'distanceMeters',
              query: { 'properties.isHospital': true },
              spherical: true,
            },
          },
          { $limit: 1 },
        ])
        .toArray();

      const nearestHospitalDoc = nearestHospitalRes[0];
      const nearestHospitalKm = nearestHospitalDoc
        ? round2(nearestHospitalDoc.distanceMeters / 1000)
        : 999;

      const connectedInterRoutes = interZoneRoutes.filter((r) =>
        Array.isArray(r.properties?.connectedZones)
          ? r.properties.connectedZones.includes(zoneCode)
          : false
      );

      const shortestRoute = connectedInterRoutes.reduce(
        (best, curr) =>
          !best || curr.properties.lengthKm < best.properties.lengthKm ? curr : best,
        null
      );

      const minInterZoneRouteKm = shortestRoute ? round2(shortestRoute.properties.lengthKm) : 999;

      const scoring = scoreZoneMetrics({
        facilityCount,
        hospitalCount,
        nearestHospitalKm,
        minInterZoneRouteKm,
      });

      return {
        zoneCode,
        zoneName: zone.properties.zoneName,
        name: zone.properties.name,
        centroid: zone.properties.centroid,
        analysisCenter,
        facilityCount,
        hospitalCount,
        nonHospitalCount: facilityCount - hospitalCount,
        nearestHospitalKm,
        nearestHospitalName: nearestHospitalDoc?.properties?.name ?? '-',
        nearestHospitalCoords: nearestHospitalDoc?.geometry?.coordinates ?? null,
        minInterZoneRouteKm,
        shortestRouteCode: shortestRoute?.properties?.routeCode ?? '-',
        shortestRouteName: shortestRoute?.properties?.name ?? '-',
        ...scoring,
        doc: zone,
      };
    })
  );

  return { zoneResults, routes };
}
