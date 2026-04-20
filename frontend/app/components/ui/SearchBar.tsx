import { useState, useRef, useEffect, useCallback } from 'react';

export interface GeocodedLocation {
  lat: number;
  lng: number;
  displayName: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface SearchBarProps {
  value?: string;
  onChange?: (val: string) => void;
  onSearch?: (location: GeocodedLocation) => void;
  onAiClick?: () => void;
  placeholder?: string;
  showAiButton?: boolean;
  showQuickCategories?: boolean;
  icon?: React.ReactNode;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export function SearchBar({ 
  value, 
  onChange, 
  onSearch, 
  onAiClick,
  placeholder = "Search an address...", 
  showAiButton = false, 
  showQuickCategories = false,
  icon 
}: SearchBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Default to internal state if value/onChange are not provided
  const [internalQuery, setInternalQuery] = useState('');
  const query = value !== undefined ? value : internalQuery;
  
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        setSuggestions([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: text,
        format: 'json',
        limit: '5',
        addressdetails: '1',
      });

      const response = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { 'Accept-Language': 'en' },
      });

      if (response.ok) {
        const data: NominatimResult[] = await response.json();
        setSuggestions(data);
      }
    } catch (err) {
      console.warn('Nominatim geocoding failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (newVal: string) => {
    if (onChange) {
      onChange(newVal);
    } else {
      setInternalQuery(newVal);
    }

    // Debounce: wait 1000ms after user stops typing before hitting Nominatim (Usage policy compliance)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newVal);
    }, 1000);
  };

  const selectSuggestion = (result: NominatimResult) => {
    const location: GeocodedLocation = {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
    };

    const shortName = result.display_name.split(',')[0];
    if (onChange) {
      onChange(shortName);
    } else {
      setInternalQuery(shortName);
    }
    
    setSuggestions([]);
    setIsExpanded(false);

    if (onSearch) {
      onSearch(location);
    }
  };

  const handleSubmit = () => {
    // If there's a top suggestion, select it on Enter
    if (suggestions.length > 0) {
      selectSuggestion(suggestions[0]);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md z-50">
      <div
        className="bg-white rounded-2xl shadow-sm border border-gray-200 flex items-center px-4 py-2 flex-1 cursor-text hover:shadow-md transition-shadow group focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300"
        onClick={() => setIsExpanded(true)}
      >
        {isExpanded ? (
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              setIsExpanded(false); 
              if (onChange) onChange(''); else setInternalQuery(''); 
              setSuggestions([]); 
            }}
            className="mr-3 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        ) : (
          icon ? <div className="mr-3">{icon}</div> : (
            <svg className="w-4 h-4 text-gray-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )
        )}

        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="flex-1 bg-transparent min-w-[200px] outline-none text-gray-800 placeholder-gray-400 text-sm font-medium"
        />

        {isLoading && (
          <div className="ml-2 w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
        )}

        {showAiButton && (
          <button 
            onClick={(e) => { e.stopPropagation(); onAiClick?.(); }}
            className="ml-2 flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 transition-colors border border-purple-200 active:scale-95"
            title="Ask Campus AI"
          >
            <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-sm font-semibold text-purple-700">Ask AI</span>
          </button>
        )}
      </div>

      {/* Expanded dropdown: Suggestions or Quick Categories */}
      {isExpanded && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-top-2">
          {/* Nominatim suggestions */}
          {suggestions.length > 0 ? (
            <div className="px-2 py-2">
              {suggestions.map((result) => (
                <button
                  key={result.place_id}
                  onClick={() => selectSuggestion(result)}
                  className="w-full flex items-center gap-4 px-4 py-3 hover:bg-blue-50 rounded-xl transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {result.display_name.split(',')[0]}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{result.display_name}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Hint text */}
              {query.length > 0 && query.length < 3 && (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">
                  Type at least 3 characters to search...
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
