import React, { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import {
  RootSolverSummary,
  exactTargetRoot,
  formatClockTime,
  formatSci,
  solveBisection,
  solveNewtonRaphson,
  solveSecant,
} from '../math/numericalMethods';

export interface RootFindingWorkbenchProps {
  headwayFn: (t: number) => number;
  headwayDerivFn: (t: number) => number;
  usesExactBaseline: boolean;
  targetHeadway: number;
  onJumpToTime: (t: number) => void;
}

export const RootFindingWorkbench: React.FC<RootFindingWorkbenchProps> = ({
  headwayFn,
  headwayDerivFn,
  usesExactBaseline,
  targetHeadway,
  onJumpToTime,
}) => {
  const [x0, setX0] = useState<number>(0.3);
  const [secantX1, setSecantX1] = useState<number>(1.5);
  const [bracketA, setBracketA] = useState<number>(0.0);
  const [bracketB, setBracketB] = useState<number>(2.0);
  const [tolerance, setTolerance] = useState<number>(1e-6);
  const [activeLogMethod, setActiveLogMethod] = useState<'newton' | 'secant' | 'bisection'>('newton');

  const f = useMemo(() => (t: number) => headwayFn(t) - targetHeadway, [headwayFn, targetHeadway]);

  const exactRootVal = useMemo(() => {
    if (usesExactBaseline) {
      return exactTargetRoot(targetHeadway);
    }
    return null;
  }, [usesExactBaseline, targetHeadway]);

  const newtonRes = useMemo(
    () => solveNewtonRaphson(f, headwayDerivFn, x0, tolerance, exactRootVal),
    [f, headwayDerivFn, x0, tolerance, exactRootVal]
  );

  const secantRes = useMemo(
    () => solveSecant(f, x0, secantX1, tolerance, exactRootVal),
    [f, x0, secantX1, tolerance, exactRootVal]
  );

  const bisectionRes = useMemo(
    () => solveBisection(f, bracketA, bracketB, tolerance, exactRootVal),
    [f, bracketA, bracketB, tolerance, exactRootVal]
  );

  const activeSummary: RootSolverSummary =
    activeLogMethod === 'newton' ? newtonRes : activeLogMethod === 'secant' ? secantRes : bisectionRes;

  // Convergence Log10(error) SVG plot
  const chartW = 540;
  const chartH = 220;
  const padL = 46;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxIterPlot = Math.max(
    6,
    newtonRes.steps.length,
    secantRes.steps.length,
    bisectionRes.steps.length
  );

  const toX = (iter: number) => padL + ((iter - 1) / Math.max(1, maxIterPlot - 1)) * plotW;
  const toYLog = (err: number) => {
    const clampedLog = Math.max(-16, Math.min(0, Math.log10(Math.max(1e-16, err))));
    return padT + ((0 - clampedLog) / 16) * plotH;
  };

  const makeLogLine = (res: RootSolverSummary) =>
    res.steps
      .map((s) => `${toX(s.iteration).toFixed(1)},${toYLog(s.stepError).toFixed(1)}`)
      .join(' ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            03. Service-Level Root Finding (h(t*) = {targetHeadway.toFixed(1)} min)
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Find the exact morning time t* when headway drops to the service-level target using Newton–Raphson, Secant, and Bisection.
          </p>
        </div>

        {newtonRes.converged && newtonRes.root !== null && (
          <button
            type="button"
            onClick={() => onJumpToTime(newtonRes.root!)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F4C81] hover:bg-[#0C3B66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Target className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sync Bus Clock to t* ({formatClockTime(newtonRes.root)})</span>
          </button>
        )}
      </div>

      {/* Solver Parameters Row */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div>
          <label htmlFor="nr-x0" className="block text-xs font-semibold text-slate-700 mb-1">
            Initial Guess x₀ (h)
          </label>
          <input
            id="nr-x0"
            type="number"
            step={0.1}
            min={0}
            max={2}
            value={x0}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) setX0(v);
            }}
            className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-md"
          />
        </div>
        <div>
          <label htmlFor="sec-x1" className="block text-xs font-semibold text-slate-700 mb-1">
            Secant x₁ (h)
          </label>
          <input
            id="sec-x1"
            type="number"
            step={0.1}
            min={0}
            max={2.5}
            value={secantX1}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) setSecantX1(v);
            }}
            className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-md"
          />
        </div>
        <div>
          <label htmlFor="bis-a" className="block text-xs font-semibold text-slate-700 mb-1">
            Bracket Start a (h)
          </label>
          <input
            id="bis-a"
            type="number"
            step={0.1}
            min={0}
            max={1.9}
            value={bracketA}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) setBracketA(v);
            }}
            className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-md"
          />
        </div>
        <div>
          <label htmlFor="bis-b" className="block text-xs font-semibold text-slate-700 mb-1">
            Bracket End b (h)
          </label>
          <input
            id="bis-b"
            type="number"
            step={0.1}
            min={0.5}
            max={2.5}
            value={bracketB}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) setBracketB(v);
            }}
            className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-md"
          />
        </div>
        <div>
          <label htmlFor="tol-select" className="block text-xs font-semibold text-slate-700 mb-1">
            Tolerance
          </label>
          <select
            id="tol-select"
            value={tolerance}
            onChange={(e) => setTolerance(parseFloat(e.target.value))}
            className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-md"
          >
            <option value={1e-4}>10⁻⁴ h</option>
            <option value={1e-6}>10⁻⁶ h (Default)</option>
            <option value={1e-9}>10⁻⁹ h</option>
            <option value={1e-12}>10⁻¹² h</option>
          </select>
        </div>
      </div>

      {/* Method Summary Table + Log-Error Convergence Plot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">
            Convergence Comparison
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-medium">Method</th>
                  <th className="py-2 text-right font-medium">Iters</th>
                  <th className="py-2 text-right font-medium">Root t* (h)</th>
                  <th className="py-2 text-right font-medium">Clock Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-tabular">
                {[
                  { res: newtonRes, order: 'Quadratic (order 2)' },
                  { res: secantRes, order: 'Superlinear (≈ 1.618)' },
                  { res: bisectionRes, order: 'Linear (bracketing)' },
                ].map(({ res, order }) => (
                  <tr key={res.method} className="hover:bg-slate-50">
                    <td className="py-2.5 font-sans">
                      <div className="font-semibold text-slate-900">{res.method}</div>
                      <div className="text-[11px] text-slate-500">{res.reason ?? order}</div>
                    </td>
                    <td className="py-2.5 text-right text-slate-900 font-semibold">
                      {res.iterations}
                    </td>
                    <td className="py-2.5 text-right text-slate-900">
                      {res.root !== null ? res.root.toFixed(8) : '—'}
                    </td>
                    <td className="py-2.5 text-right text-[#0F4C81] font-medium">
                      {res.root !== null ? formatClockTime(res.root) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Convergence Rate Log Plot */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-slate-900">
              Log₁₀ Error Convergence Decay
            </h4>
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="text-[#0F4C81]">Newton–Raphson</span>
              <span className="text-[#D97706]">Secant</span>
              <span className="text-[#059669]">Bisection</span>
            </div>
          </div>

          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto select-none" role="img" aria-label="Convergence rate log error chart">
            {[0, -4, -8, -12, -16].map((lg) => (
              <g key={lg}>
                <line
                  x1={padL}
                  y1={toYLog(Math.pow(10, lg))}
                  x2={chartW - padR}
                  y2={toYLog(Math.pow(10, lg))}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                <text
                  x={padL - 8}
                  y={toYLog(Math.pow(10, lg)) + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono-tabular"
                >
                  1e{lg}
                </text>
              </g>
            ))}

            {bisectionRes.steps.length > 1 && (
              <polyline fill="none" stroke="#059669" strokeWidth="2" points={makeLogLine(bisectionRes)} />
            )}
            {secantRes.steps.length > 1 && (
              <polyline fill="none" stroke="#D97706" strokeWidth="2.2" points={makeLogLine(secantRes)} />
            )}
            {newtonRes.steps.length > 1 && (
              <polyline fill="none" stroke="#0F4C81" strokeWidth="2.4" points={makeLogLine(newtonRes)} />
            )}

            {[1, 5, 10, 15, 20].filter((v) => v <= maxIterPlot).map((it) => (
              <text
                key={it}
                x={toX(it)}
                y={chartH - padB + 16}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] font-mono-tabular"
              >
                Iter {it}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Step-by-Step Iteration Log */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h4 className="text-sm font-semibold text-slate-900">
            Step-by-Step Iteration Log ({activeSummary.method})
          </h4>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveLogMethod('newton')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeLogMethod === 'newton' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Newton–Raphson ({newtonRes.iterations})
            </button>
            <button
              type="button"
              onClick={() => setActiveLogMethod('secant')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeLogMethod === 'secant' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Secant ({secantRes.iterations})
            </button>
            <button
              type="button"
              onClick={() => setActiveLogMethod('bisection')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeLogMethod === 'bisection' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Bisection ({bisectionRes.iterations})
            </button>
          </div>
        </div>

        {activeSummary.steps.length > 0 ? (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 px-2 text-left font-medium">Iteration</th>
                  <th className="py-2 px-2 text-right font-medium">Approximation t (h)</th>
                  <th className="py-2 px-2 text-right font-medium">Clock Equivalent</th>
                  <th className="py-2 px-2 text-right font-medium">Step Error |Δt|</th>
                  <th className="py-2 px-2 text-right font-medium">Residual |h(t) - target|</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono-tabular">
                {activeSummary.steps.map((step) => (
                  <tr key={step.iteration} className="hover:bg-slate-50">
                    <td className="py-2 px-2 text-slate-700 font-medium">{step.iteration}</td>
                    <td className="py-2 px-2 text-right text-slate-900 font-semibold">
                      {step.approximation.toFixed(8)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700">
                      {formatClockTime(step.approximation)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700">
                      {formatSci(step.stepError)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-600">
                      {formatSci(Math.abs(step.fValue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-amber-700 bg-amber-50 rounded-lg border border-amber-200">
            {activeSummary.reason ?? 'No iterations executed for the current bracket/guess.'}
          </div>
        )}
      </div>
    </div>
  );
};
