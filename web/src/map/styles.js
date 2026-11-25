import { Fill, Icon, Stroke, Style, Text } from 'ol/style';

// Bright, vivid cartographic colors for high clarity on the map
export const ACCESS_CLASS_COLORS = {
  'Sangat mudah': { fill: 'rgba(16, 185, 129, 0.34)', stroke: '#059669', badge: '#10b981' },
  Mudah: { fill: 'rgba(56, 189, 248, 0.34)', stroke: '#0284c7', badge: '#0ea5e9' },
  Sedang: { fill: 'rgba(250, 204, 21, 0.36)', stroke: '#eab308', badge: '#f59e0b' },
  Sulit: { fill: 'rgba(239, 68, 68, 0.36)', stroke: '#dc2626', badge: '#ef4444' },
};

export const ROUTE_COLOR_META = {
  J1: { color: '#2563eb', text: '#1d4ed8', label: 'J1: Rumbai – Pusat-utara', dashed: false },
  J2: { color: '#ea580c', text: '#c2410c', label: 'J2: Pusat-utara – Pusat-selatan', dashed: false },
  J3: { color: '#db2777', text: '#be185d', label: 'J3: Pusat-selatan – Selatan', dashed: false },
  J4: { color: '#16a34a', text: '#15803d', label: 'J4: Selatan – Tampan', dashed: false },
  J5: { color: '#9333ea', text: '#7e22ce', label: 'J5: Dalam Rumbai (Intra)', dashed: true },
};

export const ANALYSIS_TYPE_META = {
  buffer_rs: {
    label: 'Radius Jangkauan RS',
    hint: 'Buffer 0,6 / 1,5 / 3 km',
    techHint: 'Buffer Analisis (0.6, 1.5, 3.0 km)',
    color: '#38bdf8',
  },
  overlay_gap: {
    label: 'Wilayah Belum Terjangkau RS',
    hint: 'Di luar radius 3 km',
    techHint: 'Overlay Difference (Area > 3 km)',
    color: '#fb7185',
  },
  nearest_hospital_link: {
    label: 'Jarak ke RS Terdekat',
    hint: 'Dari pusat tiap wilayah',
    techHint: 'Spatial Query ($geoNear)',
    color: '#f43f5e',
  },
  weighted_priority: {
    label: 'Rekomendasi Lokasi RS Baru',
    hint: 'Usulan prioritas di Rumbai',
    techHint: 'Weighted Overlay Prioritas',
    color: '#34d399',
  },
};

export const FACILITY_SYMBOL_META = {
  'Rumah Sakit': {
    color: '#ef4444',
    size: 32,
    short: 'RS',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#ef4444" stroke="#ffffff" stroke-width="2.5"/>
      <path d="M13.5 8.5h5v5h5v5h-5v5h-5v-5h-5v-5h5z" fill="#ffffff"/>
    </svg>`,
  },
  Klinik: {
    color: '#14b8a6',
    size: 22,
    short: 'KL',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#14b8a6" stroke="#ffffff" stroke-width="2"/>
      <path d="M10.5 6.5h3v4h4v3h-4v4h-3v-4h-4v-3h4z" fill="#ffffff"/>
    </svg>`,
  },
  Apotek: {
    color: '#22c55e',
    size: 20,
    short: 'AP',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="9" fill="#22c55e" stroke="#ffffff" stroke-width="2"/>
      <rect x="6.5" y="9" width="9" height="4" rx="2" fill="#ffffff" transform="rotate(-35 11 11)"/>
    </svg>`,
  },
  'Praktik Dokter': {
    color: '#6366f1',
    size: 20,
    short: 'DR',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <polygon points="11,2 20,11 11,20 2,11" fill="#6366f1" stroke="#ffffff" stroke-width="2"/>
      <circle cx="11" cy="11" r="3" fill="#ffffff"/>
    </svg>`,
  },
  'Instansi Kesehatan': {
    color: '#f59e0b',
    size: 22,
    short: 'IN',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <polygon points="11,2 20,8 17,19 5,19 2,8" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
      <circle cx="11" cy="11.5" r="2.8" fill="#ffffff"/>
    </svg>`,
  },
};

const iconStyleCache = new Map();

function getFacilityIconStyle(subType) {
  if (iconStyleCache.has(subType)) {
    return iconStyleCache.get(subType);
  }
  const meta = FACILITY_SYMBOL_META[subType] || FACILITY_SYMBOL_META['Instansi Kesehatan'];
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(meta.svg)}`;
  const style = new Style({
    image: new Icon({
      src,
      scale: subType === 'Rumah Sakit' ? 1 : 0.9,
      anchor: [0.5, 0.5],
    }),
  });
  iconStyleCache.set(subType, style);
  return style;
}

export function zoneStyleFunction(feature, resolution) {
  const accessClass = feature.get('accessClass') || 'Sedang';
  const palette = ACCESS_CLASS_COLORS[accessClass] || ACCESS_CLASS_COLORS.Sedang;
  const zoneCode = feature.get('zoneCode') || '';
  const zoneName = feature.get('zoneName') || '';
  const score = feature.get('score') ?? '';

  const showLabel = resolution < 85;

  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({ color: palette.stroke, width: 2.5 }),
    text: showLabel
      ? new Text({
          text: `${zoneCode} ${zoneName}\nSkor ${score} • ${accessClass}`,
          font: '700 12px "Plus Jakarta Sans", sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3.8 }),
          overflow: true,
        })
      : undefined,
  });
}

