import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  Polyline,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Activity,
  Bus as BusIcon,
  Maximize2,
  Minimize2,
  Navigation,
  TrainFront,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CorridorStation,
  MTC_ROUTES,
  MtcRouteDefinition,
  formatClockTime,
} from '../math/numericalMethods';
import { ChennaiCorridorGeoMap } from './ChennaiCorridorGeoMap';

export interface RealTimeGoogleMtcMapProps {
  activeRoute: MtcRouteDefinition;
  simTime: number;
  isLiveClock: boolean;
  liveIstLabel: string;
  headwayFn: (t: number) => number;
  targetHeadway: number;
  cvFactor: number;
  selectedBusId: number | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectBus: (busId: number) => void;
  onSelectRoute: (routeId: string) => void;
}

interface LiveGeoBus {
  id: number;
  code: string;
  fleetType: 'deluxe' | 'ordinary' | 'ac';
  progress: number;
  lat: number;
  lng: number;
  headingDeg: number;
  kmCovered: number;
  nextStation: CorridorStation;
  etaNextStationMin: number;
  localHeadwayMin: number;
}

const CHENNAI_CENTER: google.maps.LatLngLiteral = { lat: 13.032, lng: 80.175 };

function interpolateAlongPath(
  path: google.maps.LatLngLiteral[],
  progressRaw: number
): { lat: number; lng: number; headingDeg: number } {
  if (path.length === 0) {
    return { ...CHENNAI_CENTER, headingDeg: 0 };
  }
  if (path.length === 1) {
    return { ...path[0], headingDeg: 0 };
  }
  const p = Math.max(0, Math.min(1, progressRaw));
  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dLat = path[i + 1].lat - path[i].lat;
    const dLng = (path[i + 1].lng - path[i].lng) * Math.cos((path[i].lat * Math.PI) / 180);
    const len = Math.hypot(dLat, dLng);
    segLengths.push(len);
    totalLen += len;
  }

  let dist = p * totalLen;
  for (let i = 0; i < segLengths.length; i++) {
    if (dist <= segLengths[i] || i === segLengths.length - 1) {
      const f = segLengths[i] > 0 ? dist / segLengths[i] : 0;
      const a = path[i];
      const b = path[i + 1];
      const dLat = b.lat - a.lat;
      const dLng = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
      // Bearing clockwise from North (degrees)
      const headingDeg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
        headingDeg,
      };
    }
    dist -= segLengths[i];
  }
  return { ...path[0], headingDeg: 0 };
}

