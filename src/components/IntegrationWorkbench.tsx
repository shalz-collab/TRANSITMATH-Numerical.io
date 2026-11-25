import React, { useMemo, useState } from 'react';
import {
  computeRombergAverageWait,
  exactAverageWait,
  formatSci,
  integrateSimpsonsOneThird,
  integrateSimpsonsThreeEighth,
  integrateTrapezoidal,
} from '../math/numericalMethods';

export interface IntegrationWorkbenchProps {
  headwayFn: (t: number) => number;
  usesExactBaseline: boolean;
  cvFactor: number;
  simTime: number;
}

export const IntegrationWorkbench: React.FC<IntegrationWorkbenchProps> = ({
  headwayFn,
  usesExactBaseline,
  cvFactor,
  simTime,
}) => {
  const [panels, setPanels] = useState<number>(6);
  const [visualRule, setVisualRule] = useState<'trapezoidal' | 'simpson13'>('simpson13');

  const waitFn = useMemo(() => {
    const mult = 1 + cvFactor * cvFactor;
    return (t: number) => (headwayFn(t) / 2) * mult;
  }, [headwayFn, cvFactor]);

  const exactWaitAvg = useMemo(() => {
    if (usesExactBaseline) {
      return exactAverageWait(cvFactor);
    }
    // High-resolution reference integral when custom observations are used
    return integrateSimpsonsOneThird(waitFn, 0, 4, 2400)! / 4;
  }, [usesExactBaseline, cvFactor, waitFn]);

  const comparisonRows = useMemo(() => {
    const trapArea = integrateTrapezoidal(waitFn, 0, 4, panels);
    const trapAvg = trapArea / 4;

    const s13Area = integrateSimpsonsOneThird(waitFn, 0, 4, panels);
    const s13Avg = s13Area !== null ? s13Area / 4 : null;

    const s38Area = integrateSimpsonsThreeEighth(waitFn, 0, 4, panels);
    const s38Avg = s38Area !== null ? s38Area / 4 : null;

    const makeRow = (
      method: string,
      avg: number | null,
      area: number | null,
      applicable: boolean,
      note: string
    ) => {
      const absError = avg !== null ? Math.abs(avg - exactWaitAvg) : null;
      const relErrorPct = absError !== null ? (absError / exactWaitAvg) * 100 : null;
      return { method, panels, avgWaitMin: avg, totalWaitArea: area, absError, relErrorPct, applicable, note };
    };

    return [
      makeRow('Trapezoidal Rule', trapAvg, trapArea, true, 'O(h²); overestimates on convex curve'),
      makeRow(
        "Simpson's 1/3 Rule",
        s13Avg,
        s13Area,
        s13Avg !== null,
        s13Avg !== null ? 'O(h⁴); highest accuracy for even panels' : 'Requires even panel count n'
      ),
      makeRow(
        "Simpson's 3/8 Rule",
        s38Avg,
        s38Area,
        s38Avg !== null,
        s38Avg !== null ? 'O(h⁴); cubic rule for multiples of 3' : 'Requires n divisible by 3 (e.g. 6, 12)'
      ),
    ];
  }, [waitFn, panels, exactWaitAvg]);

  const romberg = useMemo(() => computeRombergAverageWait(waitFn, 0, 4, 4), [waitFn]);

  // SVG Chart Geometry
  const chartW = 720;
  const chartH = 260;
  const padL = 52;
  const padR = 24;
  const padT = 20;
  const padB = 36;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const yMax = useMemo(() => {
    let m = 5.5;
    for (let i = 0; i <= 40; i++) {
      m = Math.max(m, waitFn((4 * i) / 40));
    }
    return Math.ceil(m + 0.6);
  }, [waitFn]);

  const toX = (t: number) => padL + (t / 4) * plotW;
  const toY = (w: number) => padT + ((yMax - w) / yMax) * plotH;

  const curvePts = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 140; i++) {
      const t = (4 * i) / 140;
      pts.push(`${toX(t).toFixed(2)},${toY(waitFn(t)).toFixed(2)}`);
    }
    return pts.join(' ');
  }, [waitFn, yMax]);

  const panelNodes = useMemo(() => {
    const nodes: { t: number; w: number }[] = [];
    for (let i = 0; i <= panels; i++) {
      const t = (4 * i) / panels;
      nodes.push({ t, w: waitFn(t) });
    }
    return nodes;
  }, [waitFn, panels]);

  const panelPolygons = useMemo(() => {
    const polys: { points: string; idx: number }[] = [];
    for (let i = 0; i < panels; i++) {
      const t0 = panelNodes[i].t;
      const t1 = panelNodes[i + 1].t;
      if (visualRule === 'trapezoidal') {
        const pts = [
          `${toX(t0).toFixed(1)},${toY(0).toFixed(1)}`,
          `${toX(t0).toFixed(1)},${toY(panelNodes[i].w).toFixed(1)}`,
          `${toX(t1).toFixed(1)},${toY(panelNodes[i + 1].w).toFixed(1)}`,
          `${toX(t1).toFixed(1)},${toY(0).toFixed(1)}`,
        ].join(' ');
        polys.push({ points: pts, idx: i });
      } else {
        // Sample parabolic fit along the subinterval
        const pts: string[] = [`${toX(t0).toFixed(1)},${toY(0).toFixed(1)}`];
        for (let s = 0; s <= 12; s++) {
          const ts = t0 + ((t1 - t0) * s) / 12;
          pts.push(`${toX(ts).toFixed(1)},${toY(waitFn(ts)).toFixed(1)}`);
        }
        pts.push(`${toX(t1).toFixed(1)},${toY(0).toFixed(1)}`);
        polys.push({ points: pts.join(' '), idx: i });
      }
    }
    return polys;
  }, [panelNodes, panels, visualRule, waitFn, yMax]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            02. Passenger Waiting Time Integration &amp; Romberg Extrapolation
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Integrate W(t) = [h(t)/2]·(1 + CV²) across the 4-hour morning window to compute expected commuter waiting time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[4, 6, 8, 12, 16].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPanels(n)}
                className={`px-3 py-1.5 text-xs font-mono-tabular font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  panels === n ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                n = {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quadrature Visualizer + Comparison Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-slate-700">
              Quadrature Panels (n = {panels}, Δt = {(4 / panels).toFixed(3)} h)
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setVisualRule('trapezoidal')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  visualRule === 'trapezoidal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Trapezoidal Chords
              </button>
              <button
                type="button"
                onClick={() => setVisualRule('simpson13')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  visualRule === 'simpson13' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Simpson Panels
              </button>
            </div>
          </div>

          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto select-none" role="img" aria-label="Passenger waiting time integration panels">
            {/* Y Grid */}
            {Array.from({ length: yMax + 1 }).map((_, yVal) => (
              <g key={yVal}>
                <line x1={padL} y1={toY(yVal)} x2={chartW - padR} y2={toY(yVal)} stroke="#E2E8F0" strokeWidth="1" />
                <text x={padL - 8} y={toY(yVal) + 4} textAnchor="end" className="fill-slate-500 text-[11px] font-mono-tabular">
                  {yVal}
                </text>
              </g>
            ))}

            {/* Shaded Panels */}
            {panelPolygons.map((poly) => (
              <polygon
                key={poly.idx}
                points={poly.points}
                fill={poly.idx % 2 === 0 ? '#0284C7' : '#0F4C81'}
                fillOpacity={poly.idx % 2 === 0 ? 0.14 : 0.08}
                stroke="#0284C7"
                strokeOpacity="0.45"
                strokeWidth="1"
              />
            ))}

            {/* W(t) Curve */}
            <polyline fill="none" stroke="#0F4C81" strokeWidth="2.4" points={curvePts} />

            {/* Panel Nodes */}
            {panelNodes.map((nd, idx) => (
              <circle key={idx} cx={toX(nd.t)} cy={toY(nd.w)} r="3.5" fill="#FFFFFF" stroke="#0F4C81" strokeWidth="2" />
            ))}

            {/* Live Sim Time Playhead */}
            <line x1={toX(simTime)} y1={padT} x2={toX(simTime)} y2={chartH - padB} stroke="#D97706" strokeWidth="1.6" />

            {/* X Ticks */}
            {[0, 1, 2, 3, 4].map((tVal) => (
              <text key={tVal} x={toX(tVal)} y={chartH - padB + 18} textAnchor="middle" className="fill-slate-500 text-[11px] font-mono-tabular">
                {tVal}.0 h
              </text>
            ))}

            <text
              x={14}
              y={padT + plotH / 2}
              transform={`rotate(-90, 14, ${padT + plotH / 2})`}
              textAnchor="middle"
              className="fill-slate-600 text-[11px] font-medium"
            >
              Wait W(t) (min)
            </text>
          </svg>
        </div>

        {/* Comparison Table */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="text-sm font-semibold text-slate-900">
              Quadrature Comparison (n = {panels})
            </h4>
            <span className="text-xs font-mono-tabular text-slate-600">
              {usesExactBaseline ? 'Exact: ' : 'Ref: '}
              {exactWaitAvg.toFixed(6)} min
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-medium">Method</th>
                  <th className="py-2 text-right font-medium">Avg Wait</th>
                  <th className="py-2 text-right font-medium">Abs Error</th>
                  <th className="py-2 text-right font-medium">Rel %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-tabular">
                {comparisonRows.map((row) => (
                  <tr key={row.method} className="hover:bg-slate-50">
                    <td className="py-2.5 font-sans">
                      <div className="font-medium text-slate-900">{row.method}</div>
                      <div className="text-[11px] text-slate-500">{row.note}</div>
                    </td>
                    <td className="py-2.5 text-right text-slate-900 font-semibold">
                      {row.avgWaitMin !== null ? `${row.avgWaitMin.toFixed(5)} m` : 'N/A'}
                    </td>
                    <td className="py-2.5 text-right text-slate-700">
                      {row.absError !== null ? formatSci(row.absError) : '—'}
                    </td>
                    <td className="py-2.5 text-right text-slate-700">
                      {row.relErrorPct !== null ? `${row.relErrorPct.toFixed(4)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Extension 2: Romberg Integration Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Extension 2: Romberg Integration Matrix R(k, j)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Richardson extrapolation raises accuracy from O(h²) → O(h⁴) → O(h⁶) → O(h⁸) → O(h¹⁰).
            </p>
          </div>
          <div className="text-xs font-mono-tabular font-semibold text-[#0F4C81]">
            Best Estimate R(4,4) = {romberg.bestEstimate.toFixed(6)} min
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 px-2 text-left font-medium">Panels n</th>
                <th className="py-2 px-2 text-right font-medium">R(k,0) · O(h²)</th>
                <th className="py-2 px-2 text-right font-medium">R(k,1) · O(h⁴)</th>
                <th className="py-2 px-2 text-right font-medium">R(k,2) · O(h⁶)</th>
                <th className="py-2 px-2 text-right font-medium">R(k,3) · O(h⁸)</th>
                <th className="py-2 px-2 text-right font-medium">R(k,4) · O(h¹⁰)</th>
                <th className="py-2 px-2 text-right font-medium">Final Abs Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono-tabular">
              {romberg.matrix.map((row, k) => {
                const diagVal = row[k];
                const diagErr = Math.abs(diagVal - exactWaitAvg);
                return (
                  <tr key={k} className="hover:bg-slate-50">
                    <td className="py-2 px-2 text-slate-800 font-semibold">n = {romberg.panelsPerRow[k]}</td>
                    {[0, 1, 2, 3, 4].map((j) => (
                      <td
                        key={j}
                        className={`py-2 px-2 text-right ${
                          j === k ? 'text-[#0F4C81] font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {j <= k ? row[j].toFixed(6) : '—'}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-right text-slate-700">{formatSci(diagErr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