export function routeStyleFunction(feature, resolution) {
  const isInterZone = feature.get('isInterZone');
  const routeCode = feature.get('routeCode') || '';
  const lengthKm = feature.get('lengthKm');
  const showLabel = resolution < 60;
  const meta = ROUTE_COLOR_META[routeCode] || {
    color: isInterZone ? '#0ea5e9' : '#9333ea',
    text: isInterZone ? '#0369a1' : '#7e22ce',
    dashed: !isInterZone,
  };

  return [
    new Style({
      stroke: new Stroke({ color: '#ffffff', width: 6 }),
    }),
    new Style({
      stroke: new Stroke({
        color: meta.color,
        width: 3.5,
        lineDash: meta.dashed ? [9, 6] : undefined,
      }),
      text: showLabel
        ? new Text({
            text: meta.dashed
              ? `${routeCode} Dalam Rumbai (${lengthKm} km)`
              : `${routeCode} (${lengthKm} km)`,
            font: '700 11px "JetBrains Mono", monospace',
            placement: 'line',
            fill: new Fill({ color: meta.text }),
            stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
          })
        : undefined,
    }),
  ];
}

export function facilityStyleFunction(feature, resolution) {
  const subType = feature.get('facilitySubType') || 'Klinik';
  const baseStyle = getFacilityIconStyle(subType);
  const isHospital = Boolean(feature.get('isHospital'));
  const showLabel = isHospital ? resolution < 22 : resolution < 9;

  if (!showLabel) return baseStyle;

  return [
    baseStyle,
    new Style({
      text: new Text({
        text: feature.get('name') || '',
        offsetY: isHospital ? -22 : -17,
        font: `${isHospital ? '700' : '600'} 11px "Plus Jakarta Sans", sans-serif`,
        fill: new Fill({ color: isHospital ? '#991b1b' : '#1e293b' }),
        stroke: new Stroke({ color: 'rgba(255,255,255,0.96)', width: 3.2 }),
      }),
    }),
  ];
}

const recommendationStarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
  <circle cx="19" cy="19" r="17" fill="#10b981" stroke="#ffffff" stroke-width="3"/>
  <polygon points="19,6 22.7,14 31.3,15.1 25,21.1 26.6,29.6 19,25.5 11.4,29.6 13,21.1 6.7,15.1 15.3,14" fill="#fef08a"/>
</svg>`;
const recommendationStarSrc = `data:image/svg+xml;utf8,${encodeURIComponent(recommendationStarSvg)}`;

export function analysisStyleFunction(feature, resolution) {
  const analysisType = feature.get('analysisType');

  if (analysisType === 'buffer_rs') {
    const r = Number(feature.get('radiusKm') || 1);
    let fill = 'rgba(251, 191, 36, 0.14)';
    let stroke = '#f59e0b';
    let zIndex = 1;

    if (r <= 0.7) {
      fill = 'rgba(16, 185, 129, 0.24)';
      stroke = '#10b981';
      zIndex = 3;
    } else if (r <= 1.6) {
      fill = 'rgba(56, 189, 248, 0.18)';
      stroke = '#0ea5e9';
      zIndex = 2;
    }

    return new Style({
      fill: new Fill({ color: fill }),
      stroke: new Stroke({ color: stroke, width: 2, lineDash: [7, 5] }),
      zIndex,
    });
  }

  if (analysisType === 'overlay_gap') {
    return new Style({
      fill: new Fill({ color: 'rgba(244, 63, 94, 0.25)' }),
      stroke: new Stroke({ color: '#e11d48', width: 2.8, lineDash: [10, 5] }),
      text:
        resolution < 85
          ? new Text({
              text: `Belum Terjangkau RS (> 3 km)\n${feature.get('uncoveredPct')}% Area`,
              offsetY: 26,
              font: '800 11px "Plus Jakarta Sans", sans-serif',
              fill: new Fill({ color: '#9f1239' }),
              stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3.5 }),
              overflow: true,
            })
          : undefined,
      zIndex: 4,
    });
  }

  if (analysisType === 'nearest_hospital_link') {
    const distanceKm = feature.get('distanceKm');
    const zoneCode = feature.get('zoneCode') || '';
    const showLabel = resolution < 65;

    return [
      new Style({
        stroke: new Stroke({ color: 'rgba(255,255,255,0.94)', width: 5 }),
        zIndex: 5,
      }),
      new Style({
        stroke: new Stroke({ color: '#f43f5e', width: 2.7, lineDash: [8, 5] }),
        text: showLabel
          ? new Text({
              text: `${zoneCode} → RS: ${distanceKm} km`,
              placement: 'line',
              font: '700 11px "JetBrains Mono", monospace',
              fill: new Fill({ color: '#be123c' }),
              stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
            })
          : undefined,
        zIndex: 6,
      }),
    ];
  }

  if (analysisType === 'weighted_priority') {
    return new Style({
      image: new Icon({ src: recommendationStarSrc, scale: 1, anchor: [0.5, 0.5] }),
      text:
        resolution < 95
          ? new Text({
              text: `Usulan RS Baru Z1\nSkor ${feature.get('beforeScore')} (${feature.get('beforeClass')}) → ${feature.get('afterScore')} (${feature.get('afterClass')})`,
              offsetY: -30,
              font: '800 11px "Plus Jakarta Sans", sans-serif',
              fill: new Fill({ color: '#047857' }),
              stroke: new Stroke({ color: '#ffffff', width: 3.8 }),
            })
          : undefined,
      zIndex: 10,
    });
  }

  return undefined;
}
