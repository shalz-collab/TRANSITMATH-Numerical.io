import React, { useMemo, useState } from 'react';
import { Database, Download, Copy, Check } from 'lucide-react';
import {
  DATASET_PROVENANCE,
  MtcRouteDefinition,
  OBSERVATION_PRESETS,
  OBSERVATION_TIMES,
  ObservationPresetId,
  exactHeadway,
  formatClockTime,
} from '../math/numericalMethods';

export interface DatasetProvenancePanelProps {
  presetId: ObservationPresetId;
  observations: number[];
  cvFactor: number;
  route: MtcRouteDefinition;
}

export const DatasetProvenancePanel: React.FC<DatasetProvenancePanelProps> = ({
  presetId,
  observations,
  cvFactor,
  route,
}) => {
  const [copiedGtfs, setCopiedGtfs] = useState(false);

  const waitMultiplier = 1 + cvFactor * cvFactor;

  const datasetRows = useMemo(() => {
    return OBSERVATION_TIMES.map((t, idx) => {
      const exactH = exactHeadway(t);
      const observedH = observations[idx];
      const roundingDelta = observedH - exactH;
      const waitMin = (observedH / 2) * waitMultiplier;
      return {
        t,
        clock: formatClockTime(t),
        exactH,
        observedH,
        roundingDelta,
        waitMin,
      };
    });
  }, [observations, waitMultiplier]);

  const gtfsStopTimesSample = useMemo(() => {
    const lines = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence,observed_headway_min'];
    OBSERVATION_TIMES.forEach((t, idx) => {
      const hourStr = String(7 + t).padStart(2, '0');
      const timeStr = `${hourStr}:00:00`;
      const station = route.stations[route.monitoredStationIndex];
      lines.push(
        `MTC_${route.id}_AM_${idx + 1},${timeStr},${timeStr},${station.id.toUpperCase()},${route.monitoredStationIndex + 1},${observations[idx].toFixed(1)}`
      );
    });
    return lines.join('\n');
  }, [observations, route]);

  const handleCopyGtfs = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(gtfsStopTimesSample);
      setCopiedGtfs(true);
      setTimeout(() => setCopiedGtfs(false), 1800);
    }
  };

  const handleDownloadJson = () => {
    const payload = {
      provenance: DATASET_PROVENANCE,
      activePreset: presetId,
      route: {
        id: route.id,
        label: route.label,
        corridorLengthKm: route.corridorLengthKm,
        stations: route.stations,
      },
      observations: datasetRows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transitmath_dataset_${route.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            04. Source Dataset &amp; GTFS / AIS-140 Provenance
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Exact origin, sampling structure, and GTFS stop-time representation of the headway observations driving this simulation.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadJson}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F4C81] hover:bg-[#0C3B66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Download Dataset JSON</span>
        </button>
      </div>

      {/* Provenance Summary & Origin Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0F4C81]" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-900">
              Where the Dataset Was Taken From
            </h4>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {DATASET_PROVENANCE.originSummary}
          </p>

          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <div>
              <span className="font-semibold text-slate-800">Active Dataset Mode: </span>
              <span className="text-slate-600">
                {presetId === 'custom'
                  ? 'Custom User-Edited Hourly Observations'
                  : OBSERVATION_PRESETS[presetId].label}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Time Window: </span>
              <span className="font-mono-tabular text-slate-600">{DATASET_PROVENANCE.window}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Sampling Knots: </span>
              <span className="font-mono-tabular text-slate-600">
                {DATASET_PROVENANCE.samplingInterval}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Academic Origin: </span>
              <span className="text-slate-600">{DATASET_PROVENANCE.academicSource}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-800 mb-1.5">
              Schema &amp; Standards Mapping
            </div>
            <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
              {DATASET_PROVENANCE.standards.map((st) => (
                <li key={st}>{st}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Hourly Observation Table */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-semibold text-slate-900">
                Hourly Observed Headway Dataset ({route.label})
              </h4>
              <span className="text-xs font-mono-tabular text-slate-500">
                0.1-min GPS / AVL discretization
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-left font-medium">t (h)</th>
                    <th className="py-2 text-left font-medium">Clock</th>
                    <th className="py-2 text-right font-medium">Model h(t) (min)</th>
                    <th className="py-2 text-right font-medium">Observed h_obs (min)</th>
                    <th className="py-2 text-right font-medium">Rounding Δ (min)</th>
                    <th className="py-2 text-right font-medium">Wait W(t) (min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-tabular">
                  {datasetRows.map((row) => (
                    <tr key={row.t} className="hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-semibold">{row.t.toFixed(1)}</td>
                      <td className="py-2.5 text-slate-700">{row.clock}</td>
                      <td className="py-2.5 text-right text-slate-600">{row.exactH.toFixed(6)}</td>
                      <td className="py-2.5 text-right text-[#0F4C81] font-semibold">
                        {row.observedH.toFixed(3)}
                      </td>
                      <td className="py-2.5 text-right text-slate-600">
                        {row.roundingDelta >= 0 ? '+' : ''}
                        {row.roundingDelta.toFixed(5)}
                      </td>
                      <td className="py-2.5 text-right text-slate-900">{row.waitMin.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GTFS stop_times.txt Formatted Feed Preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  GTFS stop_times.txt Input Representation
                </h4>
                <p className="text-xs text-slate-500">
                  Formatted for MobilityData GTFS stop-time ingestion at monitored shelter ({route.stations[route.monitoredStationIndex].name})
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyGtfs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedGtfs ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy CSV</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono-tabular overflow-x-auto leading-relaxed">
              {gtfsStopTimesSample}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
