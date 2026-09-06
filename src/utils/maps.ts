/**
 * Google Maps Platform utilities and constants.
 * Adheres strictly to the Google Maps Platform Directive:
 * - Zero hardcoding: resolves API key via import.meta.env.VITE_GOOGLE_MAPS_API_KEY.
 * - Enforces solution attribution ID: 'gmp_mcp_codeassist_v1_aistudio'.
 * - Enforces mapId for AdvancedMarker: 'DEMO_MAP_ID'.
 */

import { authedFetch } from '../firebase/config';

export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
export const GMP_MAP_ID = 'DEMO_MAP_ID';

export function getGoogleMapsApiKey(): string {
  const envKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
  return (typeof envKey === 'string' ? envKey : '').trim();
}

export function hasGoogleMapsApiKey(): boolean {
  const key = getGoogleMapsApiKey();
  return Boolean(key && key !== 'MY_GOOGLE_MAPS_API_KEY' && key.length > 5);
}

export function getGoogleMapsSearchUrl(lat: number, lng: number, name?: string): string {
  const query = name ? encodeURIComponent(`${name}, ${lat},${lng}`) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export interface PresetLocation {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
}

export const PRESET_JOURNAL_LOCATIONS: PresetLocation[] = [
  {
    name: 'Home Sanctuary',
    category: 'Quiet Reflection',
    address: 'Private Home Haven',
    lat: 37.7749,
    lng: -122.4194,
  },
  {
    name: 'Central Park Conservatory',
    category: 'Nature Walk',
    address: 'New York, NY 10022, USA',
    lat: 40.785091,
    lng: -73.968285,
  },
  {
    name: 'Redwood National Forest',
    category: 'Wilderness',
    address: 'Humboldt County, CA, USA',
    lat: 41.2132,
    lng: -124.0046,
  },
  {
    name: 'Kyoto Zen Bamboo Grove',
    category: 'Meditative Sanctuary',
    address: 'Arashiyama, Kyoto, 616-0007, Japan',
    lat: 35.0169,
    lng: 135.6713,
  },
  {
    name: 'Pacific Coast Ocean Bluff',
    category: 'Ocean Vista',
    address: 'Big Sur Highway 1, CA 93920, USA',
    lat: 36.2704,
    lng: -121.8081,
  },
];

export const SEARCHABLE_LOCATIONS: PresetLocation[] = [
  ...PRESET_JOURNAL_LOCATIONS,
  {
    name: 'Fushimi Inari-Taisha Shrine',
    category: 'Sacred Grounds',
    address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto, Japan',
    lat: 34.9671,
    lng: 135.7727,
  },
  {
    name: 'Kinkaku-ji (The Golden Pavilion)',
    category: 'Zen Temple',
    address: '1 Kinkakujicho, Kita Ward, Kyoto, 603-8361, Japan',
    lat: 35.0394,
    lng: 135.7292,
  },
  {
    name: 'Walden Pond State Reservation',
    category: 'Contemplative Retreat',
    address: '915 Walden St, Concord, MA 01742, USA',
    lat: 42.4388,
    lng: -71.3402,
  },
  {
    name: 'Lake Como & Bellagio Promenade',
    category: 'Alpine Waters',
    address: 'Piazza Giuseppe Mazzini, 22021 Bellagio CO, Italy',
    lat: 45.9872,
    lng: 9.2625,
  },
  {
    name: 'Joshua Tree High Desert Sanctuary',
    category: 'Stargazing Vista',
    address: 'Park Blvd, Joshua Tree, CA 92252, USA',
    lat: 33.8734,
    lng: -115.9010,
  },
  {
    name: 'Yosemite Valley & Tunnel View',
    category: 'National Park',
    address: 'Wawona Rd, Yosemite National Park, CA 95389, USA',
    lat: 37.7157,
    lng: -119.6775,
  },
  {
    name: 'Banff & Lake Louise Vista',
    category: 'Glacial Sanctuary',
    address: '111 Lake Louise Dr, Lake Louise, AB T0L 1E0, Canada',
    lat: 51.4254,
    lng: -116.1773,
  },
  {
    name: 'Mount Fuji 5th Station',
    category: 'Sacred Mountain',
    address: 'Subashiri, Oyama, Sunto District, Shizuoka 410-1431, Japan',
    lat: 35.3606,
    lng: 138.7274,
  },
  {
    name: 'Oia Cliffside Caldera',
    category: 'Sunset Panorama',
    address: 'Oia, Santorini 847 02, Cyclades, Greece',
    lat: 36.4618,
    lng: 25.3753,
  },
  {
    name: 'Hyde Park Serpentine Walk',
    category: 'Urban Sanctuary',
    address: 'Hyde Park, London W2 2UH, United Kingdom',
    lat: 51.5073,
    lng: -0.1696,
  },
  {
    name: 'Jardin du Luxembourg',
    category: 'Historic Gardens',
    address: 'Rue de Médicis, 75006 Paris, France',
    lat: 48.8462,
    lng: 2.3372,
  },
  {
    name: 'Montmartre & Sacré-Cœur Basilica',
    category: 'Cultural Summit',
    address: '35 Rue du Chevalier de la Barre, 75018 Paris, France',
    lat: 48.8867,
    lng: 2.3431,
  },
  {
    name: 'Shinjuku Gyoen National Garden',
    category: 'Botanical Sanctuary',
    address: '11 Naitomachi, Shinjuku City, Tokyo 160-0014, Japan',
    lat: 35.6852,
    lng: 139.7100,
  },
  {
    name: 'Shibuya Sky & Miyashita Park',
    category: 'Urban Horizon',
    address: '2 Chome-24-12 Shibuya, Tokyo 150-0002, Japan',
    lat: 35.6591,
    lng: 139.7006,
  },
  {
    name: 'Muir Woods Redwood Sanctuary',
    category: 'Ancient Forest',
    address: '1 Muir Woods Rd, Mill Valley, CA 94941, USA',
    lat: 37.8970,
    lng: -122.5811,
  },
  {
    name: 'Golden Gate Park Japanese Tea Garden',
    category: 'Zen Garden',
    address: '75 Hagiwara Tea Garden Dr, San Francisco, CA 94118, USA',
    lat: 37.7702,
    lng: -122.4701,
  },
  {
    name: 'Grand Canyon Desert View Point',
    category: 'Canyon Rim',
    address: 'Desert View Dr, Grand Canyon Village, AZ 86023, USA',
    lat: 35.9644,
    lng: -111.8315,
  },
  {
    name: 'Sedona Red Rock Cathedral',
    category: 'Vortex Sanctuary',
    address: '500 Back O Beyond Rd, Sedona, AZ 86336, USA',
    lat: 34.8211,
    lng: -111.7885,
  },
  {
    name: 'Bondi to Bronte Coastal Trail',
    category: 'Coastal Walkway',
    address: 'Bondi Beach, Sydney NSW 2026, Australia',
    lat: -33.8915,
    lng: 151.2767,
  },
  {
    name: 'Ubud Tegallalang Rice Terraces',
    category: 'Verdant Haven',
    address: 'Jl. Raya Tegallalang, Gianyar, Bali 80561, Indonesia',
    lat: -8.4343,
    lng: 115.2789,
  },
  {
    name: 'Machu Picchu Sacred Plaza',
    category: 'Ancient Citadel',
    address: '08680, Urubamba Province, Cusco Region, Peru',
    lat: -13.1631,
    lng: -72.5450,
  },
  {
    name: 'Amalfi Coast Positano Vista',
    category: 'Cliffside Marina',
    address: 'Via Cristoforo Colombo, 84017 Positano SA, Italy',
    lat: 40.6281,
    lng: 14.4850,
  },
  {
    name: 'Taj Mahal Mehtab Bagh Gardens',
    category: 'Historic Monument',
    address: 'Dharmapuri, Forest Colony, Tajganj, Agra, Uttar Pradesh 282001, India',
    lat: 27.1795,
    lng: 78.0421,
  },
  {
    name: 'Blue Lagoon Geothermal Oasis',
    category: 'Thermal Waters',
    address: 'Norðurljósavegur 9, 240 Grindavík, Iceland',
    lat: 63.8804,
    lng: -22.4495,
  },
  {
    name: 'Marina Bay Sands SkyPark',
    category: 'Skyline Panorama',
    address: '10 Bayfront Ave, Singapore 018956',
    lat: 1.2840,
    lng: 103.8610,
  },
  {
    name: 'Fisherman’s Wharf & Pier 39',
    category: 'Bayside Walk',
    address: 'The Embarcadero, San Francisco, CA 94133, USA',
    lat: 37.8087,
    lng: -122.4098,
  },
  {
    name: 'Times Square & Broadway',
    category: 'City Center',
    address: 'Manhattan, New York, NY 10036, USA',
    lat: 40.7580,
    lng: -73.9855,
  },
];

/**
 * Filter and rank curated places based on user query (executed after every keystroke).
 * Returns strictly top 5 options.
 */
export function searchCuratedPlaces(query: string, limit: number = 5): PresetLocation[] {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    return SEARCHABLE_LOCATIONS.slice(0, limit);
  }

  // Exact prefix matches on name first, then contains name, then address/category
  const scored = SEARCHABLE_LOCATIONS.map((loc) => {
    const n = loc.name.toLowerCase();
    const a = loc.address.toLowerCase();
    const c = loc.category.toLowerCase();

    let score = 0;
    if (n === clean) score += 100;
    else if (n.startsWith(clean)) score += 50;
    else if (n.includes(clean)) score += 30;
    else if (a.includes(clean)) score += 20;
    else if (c.includes(clean)) score += 10;

    return { loc, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.loc);
}

/**
 * Regional hubs for offline coordinate resolution, guaranteeing realistic
 * place and vicinity naming across global regions without placeholders.
 */
const OFFLINE_REGIONAL_HUBS = [
  { name: 'San Francisco Bay Area', city: 'San Francisco', region: 'California', country: 'USA', lat: 37.7749, lng: -122.4194 },
  { name: 'Silicon Valley & Peninsula', city: 'Palo Alto', region: 'California', country: 'USA', lat: 37.4419, lng: -122.1430 },
  { name: 'Greater Los Angeles', city: 'Los Angeles', region: 'California', country: 'USA', lat: 34.0522, lng: -118.2437 },
  { name: 'New York Metropolitan Area', city: 'New York', region: 'New York', country: 'USA', lat: 40.7128, lng: -74.0060 },
  { name: 'Greater Seattle Area', city: 'Seattle', region: 'Washington', country: 'USA', lat: 47.6062, lng: -122.3321 },
  { name: 'Chicago Metropolitan Area', city: 'Chicago', region: 'Illinois', country: 'USA', lat: 41.8781, lng: -87.6298 },
  { name: 'Greater Boston', city: 'Boston', region: 'Massachusetts', country: 'USA', lat: 42.3601, lng: -71.0589 },
  { name: 'Greater Austin', city: 'Austin', region: 'Texas', country: 'USA', lat: 30.2672, lng: -97.7431 },
  { name: 'Miami & South Florida', city: 'Miami', region: 'Florida', country: 'USA', lat: 25.7617, lng: -80.1918 },
  { name: 'Greater London Area', city: 'London', region: 'Greater London', country: 'UK', lat: 51.5074, lng: -0.1278 },
  { name: 'Paris Metropolitan Area', city: 'Paris', region: 'Île-de-France', country: 'France', lat: 48.8566, lng: 2.3522 },
  { name: 'Kansai Cultural Basin', city: 'Kyoto', region: 'Kansai', country: 'Japan', lat: 35.0116, lng: 135.7681 },
  { name: 'Greater Tokyo Metropolis', city: 'Tokyo', region: 'Kanto', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'Greater Toronto Area', city: 'Toronto', region: 'Ontario', country: 'Canada', lat: 43.6532, lng: -79.3832 },
  { name: 'Sydney Harbour Region', city: 'Sydney', region: 'New South Wales', country: 'Australia', lat: -33.8688, lng: 151.2093 },
  { name: 'Berlin Metropolis', city: 'Berlin', region: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050 },
  { name: 'Rome Historical Area', city: 'Rome', region: 'Lazio', country: 'Italy', lat: 41.9028, lng: 12.4964 },
  { name: 'Singapore Urban Core', city: 'Singapore', region: 'Central Region', country: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Greater Zurich', city: 'Zurich', region: 'Zurich', country: 'Switzerland', lat: 47.3769, lng: 8.5417 },
  { name: 'Amsterdam Canal Belt', city: 'Amsterdam', region: 'North Holland', country: 'Netherlands', lat: 52.3676, lng: 4.9041 },
  { name: 'Dubai Metropolitan Area', city: 'Dubai', region: 'Dubai', country: 'UAE', lat: 25.2048, lng: 55.2708 },
  { name: 'Delhi National Capital Region', city: 'New Delhi', region: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090 },
  { name: 'Greater Mumbai Area', city: 'Mumbai', region: 'Maharashtra', country: 'India', lat: 19.0760, lng: 72.8777 },
  { name: 'Greater Seoul Area', city: 'Seoul', region: 'Gyeonggi', country: 'South Korea', lat: 37.5665, lng: 126.9780 },
  { name: 'Bali Cultural Highlands', city: 'Ubud', region: 'Bali', country: 'Indonesia', lat: -8.5069, lng: 115.2625 },
];

/**
 * Fallback reverse geocoding when Google Maps Geocoder and network APIs are offline.
 * Identifies the nearest landmark, cultural spot, or regional center with realistic names.
 */
export function fallbackReverseGeocode(lat: number, lng: number): { name: string; address: string } {
  let closestDist = Infinity;
  let closestLoc: PresetLocation | null = null;

  for (const loc of SEARCHABLE_LOCATIONS) {
    const dLat = loc.lat - lat;
    const dLng = (loc.lng - lng) * Math.cos((lat * Math.PI) / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111; // rough km
    if (dist < closestDist) {
      closestDist = dist;
      closestLoc = loc;
    }
  }

  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;

  if (closestLoc && closestDist < 15) {
    return {
      name: closestDist < 2 ? closestLoc.name : `${closestLoc.name} Vicinity`,
      address: closestDist < 2 ? closestLoc.address : `${closestLoc.address} (~${closestDist.toFixed(1)} km)`,
    };
  }

  // Check regional hubs
  let closestHubDist = Infinity;
  let closestHub = OFFLINE_REGIONAL_HUBS[0];

  for (const hub of OFFLINE_REGIONAL_HUBS) {
    const dLat = hub.lat - lat;
    const dLng = (hub.lng - lng) * Math.cos((lat * Math.PI) / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
    if (dist < closestHubDist) {
      closestHubDist = dist;
      closestHub = hub;
    }
  }

  if (closestHubDist < 35) {
    return {
      name: closestHub.name,
      address: `${closestHub.city}, ${closestHub.region}, ${closestHub.country}`,
    };
  } else if (closestHubDist < 120) {
    return {
      name: `${closestHub.city} Vicinity`,
      address: `Near ${closestHub.city}, ${closestHub.region}, ${closestHub.country}`,
    };
  }

  // Continental region resolver
  let continent = 'Global Location';
  if (lat >= 15 && lat <= 72 && lng >= -168 && lng <= -50) {
    continent = 'North America';
  } else if (lat >= -56 && lat < 15 && lng >= -82 && lng <= -34) {
    continent = 'South America';
  } else if (lat >= 35 && lat <= 71 && lng >= -10 && lng <= 40) {
    continent = 'Europe';
  } else if (lat >= -35 && lat <= 37 && lng >= -18 && lng <= 52) {
    continent = 'Africa';
  } else if (lat >= 10 && lat <= 75 && lng >= 40 && lng <= 180) {
    continent = 'Asia';
  } else if (lat >= -47 && lat <= -10 && lng >= 110 && lng <= 180) {
    continent = 'Oceania';
  }

  return {
    name: `${continent} (${latStr}, ${lngStr})`,
    address: `${continent} Coordinates: ${latStr}, ${lngStr}`,
  };
}

/**
 * Asynchronously resolves coordinates via multi-tier reverse geocoding proxy
 * (Google Maps -> OpenStreetMap Nominatim -> Gemini AI -> Offline database)
 */
export async function fetchReverseGeocodedLocation(
  lat: number,
  lng: number
): Promise<{ name: string; address: string }> {
  try {
    const response = await authedFetch('/api/reverse-geocode', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.name && data.address) {
        return { name: data.name, address: data.address };
      }
    }
  } catch (err) {
    console.warn('[fetchReverseGeocodedLocation] Server reverse geocode error:', err);
  }

  return fallbackReverseGeocode(lat, lng);
}


