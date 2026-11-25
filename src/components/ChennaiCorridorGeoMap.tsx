import React, { useMemo, useState } from 'react';
import { Compass, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import {
  MTC_ROUTES,
  MtcRouteDefinition,
  formatClockTime,
} from '../math/numericalMethods';

export interface ChennaiCorridorGeoMapProps {
  activeRoute: MtcRouteDefinition;
  simTime: number;
  headwayFn: (t: number) => number;
  targetHeadway: number;
  cvFactor: number;
  selectedBusId: number | null;
  onSelectBus: (busId: number) => void;
  onSelectRoute: (routeId: string) => void;
}

// Chennai Bounding Box covering 570 (West SIMATS), 27B (Central), 102 (OMR South)
const FULL_BOUNDS = {
  minLat: 12.77,
  maxLat: 13.115,
  minLng: 79.99,
  maxLng: 80.325,
};

const SVG_W = 580;
const SVG_H = 360;

// Coastline points along Bay of Bengal (Chennai East Coast)
const BAY_OF_BENGAL_COAST: [number, number][] = [
  [13.12, 80.296],
  [13.095, 80.294],
  [13.068, 80.289],
  [13.040, 80.281],
  [13.012, 80.277],
  [12.985, 80.268],
  [12.950, 80.261],
  [12.905, 80.252],
  [12.845, 80.246],
  [12.765, 80.242],
];

const ADYAR_RIVER: [number, number][] = [
  [13.010, 79.995],
  [13.015, 80.085],
  [13.018, 80.165],
  [13.014, 80.220],
  [13.012, 80.277],
];

const COOUM_RIVER: [number, number][] = [
  [13.072, 79.995],
  [13.074, 80.110],
  [13.073, 80.195],
  [13.071, 80.255],
  [13.068, 80.289],
];

export const ChennaiCorridorGeoMap: React.FC<ChennaiCorridorGeoMapProps> = ({
  activeRoute,
  simTime,
  headwayFn,
  targetHeadway,
  cvFactor,
  selectedBusId,
  onSelectBus,
  onSelectRoute,
}) => {
  const [focusActiveRoute, setFocusActiveRoute] = useState<boolean>(true);
  const [showOtherRoutes, setShowOtherRoutes] = useState<boolean>(true);

  // Compute map viewport bounds (full Chennai metro vs zoomed onto active corridor)
  const bounds = useMemo(() => {
    if (!focusActiveRoute) return FULL_BOUNDS;
    const lats = activeRoute.stations.map((s) => s.lat);
    const lngs = activeRoute.stations.map((s) => s.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(0.055, maxLat - minLat);
    const lngSpan = Math.max(0.085, maxLng - minLng);
    const padLat = latSpan * 0.28;
    const padLng = lngSpan * 0.24;
    return {
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
      minLng: minLng - padLng,
      maxLng: maxLng + padLng,
    };
  }, [focusActiveRoute, activeRoute]);

  const project = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * SVG_W;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * SVG_H;
    return { x, y };
  };

  const coastPolygon = useMemo(() => {
    const pts = BAY_OF_BENGAL_COAST.map(([lat, lng]) => {
      const p = project(lat, lng);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });
    pts.push(`${SVG_W + 40},${SVG_H + 40}`, `${SVG_W + 40},-40`);
    return pts.join(' ');
  }, [bounds]);

  const adyarLine = useMemo(
    () =>
      ADYAR_RIVER.map(([lat, lng]) => {
        const p = project(lat, lng);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }).join(' '),
    [bounds]
  );

  const cooumLine = useMemo(
    () =>
      COOUM_RIVER.map(([lat, lng]) => {
        const p = project(lat, lng);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }).join(' '),
    [bounds]
  );

  // Project active route polyline & calculate live bus positions along real lat/lng path
  const activePts = useMemo(
    () => activeRoute.stations.map((s) => project(s.lat, s.lng)),
    [activeRoute, bounds]
  );

  const interpolateGeoPoint = (progressRaw: number) => {
    const p = Math.max(0, Math.min(1, progressRaw));
    const segLengths: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < activePts.length - 1; i++) {
      const len = Math.hypot(activePts[i + 1].x - activePts[i].x, activePts[i + 1].y - activePts[i].y);
      segLengths.push(len);
      totalLen += len;
    }
    let dist = p * totalLen;
    for (let i = 0; i < segLengths.length; i++) {
      if (dist <= segLengths[i] || i === segLengths.length - 1) {
        const f = segLengths[i] > 0 ? dist / segLengths[i] : 0;
        const a = activePts[i];
        const b = activePts[i + 1];
        return {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        };
      }
      dist -= segLengths[i];
    }
    return { x: activePts[0].x, y: activePts[0].y, angleDeg: 0 };
  };

  const simMin = simTime * 60;
  const currentHeadway = Math.max(1.5, headwayFn(simTime));
  const isTargetMet = currentHeadway <= targetHeadway;

  const activeBuses = useMemo(() => {
    const items: {
      id: number;
      code: string;
      fleetType: 'deluxe' | 'ordinary' | 'ac';
      dispatchMin: number;
    }[] = [];
    const preDispatches = [-35.65, -25.65, -15.65, -5.65];
    const fleetCycle: ('deluxe' | 'ordinary' | 'ac')[] = ['deluxe', 'ordinary', 'deluxe', 'ac'];

    preDispatches.forEach((m, idx) => {
      items.push({
        id: idx + 1,
        code: `${activeRoute.id}-${String(idx + 1).padStart(2, '0')}`,
        fleetType: fleetCycle[idx % fleetCycle.length],
        dispatchMin: m,
      });
    });

    let currentMin = 4.35;
    let busIndex = preDispatches.length + 1;
    while (currentMin <= 265) {
      const tHours = Math.max(0, Math.min(4, currentMin / 60));
      const baseH = Math.max(2.0, Math.min(25.0, headwayFn(tHours)));
      const sign = busIndex % 2 === 0 ? 1 : -1;
      const perturbedH = Math.max(1.5, baseH * (1 + sign * cvFactor * 0.85));
      items.push({
        id: busIndex,
        code: `${activeRoute.id}-${String(busIndex).padStart(2, '0')}`,
        fleetType: fleetCycle[(busIndex - 1) % fleetCycle.length],
        dispatchMin: currentMin,
      });
      currentMin += perturbedH;
      busIndex += 1;
    }

    return items
      .filter(
        (s) =>
          simMin >= s.dispatchMin &&
          simMin <= s.dispatchMin + activeRoute.corridorDurationMin
      )
      .map((s) => {
        const progress = (simMin - s.dispatchMin) / activeRoute.corridorDurationMin;
        const pos = interpolateGeoPoint(progress);
        return {
          ...s,
          progress,
          x: pos.x,
          y: pos.y,
          angleDeg: pos.angleDeg,
        };
      });
  }, [activeRoute, simMin, headwayFn, cvFactor, bounds]);

  // Graticule lines
  const latTicks = [12.80, 12.90, 13.00, 13.05, 13.10].filter(
    (lat) => lat >= bounds.minLat && lat <= bounds.maxLat
  );
  const lngTicks = [80.00, 80.10, 80.20, 80.25, 80.30].filter(
    (lng) => lng >= bounds.minLng && lng <= bounds.maxLng
  );

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#0F4C81] shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900">
            Chennai GIS Route Map
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowOtherRoutes((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showOtherRoutes
                ? 'bg-white text-slate-800 border-slate-300'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>All Routes</span>
          </button>

          <button
            type="button"
            onClick={() => setFocusActiveRoute((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {focusActiveRoute ? (
              <>
                <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Metro View</span>
              </>
            ) : (
              <>
                <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Zoom Route</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Cartographic Map Viewport */}
      <div className="p-4 bg-slate-50/30 flex-1 flex flex-col justify-between gap-3">
        <div className="relative bg-[#F8FAFC] border border-slate-200 rounded-lg overflow-hidden">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full h-auto block select-none"
            role="img"
            aria-label="Geographic map of Chennai MTC transit corridor"
          >
            {/* Landmass Base */}
            <rect width={SVG_W} height={SVG_H} fill="#F8FAFC" />

            {/* Bay of Bengal Water Polygon */}
            <polygon points={coastPolygon} fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1.5" />

            {/* Lat / Lng Cartographic Graticule */}
            {latTicks.map((lat) => {
              const y = project(lat, bounds.minLng).y;
              return (
                <g key={lat}>
                  <line x1={0} y1={y} x2={SVG_W} y2={y} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />
                  <text x={8} y={y - 4} className="fill-slate-400 text-[9px] font-mono-tabular">
                    {lat.toFixed(2)}°N
                  </text>
                </g>
              );
            })}
            {lngTicks.map((lng) => {
              const x = project(bounds.minLat, lng).x;
              return (
                <g key={lng}>
                  <line x1={x} y1={0} x2={x} y2={SVG_H} stroke="#E2E8F0" strokeWidth="0.8" strokeDasharray="3 3" />
                  <text x={x + 4} y={SVG_H - 8} className="fill-slate-400 text-[9px] font-mono-tabular">
                    {lng.toFixed(2)}°E
                  </text>
                </g>
              );
            })}

            {/* Cooum & Adyar Rivers */}
            <polyline fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" points={cooumLine} />
            <polyline fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" points={adyarLine} />

            {/* Bay of Bengal Label */}
            <text
              x={SVG_W - 22}
              y={SVG_H * 0.48}
              textAnchor="end"
              className="fill-sky-700/60 text-[10px] font-semibold tracking-widest"
            >
              BAY OF BENGAL
            </text>

            {/* Secondary Reference MTC Routes (Clickable to switch!) */}
            {showOtherRoutes &&
              MTC_ROUTES.filter((r) => r.id !== activeRoute.id).map((other) => {
                const pts = other.stations
                  .map((s) => {
                    const p = project(s.lat, s.lng);
                    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <g
                    key={other.id}
                    onClick={() => onSelectRoute(other.id)}
                    className="cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <polyline
                      fill="none"
                      stroke="#94A3B8"
                      strokeWidth="2.5"
                      strokeDasharray="5 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pts}
                    />
                    {other.stations.map((st) => {
                      const p = project(st.lat, st.lng);
                      return <circle key={st.id} cx={p.x} cy={p.y} r="2.5" fill="#64748B" />;
                    })}
                  </g>
                );
              })}

            {/* Active Corridor Polyline */}
            <polyline
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={activePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            />
            <polyline
              fill="none"
              stroke={isTargetMet ? '#0F4C81' : '#D97706'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={activePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            />

            {/* Active Route Station Pins */}
            {activeRoute.stations.map((st, idx) => {
              const p = activePts[idx];
              const isMonitored = idx === activeRoute.monitoredStationIndex;
              const alignEnd = p.x > SVG_W * 0.72;
              const labelX = alignEnd ? -10 : 10;
              const anchor = alignEnd ? 'end' : 'start';
              const labelY = idx % 2 === 0 ? -8 : 14;

              return (
                <g key={st.id} transform={`translate(${p.x}, ${p.y})`}>
                  <circle
                    r={isMonitored ? 6.5 : 4.8}
                    fill="#FFFFFF"
                    stroke={isMonitored ? (isTargetMet ? '#059669' : '#D97706') : '#0F4C81'}
                    strokeWidth="2.5"
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor={anchor}
                    className="fill-slate-900 text-[10.5px] font-semibold"
                    style={{ paintOrder: 'stroke', stroke: '#F8FAFC', strokeWidth: 3 }}
                  >
                    {st.name}
                  </text>
                </g>
              );
            })}

            {/* Live Moving MTC Buses on Geographic Map */}
            {activeBuses.map((bus) => {
              const isSelected = bus.id === selectedBusId;
              const fill =
                bus.fleetType === 'ordinary'
                  ? '#B91C1C'
                  : bus.fleetType === 'ac'
                  ? '#0284C7'
                  : '#0F4C81';
              return (
                <g
                  key={bus.id}
                  transform={`translate(${bus.x}, ${bus.y})`}
                  onClick={() => onSelectBus(bus.id)}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle r="13" fill="#38BDF8" fillOpacity="0.22" stroke="#0284C7" strokeWidth="1.5" />
                  )}
                  <g transform={`rotate(${bus.angleDeg})`}>
                    <rect
                      x="-9"
                      y="-5"
                      width="18"
                      height="10"
                      rx="3"
                      fill={fill}
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                    <rect x="4" y="-3.2" width="3" height="6.4" rx="0.8" fill="#E0F2FE" />
                  </g>
                  <text
                    y="-11"
                    textAnchor="middle"
                    className="fill-slate-900 text-[8.5px] font-mono-tabular font-semibold"
                    style={{ paintOrder: 'stroke', stroke: '#FFFFFF', strokeWidth: 2.5 }}
                  >
                    {bus.code}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Map Legend & Geo Context */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
          <span>
            Active: <strong className="text-slate-800">{activeRoute.label}</strong>
          </span>
          <span className="font-mono-tabular">
            {activeBuses.length} live coaches · {formatClockTime(simTime)}
          </span>
        </div>
      </div>
    </section>
  );
};