interface StationMarkerItemProps {
  station: CorridorStation;
  index: number;
  isMonitored: boolean;
  isTargetMet: boolean;
  nextEtaText: string;
  headwayMin: number;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const StationMarkerItem: React.FC<StationMarkerItemProps> = ({
  station,
  index,
  isMonitored,
  isTargetMet,
  nextEtaText,
  headwayMin,
  isOpen,
  onOpen,
  onClose,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const pinBg = isMonitored ? (isTargetMet ? '#059669' : '#D97706') : '#0F4C81';
  const pinBorder = isMonitored ? (isTargetMet ? '#065F46' : '#92400E') : '#0A3358';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: station.lat, lng: station.lng }}
        title={`${station.name} (${station.km.toFixed(1)} km)`}
        onClick={onOpen}
        zIndex={isMonitored ? 40 : 25}
      >
        <Pin
          background={pinBg}
          borderColor={pinBorder}
          glyphColor="#FFFFFF"
          glyphText={String(index + 1)}
          scale={isMonitored ? 1.15 : 0.92}
        />
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={230}>
          <div className="p-1 text-slate-900 space-y-1">
            <div className="text-xs font-bold leading-tight">
              {index + 1}. {station.name}
            </div>
            <div className="text-[11px] text-slate-600">
              {station.zone} · {station.km.toFixed(1)} km
            </div>
            <div className="pt-1 border-t border-slate-200 text-[11px] font-mono-tabular">
              <div>Next arrival: <span className="font-semibold text-slate-900">{nextEtaText}</span></div>
              <div>Headway h(t): <span className="font-semibold text-slate-900">{headwayMin.toFixed(2)} min</span></div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface BusMarkerItemProps {
  bus: LiveGeoBus;
  isSelected: boolean;
  onSelect: () => void;
}

const BusMarkerItem: React.FC<BusMarkerItemProps> = ({ bus, isSelected, onSelect }) => {
  const fill =
    bus.fleetType === 'ordinary'
      ? '#B91C1C'
      : bus.fleetType === 'ac'
      ? '#0284C7'
      : '#0F4C81';

  return (
    <AdvancedMarker
      position={{ lat: bus.lat, lng: bus.lng }}
      title={`MTC Coach ${bus.code} · Next: ${bus.nextStation.name}`}
      onClick={onSelect}
      anchorLeft="-50%"
      anchorTop="-50%"
      zIndex={isSelected ? 120 : 80}
    >
      <div className="relative flex flex-col items-center cursor-pointer select-none group">
        <div
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular font-bold leading-none mb-0.5 shadow-sm transition-transform ${
            isSelected
              ? 'bg-slate-900 text-white scale-110 ring-2 ring-sky-400'
              : 'bg-slate-900/90 text-white group-hover:scale-105'
          }`}
        >
          {bus.code}
        </div>
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow-md transition-transform ${
            isSelected ? 'scale-110 ring-2 ring-sky-400' : ''
          }`}
          style={{ backgroundColor: fill }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            style={{ transform: `rotate(${bus.headingDeg}deg)` }}
            aria-hidden="true"
          >
            <path
              d="M12 2L19 19L12 15.5L5 19L12 2Z"
              fill="#FFFFFF"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </AdvancedMarker>
  );
};

interface MapOverlayControllerProps {
  activeRoute: MtcRouteDefinition;
  roadPathsByRoute: Record<string, google.maps.LatLngLiteral[]>;
  focusActiveRoute: boolean;
  showTraffic: boolean;
  showTransit: boolean;
  onRoutePathResolved: (
    routeId: string,
    path: google.maps.LatLngLiteral[],
    meta: { distanceKm?: number; durationMin?: number }
  ) => void;
}

const MapOverlayController: React.FC<MapOverlayControllerProps> = ({
  activeRoute,
  roadPathsByRoute,
  focusActiveRoute,
  showTraffic,
  showTransit,
  onRoutePathResolved,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const pendingRef = useRef<Record<string, boolean>>({});
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const transitLayerRef = useRef<google.maps.TransitLayer | null>(null);

  // Toggle Traffic & Transit native layers
  useEffect(() => {
    if (!map) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(map);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }
    return () => {
      trafficLayerRef.current?.setMap(null);
    };
  }, [map, showTraffic]);

  useEffect(() => {
    if (!map) return;
    if (showTransit) {
      if (!transitLayerRef.current) {
        transitLayerRef.current = new google.maps.TransitLayer();
      }
      transitLayerRef.current.setMap(map);
    } else if (transitLayerRef.current) {
      transitLayerRef.current.setMap(null);
    }
    return () => {
      transitLayerRef.current?.setMap(null);
    };
  }, [map, showTransit]);

  // Compute road-following path using modern Routes API JS SDK (Route.computeRoutes)
  useEffect(() => {
    if (!routesLib || !map) return;
    if (roadPathsByRoute[activeRoute.id] || pendingRef.current[activeRoute.id]) return;

    pendingRef.current[activeRoute.id] = true;
    const stations = activeRoute.stations;
    if (stations.length < 2) return;

    const request: google.maps.routes.ComputeRoutesRequest = {
      origin: { lat: stations[0].lat, lng: stations[0].lng },
      destination: {
        lat: stations[stations.length - 1].lat,
        lng: stations[stations.length - 1].lng,
      },
      intermediates: stations.slice(1, -1).map((st) => ({
        location: { lat: st.lat, lng: st.lng },
        vehicleStopover: true,
      })),
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    };

    routesLib.Route.computeRoutes(request)
      .then((res) => {
        const primary = res.routes?.[0];
        if (primary?.path && primary.path.length >= 2) {
          const coords = primary.path.map((pt) => ({
            lat: pt.lat,
            lng: pt.lng,
          }));
          const distanceKm = primary.distanceMeters
            ? primary.distanceMeters / 1000
            : undefined;
          const durationMin = primary.durationMillis
            ? primary.durationMillis / 60000
            : undefined;
          onRoutePathResolved(activeRoute.id, coords, { distanceKm, durationMin });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      });
  }, [routesLib, map, activeRoute, roadPathsByRoute, onRoutePathResolved]);

  // Adjust map bounds smoothly when switching route or Metro vs Route Zoom
  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    if (focusActiveRoute) {
      activeRoute.stations.forEach((st) => bounds.extend({ lat: st.lat, lng: st.lng }));
    } else {
      MTC_ROUTES.forEach((r) =>
        r.stations.forEach((st) => bounds.extend({ lat: st.lat, lng: st.lng }))
      );
    }
    map.fitBounds(bounds, { top: 44, right: 32, bottom: 44, left: 32 });
  }, [map, activeRoute, focusActiveRoute]);

  return null;
};

const RealTimeMapCanvas: React.FC<
  RealTimeGoogleMtcMapProps & { onFallbackToVector: () => void }
