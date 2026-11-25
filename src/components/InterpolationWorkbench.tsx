import React, { useMemo, useState } from 'react';
import {
  CubicSplineSegment,
  DividedDifferenceResult,
  OBSERVATION_TIMES,
  computeMaxErrorAgainstExact,
  evaluateCubicSpline,
  evaluateNewtonPolynomial,
  exactHeadway,
  formatClockTime,
  formatSci,
} from '../math/numericalMethods';

export interface InterpolationWorkbenchProps {
  observations: number[];
  usesExactBaseline: boolean;
  simTime: number;
  targetHeadway: number;
  ddTable: DividedDifferenceResult;
  naturalSpline: CubicSplineSegment[];
  clampedSpline: CubicSplineSegment[];
  onUpdateObservation: (index: number, value: number) => void;
  onScrubTime: (t: number) => void;
}

export const InterpolationWorkbench: React.FC<InterpolationWorkbenchProps> = ({
  observations,
  usesExactBaseline,
  simTime,
  targetHeadway,
  ddTable,
  naturalSpline,
  clampedSpline,
  onUpdateObservation,
  onScrubTime,
}) => {
  const [showExact, setShowExact] = useState(true);
  const [showNewton, setShowNewton] = useState(true);
  const [showNatural, setShowNatural] = useState(true);
  const [showClamped, setShowClamped] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const chartW = 720;
  const chartH = 290;
  const padL = 52;
  const padR = 24;
  const padT = 20;
  const padB = 38;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const yBounds = useMemo(() => {
    const minObs = Math.min(...observations, targetHeadway, 5.5);
    const maxObs = Math.max(...observations, targetHeadway, 10.5);
    const yMin = Math.floor(Math.min(5, minObs - 0.8));
    const yMax = Math.ceil(Math.max(10.5, maxObs + 0.8));
    return { yMin, yMax };
  }, [observations, targetHeadway]);

  const toX = (t: number) => padL + (t / 4) * plotW;
  const toY = (h: number) => padT + ((yBounds.yMax - h) / (yBounds.yMax - yBounds.yMin)) * plotH;

  const buildPolyline = (fn: (t: number) => number, steps = 160) => {
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (4 * i) / steps;
      pts.push(`${toX(t).toFixed(2)},${toY(fn(t)).toFixed(2)}`);
    }
    return pts.join(' ');
  };

  const exactPath = useMemo(() => buildPolyline(exactHeadway), [yBounds]);
  const newtonPath = useMemo(
    () => buildPolyline((t) => evaluateNewtonPolynomial(ddTable, t)),
    [ddTable, yBounds]
  );
  const naturalPath = useMemo(
    () => buildPolyline((t) => evaluateCubicSpline(naturalSpline, t)),
    [naturalSpline, yBounds]
  );
  const clampedPath = useMemo(
    () => buildPolyline((t) => evaluateCubicSpline(clampedSpline, t)),
    [clampedSpline, yBounds]
  );

  const errorStats = useMemo(() => {
    const newtonErr = computeMaxErrorAgainstExact((t) => evaluateNewtonPolynomial(ddTable, t));
    const natErr = computeMaxErrorAgainstExact((t) => evaluateCubicSpline(naturalSpline, t));
    const clampErr = computeMaxErrorAgainstExact((t) => evaluateCubicSpline(clampedSpline, t));
    return { newtonErr, natErr, clampErr };
  }, [ddTable, naturalSpline, clampedSpline]);

  const inspectT = hoverT !== null ? hoverT : simTime;
  const inspectValues = {
    exact: exactHeadway(inspectT),
    newton: evaluateNewtonPolynomial(ddTable, inspectT),
    natural: evaluateCubicSpline(naturalSpline, inspectT),
    clamped: evaluateCubicSpline(clampedSpline, inspectT),
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * chartW;
    const t = ((relX - padL) / plotW) * 4;
    if (t >= 0 && t <= 4) {
      setHoverT(t);
    } else {
      setHoverT(null);
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * chartW;
    const t = Math.max(0, Math.min(4, ((relX - padL) / plotW) * 4));
    onScrubTime(t);
  };

  const yTicks: number[] = [];
  for (let y = yBounds.yMin; y <= yBounds.yMax; y += 1) {
    yTicks.push(y);
  }

  return (
    <div className="space-y-6">
      {/* Header & Layer Toggle Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            01. Headway Interpolation &amp; Cubic Splines
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Compare degree-4 Newton divided-difference interpolation against piecewise Natural and Clamped cubic splines. Click anywhere on the graph to move the bus simulation clock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          {usesExactBaseline && (
            <button
              type="button"
              onClick={() => setShowExact((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showExact ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Exact Model h(t)
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewton((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showNewton ? 'bg-white text-[#D97706] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Newton Poly
          </button>
          <button
            type="button"
            onClick={() => setShowNatural((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showNatural ? 'bg-white text-[#0F4C81] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Natural Spline
          </button>
          <button
            type="button"
            onClick={() => setShowClamped((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showClamped ? 'bg-white text-[#059669] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Clamped Spline
          </button>
        </div>
      </div>

      {/* Main Chart + Live Inspection Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
            <div className="font-medium text-slate-700">
              Headway h(t) vs Time after 7:00 AM
            </div>
            <div className="font-mono-tabular text-slate-600">
              Inspecting t = {inspectT.toFixed(3)} h ({formatClockTime(inspectT, false)})
            </div>
          </div>

          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-auto cursor-crosshair select-none"
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverT(null)}
            onClick={handleSvgClick}
            role="img"
            aria-label="Headway interpolation comparison chart"
          >
            {/* Horizontal grid lines */}
            {yTicks.map((yVal) => (
              <g key={yVal}>
                <line
                  x1={padL}
                  y1={toY(yVal)}
                  x2={chartW - padR}
                  y2={toY(yVal)}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                <text
                  x={padL - 8}
                  y={toY(yVal) + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[11px] font-mono-tabular"
                >
                  {yVal}
                </text>
              </g>
            ))}

            {/* Vertical grid lines for hours 0..4 */}
            {OBSERVATION_TIMES.map((tVal) => (
              <g key={tVal}>
                <line
                  x1={toX(tVal)}
                  y1={padT}
                  x2={toX(tVal)}
                  y2={chartH - padB}
                  stroke="#F1F5F9"
                  strokeWidth="1"
                />
                <text
                  x={toX(tVal)}
                  y={chartH - padB + 18}
                  textAnchor="middle"
                  className="fill-slate-500 text-[11px] font-mono-tabular"
                >
                  {tVal}.00 h ({7 + tVal}:00)
                </text>
              </g>
            ))}

            {/* Target Headway Horizontal Reference Line */}
            <line
              x1={padL}
              y1={toY(targetHeadway)}
              x2={chartW - padR}
              y2={toY(targetHeadway)}
              stroke="#475569"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={chartW - padR - 4}
              y={toY(targetHeadway) - 6}
              textAnchor="end"
              className="fill-slate-700 text-[10px] font-mono-tabular font-semibold"
            >
              Target {targetHeadway.toFixed(1)} min
            </text>

            {/* Curves */}
            {usesExactBaseline && showExact && (
              <polyline
                fill="none"
                stroke="#0F172A"
                strokeWidth="2.2"
                strokeOpacity="0.85"
                points={exactPath}
              />
            )}
            {showNatural && (
              <polyline
                fill="none"
                stroke="#0F4C81"
                strokeWidth="2.2"
                points={naturalPath}
              />
            )}
            {showClamped && (
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="2"
                strokeDasharray="4 3"
                points={clampedPath}
              />
            )}
            {showNewton && (
              <polyline
                fill="none"
                stroke="#D97706"
                strokeWidth="2"
                points={newtonPath}
              />
            )}

            {/* Observed Hourly Data Points */}
            {OBSERVATION_TIMES.map((tVal, idx) => (
              <circle
                key={tVal}
                cx={toX(tVal)}
                cy={toY(observations[idx])}
                r="4.5"
                fill="#FFFFFF"
                stroke="#0F4C81"
                strokeWidth="2.2"
              />
            ))}

            {/* Synchronized Simulation Playhead */}
            <line
              x1={toX(simTime)}
              y1={padT}
              x2={toX(simTime)}
              y2={chartH - padB}
              stroke="#0284C7"
              strokeWidth="1.8"
            />
            <circle cx={toX(simTime)} cy={padT} r="3.5" fill="#0284C7" />

            {/* Hover Crosshair */}
            {hoverT !== null && (
              <line
                x1={toX(hoverT)}
                y1={padT}
                x2={toX(hoverT)}
                y2={chartH - padB}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {/* Y-Axis Label */}
            <text
              x={14}
              y={padT + plotH / 2}
              transform={`rotate(-90, 14, ${padT + plotH / 2})`}
              textAnchor="middle"
              className="fill-slate-600 text-[11px] font-medium"
            >
              Headway (min)
            </text>
          </svg>

          {/* Compact Readout Bar Under Chart */}
          <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {usesExactBaseline && (
              <div>
                <div className="text-slate-500">Exact h(t)</div>
                <div className="font-mono-tabular font-semibold text-slate-900">
                  {inspectValues.exact.toFixed(5)} min
                </div>
              </div>
            )}
            <div>
              <div className="text-[#D97706] font-medium">Newton Poly P₄(t)</div>
              <div className="font-mono-tabular font-semibold text-slate-900">
                {inspectValues.newton.toFixed(5)} min
              </div>
            </div>
            <div>
              <div className="text-[#0F4C81] font-medium">Natural Spline</div>
              <div className="font-mono-tabular font-semibold text-slate-900">
                {inspectValues.natural.toFixed(5)} min
              </div>
            </div>
            <div>
              <div className="text-[#059669] font-medium">Clamped Spline</div>
              <div className="font-mono-tabular font-semibold text-slate-900">
                {inspectValues.clamped.toFixed(5)} min
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Editable Hourly Observations + Spline Error Comparison */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-1">
              Editable Hourly Observations
            </h4>
            <p className="text-xs text-slate-500 mb-3">
              Adjust any observed headway (min) to recompute all interpolants and live bus dispatches.
            </p>
            <div className="space-y-2">
              {OBSERVATION_TIMES.map((tVal, idx) => (
                <div key={tVal} className="flex items-center justify-between gap-3">
                  <label
                    htmlFor={`obs-input-${idx}`}
                    className="text-xs font-mono-tabular text-slate-700"
                  >
                    t = {tVal} h ({7 + tVal}:00 AM)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id={`obs-input-${idx}`}
                      type="number"
                      min={3}
                      max={18}
                      step={0.1}
                      value={observations[idx]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val) && val >= 2 && val <= 25) {
                          onUpdateObservation(idx, val);
                        }
                      }}
                      className="w-24 px-2.5 py-1.5 text-right text-xs font-mono-tabular text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:border-[#0F4C81]"
                    />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Extension 3 Max Error Comparison Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">
              Interpolant Error vs Exact Model
            </h4>
            {usesExactBaseline ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1.5 text-left font-medium">Interpolant</th>
                      <th className="py-1.5 text-right font-medium">Max Error (min)</th>
                      <th className="py-1.5 text-right font-medium">Peak At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono-tabular">
                    <tr>
                      <td className="py-2 font-sans text-slate-800 font-medium">Newton Div. Diff</td>
                      <td className="py-2 text-right text-slate-900">{formatSci(errorStats.newtonErr.maxError)}</td>
                      <td className="py-2 text-right text-slate-600">{errorStats.newtonErr.atTime.toFixed(2)} h</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-sans text-slate-800 font-medium">Natural Spline</td>
                      <td className="py-2 text-right text-slate-900">{formatSci(errorStats.natErr.maxError)}</td>
                      <td className="py-2 text-right text-slate-600">{errorStats.natErr.atTime.toFixed(2)} h</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-sans text-slate-800 font-medium">Clamped Spline</td>
                      <td className="py-2 text-right text-slate-900">{formatSci(errorStats.clampErr.maxError)}</td>
                      <td className="py-2 text-right text-slate-600">{errorStats.clampErr.atTime.toFixed(2)} h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Exact analytical error comparison applies to the baseline sinusoidal model. Switch preset to PDF Rounded Data or Exact Analytical Samples to verify against exact h(t).
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Newton Divided-Difference Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className="text-sm font-semibold text-slate-900">
            Newton Divided-Difference Coefficient Table
          </h4>
          <span className="text-xs font-mono-tabular text-slate-500">
            P₄(t) = f[x₀] + f[x₀,x₁](t−x₀) + … + f[x₀..x₄]∏(t−xᵢ)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 px-2 text-left font-medium">tᵢ (h)</th>
                <th className="py-2 px-2 text-right font-medium">f[xᵢ]</th>
                <th className="py-2 px-2 text-right font-medium">1st Order</th>
                <th className="py-2 px-2 text-right font-medium">2nd Order</th>
                <th className="py-2 px-2 text-right font-medium">3rd Order</th>
                <th className="py-2 px-2 text-right font-medium">4th Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono-tabular">
              {ddTable.times.map((tVal, rowIdx) => (
                <tr key={tVal} className="hover:bg-slate-50">
                  <td className="py-2 px-2 text-slate-700 font-medium">{tVal.toFixed(1)}</td>
                  {[0, 1, 2, 3, 4].map((colIdx) => {
                    const hasVal = rowIdx + colIdx < ddTable.times.length;
                    const isTopCoeff = rowIdx === 0;
                    return (
                      <td
                        key={colIdx}
                        className={`py-2 px-2 text-right ${
                          isTopCoeff && hasVal ? 'text-[#0F4C81] font-semibold' : 'text-slate-600'
                        }`}
                      >
                        {hasVal ? ddTable.table[rowIdx][colIdx].toFixed(5) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
