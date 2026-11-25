import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { motion } from 'motion/react';
import {
  InterpolationMethodId,
  MTC_ROUTES,
  OBSERVATION_PRESETS,
  OBSERVATION_TIMES,
  ObservationPresetId,
  buildCubicSpline,
  buildDividedDifferenceTable,
  evaluateCubicSpline,
  evaluateCubicSplineDerivative,
  evaluateNewtonDerivative,
  evaluateNewtonPolynomial,
  exactAverageWait,
  exactHeadway,
  exactHeadwayDerivative,
  exactTargetRoot,
  formatClockTime,
  integrateSimpsonsOneThird,
  solveNewtonRaphson,
  solveSecant,
} from './math/numericalMethods';
import { BusCorridorStage } from './components/BusCorridorStage';
import { SimulationControlDeck } from './components/SimulationControlDeck';
import { SchematicCorridorMap } from './components/SchematicCorridorMap';
import { RealTimeGoogleMtcMap } from './components/RealTimeGoogleMtcMap';
import { AnimatedMetricValue } from './components/AnimatedMetricValue';
import { InterpolationWorkbench } from './components/InterpolationWorkbench';
import { IntegrationWorkbench } from './components/IntegrationWorkbench';
import { RootFindingWorkbench } from './components/RootFindingWorkbench';
import { DatasetProvenancePanel } from './components/DatasetProvenancePanel';
import { StandardsReference } from './components/StandardsReference';

type WorkbenchTab = 'interpolation' | 'integration' | 'root_finding' | 'dataset' | 'standards';

