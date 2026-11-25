import React, { useMemo, useState } from 'react';
import { MapPin, Navigation, Bus as BusIcon } from 'lucide-react';
import {
  CorridorStation,
  MtcRouteDefinition,
  formatClockTime,
} from '../math/numericalMethods';

export interface SchematicCorridorMapProps {
  route: MtcRouteDefinition;
  simTime: number; // 0..4 hours
  headwayFn: (t: number) => number;
  targetHeadway: number;
  cvFactor: number;
  selectedBusId: number | null;
  onSelectBus: (busId: number) => void;
}

interface SchematicBusMarker {
  id: number;
  code: string;
  fleetType: 'deluxe' | 'ordinary' | 'ac';
  progress: number;
  kmCovered: number;
  x: number;
  y: number;
  angleDeg: number;
  nextStation: CorridorStation;
  etaNextStationMin: number;
  localHeadwayMin: number;
}

// 5-node angled schematic transit geometry inside 900x250 SVG
const SCHEMATIC_NODES: { x: number; y: number; labelSide: 'top' | 'bottom' }[] = [
  { x: 76, y: 155, labelSide: 'top' },
  { x: 268, y: 155, labelSide: 'bottom' },
  { x: 452, y: 92, labelSide: 'top' },
  { x: 644, y: 155, labelSide: 'bottom' },
  { x: 824, y: 92, labelSide: 'top' },
];

function interpolateSchematicPoint(progressRaw: number): {
  x: number;
  y: number;
  angleDeg: number;
} {
  const p = Math.max(0, Math.min(1, progressRaw));
  // Compute cumulative segment lengths
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < SCHEMATIC_NODES.length - 1; i++) {
    const dx = SCHEMATIC_NODES[i + 1].x - SCHEMATIC_NODES[i].x;
    const dy = SCHEMATIC_NODES[i + 1].y - SCHEMATIC_NODES[i].y;
    const len = Math.hypot(dx, dy);
    segLengths.push(len);
    totalLen += len;
  }

  let targetDist = p * totalLen;
  for (let i = 0; i < segLengths.length; i++) {
    if (targetDist <= segLengths[i] || i === segLengths.length - 1) {
      const localT = segLengths[i] > 0 ? targetDist / segLengths[i] : 0;
      const a = SCHEMATIC_NODES[i];
      const b = SCHEMATIC_NODES[i + 1];
      const x = a.x + (b.x - a.x) * localT;
      const y = a.y + (b.y - a.y) * localT;
      const angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return { x, y, angleDeg };
    }
    targetDist -= segLengths[i];
  }
  return { x: SCHEMATIC_NODES[0].x, y: SCHEMATIC_NODES[0].y, angleDeg: 0 };
}

function lerpHex(hexA: string, hexB: string, tRaw: number): string {
  const t = Math.max(0, Math.min(1, tRaw));
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
}

function getHeadwayGradientColor(headwayMin: number, targetMin: number): string {
  const excess = headwayMin - targetMin;
  if (excess <= 0) {
    // Within target: Emerald (#059669) -> Sky (#0284C7) as it approaches target
    const t = Math.max(0, Math.min(1, (excess + 1.2) / 1.2));
    return lerpHex('#059669', '#0284C7', t);
  }
  if (excess <= 1.2) {
    // Moderately exceeding target: Amber (#F59E0B) -> Orange (#EA580C)
    return lerpHex('#F59E0B', '#EA580C', excess / 1.2);
  }
  // Severely exceeding target: Orange (#EA580C) -> Crimson (#DC2626)
  return lerpHex('#EA580C', '#DC2626', Math.min(1, (excess - 1.2) / 1.8));
}

