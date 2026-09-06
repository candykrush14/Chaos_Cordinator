import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { Marker, Renderer } from '@googlemaps/markerclusterer';
import {
  MapPin,
  ArrowLeft,
  ExternalLink,
  BookOpen,
  Compass,
  Loader2,
  X,
  MessageSquare,
  Clock,
} from 'lucide-react';
import type { JournalInteraction, UserProfile } from '../types';
import {
  getInteractionsCollectionRef,
  onSnapshot,
  query,
  orderBy,
} from '../firebase/config';
import {
  getGoogleMapsApiKey,
  hasGoogleMapsApiKey,
  GMP_ATTRIBUTION_ID,
  GMP_MAP_ID,
  getGoogleMapsSearchUrl,
} from '../utils/maps';
import { formatJournalDate } from '../utils/sanitize';
import { ErrorBoundary } from './ErrorBoundary';

interface LocationsMapViewProps {
  user: UserProfile;
  onOpenEntry: (entry: JournalInteraction) => void;
  onBackToJournal: () => void;
}

type LocatedEntry = JournalInteraction & {
  location: NonNullable<JournalInteraction['location']>;
};

function hasValidLocation(entry: JournalInteraction): entry is LocatedEntry {
  const loc = entry.location;
  return (
    !!loc &&
    typeof loc.lat === 'number' &&
    Number.isFinite(loc.lat) &&
    Math.abs(loc.lat) <= 90 &&
    typeof loc.lng === 'number' &&
    Number.isFinite(loc.lng) &&
    Math.abs(loc.lng) <= 180
  );
}

function firstUserSnippet(entry: JournalInteraction, max = 150): string {
  const msg = entry.messages?.find((m) => m.role === 'user' && m.content?.trim());
  if (!msg) return 'No reflection text in this entry yet.';
  const text = msg.content.trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Zooms/pans the map so every pinned entry is in view. Uses the `core` Maps
 * library loader for LatLngBounds instead of the `google` global.
 */
const FitBounds: React.FC<{ entries: LocatedEntry[] }> = ({ entries }) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  const fittedSigRef = useRef<string>('');

  useEffect(() => {
    if (!map || !coreLib || entries.length === 0) return;

    // Only auto-fit when the set of pinned entries actually changes - not on
    // every unrelated Firestore snapshot (would yank the map mid-pan).
    const sig = entries
      .map((e) => `${e.id}:${e.location.lat},${e.location.lng}`)
      .sort()
      .join('|');
    if (sig === fittedSigRef.current) return;
    fittedSigRef.current = sig;

    if (entries.length === 1) {
      map.panTo({ lat: entries[0].location.lat, lng: entries[0].location.lng });
      map.setZoom(13);
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    entries.forEach((e) => bounds.extend({ lat: e.location.lat, lng: e.location.lng }));
    map.fitBounds(bounds, 72);

    // fitBounds on a single (or very tight) cluster over-zooms; clamp once idle.
    const listener = map.addListener('idle', () => {
      const zoom = map.getZoom();
      if (typeof zoom === 'number' && zoom > 15) map.setZoom(15);
      listener.remove();
    });
    return () => listener.remove();
  }, [map, coreLib, entries]);

  return null;
};

/**
 * One AdvancedMarker + Pin per pinned entry, grouped into Google-Photos-style
 * count bubbles by @googlemaps/markerclusterer. Cluster bubbles are
 * AdvancedMarkerElements with local DOM content - no external images/CDN.
 */
const ClusteredEntryMarkers: React.FC<{
  entries: LocatedEntry[];
  selectedId: string | null;
  onSelect: (entry: LocatedEntry) => void;
}> = ({ entries, selectedId, onSelect }) => {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const markersRef = useRef<Record<string, Marker>>({});
  const clustererRef = useRef<MarkerClusterer | null>(null);

  // Initialize clusterer once map and marker library are ready
  useEffect(() => {
    if (!map || !markerLib) return;

    const renderer: Renderer = {
      render: (cluster) => {
        const el = document.createElement('div');
        el.className = 'photos-cluster';
        el.textContent = String(cluster.count);
        return new markerLib.AdvancedMarkerElement({
          position: cluster.position,
          content: el,
          zIndex: 1000 + cluster.count,
        });
      },
    };

    const clusterer = new MarkerClusterer({
      map,
      renderer,
      onClusterClick: (_event, cluster, mapInstance) => {
        if (cluster.bounds) {
          mapInstance.fitBounds(cluster.bounds, 40);
        }
      },
    });
    clustererRef.current = clusterer;

    // Attach any existing markers that mounted before clusterer was ready
    const initialMarkers = Object.values(markersRef.current).filter(Boolean);
    if (initialMarkers.length > 0) {
      clusterer.addMarkers(initialMarkers);
    }

    return () => {
      clusterer.clearMarkers();
      clusterer.setMap(null);
      clustererRef.current = null;
    };
  }, [map, markerLib]);

  // Sync clusterer whenever markers mount/unmount
  const syncClusterer = useCallback(() => {
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      const currentMarkers = Object.values(markersRef.current).filter(Boolean);
      if (currentMarkers.length > 0) {
        clustererRef.current.addMarkers(currentMarkers);
      }
    }
  }, []);

  const setMarkerRef = useCallback(
    (marker: Marker | null, key: string) => {
      if (marker) {
        if (markersRef.current[key] === marker) return;
        markersRef.current[key] = marker;
        syncClusterer();
      } else {
        if (!(key in markersRef.current)) return;
        delete markersRef.current[key];
        syncClusterer();
      }
    },
    [syncClusterer]
  );

  return (
    <>
      {entries.map((entry) => {
        const isSelected = selectedId === entry.id;
        return (
          <AdvancedMarker
            key={entry.id}
            position={{ lat: entry.location.lat, lng: entry.location.lng }}
            ref={(marker) => setMarkerRef(marker, entry.id)}
            onClick={() => onSelect(entry)}
            zIndex={isSelected ? 999 : undefined}
            title={entry.location.name}
          >
            <Pin
              background={isSelected ? '#3d3d3d' : '#5a5a40'}
              glyphColor="#ffffff"
              borderColor="#3d3d3d"
            />
          </AdvancedMarker>
        );
      })}
    </>
  );
};