> = ({
  activeRoute,
  simTime,
  isLiveClock,
  liveIstLabel,
  headwayFn,
  targetHeadway,
  cvFactor,
  selectedBusId,
  isExpanded,
  onToggleExpand,
  onSelectBus,
  onSelectRoute,
  onFallbackToVector,
}) => {
  const apiStatus = useApiLoadingStatus();
  const [focusActiveRoute, setFocusActiveRoute] = useState<boolean>(true);
  const [showTraffic, setShowTraffic] = useState<boolean>(true);
  const [showTransit, setShowTransit] = useState<boolean>(false);
  const [openStationId, setOpenStationId] = useState<string | null>(null);
  const [roadPathsByRoute, setRoadPathsByRoute] = useState<
    Record<string, google.maps.LatLngLiteral[]>
  >({});
  const [routeMetaByRoute, setRouteMetaByRoute] = useState<
    Record<string, { distanceKm?: number; durationMin?: number }>
  >({});

  useEffect(() => {
    if (
      apiStatus === APILoadingStatus.FAILED ||
      apiStatus === APILoadingStatus.AUTH_FAILURE
    ) {
      onFallbackToVector();
    }
  }, [apiStatus, onFallbackToVector]);

  const handleRoutePathResolved = (
    routeId: string,
    path: google.maps.LatLngLiteral[],
    meta: { distanceKm?: number; durationMin?: number }
  ) => {
    setRoadPathsByRoute((prev) => ({ ...prev, [routeId]: path }));
    setRouteMetaByRoute((prev) => ({ ...prev, [routeId]: meta }));
  };

  const activePolylinePath = useMemo(() => {
    const roadPath = roadPathsByRoute[activeRoute.id];
    if (roadPath && roadPath.length >= 2) return roadPath;
    return activeRoute.stations.map((st) => ({ lat: st.lat, lng: st.lng }));
  }, [roadPathsByRoute, activeRoute]);

  const simMin = simTime * 60;
  const currentHeadway = Math.max(1.5, headwayFn(simTime));
  const isTargetMet = currentHeadway <= targetHeadway;

  const schedule = useMemo(() => {
    const items: {
      id: number;
      code: string;
      fleetType: 'deluxe' | 'ordinary' | 'ac';
      dispatchMin: number;
      localHeadwayMin: number;
    }[] = [];
    const preDispatches = [-35.65, -25.65, -15.65, -5.65];
    const fleetCycle: ('deluxe' | 'ordinary' | 'ac')[] = [
      'deluxe',
      'ordinary',
      'deluxe',
      'ac',
    ];

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
  }, [activeRoute.id, headwayFn, cvFactor]);

  const liveBuses = useMemo<LiveGeoBus[]>(() => {
    return schedule
      .filter(
        (s) =>
          simMin >= s.dispatchMin &&
          simMin <= s.dispatchMin + activeRoute.corridorDurationMin
      )
      .map((s) => {
        const progress =
          (simMin - s.dispatchMin) / activeRoute.corridorDurationMin;
        const pos = interpolateAlongPath(activePolylinePath, progress);
        const stopCount = activeRoute.stations.length;
        const nextIdx = Math.min(
          stopCount - 1,
          Math.ceil(progress * (stopCount - 1))
        );
        const nextFrac = nextIdx / (stopCount - 1);
        const etaNextStationMin = Math.max(
          0,
          (nextFrac - progress) * activeRoute.corridorDurationMin
        );
        return {
          id: s.id,
          code: s.code,
          fleetType: s.fleetType,
          progress,
          lat: pos.lat,
          lng: pos.lng,
          headingDeg: pos.headingDeg,
          kmCovered: progress * activeRoute.corridorLengthKm,
          nextStation: activeRoute.stations[nextIdx],
          etaNextStationMin,
          localHeadwayMin: s.localHeadwayMin,
        };
      });
  }, [schedule, simMin, activeRoute, activePolylinePath]);

  const getStationNextEta = (stationIdx: number) => {
    const frac = stationIdx / (activeRoute.stations.length - 1);
    const offsetMin = frac * activeRoute.corridorDurationMin;
    const nextArrival = schedule.find((s) => s.dispatchMin + offsetMin >= simMin);
    if (!nextArrival) return 'End of window';
    const eta = Math.max(0, nextArrival.dispatchMin + offsetMin - simMin);
    return `${nextArrival.code} in ${eta.toFixed(1)} min`;
  };

  const selectedBus =
    liveBuses.find((b) => b.id === selectedBusId) || liveBuses[0] || null;
  const routeMeta = routeMetaByRoute[activeRoute.id];

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-[#0F4C81] shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900">
            Real-Time Google Map · Chennai MTC
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTraffic((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showTraffic
                ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Traffic</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTransit((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showTransit
                ? 'bg-[#0F4C81] text-white border-[#0F4C81]'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <TrainFront className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Transit</span>
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

          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Restore split map layout' : 'Expand real-time map'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Map Canvas with explicit CSS height (CF2) */}
      <div className="p-4 bg-slate-50/30 flex-1 flex flex-col justify-between gap-3">
        <div
          className={`relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-100 ${
            isExpanded ? 'h-[480px] sm:h-[520px]' : 'h-[360px] sm:h-[400px]'
          }`}
        >
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={CHENNAI_CENTER}
            defaultZoom={12}
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <MapOverlayController
              activeRoute={activeRoute}
              roadPathsByRoute={roadPathsByRoute}
              focusActiveRoute={focusActiveRoute}
              showTraffic={showTraffic}
              showTransit={showTransit}
              onRoutePathResolved={handleRoutePathResolved}
            />

            {/* Secondary Reference MTC Routes (Clickable to switch) */}
            {MTC_ROUTES.filter((r) => r.id !== activeRoute.id).map((other) => (
              <Polyline
                key={`other-${other.id}`}
                path={
                  roadPathsByRoute[other.id] ||
                  other.stations.map((st) => ({ lat: st.lat, lng: st.lng }))
                }
                strokeColor="#64748B"
                strokeOpacity={0.45}
                strokeWeight={3}
                onClick={() => onSelectRoute(other.id)}
              />
            ))}

            {/* Active Corridor Road Polyline (casing + core) */}
            <Polyline
              path={activePolylinePath}
              strokeColor="#FFFFFF"
              strokeOpacity={0.95}
              strokeWeight={8}
              zIndex={10}
            />
            <Polyline
              path={activePolylinePath}
              strokeColor={isTargetMet ? '#0F4C81' : '#D97706'}
              strokeOpacity={0.95}
              strokeWeight={5}
              zIndex={15}
            />

            {/* Station AdvancedMarkers */}
            {activeRoute.stations.map((station, idx) => (
              <StationMarkerItem
                key={`${activeRoute.id}-${station.id}`}
                station={station}
                index={idx}
                isMonitored={idx === activeRoute.monitoredStationIndex}
                isTargetMet={isTargetMet}
                nextEtaText={getStationNextEta(idx)}
                headwayMin={currentHeadway}
                isOpen={openStationId === station.id}
                onOpen={() => setOpenStationId(station.id)}
                onClose={() => setOpenStationId(null)}
              />
            ))}

            {/* Live Moving MTC Buses */}
            {liveBuses.map((bus) => (
              <BusMarkerItem
                key={bus.id}
                bus={bus}
                isSelected={selectedBus?.id === bus.id}
                onSelect={() => onSelectBus(bus.id)}
              />
            ))}
          </GoogleMap>
        </div>

        {/* Live Telemetry & Selected Coach Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <BusIcon className="w-3.5 h-3.5 text-[#0F4C81] shrink-0" aria-hidden="true" />
            {selectedBus ? (
              <span className="truncate">
                Coach <strong className="font-mono-tabular text-slate-900">{selectedBus.code}</strong> · Next:{' '}
                <strong className="text-slate-900">{selectedBus.nextStation.name}</strong>{' '}
                <span className="font-mono-tabular">({selectedBus.etaNextStationMin.toFixed(1)} min)</span>
              </span>
            ) : (
              <span>{activeRoute.label}</span>
            )}
          </div>

          <div className="font-mono-tabular text-slate-500 shrink-0">
            {routeMeta?.distanceKm
              ? `${routeMeta.distanceKm.toFixed(1)} km road`
              : `${activeRoute.corridorLengthKm.toFixed(1)} km corridor`}{' '}
            · {liveBuses.length} live ·{' '}
            {isLiveClock ? `${liveIstLabel} IST` : formatClockTime(simTime)}
          </div>
        </div>
      </div>
    </section>
  );
};

export const RealTimeGoogleMtcMap: React.FC<RealTimeGoogleMtcMapProps> = (props) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [useFallbackVector, setUseFallbackVector] = useState<boolean>(false);

  if (!apiKey || apiKey === 'MY_GOOGLE_MAPS_API_KEY' || useFallbackVector) {
    return (
      <ChennaiCorridorGeoMap
        activeRoute={props.activeRoute}
        simTime={props.simTime}
        headwayFn={props.headwayFn}
        targetHeadway={props.targetHeadway}
        cvFactor={props.cvFactor}
        selectedBusId={props.selectedBusId}
        onSelectBus={props.onSelectBus}
        onSelectRoute={props.onSelectRoute}
      />
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={['marker', 'routes']}
      language="en"
      region="IN"
      onError={() => setUseFallbackVector(true)}
    >
      <RealTimeMapCanvas
        {...props}
        onFallbackToVector={() => setUseFallbackVector(true)}
      />
    </APIProvider>
  );
};
