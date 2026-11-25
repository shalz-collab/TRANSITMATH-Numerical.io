import React from 'react';
import { Sliders, RotateCcw } from 'lucide-react';
import {
  InterpolationMethodId,
  ObservationPresetId,
  OBSERVATION_PRESETS,
  formatClockTime,
} from '../math/numericalMethods';

export interface SimulationControlDeckProps {
  presetId: ObservationPresetId;
  activeModelId: InterpolationMethodId;
  targetHeadway: number;
  cvFactor: number;
  simTime: number;
  currentHeadway: number;
  currentWait: number;
  targetRootTime: number | null;
  onSelectPreset: (id: Exclude<ObservationPresetId, 'custom'>) => void;
  onSelectModel: (id: InterpolationMethodId) => void;
  onChangeTargetHeadway: (val: number) => void;
  onChangeCvFactor: (val: number) => void;
  onResetDefaults: () => void;
}

const MODEL_OPTIONS: { id: InterpolationMethodId; label: string; detail: string }[] = [
  { id: 'exact', label: 'Exact h(t)', detail: '10 - 4·sin(πt/4)' },
  { id: 'newton', label: 'Newton Poly', detail: 'Degree-4 divided diff' },
  { id: 'natural_spline', label: 'Natural Spline', detail: 'Piecewise cubic S″=0' },
  { id: 'clamped_spline', label: 'Clamped Spline', detail: 'S′(0)=-π, S′(4)=+π' },
];

export const SimulationControlDeck: React.FC<SimulationControlDeckProps> = ({
  presetId,
  activeModelId,
  targetHeadway,
  cvFactor,
  simTime,
  currentHeadway,
  currentWait,
  targetRootTime,
  onSelectPreset,
  onSelectModel,
  onChangeTargetHeadway,
  onChangeCvFactor,
  onResetDefaults,
}) => {
  return (
    <aside className="bg-white border border-slate-200 rounded-xl flex flex-col justify-between h-full">
      <div>
        {/* Deck Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#0F4C81]" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              Model Parameters
            </h2>
          </div>
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Defaults</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Dataset Preset Selector */}
          <div>
            <label
              htmlFor="preset-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Hourly Observation Dataset (7 AM – 11 AM)
            </label>
            <select
              id="preset-select"
              value={presetId}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'custom') {
                  onSelectPreset(val as Exclude<ObservationPresetId, 'custom'>);
                }
              }}
              className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81]"
            >
              {Object.values(OBSERVATION_PRESETS).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              {presetId === 'custom' && (
                <option value="custom">Custom Edited Hourly Data</option>
              )}
            </select>
            <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
              {presetId === 'custom'
                ? 'Using manually adjusted hourly headway inputs from the Interpolation tab.'
                : OBSERVATION_PRESETS[presetId].description}
            </p>
          </div>

          {/* Driving Headway Model Selector */}
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1.5">
              Active Headway Model Driving Buses
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
              {MODEL_OPTIONS.map((opt) => {
                const isExactDisabled = opt.id === 'exact' && presetId !== 'pdf_rounded' && presetId !== 'exact_model';
                const active = activeModelId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isExactDisabled}
                    onClick={() => onSelectModel(opt.id)}
                    className={`px-2.5 py-2 text-left rounded-md transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <div className="text-xs font-semibold whitespace-nowrap truncate">{opt.label}</div>
                    <div className="text-[11px] text-slate-500 whitespace-nowrap truncate">{opt.detail}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Service-Level Headway Slider */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="target-headway-slider" className="text-xs font-semibold text-slate-700">
                Target Headway Threshold (h*)
              </label>
              <span className="font-mono-tabular text-xs font-semibold text-[#0F4C81]">
                {targetHeadway.toFixed(1)} min
              </span>
            </div>
            <input
              id="target-headway-slider"
              type="range"
              min={6.2}
              max={9.5}
              step={0.1}
              value={targetHeadway}
              onChange={(e) => onChangeTargetHeadway(parseFloat(e.target.value))}
              className="transit-slider w-full"
            />
            <div className="flex justify-between text-[11px] font-mono-tabular text-slate-400 mt-1">
              <span>6.2 min</span>
              <span>7.0 min (Default)</span>
              <span>9.5 min</span>
            </div>
          </div>

          {/* Schedule Irregularity CV Slider (Slide 14 Limitation Factor) */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="cv-slider" className="text-xs font-semibold text-slate-700">
                Headway Irregularity (CV)
              </label>
              <span className="font-mono-tabular text-xs font-semibold text-slate-900">
                CV = {cvFactor.toFixed(2)} ({(1 + cvFactor * cvFactor).toFixed(2)}× wait)
              </span>
            </div>
            <input
              id="cv-slider"
              type="range"
              min={0}
              max={0.45}
              step={0.05}
              value={cvFactor}
              onChange={(e) => onChangeCvFactor(parseFloat(e.target.value))}
              className="transit-slider w-full"
            />
            <div className="flex justify-between text-[11px] font-mono-tabular text-slate-400 mt-1">
              <span>0.00 (Regular)</span>
              <span>0.25</span>
              <span>0.45 (Bunching)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Mathematical Evaluation Footer inside Deck */}
      <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/70 rounded-b-xl space-y-2.5">
        <div className="text-xs font-semibold text-slate-700">
          Live Evaluation at t = {simTime.toFixed(3)} h ({formatClockTime(simTime, false)})
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-slate-500">Headway h(t)</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-900">
              {currentHeadway.toFixed(4)} min
            </div>
          </div>
          <div>
            <div className="text-slate-500">Avg Wait W(t)</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-900">
              {currentWait.toFixed(4)} min
            </div>
          </div>
        </div>
        <div className="pt-2 border-t border-slate-200/80 text-[11px] font-mono-tabular text-slate-600 flex items-center justify-between gap-2">
          <span>W(t) = [h(t) / 2] · (1 + CV²)</span>
          <span>
            t* = {targetRootTime !== null ? `${targetRootTime.toFixed(5)} h` : 'Not reached'}
          </span>
        </div>
      </div>
    </aside>
  );
};
