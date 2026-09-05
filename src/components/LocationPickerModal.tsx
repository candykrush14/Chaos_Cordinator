import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin,
  Compass,
  Navigation,
  Check,
  X,
  ExternalLink,
  Info,
  Globe,
  Trash2,
  Search,
  Loader2,
  Move,
} from 'lucide-react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import type { JournalLocation } from '../types';
import {
  getGoogleMapsApiKey,
  hasGoogleMapsApiKey,
  GMP_ATTRIBUTION_ID,
  GMP_MAP_ID,
  PRESET_JOURNAL_LOCATIONS,
  getGoogleMapsSearchUrl,
  searchCuratedPlaces,
  fallbackReverseGeocode,
  fetchReverseGeocodedLocation,
  type PresetLocation,
} from '../utils/maps';

interface LocationPickerModalProps {
  isOpen: boolean;
  currentLocation?: JournalLocation;
  onSave: (location: JournalLocation) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export interface DropdownOption {
  id: string;
  name: string;
  address: string;
  category?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  rawSuggestion?: any;
}

/**
 * Inner component mounted inside APIProvider when Google Maps API key is configured.
 * Has direct access to useMap() and useMapsLibrary('places').
 * Reverse geocoding is handled via the multi-tier backend proxy without invoking
 * the unbilled Google Maps Geocoding client service.
 */
const GoogleMapsConnectedModal: React.FC<{
  currentLocation?: JournalLocation;
  onSave: (location: JournalLocation) => void;
  onRemove?: () => void;
  onClose: () => void;
}> = ({ currentLocation, onSave, onRemove, onClose }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(37.7749);
  const [lng, setLng] = useState(-122.4194);
  const [activeTab, setActiveTab] = useState<'map' | 'presets'>('map');

  // Search and Top 5 Dropdown State
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // Reverse Geocoding & GPS Status
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<any>(null);

  // Initialize state on open
  useEffect(() => {
    if (currentLocation) {
      setName(currentLocation.name);
      setAddress(currentLocation.address || '');
      setLat(currentLocation.lat);
      setLng(currentLocation.lng);
      setSearchQuery(currentLocation.name);
    } else {
      setName('Kyoto Zen Bamboo Grove');
      setAddress('Arashiyama, Kyoto, 616-0007, Japan');
      setLat(35.0169);
      setLng(135.6713);
      setSearchQuery('Kyoto Zen Bamboo Grove');
    }
    setGeoError(null);
    setStatusNotification(null);
    setIsDropdownOpen(false);
  }, [currentLocation]);

  // Close dropdown on click outside
  useEffect(() => {
    const handlePointerDownOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDownOutside);
    return () => document.removeEventListener('mousedown', handlePointerDownOutside);
  }, []);

  /**
   * Reverse Geocoding logic:
   * Called when clicking on the map or dragging the cursor/pin.
   * Updates BOTH the location spot name AND vicinity address with real-world names
   * via our multi-tier proxy without invoking the unbilled Google Maps Geocoding service in the browser.
   */
  const performReverseGeocode = useCallback(
    async (targetLat: number, targetLng: number) => {
      setIsReverseGeocoding(true);
      setStatusNotification('Resolving location & vicinity...');

      try {
        const loc = await fetchReverseGeocodedLocation(targetLat, targetLng);
        setName(loc.name);
        setAddress(loc.address);
        setSearchQuery(loc.name);
        setStatusNotification(`Location resolved: ${loc.name}`);
      } catch (err) {
        console.warn('[LocationPicker] Reverse geocode error:', err);
        const fb = fallbackReverseGeocode(targetLat, targetLng);
        setName(fb.name);
        setAddress(fb.address);
        setSearchQuery(fb.name);
        setStatusNotification(`Location updated: ${fb.name}`);
      } finally {
        setIsReverseGeocoding(false);
      }
    },
    []
  );

  /**
   * Handle user interacting directly with map: clicking or dragging the cursor/pin
   */
  const handleMapPointChange = useCallback(
    (newLat: number, newLng: number) => {
      const roundedLat = Number(newLat.toFixed(6));
      const roundedLng = Number(newLng.toFixed(6));
      setLat(roundedLat);
      setLng(roundedLng);

      // Smoothly pan to the new cursor coordinate
      if (map) {
        map.panTo({ lat: roundedLat, lng: roundedLng });
      }

      // Immediately reverse geocode to update Location Spot Name & Vicinity Address!
      performReverseGeocode(roundedLat, roundedLng);
    },
    [map, performReverseGeocode]
  );

