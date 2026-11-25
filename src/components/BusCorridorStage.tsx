import React, { useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  Target,
  CheckCircle2,
  AlertTriangle,
  Bus as BusIcon,
  Users,
} from 'lucide-react';
import { MTC_ROUTES, formatClockTime } from '../math/numericalMethods';

export interface BusCorridorStageProps {
  simTime: number; // 0 to 4 hours
  isPlaying: boolean;
  isLiveClock: boolean;
  liveIstLabel: string;
  speedMultiplier: number;
  selectedRouteId: string;
  selectedBusId: number | null;
  headwayFn: (t: number) => number;
  targetHeadway: number;
  targetRootTime: number | null;
  cvFactor: number;
  onSelectRoute: (routeId: string) => void;
  onSelectBus: (busId: number) => void;
  onTogglePlay: () => void;
  onToggleLiveClock: () => void;
  onReset: () => void;
  onScrubTime: (t: number) => void;
  onChangeSpeed: (speed: number) => void;
  onJumpToTarget: () => void;
}

interface BusScheduleItem {
  id: number;
  code: string;
  fleetType: 'deluxe' | 'ordinary' | 'ac';
  dispatchMin: number;
  localHeadwayMin: number;
}

interface StreetBusState {
  id: number;
  code: string;
  fleetType: 'deluxe' | 'ordinary' | 'ac';
  x: number;
  y: number;
  wheelAngleDeg: number;
  isBraking: boolean;
  isDwelling: boolean;
  speedKmh: number;
  deltaFromShelterMin: number;
  localHeadwayMin: number;
  gapAheadMin: number | null;
  occupancyPct: number;
}

const CORRIDOR_DURATION_MIN = 36; // Full 5-stop corridor travel time
const SHELTER_STOP_FRAC = 0.25; // Stop 2 on the corridor is our monitored shelter
const VIEW_WINDOW_HALF_MIN = 0.65; // +/- 0.65 min (~39s at 1x) visible street block
const DWELL_MIN = 0.20; // 12-second real-time dwell stop at shelter

// Maps time relative to shelter arrival (in min) to X coordinate (0..820) with smooth braking dwell
function mapDeltaToStreetX(deltaMin: number): {
  x: number;
  isBraking: boolean;
  isDwelling: boolean;
  speedKmh: number;
} {
  const shelterX = 410;
  // Dwell window [0, DWELL_MIN] -> bus stays smoothly parked at shelterX
  if (deltaMin >= 0 && deltaMin <= DWELL_MIN) {
    return { x: shelterX, isBraking: true, isDwelling: true, speedKmh: 0 };
  }

  const effectiveDelta = deltaMin > DWELL_MIN ? deltaMin - DWELL_MIN : deltaMin;
  // Smooth braking/acceleration transition within +/- 0.16 min (~9.6 sec) of shelter
  const absD = Math.abs(effectiveDelta);
  let xOffset = 0;
  let speedKmh = 38;
  let isBraking = false;

  if (absD < 0.16) {
    const s = absD / 0.16; // 0..1
    const eased = s * s * (1.8 - 0.8 * s);
    xOffset = Math.sign(effectiveDelta) * eased * 86;
    speedKmh = Math.round(38 * Math.min(1, s * 1.15));
    isBraking = effectiveDelta < 0;
  } else {
    const rest = absD - 0.16;
    const pixelsPerMin = (485 - 86) / (VIEW_WINDOW_HALF_MIN - 0.16);
    xOffset = Math.sign(effectiveDelta) * (86 + rest * pixelsPerMin);
    speedKmh = 38;
  }

  return {
    x: shelterX + xOffset,
    isBraking,
    isDwelling: false,
    speedKmh,
  };
}

