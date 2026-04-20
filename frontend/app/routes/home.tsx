import type { MetaFunction } from "react-router";
import { useState, useEffect } from "react";
import { useSimulator } from "../hooks/useSimulator";

export const meta: MetaFunction = () => {
  return [
    { title: "PolyTrack Simulator" },
    { name: "description", content: "GPS Telemetry Simulator" },
  ];
};

export default function Home() {
  const [deviceId, setDeviceId] = useState("550e8400-e29b-41d4-a716-446655440000");
  const [mounted, setMounted] = useState(false);
  
  const [startLat, setStartLat] = useState("28.147725");
  const [startLng, setStartLng] = useState("-81.848810");
  const [targetLat, setTargetLat] = useState("");
  const [targetLng, setTargetLng] = useState("");
  
  const startCoords: [number, number] | null = (startLat && startLng) ? [parseFloat(startLat), parseFloat(startLng)] : null;
  const targetCoords: [number, number] | null = (targetLat && targetLng) ? [parseFloat(targetLat), parseFloat(targetLng)] : null;

  const {
    isActive,
    setIsActive,
    isOnline,
    status,
    lastPoint,
    pointsTransmitted,
    cacheSize,
    flushCache
  } = useSimulator(deviceId, startCoords, targetCoords);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // Avoid hydration mismatch on initial render

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-slate-800/50 p-6 rounded-2xl border border-slate-700 backdrop-blur-md">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">PolyTrack</h1>
              <p className="text-slate-400 text-sm">Hardware-Free Telemetry Simulator</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`px-4 py-1.5 rounded-full text-sm font-medium border ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                <span>{isOnline ? 'Network Online' : 'Network Offline'}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Controls Panel */}
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl relative overflow-hidden group flex flex-col">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none" />
            <h2 className="text-xl font-semibold mb-4 flex items-center text-slate-200">
              <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Simulation Controls
            </h2>
            
            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Device ID (UUID)</label>
                <input 
                  type="text" 
                  value={deviceId} 
                  onChange={(e) => setDeviceId(e.target.value)}
                  disabled={isActive}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 font-mono text-sm shadow-inner"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Origin Lat</label>
                    <input 
                      type="text" 
                      value={startLat} 
                      onChange={(e) => setStartLat(e.target.value)}
                      disabled={isActive}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 font-mono text-xs shadow-inner"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Origin Lng</label>
                    <input 
                      type="text" 
                      value={startLng} 
                      onChange={(e) => setStartLng(e.target.value)}
                      disabled={isActive}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 font-mono text-xs shadow-inner"
                    />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Target Lat (Opt)</label>
                    <input 
                      type="text" 
                      value={targetLat} 
                      placeholder="e.g. 28.150"
                      onChange={(e) => setTargetLat(e.target.value)}
                      disabled={isActive}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 font-mono text-xs shadow-inner"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Target Lng (Opt)</label>
                    <input 
                      type="text" 
                      value={targetLng} 
                      placeholder="e.g. -81.855"
                      onChange={(e) => setTargetLng(e.target.value)}
                      disabled={isActive}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 font-mono text-xs shadow-inner"
                    />
                 </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`w-full flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-300 shadow-lg ${
                    isActive 
                      ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25"
                  }`}
                >
                  <span className="mr-2">{isActive ? "⏹ Stop Simulation" : "▶ Start Broadcasting"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Telemetry Stats */}
          <div className="md:col-span-2 bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
             <h2 className="text-xl font-semibold mb-6 flex items-center text-slate-200">
              <svg className="w-5 h-5 mr-2 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Live Telemetry Stream
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700/50 shadow-inner">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Status</div>
                <div className="text-lg font-medium text-slate-200 capitalize">
                  {status === 'running' ? <span className="text-emerald-400">Running</span> : 
                   status === 'error' ? <span className="text-yellow-400">Caching</span> : 
                   status === 'idle' ? <span className="text-slate-500">Idle</span> : 
                   status}
                </div>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700/50 shadow-inner">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Transmitted</div>
                <div className="text-xl font-bold text-blue-400 font-mono">{pointsTransmitted}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700/50 relative overflow-hidden shadow-inner flex flex-col justify-between">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1 z-10">Cached Loc.</div>
                <div className="text-xl font-bold text-yellow-400 font-mono z-10">{cacheSize}</div>
                {cacheSize > 0 && <div className="absolute inset-0 bg-yellow-400/5 animate-pulse" />}
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700/50 flex flex-col justify-end shadow-inner">
                 <button
                    onClick={async () => {
                       const btn = document.activeElement as HTMLElement;
                       btn.innerText = "Flushing...";
                       const success = await flushCache();
                       if (success) {
                         alert("Successfully flushed cached telemetry to the PolyTrack server.");
                       } else {
                         alert("Failed to flush cache. The backend API may be unreachable, or the payload might be rejected. Check browser console.");
                       }
                       btn.innerText = "Flush Data";
                    }}
                    disabled={cacheSize === 0 || !isOnline}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 rounded-lg text-sm text-slate-300 transition-colors font-medium flex items-center justify-center"
                 >
                   Flush Data
                 </button>
              </div>
            </div>

            {/* Current Coordinates Payload Viewer */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-inner">
              <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700 flex justify-between items-center text-xs">
                <span className="font-mono text-slate-400">latest_payload.json</span>
                {lastPoint && <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded animate-pulse">Updated</span>}
              </div>
              <div className="p-4 overflow-auto max-h-[250px] font-mono text-sm text-blue-300">
                {lastPoint ? (
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify({
                      device_id: deviceId,
                      ...lastPoint,
                      batch_id: null
                    }, null, 2)}
                  </pre>
                ) : (
                  <div className="text-slate-500 flex items-center justify-center h-32 italic">
                    {isActive ? "Awaiting GPS signal..." : "Simulation stopped. No data."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
