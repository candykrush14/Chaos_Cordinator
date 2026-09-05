import React, { useState } from 'react';
import {
  MapPin,
  ExternalLink,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Compass,
} from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import type { JournalLocation } from '../types';
import {
  getGoogleMapsApiKey,
  hasGoogleMapsApiKey,
  GMP_ATTRIBUTION_ID,
  GMP_MAP_ID,
  getGoogleMapsSearchUrl,
} from '../utils/maps';

interface LocationMapCardProps {
  location: JournalLocation;
  onEdit?: () => void;
  onRemove?: () => void;
  readOnly?: boolean;
}

export const LocationMapCard: React.FC<LocationMapCardProps> = ({
  location,
  onEdit,
  onRemove,
  readOnly = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const apiKey = getGoogleMapsApiKey();
  const hasKey = hasGoogleMapsApiKey();

  return (
    <div
      id="location-map-card"
      className="mb-4 overflow-hidden rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed]/80 shadow-2xs transition-all"
    >
      {/* Location Header Bar */}
      <div className="flex items-center justify-between p-3.5 sm:px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#5a5a40] text-white shadow-2xs">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-sm font-bold text-[#3d3d3d] truncate">
                {location.name}
              </h3>
              <span className="rounded-full bg-[#5a5a40]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#5a5a40]">
                Pinned Spot
              </span>
            </div>
            <p className="text-[11px] text-[#8c8579] truncate mt-0.5 font-mono">
              {location.address || `${location.lat.toFixed(4)}°, ${location.lng.toFixed(4)}°`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={getGoogleMapsSearchUrl(location.lat, location.lng, location.name)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-[#e5e0d8] bg-white px-2 py-1 text-[11px] font-medium text-[#3d3d3d] hover:bg-[#f5f2ed] hover:text-[#5a5a40] transition-colors"
            title="Open in Google Maps"
          >
            <span className="hidden sm:inline">Google Maps</span>
            <ExternalLink className="h-3 w-3" />
          </a>

          {!readOnly && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-lg text-[#8c8579] hover:text-[#3d3d3d] hover:bg-white transition-colors cursor-pointer"
              title="Edit Pinned Location"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}

          {!readOnly && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg text-[#8c8579] hover:text-red-600 hover:bg-white transition-colors cursor-pointer"
              title="Remove Pinned Location"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-[#8c8579] hover:text-[#3d3d3d] hover:bg-white transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse Map' : 'Expand Map'}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Interactive Map View */}
      {isExpanded && (
        <div className="border-t border-[#e5e0d8] p-3 sm:p-4 bg-[#fdfbf7]">
          {hasKey ? (
            <div className="relative h-48 w-full overflow-hidden rounded-xl border border-[#e5e0d8] shadow-2xs">
              <APIProvider apiKey={apiKey} solutionChannel={GMP_ATTRIBUTION_ID}>
                <Map
                  center={{ lat: location.lat, lng: location.lng }}
                  zoom={14}
                  mapId={GMP_MAP_ID}
                  internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
                  style={{ width: '100%', height: '100%' }}
                  gestureHandling="cooperative"
                  disableDefaultUI={false}
                >
                  <AdvancedMarker position={{ lat: location.lat, lng: location.lng }}>
                    <Pin background="#5a5a40" glyphColor="#ffffff" borderColor="#3d3d3d" />
                  </AdvancedMarker>
                </Map>
              </APIProvider>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] p-3.5 text-xs">
              <div className="flex items-center gap-3">
                <Compass className="h-6 w-6 text-[#5a5a40] shrink-0" />
                <div>
                  <div className="font-semibold text-[#3d3d3d]">
                    Geographic Coordinates: {location.lat.toFixed(4)}° N, {location.lng.toFixed(4)}° W
                  </div>
                  <div className="text-[11px] text-[#8c8579] mt-0.5">
                    {location.address || 'Custom GPS coordinate pinned to this journal session'}
                  </div>
                </div>
              </div>
              <a
                href={getGoogleMapsSearchUrl(location.lat, location.lng, location.name)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-[#5a5a40] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#464632] transition-colors shrink-0"
              >
                <span>View Coordinates</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