  /**
   * Search after each letter:
   * Generates strictly top 5 options combining live Google Places / Geocoder suggestions
   * with curated contemplative spots.
   */
  const handleSearchChange = (queryText: string) => {
    setSearchQuery(queryText);
    setHighlightedIndex(0);

    // Filter curated places first (instant response)
    const curatedMatches = searchCuratedPlaces(queryText, 5);
    const initialOptions: DropdownOption[] = curatedMatches.map((c) => ({
      id: `curated-${c.name}`,
      name: c.name,
      address: c.address,
      category: c.category,
      lat: c.lat,
      lng: c.lng,
    }));

    if (!queryText.trim()) {
      setDropdownOptions(initialOptions.slice(0, 5));
      setIsDropdownOpen(false);
      return;
    }

    setIsSearching(true);

    // If Google Places library is available, query live predictions
    if (placesLib?.AutocompleteSuggestion) {
      if (!sessionTokenRef.current && placesLib.AutocompleteSessionToken) {
        sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
      }

      placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: queryText,
        sessionToken: sessionTokenRef.current,
      })
        .then((res: any) => {
          setIsSearching(false);
          const suggestions = res?.suggestions || [];
          const gmpOptions: DropdownOption[] = suggestions.map((s: any, idx: number) => ({
            id: `gmp-${idx}-${s.placePrediction?.placeId || idx}`,
            name: s.placePrediction?.text?.text || s.placePrediction?.mainText?.text || 'Location',
            address: s.placePrediction?.secondaryText?.text || s.placePrediction?.text?.text || '',
            category: 'Google Maps Place',
            rawSuggestion: s,
          }));

          // Merge GMP options with curated list without duplicates, strictly capped at 5
          const merged: DropdownOption[] = [...gmpOptions];
          for (const cur of initialOptions) {
            if (merged.length >= 5) break;
            if (!merged.some((m) => m.name.toLowerCase() === cur.name.toLowerCase())) {
              merged.push(cur);
            }
          }

          const top5 = merged.slice(0, 5);
          setDropdownOptions(top5);
          setIsDropdownOpen(top5.length > 0);
        })
        .catch(() => {
          setIsSearching(false);
          setDropdownOptions(initialOptions.slice(0, 5));
          setIsDropdownOpen(initialOptions.length > 0);
        });
    } else if (placesLib?.AutocompleteService) {
      const service = new placesLib.AutocompleteService();
      service.getPlacePredictions({ input: queryText }, (predictions: any[]) => {
        setIsSearching(false);
        if (predictions && predictions.length > 0) {
          const gmpOptions: DropdownOption[] = predictions.map((p, idx) => ({
            id: `gmp-${idx}-${p.place_id}`,
            name: p.structured_formatting?.main_text || p.description,
            address: p.structured_formatting?.secondary_text || p.description,
            category: 'Google Maps Place',
            placeId: p.place_id,
          }));

          const merged: DropdownOption[] = [...gmpOptions];
          for (const cur of initialOptions) {
            if (merged.length >= 5) break;
            if (!merged.some((m) => m.name.toLowerCase() === cur.name.toLowerCase())) {
              merged.push(cur);
            }
          }

          const top5 = merged.slice(0, 5);
          setDropdownOptions(top5);
          setIsDropdownOpen(top5.length > 0);
        } else {
          setDropdownOptions(initialOptions.slice(0, 5));
          setIsDropdownOpen(initialOptions.length > 0);
        }
      });
    } else {
      setIsSearching(false);
      setDropdownOptions(initialOptions.slice(0, 5));
      setIsDropdownOpen(initialOptions.length > 0);
    }
  };

  /**
   * Selection handler for dropdown items:
   * Updates location, vicinity address, coordinates, and brings the cursor/map camera
   * directly to that location.
   */
  const handleSelectOption = async (option: DropdownOption) => {
    setIsDropdownOpen(false);
    setSearchQuery(option.name);
    setStatusNotification(`Selected: ${option.name}`);

    // If this is a Google Place suggestion
    if (option.rawSuggestion?.placePrediction?.toPlace) {
      try {
        const place = option.rawSuggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        if (place.location) {
          const targetLat = Number(place.location.lat().toFixed(6));
          const targetLng = Number(place.location.lng().toFixed(6));
          const targetName = place.displayName || option.name;
          const targetAddress = place.formattedAddress || option.address;

          setLat(targetLat);
          setLng(targetLng);
          setName(targetName);
          setAddress(targetAddress);

          if (map) {
            map.panTo({ lat: targetLat, lng: targetLng });
            map.setZoom(15);
          }

          // Reset session token after selection
          sessionTokenRef.current = null;
          return;
        }
      } catch (err) {
        console.warn('Place fetchFields error:', err);
      }
    }

    if (option.placeId && placesLib) {
      if (placesLib.Place) {
        try {
          const place = new placesLib.Place({ id: option.placeId });
          await place.fetchFields({
            fields: ['displayName', 'formattedAddress', 'location'],
          });
          if (place.location) {
            const targetLat = Number(place.location.lat().toFixed(6));
            const targetLng = Number(place.location.lng().toFixed(6));
            const targetName = place.displayName || option.name;
            const targetAddress = place.formattedAddress || option.address;

            setLat(targetLat);
            setLng(targetLng);
            setName(targetName);
            setAddress(targetAddress);

            if (map) {
              map.panTo({ lat: targetLat, lng: targetLng });
              map.setZoom(15);
            }
            return;
          }
        } catch (err) {
          console.warn('Place id fetchFields error:', err);
        }
      }

      if (placesLib.PlacesService && map) {
        try {
          const service = new placesLib.PlacesService(map);
          service.getDetails(
            { placeId: option.placeId, fields: ['name', 'formatted_address', 'geometry'] },
            (placeResult, status) => {
              if (status === 'OK' && placeResult?.geometry?.location) {
                const targetLat = Number(placeResult.geometry.location.lat().toFixed(6));
                const targetLng = Number(placeResult.geometry.location.lng().toFixed(6));
                const targetName = placeResult.name || option.name;
                const targetAddress = placeResult.formatted_address || option.address;

                setLat(targetLat);
                setLng(targetLng);
                setName(targetName);
                setAddress(targetAddress);

                map.panTo({ lat: targetLat, lng: targetLng });
                map.setZoom(15);
              }
            }
          );
          return;
        } catch (err) {
          console.warn('PlacesService getDetails error:', err);
        }
      }
    }

    // Curated spot with known coordinates
    if (option.lat !== undefined && option.lng !== undefined) {
      const targetLat = Number(option.lat.toFixed(6));
      const targetLng = Number(option.lng.toFixed(6));

      setLat(targetLat);
      setLng(targetLng);
      setName(option.name);
      setAddress(option.address);

      if (map) {
        map.panTo({ lat: targetLat, lng: targetLng });
        map.setZoom(15);
      }
    }
  };

  /**
   * Keyboard accessibility for dropdown (ArrowDown, ArrowUp, Enter, Escape)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || dropdownOptions.length === 0) {
      if (e.key === 'ArrowDown') {
        handleSearchChange(searchQuery);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % dropdownOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + dropdownOptions.length) % dropdownOptions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownOptions[highlightedIndex]) {
        handleSelectOption(dropdownOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  // Browser GPS detection
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        handleMapPointChange(userLat, userLng);
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        setGeoError('Location permission denied or unavailable.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelectPreset = (preset: PresetLocation) => {
    setName(preset.name);
    setAddress(preset.address);
    setLat(preset.lat);
    setLng(preset.lng);
    setSearchQuery(preset.name);
    setStatusNotification(`Preset loaded: ${preset.name}`);

    if (map) {
      map.panTo({ lat: preset.lat, lng: preset.lng });
      map.setZoom(14);
    }
  };

  const handleSave = () => {
    onSave({
      name: name.trim() || 'Reflective Spot',
      address: address.trim() || undefined,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    });
    onClose();
  };

  return (
    <div
      id="location-picker-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 sm:p-6"
    >
      <div
        id="location-picker-modal-container"
        className="relative w-full max-w-xl rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7] p-5 sm:p-6 shadow-xl text-[#3d3d3d] max-h-[92vh] overflow-y-auto flex flex-col gap-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5e0d8] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5a5a40] text-white shadow-2xs">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#3d3d3d]">
                Pin Location to Entry
              </h2>
              <p className="text-xs text-[#8c8579]">
                Interactive map cursor, real-time vicinity geocoding & top 5 search
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#8c8579] hover:text-[#3d3d3d] hover:bg-[#f5f2ed] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Input with Dynamic Top 5 Dropdown */}
        <div ref={searchContainerRef} className="relative w-full">
          <label className="block text-xs font-semibold text-[#3d3d3d] mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-[#5a5a40]" />
              Search Spot or City (Selectable Dropdown)
            </span>
            <span className="text-[10px] text-[#8c8579] font-normal">
              Searches after each letter • Top 5 options
            </span>
          </label>
          <div className="relative">
            <input
              type="text"
              id="location-search-input"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (dropdownOptions.length > 0) setIsDropdownOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type to search (e.g. Kyoto, Central Park, Big Sur, Paris, Lake Como)..."
              className="w-full rounded-xl border border-[#e5e0d8] bg-white pl-9 pr-9 py-2.5 text-xs text-[#3d3d3d] placeholder:text-[#8c8579]/60 focus:border-[#5a5a40] focus:ring-1 focus:ring-[#5a5a40]/30 focus:outline-none transition-all shadow-2xs"
            />
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#8c8579]" />
            {isSearching ? (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 text-[#5a5a40] animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDropdownOptions([]);
                  setIsDropdownOpen(false);
                }}
                className="absolute right-2.5 top-2.5 p-0.5 rounded text-[#8c8579] hover:text-[#3d3d3d] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Top 5 Selectable Dropdown Menu */}
          {isDropdownOpen && dropdownOptions.length > 0 && (
            <div
              id="location-dropdown-menu"
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-50 overflow-hidden rounded-xl border border-[#e5e0d8] bg-white shadow-xl py-1 animate-in fade-in-50 duration-150"
            >
              <div className="px-3 py-1 bg-[#fdfbf7] border-b border-[#e5e0d8] flex items-center justify-between text-[10px] font-semibold text-[#8c8579] uppercase tracking-wider">
                <span>Top 5 Matches</span>
                <span>Click or Press Enter</span>
              </div>
              {dropdownOptions.map((opt, index) => {
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    role="option"
                    aria-selected={isHighlighted}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelectOption(opt)}
                    className={`w-full px-3.5 py-2.5 text-left flex items-start gap-2.5 transition-colors cursor-pointer border-b last:border-b-0 border-[#f5f2ed] ${
                      isHighlighted ? 'bg-[#5a5a40]/10 text-[#3d3d3d]' : 'hover:bg-[#f5f2ed]'
                    }`}
                  >
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#5a5a40]/10 text-[#5a5a40]">
                      <MapPin className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-[#3d3d3d] truncate">
                          {opt.name}
                        </span>
                        {opt.category && (
                          <span className="shrink-0 text-[9px] font-medium text-[#5a5a40] bg-[#f5f2ed] px-1.5 py-0.5 rounded border border-[#e5e0d8]/80">
                            {opt.category}
                          </span>
                        )}
                      </div>
                      {opt.address && (
                        <span className="text-[11px] text-[#8c8579] truncate block mt-0.5">
                          {opt.address}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* View switcher tabs & GPS button */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl bg-[#f5f2ed] p-1 border border-[#e5e0d8]">
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'map'
                  ? 'bg-white text-[#3d3d3d] shadow-2xs'
                  : 'text-[#8c8579] hover:text-[#3d3d3d]'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Interactive Map</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'presets'
                  ? 'bg-white text-[#3d3d3d] shadow-2xs'
                  : 'text-[#8c8579] hover:text-[#3d3d3d]'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Sanctuaries</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#5a5a40]/30 bg-[#f5f2ed] px-3 py-1.5 text-xs font-medium text-[#5a5a40] hover:bg-[#e5e0d8] transition-colors cursor-pointer disabled:opacity-50"
            title="Detect your device GPS coordinates"
          >
            <Navigation className={`h-3.5 w-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'Detecting GPS...' : 'Use Current Location'}</span>
          </button>
        </div>

        {geoError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{geoError}</span>
          </div>
        )}

        {/* Tab 1: Interactive Google Maps with Live Cursor & Click-to-Reverse-Geocode */}
        {activeTab === 'map' && (
          <div className="flex flex-col gap-2">
            <div className="relative h-64 w-full overflow-hidden rounded-xl border border-[#e5e0d8] shadow-2xs">
              <Map
                center={{ lat, lng }}
                zoom={13}
                mapId={GMP_MAP_ID}
                internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
                onClick={(e) => {
                  if (e.detail.latLng) {
                    handleMapPointChange(e.detail.latLng.lat, e.detail.latLng.lng);
                  }
                }}
                style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
                gestureHandling="greedy"
                disableDefaultUI={false}
              >
                <AdvancedMarker
                  position={{ lat, lng }}
                  draggable={true}
                  onDrag={(e) => {
                    const dragLat = e.latLng
                      ? typeof e.latLng.lat === 'function'
                        ? e.latLng.lat()
                        : (e.latLng as any).lat
                      : null;
                    const dragLng = e.latLng
                      ? typeof e.latLng.lng === 'function'
                        ? e.latLng.lng()
                        : (e.latLng as any).lng
                      : null;
                    if (dragLat != null && dragLng != null) {
                      setLat(Number(dragLat.toFixed(6)));
                      setLng(Number(dragLng.toFixed(6)));
                    }
                  }}
                  onDragEnd={(e) => {
                    const endLat = e.latLng
                      ? typeof e.latLng.lat === 'function'
                        ? e.latLng.lat()
                        : (e.latLng as any).lat
                      : null;
                    const endLng = e.latLng
                      ? typeof e.latLng.lng === 'function'
                        ? e.latLng.lng()
                        : (e.latLng as any).lng
                      : null;
                    if (endLat != null && endLng != null) {
                      handleMapPointChange(endLat, endLng);
                    }
                  }}
                >
                  <Pin background="#5a5a40" glyphColor="#ffffff" borderColor="#3d3d3d" />
                </AdvancedMarker>
              </Map>

              {/* Status and instruction pill */}
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                <div className="rounded-lg bg-white/95 px-2.5 py-1 text-[11px] font-medium text-[#3d3d3d] backdrop-blur-xs border border-[#e5e0d8] shadow-2xs flex items-center gap-1.5 pointer-events-auto">
                  <Move className="h-3 w-3 text-[#5a5a40]" />
                  <span>Click map or drag pin to update location & vicinity</span>
                </div>
                {isReverseGeocoding && (
                  <div className="rounded-lg bg-[#5a5a40] px-2 py-1 text-[10px] font-medium text-white shadow-2xs flex items-center gap-1 pointer-events-auto">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Resolving vicinity...</span>
                  </div>
                )}
              </div>

              {/* Coordinates & vicinity indicator at bottom */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-medium text-[#5a5a40] backdrop-blur-xs border border-[#e5e0d8] shadow-2xs">
                <div className="flex items-center gap-1.5 truncate mr-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#5a5a40]" />
                  <span className="font-mono text-[#3d3d3d]">
                    {lat.toFixed(4)}°, {lng.toFixed(4)}°
                  </span>
                  {address && (
                    <span className="text-[#8c8579] truncate max-w-[220px]">
                      • {address}
                    </span>
                  )}
                </div>
                <a
                  href={getGoogleMapsSearchUrl(lat, lng, name)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 shrink-0 font-semibold text-[#5a5a40] hover:underline text-[10px]"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>

            {statusNotification && (
              <div className="text-[11px] text-[#5a5a40] bg-[#5a5a40]/5 border border-[#5a5a40]/20 rounded-lg px-2.5 py-1 flex items-center justify-between">
                <span>{statusNotification}</span>
                <Check className="h-3 w-3 text-[#5a5a40]" />
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Preset Sanctuaries */}
        {activeTab === 'presets' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_JOURNAL_LOCATIONS.map((preset) => {
              const isSelected =
                Math.abs(preset.lat - lat) < 0.001 && Math.abs(preset.lng - lng) < 0.001;
              return (
                <button
                  type="button"
                  key={preset.name}
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#5a5a40] bg-[#5a5a40]/5 shadow-xs'
                      : 'border-[#e5e0d8] bg-white hover:bg-[#f5f2ed]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-serif font-bold text-sm text-[#3d3d3d]">
                      {preset.name}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-[#5a5a40]" />}
                  </div>
                  <span className="text-[10px] font-semibold text-[#5a5a40] uppercase tracking-wider mt-0.5">
                    {preset.category}
                  </span>
                  <span className="text-xs text-[#8c8579] mt-1 line-clamp-1">
                    {preset.address}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Live Location Form Inputs: Automatically updated from map clicks, drags & dropdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#e5e0d8]">
          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Location / Spot Name
            </label>
            <input
              type="text"
              id="location-name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSearchQuery(e.target.value);
              }}
              placeholder="e.g. Kyoto Zen Bamboo Grove"
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] placeholder:text-[#8c8579]/60 focus:border-[#5a5a40] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Vicinity or Address
            </label>
            <input
              type="text"
              id="location-vicinity-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Arashiyama, Kyoto, Japan"
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] placeholder:text-[#8c8579]/60 focus:border-[#5a5a40] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="any"
              id="location-lat-input"
              value={lat}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setLat(val);
                if (map) map.panTo({ lat: val, lng });
              }}
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] font-mono focus:border-[#5a5a40] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              id="location-lng-input"
              value={lng}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setLng(val);
                if (map) map.panTo({ lat, lng: val });
              }}
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] font-mono focus:border-[#5a5a40] focus:outline-none"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[#e5e0d8]">
          {currentLocation && onRemove ? (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium hover:underline cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Location</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#e5e0d8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3d3d3d] hover:bg-[#f5f2ed] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="confirm-pin-location-btn"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5a40] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#464632] transition-colors cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Pin to Entry</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Fallback modal component when Google Maps API key is not configured.
 * Uses the curated places database and coordinate geometry for search,
 * reverse geocoding, and interactive coordinate selection.
 */
const FallbackLocationModal: React.FC<{
  currentLocation?: JournalLocation;
  onSave: (location: JournalLocation) => void;
  onRemove?: () => void;
  onClose: () => void;
}> = ({ currentLocation, onSave, onRemove, onClose }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(37.7749);
  const [lng, setLng] = useState(-122.4194);
  const [activeTab, setActiveTab] = useState<'map' | 'presets'>('map');

  // Search and Top 5 Dropdown State
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentLocation) {
      setName(currentLocation.name);
      setAddress(currentLocation.address || '');
      setLat(currentLocation.lat);
      setLng(currentLocation.lng);
      setSearchQuery(currentLocation.name);
    } else {
      setName('Kyoto Zen Bamboo Grove');
      setAddress('Arashiyama, Kyoto, 616-0007, Japan');
      setLat(35.0169);
      setLng(135.6713);
      setSearchQuery('Kyoto Zen Bamboo Grove');
    }
  }, [currentLocation]);

  useEffect(() => {
    const handlePointerDownOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDownOutside);
    return () => document.removeEventListener('mousedown', handlePointerDownOutside);
  }, []);

  const handleSearchChange = (queryText: string) => {
    setSearchQuery(queryText);
    setHighlightedIndex(0);

    const matches = searchCuratedPlaces(queryText, 5);
    const options: DropdownOption[] = matches.map((c) => ({
      id: `curated-${c.name}`,
      name: c.name,
      address: c.address,
      category: c.category,
      lat: c.lat,
      lng: c.lng,
    }));

    setDropdownOptions(options);
    setIsDropdownOpen(queryText.trim().length > 0 && options.length > 0);
  };

  const handleSelectOption = (opt: DropdownOption) => {
    if (opt.lat !== undefined && opt.lng !== undefined) {
      const targetLat = Number(opt.lat.toFixed(6));
      const targetLng = Number(opt.lng.toFixed(6));
      setLat(targetLat);
      setLng(targetLng);
      setName(opt.name);
      setAddress(opt.address);
      setSearchQuery(opt.name);
      setIsDropdownOpen(false);
      setStatusNotification(`Selected: ${opt.name}`);
    }
  };

  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);

  const resolveFallbackPoint = async (targetLat: number, targetLng: number) => {
    setStatusNotification('Resolving location & vicinity...');
    try {
      const loc = await fetchReverseGeocodedLocation(targetLat, targetLng);
      setName(loc.name);
      setAddress(loc.address);
      setSearchQuery(loc.name);
      setStatusNotification(`Location resolved: ${loc.name}`);
    } catch {
      const fb = fallbackReverseGeocode(targetLat, targetLng);
      setName(fb.name);
      setAddress(fb.address);
      setSearchQuery(fb.name);
      setStatusNotification(`Location updated: ${fb.name}`);
    }
  };

  const calculateCanvasCoords = (clientX: number, clientY: number, rect: DOMRect) => {
    const xRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    const newLat = Number((lat + (0.5 - yRatio) * 0.2).toFixed(6));
    const newLng = Number((lng + (xRatio - 0.5) * 0.2).toFixed(6));
    return { newLat, newLng };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingCanvas(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const { newLat, newLng } = calculateCanvasCoords(e.clientX, e.clientY, rect);
    setLat(newLat);
    setLng(newLng);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCanvas) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { newLat, newLng } = calculateCanvasCoords(e.clientX, e.clientY, rect);
    setLat(newLat);
    setLng(newLng);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCanvas) return;
    setIsDraggingCanvas(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    const rect = e.currentTarget.getBoundingClientRect();
    const { newLat, newLng } = calculateCanvasCoords(e.clientX, e.clientY, rect);
    setLat(newLat);
    setLng(newLng);
    resolveFallbackPoint(newLat, newLng);
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const uLat = Number(position.coords.latitude.toFixed(6));
        const uLng = Number(position.coords.longitude.toFixed(6));
        setLat(uLat);
        setLng(uLng);
        await resolveFallbackPoint(uLat, uLng);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        setGeoError('Location permission denied.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelectPreset = (preset: PresetLocation) => {
    setName(preset.name);
    setAddress(preset.address);
    setLat(preset.lat);
    setLng(preset.lng);
    setSearchQuery(preset.name);
    setStatusNotification(`Preset loaded: ${preset.name}`);
  };

  const handleSave = () => {
    onSave({
      name: name.trim() || 'Reflective Spot',
      address: address.trim() || undefined,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    });
    onClose();
  };

  return (
    <div
      id="location-picker-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 sm:p-6"
    >
      <div
        id="location-picker-modal-container"
        className="relative w-full max-w-xl rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7] p-5 sm:p-6 shadow-xl text-[#3d3d3d] max-h-[92vh] overflow-y-auto flex flex-col gap-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e5e0d8] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5a5a40] text-white shadow-2xs">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#3d3d3d]">
                Pin Location to Entry
              </h2>
              <p className="text-xs text-[#8c8579]">
                Selectable top 5 dropdown, coordinate picker & preset sanctuaries
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#8c8579] hover:text-[#3d3d3d] hover:bg-[#f5f2ed] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Input with Top 5 Dropdown */}
        <div ref={searchContainerRef} className="relative w-full">
          <label className="block text-xs font-semibold text-[#3d3d3d] mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-[#5a5a40]" />
              Search Spot or City (Selectable Dropdown)
            </span>
            <span className="text-[10px] text-[#8c8579] font-normal">
              Searches after each letter • Top 5 options
            </span>
          </label>
          <div className="relative">
            <input
              type="text"
              id="location-search-input-fallback"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (dropdownOptions.length > 0) setIsDropdownOpen(true);
              }}
              placeholder="Type to search (e.g. Kyoto, Central Park, Big Sur, Paris, Lake Como)..."
              className="w-full rounded-xl border border-[#e5e0d8] bg-white pl-9 pr-9 py-2.5 text-xs text-[#3d3d3d] placeholder:text-[#8c8579]/60 focus:border-[#5a5a40] focus:ring-1 focus:ring-[#5a5a40]/30 focus:outline-none transition-all shadow-2xs"
            />
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#8c8579]" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDropdownOptions([]);
                  setIsDropdownOpen(false);
                }}
                className="absolute right-2.5 top-2.5 p-0.5 rounded text-[#8c8579] hover:text-[#3d3d3d] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Top 5 Selectable Dropdown Menu */}
          {isDropdownOpen && dropdownOptions.length > 0 && (
            <div
              id="location-dropdown-fallback"
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-50 overflow-hidden rounded-xl border border-[#e5e0d8] bg-white shadow-xl py-1"
            >
              <div className="px-3 py-1 bg-[#fdfbf7] border-b border-[#e5e0d8] flex items-center justify-between text-[10px] font-semibold text-[#8c8579] uppercase tracking-wider">
                <span>Top 5 Matches</span>
                <span>Select to reposition pin</span>
              </div>
              {dropdownOptions.map((opt, index) => {
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelectOption(opt)}
                    className={`w-full px-3.5 py-2.5 text-left flex items-start gap-2.5 transition-colors cursor-pointer border-b last:border-b-0 border-[#f5f2ed] ${
                      isHighlighted ? 'bg-[#5a5a40]/10 text-[#3d3d3d]' : 'hover:bg-[#f5f2ed]'
                    }`}
                  >
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#5a5a40]/10 text-[#5a5a40]">
                      <MapPin className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-[#3d3d3d] truncate">
                          {opt.name}
                        </span>
                        {opt.category && (
                          <span className="shrink-0 text-[9px] font-medium text-[#5a5a40] bg-[#f5f2ed] px-1.5 py-0.5 rounded border border-[#e5e0d8]/80">
                            {opt.category}
                          </span>
                        )}
                      </div>
                      {opt.address && (
                        <span className="text-[11px] text-[#8c8579] truncate block mt-0.5">
                          {opt.address}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* View switcher tabs & GPS */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl bg-[#f5f2ed] p-1 border border-[#e5e0d8]">
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'map'
                  ? 'bg-white text-[#3d3d3d] shadow-2xs'
                  : 'text-[#8c8579] hover:text-[#3d3d3d]'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Coordinate Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'presets'
                  ? 'bg-white text-[#3d3d3d] shadow-2xs'
                  : 'text-[#8c8579] hover:text-[#3d3d3d]'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Sanctuaries</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#5a5a40]/30 bg-[#f5f2ed] px-3 py-1.5 text-xs font-medium text-[#5a5a40] hover:bg-[#e5e0d8] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Navigation className={`h-3.5 w-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? 'Detecting GPS...' : 'Use Current Location'}</span>
          </button>
        </div>

        {/* Fallback Interactive Grid Canvas */}
        {activeTab === 'map' && (
          <div className="flex flex-col gap-2">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative h-56 w-full overflow-hidden rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] cursor-crosshair shadow-2xs flex items-center justify-center select-none touch-none"
              style={{
                backgroundImage:
                  'radial-gradient(#5a5a40 0.75px, transparent 0.75px), radial-gradient(#5a5a40 0.75px, #f5f2ed 0.75px)',
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0, 12px 12px',
              }}
            >
              {/* Interactive cursor indicator */}
              <div className="flex flex-col items-center gap-1 z-10 pointer-events-none">
                <div className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-[#5a5a40] text-white shadow-md ring-4 ring-white ${isDraggingCanvas ? 'scale-110' : ''} transition-transform`}>
                  <MapPin className="h-5 w-5 animate-bounce" />
                </div>
                <div className="rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-mono font-bold text-[#3d3d3d] shadow-xs border border-[#e5e0d8]">
                  {lat.toFixed(4)}°, {lng.toFixed(4)}°
                </div>
              </div>

              <div className="absolute top-2 left-2 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-medium text-[#5a5a40] border border-[#e5e0d8] pointer-events-none">
                Interactive: Click or drag pin across canvas to update location & vicinity
              </div>

              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-white/95 px-2.5 py-1 text-[11px] text-[#5a5a40] border border-[#e5e0d8]">
                <span className="truncate max-w-[280px] font-medium">
                  {name} {address ? `• ${address}` : ''}
                </span>
                <a
                  href={getGoogleMapsSearchUrl(lat, lng, name)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#5a5a40] hover:underline text-[10px]"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-[#e5e0d8] bg-white p-3 text-xs flex items-start gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-[#5a5a40] mt-0.5" />
              <div className="leading-relaxed text-[#8c8579]">
                To enable live Google Maps satellite & street tiles, configure{' '}
                <code className="rounded bg-[#f5f2ed] px-1 text-[11px] font-mono text-[#5a5a40]">
                  VITE_GOOGLE_MAPS_API_KEY
                </code>{' '}
                in Settings, or use a free{' '}
                <a
                  href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#5a5a40] underline"
                >
                  Maps Demo Key
                </a>
                .
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Preset Sanctuaries */}
        {activeTab === 'presets' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_JOURNAL_LOCATIONS.map((preset) => {
              const isSelected =
                Math.abs(preset.lat - lat) < 0.001 && Math.abs(preset.lng - lng) < 0.001;
              return (
                <button
                  type="button"
                  key={preset.name}
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#5a5a40] bg-[#5a5a40]/5 shadow-xs'
                      : 'border-[#e5e0d8] bg-white hover:bg-[#f5f2ed]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-serif font-bold text-sm text-[#3d3d3d]">
                      {preset.name}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-[#5a5a40]" />}
                  </div>
                  <span className="text-[10px] font-semibold text-[#5a5a40] uppercase tracking-wider mt-0.5">
                    {preset.category}
                  </span>
                  <span className="text-xs text-[#8c8579] mt-1 line-clamp-1">
                    {preset.address}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Location Form Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#e5e0d8]">
          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Location / Spot Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSearchQuery(e.target.value);
              }}
              placeholder="e.g. Kyoto Zen Bamboo Grove"
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] placeholder:text-[#8c8579]/60 focus:border-[#5a5a40] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Vicinity or Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Arashiyama, Kyoto, Japan"
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] placeholder:text-[#8c8579]/60 focus:border-[#5a5a40] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] font-mono focus:border-[#5a5a40] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3d3d3d] mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs text-[#3d3d3d] font-mono focus:border-[#5a5a40] focus:outline-none"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[#e5e0d8]">
          {currentLocation && onRemove ? (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium hover:underline cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Location</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#e5e0d8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3d3d3d] hover:bg-[#f5f2ed] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5a40] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#464632] transition-colors cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Pin to Entry</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LocationPickerModal: React.FC<LocationPickerModalProps> = (props) => {
  if (!props.isOpen) return null;

  const apiKey = getGoogleMapsApiKey();
  const hasKey = hasGoogleMapsApiKey();

  if (hasKey) {
    return (
      <APIProvider apiKey={apiKey} solutionChannel={GMP_ATTRIBUTION_ID}>
        <GoogleMapsConnectedModal {...props} />
      </APIProvider>
    );
  }

  return <FallbackLocationModal {...props} />;
};
