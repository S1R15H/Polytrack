import { useState, useEffect } from 'react';
import { getSavedRoutes, deleteSavedRoute } from '../lib/api';
import type { SavedRoute } from '../lib/api';

interface SavedRoutesPanelProps {
  onClose: () => void;
  onRouteSelect: (route: SavedRoute) => void;
  onShowToast?: (msg: string) => void;
}

export function SavedRoutesPanel({ onClose, onRouteSelect, onShowToast }: SavedRoutesPanelProps) {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRoutes() {
      try {
        setIsLoading(true);
        const data = await getSavedRoutes();
        setRoutes(data);
      } catch (err) {
        setError('Failed to load saved routes');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRoutes();
  }, []);

  const handleDelete = async (id: string) => {

    try {
      setDeletingId(id);
      await deleteSavedRoute(id);
      setRoutes(prev => prev.filter(r => r.id !== id));
      if (onShowToast) onShowToast("Saved route deleted.");
    } catch (err) {
      console.error(err);
      alert('Failed to delete route.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className="absolute inset-0 md:relative md:inset-auto w-full md:w-[400px] max-w-full bg-white h-full flex flex-col shadow-2xl z-[2000] border-r border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 p-5 border-b border-gray-100">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">Saved Routes</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="text-sm">Loading saved routes...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {!isLoading && routes.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 px-6 gap-3">
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-sm">No saved routes yet. Search for directions and click "Save Route" to keep them here.</p>
          </div>
        )}

        {!isLoading && routes.map((route) => (
          <div 
            key={route.id} 
            onClick={() => onRouteSelect(route)}
            className="cursor-pointer hover:bg-gray-50 rounded-xl p-4 border border-gray-100 shadow-sm transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 truncate pr-2">{route.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 whitespace-nowrap">
                  {route.duration}
                </span>
                {confirmDeleteId === route.id ? (
                  <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded-md border border-red-100">
                    <span className="text-xs font-semibold text-red-600 mr-1">Confirm?</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(route.id); }}
                      disabled={deletingId === route.id}
                      className="px-2 py-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                    >
                      {deletingId === route.id ? '...' : 'Yes'}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      disabled={deletingId === route.id}
                      className="px-2 py-1 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 border border-gray-200 rounded transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(route.id); }}
                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 hover:border-red-200 border border-transparent transition-all"
                    title="Delete Route"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1 line-clamp-1">
               <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
               <span className="truncate">{route.origin_name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-3 line-clamp-1">
               <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
               <span className="truncate">{route.destination_name}</span>
            </div>

            <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
              <div className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {route.distance}
              </div>
              <div className="flex items-center gap-1 capitalize">
                {route.mode} Mode
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
