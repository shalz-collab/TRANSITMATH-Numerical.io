import React from 'react';

export const StandardsReference: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          04. Engineering Standards, SDGs &amp; Capstone Reference
        </h3>
        <p className="text-sm text-slate-600 mt-0.5">
          UBA1024 Numerical Methods Capstone Project · SIMATS Engineering (Academic Year 2026–2027)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Engineering Standards & Constraints */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">
            Engineering Standards &amp; Computational Compliance
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-medium">Standard</th>
                  <th className="py-2 text-left font-medium">Issuing Body</th>
                  <th className="py-2 text-left font-medium">Role in Transit Simulation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 font-mono-tabular font-semibold text-slate-900">IEEE 754</td>
                  <td className="py-2.5 text-slate-700">IEEE</td>
                  <td className="py-2.5 text-slate-600">
                    Double-precision floating-point arithmetic used across all interpolants, quadrature, and root solvers (round-off ≈ 2.2 × 10⁻¹⁶).
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 font-mono-tabular font-semibold text-slate-900">AIS-140</td>
                  <td className="py-2.5 text-slate-700">ARAI (AISC), India</td>
                  <td className="py-2.5 text-slate-600">
                    Public transport vehicle-tracking telemetry specification governing real-time GPS bus arrival feeds.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 font-mono-tabular font-semibold text-slate-900">GTFS</td>
                  <td className="py-2.5 text-slate-700">MobilityData</td>
                  <td className="py-2.5 text-slate-600">
                    Standard schedule and stop-time format used to structure discrete hourly headway observations.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
            <div>
              <div className="font-semibold text-slate-900 mb-1">Model Limitations</div>
              <p className="leading-relaxed">
                Standard W(t) = h(t)/2 assumes regular arrivals and uniform passenger flow. Irregular headways introduce the multiplier (1 + CV²), adjustable via the CV slider above.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900 mb-1">Advisory Safety Scope</div>
              <p className="leading-relaxed">
                Headway and wait estimates are advisory analytics built on anonymized commuter counts; not intended for safety-critical vehicle dispatch control.
              </p>
            </div>
          </div>
        </div>

        {/* SDGs & Project Team */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">
              UN Sustainable Development Goals Alignment
            </h4>
            <div className="space-y-3 text-xs">
              <div className="pb-3 border-b border-slate-100">
                <div className="font-semibold text-[#0F4C81]">
                  SDG 11 · Sustainable Cities &amp; Communities (Target 11.2)
                </div>
                <p className="text-slate-600 mt-0.5">
                  Accurate arrival and waiting-time estimates let transit agencies tune headways, making public buses more reliable.
                </p>
              </div>
              <div className="pb-3 border-b border-slate-100">
                <div className="font-semibold text-[#0F4C81]">
                  SDG 9 · Industry, Innovation &amp; Infrastructure (Target 9.1)
                </div>
                <p className="text-slate-600 mt-0.5">
                  Lightweight numerical models operating on existing GPS/GTFS feeds provide low-cost resilient transport analytics.
                </p>
              </div>
              <div>
                <div className="font-semibold text-[#0F4C81]">
                  SDG 13 · Climate Action (Target 13.2)
                </div>
                <p className="text-slate-600 mt-0.5">
                  Shorter, predictable waits encourage modal shift from private vehicles to public transit, reducing urban emissions.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-2">
              Project Team &amp; Supervision
            </h4>
            <div className="space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between gap-2">
                <span>Monica AR</span>
                <span className="font-mono-tabular text-slate-500">192211024</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Infant Ency L</span>
                <span className="font-mono-tabular text-slate-500">1965260003</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Shalini M</span>
                <span className="font-mono-tabular text-slate-500">192311434</span>
              </div>
              <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between gap-2 text-slate-600">
                <span>Supervisor</span>
                <span className="font-medium text-slate-900">Diana Grace Thomas</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