const EntryPreviewCard: React.FC<{
  entry: LocatedEntry;
  onClose: () => void;
  onOpen: () => void;
}> = ({ entry, onClose, onOpen }) => (
  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-5">
    <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7] p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#5a5a40] text-white">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-serif text-sm font-bold text-[#3d3d3d]">
              {entry.location.name}
            </h3>
            <p className="truncate font-mono text-[11px] text-[#8c8579]">
              {entry.location.address ||
                `${entry.location.lat.toFixed(4)}°, ${entry.location.lng.toFixed(4)}°`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-lg p-1 text-[#8c8579] transition-colors hover:bg-[#f5f2ed] hover:text-[#3d3d3d]"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 line-clamp-1 text-sm font-semibold text-[#5a5a40]">
        {entry.title || 'Untitled Reflection'}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#3d3d3d]">
        {firstUserSnippet(entry)}
      </p>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-[#8c8579]">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatJournalDate(entry.updatedAt || entry.createdAt)}
        </span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {entry.messages?.length || 0} turns
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#5a5a40] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4a4a35]"
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Open entry</span>
        </button>
        <a
          href={getGoogleMapsSearchUrl(entry.location.lat, entry.location.lng, entry.location.name)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs font-medium text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed]"
        >
          <span>Maps</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  </div>
);

const EntriesMap: React.FC<{
  entries: LocatedEntry[];
  onOpenEntry: (entry: JournalInteraction) => void;
}> = ({ entries, onOpenEntry }) => {
  const [selected, setSelected] = useState<LocatedEntry | null>(null);

  // Drop the selection if that entry disappears from the live snapshot.
  useEffect(() => {
    if (selected && !entries.some((e) => e.id === selected.id)) setSelected(null);
  }, [entries, selected]);

  const initialCenter = entries.length
    ? { lat: entries[0].location.lat, lng: entries[0].location.lng }
    : { lat: 20, lng: 0 };

  return (
    <div className="relative h-full w-full">
      <Map
        defaultCenter={initialCenter}
        defaultZoom={entries.length ? 4 : 2}
        mapId={GMP_MAP_ID}
        internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        style={{ width: '100%', height: '100%' }}
        onClick={() => setSelected(null)}
      >
        <FitBounds entries={entries} />
        <ClusteredEntryMarkers
          entries={entries}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
      </Map>

      {selected && (
        <EntryPreviewCard
          entry={selected}
          onClose={() => setSelected(null)}
          onOpen={() => onOpenEntry(selected)}
        />
      )}

      {entries.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#e5e0d8] bg-[#fdfbf7]/95 px-4 py-3 shadow-lg backdrop-blur-md">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#5a5a40] text-white">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#3d3d3d]">No pinned locations yet</p>
              <p className="text-[11px] text-[#8c8579]">
                Open any reflection in your journal and use &ldquo;Pin Location&rdquo; to drop it on this map.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}> = ({ icon, title, body, actionLabel, onAction }) => (
  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed] text-[#5a5a40]">
      {icon}
    </div>
    <h3 className="font-serif text-xl font-semibold text-[#5a5a40]">{title}</h3>
    <p className="max-w-sm text-sm leading-relaxed text-[#3d3d3d]">{body}</p>
    <button
      type="button"
      onClick={onAction}
      className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4a4a35]"
    >
      <BookOpen className="h-3.5 w-3.5" />
      <span>{actionLabel}</span>
    </button>
  </div>
);

const FallbackList: React.FC<{
  entries: LocatedEntry[];
  onOpenEntry: (entry: JournalInteraction) => void;
}> = ({ entries, onOpenEntry }) => (
  <div className="w-full p-4 sm:p-6">
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#e5e0d8] bg-[#f5f2ed] p-3 text-xs text-[#8c8579]">
        <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[#5a5a40]" />
        <span>
          Live map tiles need{' '}
          <code className="rounded bg-white px-1 font-mono text-[#5a5a40]">
            VITE_GOOGLE_MAPS_API_KEY
          </code>
          . Showing a coordinate list until it&apos;s configured.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpenEntry(entry)}
            className="flex cursor-pointer flex-col items-start rounded-xl border border-[#e5e0d8] bg-white p-3.5 text-left transition-all hover:border-[#5a5a40] hover:bg-[#f5f2ed]"
          >
            <div className="flex w-full items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#5a5a40]" />
              <span className="truncate font-serif text-sm font-bold text-[#3d3d3d]">
                {entry.location.name}
              </span>
            </div>
            <span className="mt-1 line-clamp-1 text-xs text-[#5a5a40]">
              {entry.title || 'Untitled Reflection'}
            </span>
            <span className="mt-0.5 font-mono text-[11px] text-[#8c8579]">
              {entry.location.lat.toFixed(4)}°, {entry.location.lng.toFixed(4)}°
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export const LocationsMapView: React.FC<LocationsMapViewProps> = ({
  user,
  onOpenEntry,
  onBackToJournal,
}) => {
  const [entries, setEntries] = useState<JournalInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Same user-isolated collection the journal reads from.
  useEffect(() => {
    if (!user.uid) {
      // Never leave the view stuck on a spinner if there's no uid to query.
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const colRef = getInteractionsCollectionRef(user.uid);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const list: JournalInteraction[] = [];
        snapshot.forEach((doc) => {
          list.push({ ...(doc.data() as JournalInteraction), id: doc.id });
        });
        list.sort((a, b) =>
          (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
        );
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        console.error('Locations subscription error:', err);
        setError('Failed to load your pinned locations: ' + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user.uid]);

  const located = useMemo(() => entries.filter(hasValidLocation), [entries]);
  const apiKey = getGoogleMapsApiKey();
  const hasKey = hasGoogleMapsApiKey();

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-[#fdfbf7]">
      <div className="flex items-center justify-between gap-3 border-b border-[#e5e0d8] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToJournal}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Journal</span>
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-semibold text-[#3d3d3d]">
              Location-Aware Entries
            </h1>
            <p className="text-[11px] text-[#8c8579]">
              Every reflection you&apos;ve pinned, dropped on the map
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#e5e0d8] px-2.5 py-0.5 text-[11px] font-bold text-[#5a5a40]">
          {located.length} pinned
        </span>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-900">{error}</div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-xs text-[#8c8579]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#5a5a40]" />
            Loading pinned locations…
          </div>
        ) : hasKey ? (
          <ErrorBoundary
            label="the map"
            fallback={(err, reset) => (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600">
                  <Compass className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-[#5a5a40]">
                  Couldn&apos;t load Google Maps
                </h3>
                <p className="max-w-md text-sm text-[#3d3d3d]">
                  Your {located.length} pinned{' '}
                  {located.length === 1 ? 'location is' : 'locations are'} listed below instead.
                  Check that <code className="font-mono text-[#5a5a40]">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
                  is valid and referrer-allowed for this domain.
                </p>
                <code className="max-w-md overflow-x-auto rounded-lg border border-[#e5e0d8] bg-[#f5f2ed] px-3 py-2 text-left font-mono text-[11px] text-[#8c8579]">
                  {err.message}
                </code>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-1 cursor-pointer rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4a4a35]"
                >
                  Retry map
                </button>
                <div className="mt-2 w-full">
                  <FallbackList entries={located} onOpenEntry={onOpenEntry} />
                </div>
              </div>
            )}
          >
            <div className="h-full min-h-[320px]">
              <APIProvider apiKey={apiKey} solutionChannel={GMP_ATTRIBUTION_ID}>
                <EntriesMap entries={located} onOpenEntry={onOpenEntry} />
              </APIProvider>
            </div>
          </ErrorBoundary>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No journal entries yet"
            body="You haven't written any reflections yet. Start one, and any entry you pin to a place will show up here as a map drop."
            actionLabel="Write your first entry"
            onAction={onBackToJournal}
          />
        ) : located.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-6 w-6" />}
            title="No pinned locations yet"
            body={
              <>
                You have {entries.length} {entries.length === 1 ? 'entry' : 'entries'}, but none of
                them has a location yet. Open a reflection and use{' '}
                <span className="font-semibold">Pin Location</span> to tie it to a place.
              </>
            }
            actionLabel="Go to journal"
            onAction={onBackToJournal}
          />
        ) : (
          <FallbackList entries={located} onOpenEntry={onOpenEntry} />
        )}
      </div>
    </div>
  );
};