export const BusCorridorStage: React.FC<BusCorridorStageProps> = ({
  simTime,
  isPlaying,
  isLiveClock,
  liveIstLabel,
  speedMultiplier,
  selectedRouteId,
  selectedBusId,
  headwayFn,
  targetHeadway,
  targetRootTime,
  cvFactor,
  onSelectRoute,
  onSelectBus,
  onTogglePlay,
  onToggleLiveClock,
  onReset,
  onScrubTime,
  onChangeSpeed,
  onJumpToTarget,
}) => {
  const activeRoute = MTC_ROUTES.find((r) => r.id === selectedRouteId) || MTC_ROUTES[0];
  const shelterStopName = activeRoute.stations[activeRoute.monitoredStationIndex].name;

  // Build deterministic MTC bus dispatch schedule aligned so Bus #4 arrives ~21s into 7:03 AM
  const schedule = useMemo<BusScheduleItem[]>(() => {
    const items: BusScheduleItem[] = [];
    const preDispatches = [-35.65, -25.65, -15.65, -5.65];
    const fleetCycle: ('deluxe' | 'ordinary' | 'ac')[] = ['deluxe', 'ordinary', 'deluxe', 'ac'];

    preDispatches.forEach((m, idx) => {
      items.push({
        id: idx + 1,
        code: `${activeRoute.id}-${String(idx + 1).padStart(2, '0')}`,
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
        code: `${activeRoute.id}-${String(busIndex).padStart(2, '0')}`,
        fleetType: fleetCycle[(busIndex - 1) % fleetCycle.length],
        dispatchMin: currentMin,
        localHeadwayMin: baseH,
      });

      currentMin += perturbedH;
      busIndex += 1;
    }
    return items;
  }, [headwayFn, cvFactor, activeRoute.id]);

  const simMin = simTime * 60;
  const currentHeadway = Math.max(1.5, headwayFn(simTime));
  const currentWait = (currentHeadway / 2) * (1 + cvFactor * cvFactor);
  const isTargetMet = currentHeadway <= targetHeadway;

  const shelterArrivalOffsetMin = SHELTER_STOP_FRAC * CORRIDOR_DURATION_MIN;

  // Compute buses visible on the animated street canvas
  const streetBuses = useMemo<StreetBusState[]>(() => {
    const visible: StreetBusState[] = [];
    for (let i = 0; i < schedule.length; i++) {
      const item = schedule[i];
      const shelterTargetMin = item.dispatchMin + shelterArrivalOffsetMin;
      const deltaFromShelter = simMin - shelterTargetMin;

      if (deltaFromShelter >= -VIEW_WINDOW_HALF_MIN - 0.15 && deltaFromShelter <= VIEW_WINDOW_HALF_MIN + DWELL_MIN + 0.15) {
        const mapped = mapDeltaToStreetX(deltaFromShelter);
        if (mapped.x >= -120 && mapped.x <= 940) {
          const prevBus = i > 0 ? schedule[i - 1] : null;
          const gapAheadMin = prevBus ? item.dispatchMin - prevBus.dispatchMin : null;
          const occupancyPct = Math.min(
            98,
            Math.round(40 + (item.localHeadwayMin / 12) * 44 + (item.id % 3) * 4)
          );

          visible.push({
            id: item.id,
            code: item.code,
            fleetType: item.fleetType,
            x: mapped.x,
            y: 198,
            wheelAngleDeg: (mapped.x * 5.2) % 360,
            isBraking: mapped.isBraking,
            isDwelling: mapped.isDwelling,
            speedKmh: mapped.speedKmh,
            deltaFromShelterMin: deltaFromShelter,
            localHeadwayMin: item.localHeadwayMin,
            gapAheadMin,
            occupancyPct,
          });
        }
      }
    }
    return visible.sort((a, b) => a.x - b.x);
  }, [schedule, simMin, shelterArrivalOffsetMin]);

  // Count active coaches currently on the corridor
  const activeCorridorCount = useMemo(() => {
    return schedule.filter(
      (s) => simMin >= s.dispatchMin && simMin <= s.dispatchMin + CORRIDOR_DURATION_MIN
    ).length;
  }, [schedule, simMin]);

  // Shelter queue & next MTC bus ETA
  const shelterMetrics = useMemo(() => {
    const arrivals = schedule.map((s) => s.dispatchMin + shelterArrivalOffsetMin);
    let lastArr = arrivals[0] ?? 0;
    let nextArr = arrivals[arrivals.length - 1] ?? 10;

    for (const arr of arrivals) {
      if (arr <= simMin) {
        lastArr = arr;
      } else {
        nextArr = arr;
        break;
      }
    }

    const elapsedSinceBus = Math.max(0, simMin - lastArr);
    const etaNextBus = Math.max(0, nextArr - simMin);
    const isBoarding = streetBuses.some((b) => b.isDwelling);
    const waitingPassengers = isBoarding
      ? Math.max(0, Math.floor(elapsedSinceBus * 0.4))
      : Math.min(14, Math.max(1, Math.floor(elapsedSinceBus * 1.35)));

    return {
      elapsedSinceBus,
      etaNextBus,
      isBoarding,
      waitingPassengers,
    };
  }, [schedule, simMin, shelterArrivalOffsetMin, streetBuses]);

  const selectedBus =
    streetBuses.find((b) => b.id === selectedBusId) ||
    streetBuses[streetBuses.length - 1] ||
    null;

  const targetMarkerPct =
    targetRootTime !== null ? Math.max(0, Math.min(100, (targetRootTime / 4) * 100)) : null;

  // Format ETA as MM:SS for true real-time digital shelter board
  const etaTotalSec = Math.max(0, Math.round(shelterMetrics.etaNextBus * 60));
  const etaMm = String(Math.floor(etaTotalSec / 60)).padStart(2, '0');
  const etaSs = String(etaTotalSec % 60).padStart(2, '0');

  // Sky tint shifting softly from 7 AM morning warmth to 11 AM daylight
  const skyTop = simTime < 1.0 ? '#BAE6FD' : simTime < 2.5 ? '#93C5FD' : '#BAE6FD';
  const skyBottom = simTime < 1.0 ? '#FEF3C7' : '#F0F9FF';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Stage Top Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="mtc-route-select" className="sr-only">
            Select MTC Chennai Route
          </label>
          <select
            id="mtc-route-select"
            value={selectedRouteId}
            onChange={(e) => onSelectRoute(e.target.value)}
            className="text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#0F4C81] cursor-pointer"
          >
            {MTC_ROUTES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>

          <span className="text-xs text-slate-500">
            {activeCorridorCount} MTC Buses En Route · Headway {currentHeadway.toFixed(2)} min
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {isTargetMet ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span className="text-emerald-700">
                  Target Met (h ≤ {targetHeadway.toFixed(1)} min)
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                <span className="text-amber-700">
                  Above Target (h &gt; {targetHeadway.toFixed(1)} min)
                </span>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <div className="font-mono-tabular text-sm font-semibold text-slate-900">
            {isLiveClock ? `${liveIstLabel} IST` : formatClockTime(simTime)}
          </div>
        </div>
      </div>

      {/* Real-Time Moving MTC Bus Street Animation Canvas */}
      <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
        <div className="relative w-full bg-white border border-slate-200 rounded-lg overflow-hidden">
          <svg
            viewBox="0 0 820 285"
            className="w-full h-auto block select-none"
            role="img"
            aria-label="Real-time Chennai MTC moving bus animation along street corridor"
          >
            <defs>
              <linearGradient id="chennaiSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={skyTop} stopOpacity="0.65" />
                <stop offset="100%" stopColor={skyBottom} stopOpacity="0.45" />
              </linearGradient>
            </defs>

            {/* Daylight Sky Backdrop */}
            <rect width="820" height="190" fill="url(#chennaiSky)" />

            {/* Subtle Chennai Urban Skyline Silhouette */}
            <g fill="#CBD5E1" fillOpacity="0.45">
              <rect x="28" y="112" width="38" height="78" />
              <rect x="74" y="96" width="28" height="94" />
              <rect x="114" y="122" width="46" height="68" />
              <rect x="195" y="102" width="42" height="88" />
              <rect x="255" y="118" width="32" height="72" />
              <rect x="530" y="106" width="44" height="84" />
              <rect x="586" y="92" width="34" height="98" />
              <rect x="640" y="116" width="52" height="74" />
              <rect x="712" y="100" width="38" height="90" />
              <rect x="762" y="124" width="40" height="66" />
            </g>

            {/* Roadside Trees & Streetlight Poles */}
            {[90, 260, 560, 730].map((px, i) => (
              <g key={i} transform={`translate(${px}, 190)`}>
                {/* Streetlight */}
                <line x1="0" y1="0" x2="0" y2="-66" stroke="#64748B" strokeWidth="2.5" />
                <path d="M 0 -66 Q 10 -70 18 -64" fill="none" stroke="#64748B" strokeWidth="2" />
                <ellipse cx="18" cy="-63" rx="4" ry="2" fill="#FEF08A" />
                {/* Tree beside pole */}
                <rect x="26" y="-26" width="4" height="26" fill="#78350F" fillOpacity="0.55" />
                <circle cx="28" cy="-34" r="14" fill="#15803D" fillOpacity="0.32" />
              </g>
            ))}

            {/* MTC Chennai Bus Stop Shelter (Center Stop: activeRoute.stops[1]) */}
            <g transform="translate(342, 114)">
              {/* Shelter Roof & Pillars */}
              <rect x="0" y="0" width="146" height="9" rx="2" fill="#0F4C81" />
              <rect x="6" y="9" width="4" height="67" fill="#475569" />
              <rect x="136" y="9" width="4" height="67" fill="#475569" />
              {/* Shelter Back Glass */}
              <rect x="10" y="12" width="126" height="46" fill="#E2E8F0" fillOpacity="0.65" stroke="#CBD5E1" strokeWidth="1" />

              {/* MTC Bus Stop Signboard */}
              <rect x="14" y="-18" width="118" height="18" rx="3" fill="#0F4C81" />
              <text x="73" y="-6" textAnchor="middle" className="fill-white text-[9px] font-semibold tracking-wide">
                MTC STOP · {shelterStopName.toUpperCase()}
              </text>

              {/* Digital Live ETA Display inside Shelter */}
              <rect x="18" y="18" width="110" height="20" rx="2" fill="#0F172A" />
              <text x="73" y="31" textAnchor="middle" className="fill-amber-300 text-[9.5px] font-mono-tabular font-semibold">
                {shelterMetrics.isBoarding
                  ? 'BOARDING NOW'
                  : `NEXT MTC: ${etaMm}:${etaSs}`}
              </text>

              {/* Shelter Bench */}
              <rect x="22" y="54" width="102" height="5" rx="1" fill="#64748B" />
              <rect x="28" y="59" width="4" height="15" fill="#475569" />
              <rect x="114" y="59" width="4" height="15" fill="#475569" />

              {/* Animated Waiting Commuters Standing at Shelter */}
              {Array.from({ length: Math.min(8, shelterMetrics.waitingPassengers) }).map((_, pIdx) => {
                const px = 18 + pIdx * 14;
                const shirtColors = ['#0284C7', '#D97706', '#059669', '#475569', '#B45309'];
                return (
                  <g key={pIdx} transform={`translate(${px}, 46)`}>
                    <circle cx="4" cy="4" r="3.2" fill="#334155" />
                    <rect
                      x="1"
                      y="8"
                      width="6"
                      height="13"
                      rx="2"
                      fill={shirtColors[pIdx % shirtColors.length]}
                    />
                    <rect x="1.5" y="21" width="2" height="9" fill="#1E293B" />
                    <rect x="4.5" y="21" width="2" height="9" fill="#1E293B" />
                  </g>
                );
              })}
            </g>

            {/* Sidewalk / Pavement Curb */}
            <rect x="0" y="186" width="820" height="12" fill="#E2E8F0" />
            <line x1="0" y1="186" x2="820" y2="186" stroke="#CBD5E1" strokeWidth="1" />

            {/* Chennai Arterial Roadway */}
            <rect x="0" y="198" width="820" height="72" fill="#334155" />
            <line x1="0" y1="198" x2="820" y2="198" stroke="#94A3B8" strokeWidth="2" />
            <line x1="0" y1="270" x2="820" y2="270" stroke="#1E293B" strokeWidth="2" />

            {/* Bus Bay Yellow Markings at Shelter */}
            <rect x="335" y="201" width="160" height="4" fill="#FACC15" fillOpacity="0.85" />
            <text x="415" y="216" textAnchor="middle" className="fill-amber-300/70 text-[8px] font-mono-tabular font-semibold tracking-widest">
              MTC BUS BAY
            </text>

            {/* Stationary Painted Center Road Lane Divider */}
            <line
              x1="0"
              y1="234"
              x2="820"
              y2="234"
              stroke="#F8FAFC"
              strokeOpacity="0.65"
              strokeWidth="2.5"
              strokeDasharray="24 24"
            />

            {/* Grass / Median Strip at Bottom */}
            <rect x="0" y="270" width="820" height="15" fill="#1E293B" />

            {/* Moving MTC Chennai Buses (Side-Profile Detailed Coaches) */}
            {streetBuses.map((bus) => {
              const isSelected = selectedBus?.id === bus.id;
              // Iconic Chennai MTC Liveries:
              // Deluxe = Royal Blue & White; Ordinary = MTC Crimson Red & Cream; AC = Pearl White & Teal
              const upperColor =
                bus.fleetType === 'ordinary'
                  ? '#FFFBEB'
                  : bus.fleetType === 'ac'
                  ? '#F8FAFC'
                  : '#F8FAFC';
              const lowerBodyColor =
                bus.fleetType === 'ordinary'
                  ? '#B91C1C' // Iconic MTC Red
                  : bus.fleetType === 'ac'
                  ? '#0284C7' // MTC AC Blue-Teal
                  : '#0F4C81'; // MTC Deluxe Blue
              const stripeColor =
                bus.fleetType === 'ordinary'
                  ? '#F59E0B'
                  : bus.fleetType === 'ac'
                  ? '#10B981'
                  : '#38BDF8';

              return (
                <g
                  key={bus.id}
                  transform={`translate(${bus.x - 68}, ${bus.y - 26})`}
                  onClick={() => onSelectBus(bus.id)}
                  className="cursor-pointer"
                >
                  {/* Selection Highlight Outline */}
                  {isSelected && (
                    <rect
                      x="-5"
                      y="-5"
                      width="146"
                      height="64"
                      rx="8"
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                  )}

                  {/* Ground Shadow under Bus */}
                  <ellipse cx="68" cy="53" rx="64" ry="5" fill="#0F172A" fillOpacity="0.45" />

                  {/* Headlight Cone Beam */}
                  <polygon
                    points="135,34 190,22 190,50 135,44"
                    fill="#FEF08A"
                    fillOpacity="0.28"
                  />

                  {/* Roof AC / Ventilation Pod */}
                  <rect x="34" y="-4" width="46" height="5" rx="2" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="0.8" />

                  {/* Upper Bus Coach Frame */}
                  <rect
                    x="0"
                    y="0"
                    width="136"
                    height="46"
                    rx="6"
                    fill={upperColor}
                    stroke="#334155"
                    strokeWidth="1.2"
                  />

                  {/* Lower Livery Skirt */}
                  <path
                    d="M 0 24 L 136 24 L 136 40 Q 136 46 130 46 L 6 46 Q 0 46 0 40 Z"
                    fill={lowerBodyColor}
                  />

                  {/* Signature MTC Accent Stripe */}
                  <rect x="0" y="21" width="136" height="3.5" fill={stripeColor} />

                  {/* Passenger Windows Row */}
                  {[8, 28, 48, 68, 88].map((wx, wIdx) => (
                    <g key={wIdx}>
                      <rect
                        x={wx}
                        y="6"
                        width="16"
                        height="13"
                        rx="2"
                        fill="#1E293B"
                        stroke="#64748B"
                        strokeWidth="0.8"
                      />
                      {/* Window reflection */}
                      <line x1={wx + 2} y1="8" x2={wx + 6} y2="17" stroke="#94A3B8" strokeOpacity="0.4" strokeWidth="1" />
                    </g>
                  ))}

                  {/* Front Windshield & Driver Cab */}
                  <path
                    d="M 118 5 L 132 5 Q 135 5 135 9 L 135 20 L 118 20 Z"
                    fill="#0F172A"
                  />

                  {/* Front Destination LED Matrix (Route Number) */}
                  <rect x="111" y="1" width="22" height="5.5" rx="1" fill="#0F172A" />
                  <text x="122" y="5.2" textAnchor="middle" className="fill-amber-400 text-[4.8px] font-mono-tabular font-bold">
                    MTC {activeRoute.id}
                  </text>

                  {/* Side Door Bay (Opens visually when dwelling at shelter) */}
                  <rect
                    x="108"
                    y="23"
                    width="9"
                    height="22"
                    rx="1"
                    fill={bus.isDwelling ? '#FDE68A' : '#0F172A'}
                    stroke="#E2E8F0"
                    strokeWidth="0.8"
                  />

                  {/* Side MTC Chennai Branding & Bus Code */}
                  <text x="10" y="37" className="fill-white text-[8px] font-bold tracking-wide">
                    MTC CHENNAI
                  </text>
                  <text x="98" y="37" textAnchor="end" className="fill-white/90 text-[7.5px] font-mono-tabular">
                    {bus.code}
                  </text>

                  {/* Front Headlight & Rear Brake Light */}
                  <rect x="132" y="35" width="4" height="5" rx="1" fill="#FEF08A" />
                  <rect
                    x="-1"
                    y="34"
                    width="3"
                    height="6"
                    rx="1"
                    fill={bus.isBraking ? '#EF4444' : '#991B1B'}
                  />

                  {/* Rear & Front Rotating Wheels */}
                  {[28, 108].map((wheelX, wIdx) => (
                    <g key={wIdx} transform={`translate(${wheelX}, 46)`}>
                      {/* Wheel Arch */}
                      <circle r="10.5" fill="#0F172A" />
                      {/* Tire */}
                      <circle r="8.5" fill="#1E293B" stroke="#475569" strokeWidth="1" />
                      {/* Rotating Rim & Spokes */}
                      <g transform={`rotate(${bus.wheelAngleDeg})`}>
                        <circle r="4.5" fill="#CBD5E1" />
                        <line x1="-4.5" y1="0" x2="4.5" y2="0" stroke="#334155" strokeWidth="1.2" />
                        <line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="#334155" strokeWidth="1.2" />
                        <circle r="1.5" fill="#0F172A" />
                      </g>
                    </g>
                  ))}

                  {/* Live Speed / Status Tag Above Coach */}
                  <text
                    x="68"
                    y="-10"
                    textAnchor="middle"
                    className="fill-slate-800 text-[9px] font-mono-tabular font-semibold"
                  >
                    {bus.isDwelling ? `${bus.code} · Boarding` : `${bus.code} · ${bus.speedKmh} km/h`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom Platform Queue & Selected Coach Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <Users className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {shelterStopName} Shelter Queue
                </div>
                <div className="text-xs text-slate-500 font-mono-tabular">
                  Wait elapsed: {shelterMetrics.elapsedSinceBus.toFixed(1)} min · Next MTC: {shelterMetrics.etaNextBus.toFixed(1)} min
                </div>
              </div>
            </div>
            <div className="text-xs font-mono-tabular font-semibold text-slate-900 shrink-0">
              {shelterMetrics.waitingPassengers} pax
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <BusIcon className="w-4 h-4 text-[#0F4C81] shrink-0" aria-hidden="true" />
              {selectedBus ? (
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    MTC {selectedBus.code} ({selectedBus.fleetType.toUpperCase()})
                  </div>
                  <div className="text-xs text-slate-500 font-mono-tabular">
                    Speed {selectedBus.speedKmh} km/h · Lead gap{' '}
                    {selectedBus.gapAheadMin !== null ? `${selectedBus.gapAheadMin.toFixed(1)} min` : '—'}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">Click any MTC bus on screen to inspect</div>
              )}
            </div>
            {selectedBus && (
              <div className="text-right shrink-0">
                <div className="text-xs font-mono-tabular font-semibold text-slate-900">
                  {selectedBus.occupancyPct}% load
                </div>
                <div className="text-[11px] text-slate-500">Chennai MTC</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transport Playback Controls & Scrubber */}
      <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex flex-col gap-3">
        <div className="relative pt-1">
          <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-500 mb-1.5">
            <span>7:00 AM (0.0 h)</span>
            <span>8:00 AM (1.0 h)</span>
            <span>9:00 AM (2.0 h)</span>
            <span>10:00 AM (3.0 h)</span>
            <span>11:00 AM (4.0 h)</span>
          </div>
          <div className="relative flex items-center">
            {targetMarkerPct !== null && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-600 pointer-events-none z-10"
                style={{ left: `${targetMarkerPct}%` }}
                title={`Target time t* = ${targetRootTime?.toFixed(4)} h`}
              />
            )}
            <input
              type="range"
              min={0}
              max={4}
              step={0.005}
              value={simTime}
              onChange={(e) => onScrubTime(parseFloat(e.target.value))}
              aria-label="Simulation timeline from 7 AM to 11 AM"
              className="transit-slider w-full"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleLiveClock}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                isLiveClock
                  ? 'bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Sync simulation clock 1:1 to current real-world IST time"
            >
              <span>{isLiveClock ? 'Live IST Active' : 'Sync Live IST'}</span>
            </button>

            <button
              type="button"
              disabled={isLiveClock}
              onClick={onTogglePlay}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F4C81] hover:bg-[#0C3B66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onScrubTime(Math.max(0, simTime - 0.25))}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" aria-hidden="true" />
              <span>-15m</span>
            </button>

            <button
              type="button"
              onClick={() => onScrubTime(Math.min(4, simTime + 0.25))}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
              <span>+15m</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>

            {targetRootTime !== null && (
              <button
                type="button"
                onClick={onJumpToTarget}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Target className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Jump to t* ({formatClockTime(targetRootTime, false)})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">Pace</span>
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
              {[
                { spd: 1, label: '1x Real-Time' },
                { spd: 5, label: '5x' },
                { spd: 15, label: '15x' },
                { spd: 60, label: '60x' },
              ].map((item) => (
                <button
                  key={item.spd}
                  type="button"
                  disabled={isLiveClock}
                  onClick={() => onChangeSpeed(item.spd)}
                  className={`px-2.5 py-1 text-xs font-mono-tabular font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    speedMultiplier === item.spd && !isLiveClock
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