export default function App() {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [presetId, setPresetId] = useState<ObservationPresetId>('pdf_rounded');
  const [observations, setObservations] = useState<number[]>(OBSERVATION_PRESETS.pdf_rounded.headways);
  const [activeModelId, setActiveModelId] = useState<InterpolationMethodId>('exact');
  const [targetHeadway, setTargetHeadway] = useState<number>(7.0);
  const [cvFactor, setCvFactor] = useState<number>(0.0);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('570');
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);

  // Simulation playback state (0 to 4 hours = 7:00 AM to 11:00 AM)
  const [simTime, setSimTime] = useState<number>(0.05);
  const [isPlaying, setIsPlaying] = useState<boolean>(!prefersReducedMotion);
  const [isLiveClock, setIsLiveClock] = useState<boolean>(false);
  const [liveIstLabel, setLiveIstLabel] = useState<string>('07:03:00 AM');
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('interpolation');
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  const workbenchRef = useRef<HTMLElement | null>(null);
  const corridorRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const activeRoute = useMemo(
    () => MTC_ROUTES.find((r) => r.id === selectedRouteId) || MTC_ROUTES[0],
    [selectedRouteId]
  );

  const usesExactBaseline = presetId === 'pdf_rounded' || presetId === 'exact_model';

  // Build numerical interpolants whenever observations change
  const ddTable = useMemo(
    () => buildDividedDifferenceTable(OBSERVATION_TIMES, observations),
    [observations]
  );

  const naturalSpline = useMemo(
    () => buildCubicSpline(OBSERVATION_TIMES, observations, 'natural'),
    [observations]
  );

  const clampedSpline = useMemo(() => {
    const slopes: [number, number] = usesExactBaseline
      ? [-Math.PI, Math.PI]
      : [observations[1] - observations[0], observations[4] - observations[3]];
    return buildCubicSpline(OBSERVATION_TIMES, observations, 'clamped', slopes);
  }, [observations, usesExactBaseline]);

  // Active headway & derivative functions driving both animation & solvers
  const activeHeadwayFn = useCallback(
    (t: number): number => {
      if (activeModelId === 'exact' && usesExactBaseline) {
        return exactHeadway(t);
      }
      if (activeModelId === 'newton') {
        return evaluateNewtonPolynomial(ddTable, t);
      }
      if (activeModelId === 'natural_spline') {
        return evaluateCubicSpline(naturalSpline, t);
      }
      if (activeModelId === 'clamped_spline') {
        return evaluateCubicSpline(clampedSpline, t);
      }
      return evaluateNewtonPolynomial(ddTable, t);
    },
    [activeModelId, usesExactBaseline, ddTable, naturalSpline, clampedSpline]
  );

  const activeHeadwayDerivFn = useCallback(
    (t: number): number => {
      if (activeModelId === 'exact' && usesExactBaseline) {
        return exactHeadwayDerivative(t);
      }
      if (activeModelId === 'newton') {
        return evaluateNewtonDerivative(ddTable, t);
      }
      if (activeModelId === 'natural_spline') {
        return evaluateCubicSplineDerivative(naturalSpline, t);
      }
      if (activeModelId === 'clamped_spline') {
        return evaluateCubicSplineDerivative(clampedSpline, t);
      }
      return evaluateNewtonDerivative(ddTable, t);
    },
    [activeModelId, usesExactBaseline, ddTable, naturalSpline, clampedSpline]
  );

  // Real-time animation frame loop (true 1:1 seconds at 1x, or synced to real-world IST clock)
  useEffect(() => {
    if (!isPlaying && !isLiveClock) return;
    let rafId = 0;
    let lastTs = performance.now();

    const computeIstNow = () => {
      const istDate = new Date(Date.now() + 19800 * 1000);
      const h24 = istDate.getUTCHours();
      const m = istDate.getUTCMinutes();
      const s = istDate.getUTCSeconds();
      const ms = istDate.getUTCMilliseconds();
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const label = `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${period}`;
      const istHours = h24 + m / 60 + s / 3600 + ms / 3600000;
      const mappedSimTime = (((istHours - 7) % 4) + 4) % 4;
      return { label, mappedSimTime };
    };

    const tick = (now: number) => {
      if (isLiveClock) {
        const { label, mappedSimTime } = computeIstNow();
        setLiveIstLabel(label);
        setSimTime(mappedSimTime);
      } else {
        const dtSec = Math.min(0.1, (now - lastTs) / 1000);
        lastTs = now;
        // True 1:1 real-time at 1x speed: 1 simulated second = 1 real second
        const simHoursDelta = (dtSec / 3600) * speedMultiplier;
        setSimTime((prev) => {
          const next = prev + simHoursDelta;
          return next > 4.0 ? next - 4.0 : next;
        });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isLiveClock, speedMultiplier]);

  // Live metrics & solver summaries for KPI strip
  const currentHeadway = Math.max(1.0, activeHeadwayFn(simTime));
  const currentWait = (currentHeadway / 2) * (1 + cvFactor * cvFactor);

  const windowWaitSimpson = useMemo(() => {
    const mult = 1 + cvFactor * cvFactor;
    const area = integrateSimpsonsOneThird(
      (t) => (activeHeadwayFn(t) / 2) * mult,
      0,
      4,
      6
    );
    return area !== null ? area / 4 : exactAverageWait(cvFactor);
  }, [activeHeadwayFn, cvFactor]);

  const exactWaitReference = useMemo(() => exactAverageWait(cvFactor), [cvFactor]);

  const targetRootSummary = useMemo(() => {
    const f = (t: number) => activeHeadwayFn(t) - targetHeadway;
    const exactR = usesExactBaseline ? exactTargetRoot(targetHeadway) : null;
    const nr = solveNewtonRaphson(f, activeHeadwayDerivFn, 0.3, 1e-6, exactR);
    if (nr.converged && nr.root !== null && nr.root >= 0 && nr.root <= 4) {
      return nr;
    }
    const sec = solveSecant(f, 0.3, 1.5, 1e-6, exactR);
    return sec;
  }, [activeHeadwayFn, activeHeadwayDerivFn, targetHeadway, usesExactBaseline]);

  const targetRootTime =
    targetRootSummary.converged &&
    targetRootSummary.root !== null &&
    targetRootSummary.root >= 0 &&
    targetRootSummary.root <= 4
      ? targetRootSummary.root
      : null;

  // Handlers
  const handleSelectPreset = (id: Exclude<ObservationPresetId, 'custom'>) => {
    const preset = OBSERVATION_PRESETS[id];
    setPresetId(id);
    setObservations([...preset.headways]);
    if (!preset.usesExactModel && activeModelId === 'exact') {
      setActiveModelId('natural_spline');
    }
  };

  const handleUpdateObservation = (index: number, value: number) => {
    setPresetId('custom');
    setObservations((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (activeModelId === 'exact') {
      setActiveModelId('newton');
    }
  };

  const handleResetDefaults = () => {
    setPresetId('pdf_rounded');
    setObservations([...OBSERVATION_PRESETS.pdf_rounded.headways]);
    setActiveModelId('exact');
    setTargetHeadway(7.0);
    setCvFactor(0.0);
  };

  const handleJumpToTarget = () => {
    if (targetRootTime !== null) {
      setIsPlaying(false);
      setSimTime(targetRootTime);
    }
  };

  const navigateToTab = (tab: WorkbenchTab) => {
    setActiveTab(tab);
    workbenchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExportCsv = () => {
    const rows = [
      ['Time_h', 'Clock_Time', 'Exact_h_min', 'Newton_P4_min', 'Natural_Spline_min', 'Clamped_Spline_min', 'Wait_W_min'],
    ];
    for (let i = 0; i <= 16; i++) {
      const t = (4 * i) / 16;
      const exactV = usesExactBaseline ? exactHeadway(t).toFixed(6) : '';
      const newtonV = evaluateNewtonPolynomial(ddTable, t).toFixed(6);
      const natV = evaluateCubicSpline(naturalSpline, t).toFixed(6);
      const clampV = evaluateCubicSpline(clampedSpline, t).toFixed(6);
      const wV = ((activeHeadwayFn(t) / 2) * (1 + cvFactor * cvFactor)).toFixed(6);
      rows.push([
        t.toFixed(4),
        formatClockTime(t),
        exactV,
        newtonV,
        natV,
        clampV,
        wV,
      ]);
    }
    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transitmath_headway_telemetry.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Bar Contract: 3 zones separated by gap-8, single row, no extra badges */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#corridor"
            onClick={(e) => {
              e.preventDefault();
              corridorRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            TransitMath
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => corridorRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Live Corridor
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Corridor Map
            </button>
            <button
              type="button"
              onClick={() => navigateToTab('interpolation')}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Numerical Models
            </button>
            <button
              type="button"
              onClick={() => navigateToTab('dataset')}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dataset
            </button>
            <button
              type="button"
              onClick={() => navigateToTab('standards')}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Standards
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F4C81] hover:bg-[#0C3B66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Concise Title & Unboxed Context Line */}
        <section ref={corridorRef} id="corridor" className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-slate-900 text-balance">
                Smart Transit Analytics &amp; Live Bus Simulation
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>UBA1024 Numerical Methods</span>
                <span aria-hidden="true">·</span>
                <span>Dataset: GTFS / AIS-140 Morning Window (7:00 AM – 11:00 AM, 0.1-min rounded)</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => navigateToTab('dataset')}
                  className="text-[#0F4C81] font-medium hover:underline underline-offset-2 cursor-pointer"
                >
                  View Source Dataset
                </button>
              </div>
            </div>
          </div>

          {/* 2-Zone Sandbox Layout: Left Interactive Stage (8 cols) + Right Control Deck (4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8">
              <BusCorridorStage
                simTime={simTime}
                isPlaying={isPlaying}
                isLiveClock={isLiveClock}
                liveIstLabel={liveIstLabel}
                speedMultiplier={speedMultiplier}
                selectedRouteId={selectedRouteId}
                selectedBusId={selectedBusId}
                headwayFn={activeHeadwayFn}
                targetHeadway={targetHeadway}
                targetRootTime={targetRootTime}
                cvFactor={cvFactor}
                onSelectRoute={(id) => {
                  setSelectedRouteId(id);
                  setSelectedBusId(null);
                }}
                onSelectBus={setSelectedBusId}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onToggleLiveClock={() => {
                  setIsLiveClock((live) => {
                    const nextLive = !live;
                    if (!nextLive) {
                      setIsPlaying(true);
                    }
                    return nextLive;
                  });
                }}
                onReset={() => {
                  setIsLiveClock(false);
                  setIsPlaying(false);
                  setSimTime(0.05);
                }}
                onScrubTime={(t) => {
                  setIsLiveClock(false);
                  setIsPlaying(false);
                  setSimTime(t);
                }}
                onChangeSpeed={(spd) => {
                  setIsLiveClock(false);
                  setSpeedMultiplier(spd);
                }}
                onJumpToTarget={handleJumpToTarget}
              />
            </div>

            <div className="lg:col-span-4">
              <SimulationControlDeck
                presetId={presetId}
                activeModelId={activeModelId}
                targetHeadway={targetHeadway}
                cvFactor={cvFactor}
                simTime={simTime}
                currentHeadway={currentHeadway}
                currentWait={currentWait}
                targetRootTime={targetRootTime}
                onSelectPreset={handleSelectPreset}
                onSelectModel={setActiveModelId}
                onChangeTargetHeadway={setTargetHeadway}
                onChangeCvFactor={setCvFactor}
                onResetDefaults={handleResetDefaults}
              />
            </div>
          </div>

          {/* Dual Corridor Maps: Schematic Gradient Topology + Real-Time Google Map */}
          <div ref={mapRef} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className={isMapExpanded ? 'lg:col-span-12 order-2' : 'lg:col-span-6'}>
              <SchematicCorridorMap
                route={activeRoute}
                simTime={simTime}
                headwayFn={activeHeadwayFn}
                targetHeadway={targetHeadway}
                cvFactor={cvFactor}
                selectedBusId={selectedBusId}
                onSelectBus={setSelectedBusId}
              />
            </div>

            <div className={isMapExpanded ? 'lg:col-span-12 order-1' : 'lg:col-span-6'}>
              <RealTimeGoogleMtcMap
                activeRoute={activeRoute}
                simTime={simTime}
                isLiveClock={isLiveClock}
                liveIstLabel={liveIstLabel}
                headwayFn={activeHeadwayFn}
                targetHeadway={targetHeadway}
                cvFactor={cvFactor}
                selectedBusId={selectedBusId}
                isExpanded={isMapExpanded}
                onToggleExpand={() => setIsMapExpanded((v) => !v)}
                onSelectBus={setSelectedBusId}
                onSelectRoute={(id) => {
                  setSelectedRouteId(id);
                  setSelectedBusId(null);
                }}
              />
            </div>
          </div>

          {/* Full-Width 4-Column Framer Motion Animated KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:px-5 flex flex-col justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  Instantaneous Headway h(t)
                </div>
                <div className="mt-1 text-xl font-semibold font-mono-tabular text-slate-900">
                  <AnimatedMetricValue value={currentHeadway} decimals={3} suffix=" min" />
                </div>
                <div className="mt-0.5 text-xs text-slate-500 font-mono-tabular">
                  At {isLiveClock ? `${liveIstLabel} IST` : formatClockTime(simTime)}
                </div>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full origin-left ${
                    currentHeadway <= targetHeadway ? 'bg-emerald-600' : 'bg-amber-500'
                  }`}
                  animate={{ scaleX: Math.min(1, Math.max(0.1, currentHeadway / 12)) }}
                  transition={{ type: 'spring', stiffness: 160, damping: 24 }}
                />
              </div>
            </div>

            <div className="p-4 sm:px-5 flex flex-col justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  Instantaneous Wait W(t)
                </div>
                <div className="mt-1 text-xl font-semibold font-mono-tabular text-slate-900">
                  <AnimatedMetricValue value={currentWait} decimals={3} suffix=" min" />
                </div>
                <div className="mt-0.5 text-xs text-slate-500 font-mono-tabular">
                  (h/2) · (1 + {cvFactor.toFixed(2)}²)
                </div>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full origin-left bg-[#0284C7]"
                  animate={{ scaleX: Math.min(1, Math.max(0.1, currentWait / 7)) }}
                  transition={{ type: 'spring', stiffness: 160, damping: 24 }}
                />
              </div>
            </div>

            <div className="p-4 sm:px-5 flex flex-col justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  Mean Window Wait (Simpson 1/3)
                </div>
                <div className="mt-1 text-xl font-semibold font-mono-tabular text-[#0F4C81]">
                  <AnimatedMetricValue value={windowWaitSimpson} decimals={4} suffix=" min" />
                </div>
                <div className="mt-0.5 text-xs text-slate-500 font-mono-tabular">
                  {usesExactBaseline
                    ? `Exact: ${exactWaitReference.toFixed(4)} min (n=6)`
                    : 'Integrated over 0–4 h (n=6)'}
                </div>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full origin-left bg-[#0F4C81]"
                  animate={{ scaleX: Math.min(1, Math.max(0.1, windowWaitSimpson / 7)) }}
                  transition={{ type: 'spring', stiffness: 160, damping: 24 }}
                />
              </div>
            </div>

            <div className="p-4 sm:px-5 flex flex-col justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  Service Target Crossing t*
                </div>
                <div className="mt-1 text-xl font-semibold font-mono-tabular text-emerald-700">
                  {targetRootTime !== null ? (
                    <AnimatedMetricValue value={targetRootTime} decimals={5} suffix=" h" />
                  ) : (
                    'Not reached'
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 font-mono-tabular">
                  {targetRootTime !== null
                    ? `${formatClockTime(targetRootTime)} · ${targetRootSummary.iterations} iters`
                    : `h(t) never reaches ${targetHeadway.toFixed(1)} min`}
                </div>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full origin-left bg-emerald-600"
                  animate={{
                    scaleX: targetRootTime !== null ? Math.min(1, Math.max(0.08, simTime / targetRootTime)) : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 160, damping: 24 }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Numerical Methods Workbench Section */}
        <section ref={workbenchRef} className="pt-2 space-y-6">
          <div className="border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 pb-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'interpolation', label: '1. Interpolation & Splines' },
                  { id: 'integration', label: '2. Waiting Time Integration' },
                  { id: 'root_finding', label: '3. Root Finding (t*)' },
                  { id: 'dataset', label: '4. Dataset & Source' },
                  { id: 'standards', label: '5. Standards & SDGs' },
                ] as { id: WorkbenchTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-500 font-mono-tabular">
              Active Driving Model:{' '}
              <span className="font-semibold text-slate-800">
                {activeModelId === 'exact' && usesExactBaseline
                  ? 'Exact h(t) = 10 - 4·sin(πt/4)'
                  : activeModelId === 'newton'
                  ? 'Newton Divided-Difference P₄(t)'
                  : activeModelId === 'natural_spline'
                  ? 'Natural Cubic Spline'
                  : 'Clamped Cubic Spline'}
              </span>
            </div>
          </div>

          {activeTab === 'interpolation' && (
            <InterpolationWorkbench
              observations={observations}
              usesExactBaseline={usesExactBaseline}
              simTime={simTime}
              targetHeadway={targetHeadway}
              ddTable={ddTable}
              naturalSpline={naturalSpline}
              clampedSpline={clampedSpline}
              onUpdateObservation={handleUpdateObservation}
              onScrubTime={(t) => {
                setIsPlaying(false);
                setSimTime(t);
              }}
            />
          )}

          {activeTab === 'integration' && (
            <IntegrationWorkbench
              headwayFn={activeHeadwayFn}
              usesExactBaseline={usesExactBaseline}
              cvFactor={cvFactor}
              simTime={simTime}
            />
          )}

          {activeTab === 'root_finding' && (
            <RootFindingWorkbench
              headwayFn={activeHeadwayFn}
              headwayDerivFn={activeHeadwayDerivFn}
              usesExactBaseline={usesExactBaseline}
              targetHeadway={targetHeadway}
              onJumpToTime={(t) => {
                setIsPlaying(false);
                setSimTime(Math.max(0, Math.min(4, t)));
              }}
            />
          )}

          {activeTab === 'dataset' && (
            <DatasetProvenancePanel
              presetId={presetId}
              observations={observations}
              cvFactor={cvFactor}
              route={activeRoute}
            />
          )}

          {activeTab === 'standards' && <StandardsReference />}
        </section>
      </main>

      {/* Clean Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            Smart Transit Analytics · UBA1024 Numerical Methods · SIMATS Engineering
          </div>
          <div>
            Monica AR · Infant Ency L · Shalini M · Supervised by Diana Grace Thomas
          </div>
        </div>
      </footer>
    </div>
  );
}