export const SchematicCorridorMap: React.FC<SchematicCorridorMapProps> = ({
  route,
  simTime,
  headwayFn,
  targetHeadway,
  cvFactor,
  selectedBusId,
  onSelectBus,
}) => {
  const [selectedStationIdx, setSelectedStationIdx] = useState<number>(
    route.monitoredStationIndex
  );
  const [showHeadwayGradient, setShowHeadwayGradient] = useState<boolean>(true);

  const simMin = simTime * 60;
  const currentHeadway = Math.max(1.5, headwayFn(simTime));
  const isTargetMet = currentHeadway <= targetHeadway;

  // Deterministic bus dispatches matching BusCorridorStage
  const schedule = useMemo(() => {
    const items: {
      id: number;
      code: string;
      fleetType: 'deluxe' | 'ordinary' | 'ac';
      dispatchMin: number;
      localHeadwayMin: number;
    }[] = [];
    const preDispatches = [-35.65, -25.65, -15.65, -5.65];
    const fleetCycle: ('deluxe' | 'ordinary' | 'ac')[] = ['deluxe', 'ordinary', 'deluxe', 'ac'];

    preDispatches.forEach((m, idx) => {
      items.push({
        id: idx + 1,
        code: `${route.id}-${String(idx + 1).padStart(2, '0')}`,
        fleetType: fleetCycle[idx % fleetCycle.length],
        dispatchMin: m,
        localHeadwayMin: Math.max(2, headwayFn(0)),
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
        code: `${route.id}-${String(busIndex).padStart(2, '0')}`,
        fleetType: fleetCycle[(busIndex - 1) % fleetCycle.length],
        dispatchMin: currentMin,
        localHeadwayMin: baseH,
      });

      currentMin += perturbedH;
      busIndex += 1;
    }
    return items;
  }, [headwayFn, cvFactor, route.id]);

  // Active buses mapped along the schematic route polyline based on simTime
  const activeBuses = useMemo<SchematicBusMarker[]>(() => {
    return schedule
      .filter(
        (s) =>
          simMin >= s.dispatchMin &&
          simMin <= s.dispatchMin + route.corridorDurationMin
      )
      .map((s) => {
        const progress = (simMin - s.dispatchMin) / route.corridorDurationMin;
        const pos = interpolateSchematicPoint(progress);
        const stopCount = route.stations.length;
        const nextIdx = Math.min(
          stopCount - 1,
          Math.ceil(progress * (stopCount - 1))
        );
        const nextFrac = nextIdx / (stopCount - 1);
        const etaNextStationMin = Math.max(
          0,
          (nextFrac - progress) * route.corridorDurationMin
        );
        return {
          id: s.id,
          code: s.code,
          fleetType: s.fleetType,
          progress,
          kmCovered: progress * route.corridorLengthKm,
          x: pos.x,
          y: pos.y,
          angleDeg: pos.angleDeg,
          nextStation: route.stations[nextIdx],
          etaNextStationMin,
          localHeadwayMin: s.localHeadwayMin,
        };
      });
  }, [schedule, simMin, route]);

  // Station arrival ETA at the selected station
  const safeStationIdx = Math.min(selectedStationIdx, route.stations.length - 1);
  const activeStation = route.stations[safeStationIdx];
  const stationFrac = safeStationIdx / (route.stations.length - 1);
  const stationOffsetMin = stationFrac * route.corridorDurationMin;

  const stationArrivalInfo = useMemo(() => {
    const arrivals = schedule.map((s) => ({
      code: s.code,
      arrivalMin: s.dispatchMin + stationOffsetMin,
    }));
    const upcoming = arrivals.find((a) => a.arrivalMin >= simMin);
    const previous = [...arrivals].reverse().find((a) => a.arrivalMin <= simMin);
    return {
      nextCode: upcoming?.code ?? '—',
      etaMin: upcoming ? Math.max(0, upcoming.arrivalMin - simMin) : null,
      sinceLastMin: previous ? Math.max(0, simMin - previous.arrivalMin) : null,
    };
  }, [schedule, stationOffsetMin, simMin]);

  const highlightedBus =
    activeBuses.find((b) => b.id === selectedBusId) || activeBuses[0] || null;

  const routePathD = SCHEMATIC_NODES.map(
    (pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`
  ).join(' ');

  // Secondary layer: per-segment headway gradient evaluation against targetHeadway
  const segmentLayers = useMemo(() => {
    const segCount = SCHEMATIC_NODES.length - 1;
    const corridorHours = route.corridorDurationMin / 60;

    return Array.from({ length: segCount }).map((_, idx) => {
      const a = SCHEMATIC_NODES[idx];
      const b = SCHEMATIC_NODES[idx + 1];
      const uStart = idx / segCount;
      const uEnd = (idx + 1) / segCount;

      const evalHeadwayAtU = (u: number) => {
        const dispatchT = Math.max(0, simTime - u * corridorHours);
        return Math.max(1.5, headwayFn(dispatchT) * (1 + cvFactor * 0.45));
      };

      const stops = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((localF) => {
        const u = uStart + (uEnd - uStart) * localF;
        const hVal = evalHeadwayAtU(u);
        return {
          offset: `${Math.round(localF * 100)}%`,
          color: getHeadwayGradientColor(hVal, targetHeadway),
          headway: hVal,
        };
      });

      const uMid = (uStart + uEnd) / 2;
      const midHeadway = evalHeadwayAtU(uMid);
      const excess = midHeadway - targetHeadway;
      const maxSegHeadway = Math.max(...stops.map((s) => s.headway));

      // Place segment label perpendicular/clear of the diagonal line
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const labelYOffset = idx === 0 ? -16 : idx === 2 ? -18 : 22;

      return {
        idx,
        id: `seg-headway-grad-${idx}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        midX,
        midY: midY + labelYOffset,
        midHeadway,
        excess,
        exceedsTarget: maxSegHeadway > targetHeadway,
        stops,
      };
    });
  }, [route.corridorDurationMin, simTime, headwayFn, cvFactor, targetHeadway]);

  const exceedingSegmentCount = segmentLayers.filter((s) => s.exceedsTarget).length;

  return (
    <section
      id="corridor-map"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-[#0F4C81] shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900">
            Schematic Transit Corridor Map
          </h2>
          <span className="text-xs text-slate-500">
            {route.label} · {route.corridorLengthKm.toFixed(1)} km · {activeBuses.length} Coaches Live
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowHeadwayGradient((v) => !v)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showHeadwayGradient
                ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {showHeadwayGradient ? 'Headway Gradient: On' : 'Headway Gradient: Off'}
          </button>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <span className="font-mono-tabular font-semibold text-slate-900">
            simTime = {simTime.toFixed(3)} h ({formatClockTime(simTime)})
          </span>
        </div>
      </div>

      {/* Schematic SVG Map */}
      <div className="p-4 sm:p-5 bg-slate-50/30">
        {showHeadwayGradient && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <span>Threshold Gradient Layer (Target ≤ {targetHeadway.toFixed(1)} min):</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {exceedingSegmentCount} / {segmentLayers.length} segments exceeding
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] font-mono-tabular text-slate-600">
              <span>≤ Target</span>
              <span
                className="w-28 h-2.5 rounded-full inline-block border border-slate-200"
                style={{
                  background: 'linear-gradient(90deg, #059669 0%, #0284C7 35%, #F59E0B 60%, #EA580C 80%, #DC2626 100%)',
                }}
              />
              <span>+2.0m+ Excess</span>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <svg
            viewBox="0 0 900 245"
            className="w-full h-auto block select-none"
            role="img"
            aria-label="Schematic transit corridor map showing station markers, headway gradient layer, and live bus positions"
          >
            <defs>
              <pattern id="mapGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#F1F5F9" strokeWidth="1" />
              </pattern>
              {segmentLayers.map((seg) => (
                <linearGradient
                  key={seg.id}
                  id={seg.id}
                  gradientUnits="userSpaceOnUse"
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                >
                  {seg.stops.map((st, sIdx) => (
                    <stop key={sIdx} offset={st.offset} stopColor={st.color} />
                  ))}
                </linearGradient>
              ))}
            </defs>

            {/* Schematic Grid Background */}
            <rect width="900" height="245" fill="url(#mapGrid)" />

            {/* Subtle Zone Guides */}
            <text x="20" y="24" className="fill-slate-400 text-[10px] font-mono-tabular">
              SCHEMATIC ROUTE TOPOLOGY · {route.corridorLengthKm.toFixed(1)} KM CORRIDOR
            </text>
            <text x="880" y="24" textAnchor="end" className="fill-slate-400 text-[10px] font-mono-tabular">
              {isTargetMet ? 'SERVICE TARGET MET' : 'HEADWAY ABOVE TARGET'}
            </text>

            {/* Base Corridor Casing */}
            <path
              d={routePathD}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Secondary Layer: Color Gradient Segments Highlighting Headway vs Target */}
            {showHeadwayGradient ? (
              <g>
                {segmentLayers.map((seg) => (
                  <g key={seg.id}>
                    {/* Soft glow halo stronger where headway exceeds target */}
                    <line
                      x1={seg.x1}
                      y1={seg.y1}
                      x2={seg.x2}
                      y2={seg.y2}
                      stroke={`url(#${seg.id})`}
                      strokeWidth={seg.exceedsTarget ? 22 : 14}
                      strokeOpacity={seg.exceedsTarget ? 0.34 : 0.16}
                      strokeLinecap="round"
                    />
                    {/* Core color-gradient segment track */}
                    <line
                      x1={seg.x1}
                      y1={seg.y1}
                      x2={seg.x2}
                      y2={seg.y2}
                      stroke={`url(#${seg.id})`}
                      strokeWidth="8"
                      strokeLinecap="round"
                    />
                  </g>
                ))}
              </g>
            ) : (
              <path
                d={routePathD}
                fill="none"
                stroke="#0F4C81"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Centerline dashes */}
            <path
              d={routePathD}
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity="0.5"
              strokeWidth="1.4"
              strokeDasharray="8 8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Per-Segment Numeric Headway Delta Callouts (Dual-coded text + color) */}
            {showHeadwayGradient &&
              segmentLayers.map((seg) => (
                <g key={`lbl-${seg.idx}`} transform={`translate(${seg.midX}, ${seg.midY})`}>
                  <rect
                    x="-34"
                    y="-9"
                    width="68"
                    height="17"
                    rx="4"
                    fill="#FFFFFF"
                    fillOpacity="0.92"
                    stroke={seg.exceedsTarget ? '#F59E0B' : '#CBD5E1'}
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    className={`text-[9px] font-mono-tabular font-semibold ${
                      seg.exceedsTarget ? 'fill-red-700' : 'fill-emerald-700'
                    }`}
                  >
                    {seg.excess > 0
                      ? `+${seg.excess.toFixed(1)}m (${seg.midHeadway.toFixed(1)}m)`
                      : `OK (${seg.midHeadway.toFixed(1)}m)`}
                  </text>
                </g>
              ))}

            {/* Bus Station Markers */}
            {route.stations.map((station, idx) => {
              const pt = SCHEMATIC_NODES[idx];
              const isSelectedStation = idx === safeStationIdx;
              const isMonitored = idx === route.monitoredStationIndex;
              const labelOffset = pt.labelSide === 'top' ? -24 : 28;
              const subOffset = pt.labelSide === 'top' ? -38 : 42;

              return (
                <g
                  key={station.id}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  onClick={() => setSelectedStationIdx(idx)}
                  className="cursor-pointer"
                >
                  {/* Selection Ring */}
                  {isSelectedStation && (
                    <circle
                      r="16"
                      fill="none"
                      stroke="#0284C7"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Station Outer Ring */}
                  <circle
                    r={isMonitored ? 10.5 : 8.5}
                    fill="#FFFFFF"
                    stroke={
                      isMonitored
                        ? isTargetMet
                          ? '#059669'
                          : '#D97706'
                        : '#0F4C81'
                    }
                    strokeWidth="3.5"
                  />

                  {/* Station Inner Dot */}
                  <circle
                    r="3.2"
                    fill={
                      isMonitored
                        ? isTargetMet
                          ? '#059669'
                          : '#D97706'
                        : '#0F4C81'
                    }
                  />

                  {/* Station Name & KM Distance */}
                  <text
                    y={labelOffset}
                    textAnchor="middle"
                    className={`text-[12px] font-semibold ${
                      isSelectedStation ? 'fill-[#0F4C81]' : 'fill-slate-900'
                    }`}
                  >
                    {station.name}
                  </text>
                  <text
                    y={subOffset}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-mono-tabular"
                  >
                    {station.km.toFixed(1)} km · {station.zone}
                  </text>
                </g>
              );
            })}

            {/* Dynamic Moving Bus Markers Along Route */}
            {activeBuses.map((bus) => {
              const isSelected = highlightedBus?.id === bus.id;
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
                    <circle
                      r="18"
                      fill="#38BDF8"
                      fillOpacity="0.18"
                      stroke="#0284C7"
                      strokeWidth="1.5"
                    />
                  )}

                  {/* Directional Rotated Bus Capsule */}
                  <g transform={`rotate(${bus.angleDeg})`}>
                    <rect
                      x="-13"
                      y="-7.5"
                      width="26"
                      height="15"
                      rx="4"
                      fill={fill}
                      stroke="#FFFFFF"
                      strokeWidth="1.8"
                    />
                    {/* Front Windshield */}
                    <rect x="7" y="-5" width="4" height="10" rx="1" fill="#E0F2FE" />
                    {/* Directional Nose Chevron */}
                    <path d="M 15 -3 L 19 0 L 15 3" fill="none" stroke={fill} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </g>

                  {/* Upright Code Label */}
                  <rect
                    x="-19"
                    y="-24"
                    width="38"
                    height="13"
                    rx="3"
                    fill="#0F172A"
                    fillOpacity="0.88"
                  />
                  <text
                    x="0"
                    y="-15"
                    textAnchor="middle"
                    className="fill-white text-[8.5px] font-mono-tabular font-semibold pointer-events-none"
                  >
                    {bus.code}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Interactive Station & Active Coach Inspection Strip */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <MapPin className="w-4 h-4 text-[#0F4C81] shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  Station: {activeStation.name} ({activeStation.km.toFixed(1)} km)
                </div>
                <div className="text-xs text-slate-500 font-mono-tabular">
                  {activeStation.coordLabel} · {activeStation.zone}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-mono-tabular font-semibold text-slate-900">
                {stationArrivalInfo.etaMin !== null
                  ? `Next ${stationArrivalInfo.nextCode} in ${stationArrivalInfo.etaMin.toFixed(1)} min`
                  : 'End of window'}
              </div>
              <div className="text-[11px] font-mono-tabular text-slate-500">
                {stationArrivalInfo.sinceLastMin !== null
                  ? `Last coach ${stationArrivalInfo.sinceLastMin.toFixed(1)} min ago`
                  : 'First dispatch'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <Navigation className="w-4 h-4 text-[#0284C7] shrink-0" aria-hidden="true" />
              {highlightedBus ? (
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    Coach {highlightedBus.code} · {(highlightedBus.progress * 100).toFixed(1)}% along route
                  </div>
                  <div className="text-xs text-slate-500 font-mono-tabular">
                    {highlightedBus.kmCovered.toFixed(2)} / {route.corridorLengthKm.toFixed(1)} km · Next: {highlightedBus.nextStation.name}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <BusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Select a coach marker on the map</span>
                </div>
              )}
            </div>
            {highlightedBus && (
              <div className="text-right shrink-0">
                <div className="text-xs font-mono-tabular font-semibold text-slate-900">
                  ETA {highlightedBus.etaNextStationMin.toFixed(1)} min
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-500">
                  h ≈ {highlightedBus.localHeadwayMin.toFixed(2)} min
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
