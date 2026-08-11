/**
 * City → coordinates lookup for the recommender.
 *
 * A stopgap, and deliberately a visible one. `UserPreferenceEntity` stores the
 * user's `city` as free text and nothing else, so there is no point to measure
 * distances from — but EF-13 cannot rank fan zones without one. The honest fix
 * is `latitude`/`longitude` columns on `user_preferences`, which is a user-module
 * migration plus an API change and belongs to its own task.
 *
 * Until then: a small table of the cities this deployment serves, matched
 * leniently, with every miss logged by the caller so the table can be extended
 * from real data rather than guesswork.
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

/**
 * Keys are already normalised — lower-case and unaccented — because
 * `resolveCityCoordinates` normalises its argument before looking it up.
 */
export const CITY_COORDINATES: Readonly<Record<string, Coordinates>> = {
  tunis: { latitude: 36.8065, longitude: 10.1815 },
  ariana: { latitude: 36.8625, longitude: 10.1956 },
  ben_arous: { latitude: 36.7533, longitude: 10.2189 },
  manouba: { latitude: 36.8081, longitude: 10.0972 },
  bizerte: { latitude: 37.2744, longitude: 9.8739 },
  beja: { latitude: 36.7256, longitude: 9.1817 },
  jendouba: { latitude: 36.5011, longitude: 8.7803 },
  kef: { latitude: 36.1742, longitude: 8.7047 },
  siliana: { latitude: 36.0849, longitude: 9.3708 },
  zaghouan: { latitude: 36.4029, longitude: 10.1429 },
  nabeul: { latitude: 36.456, longitude: 10.7376 },
  sousse: { latitude: 35.8256, longitude: 10.636 },
  monastir: { latitude: 35.7643, longitude: 10.8113 },
  mahdia: { latitude: 35.5047, longitude: 11.0622 },
  kairouan: { latitude: 35.6781, longitude: 10.0963 },
  kasserine: { latitude: 35.1676, longitude: 8.8365 },
  sidi_bouzid: { latitude: 35.0382, longitude: 9.4849 },
  sfax: { latitude: 34.7406, longitude: 10.7603 },
  gabes: { latitude: 33.8815, longitude: 10.0982 },
  medenine: { latitude: 33.3549, longitude: 10.5055 },
  tataouine: { latitude: 32.9297, longitude: 10.4518 },
  gafsa: { latitude: 34.425, longitude: 8.7842 },
  tozeur: { latitude: 33.9197, longitude: 8.1335 },
  kebili: { latitude: 33.7047, longitude: 8.9692 },
};

/**
 * Used when the user has no city, or one that is not in the table.
 *
 * The capital rather than a geometric centre of the country: a wrong guess that
 * lands in the largest population centre is wrong by less, for more users, than
 * one that lands in the desert.
 */
export const DEFAULT_CITY = 'tunis';

/**
 * Normalises a city name to a lookup key: trimmed, unaccented, lower-cased, and
 * with runs of spaces, hyphens and apostrophes collapsed to a single underscore.
 *
 * So `"Béja"`, `" BEJA "` and `"beja"` agree, as do `"Ben Arous"`,
 * `"ben-arous"` and `"Ben  Arous"`.
 */
export function normaliseCityName(city: string): string {
  return city
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s\-']+/g, '_');
}

/**
 * Whether a city is in the table — lets the caller log a miss without a second
 * lookup, and without `resolveCityCoordinates` needing to return null.
 */
export function isKnownCity(city: string | null | undefined): boolean {
  if (typeof city !== 'string') {
    return false;
  }

  return normaliseCityName(city) in CITY_COORDINATES;
}

/**
 * Coordinates for a city, falling back to {@link DEFAULT_CITY}.
 *
 * Never throws and never returns null: a missing or unrecognised city is a data
 * gap, and refusing to recommend anything at all would be a worse answer than
 * recommending from the capital. Callers are expected to check
 * {@link isKnownCity} first and log the miss.
 */
export function resolveCityCoordinates(
  city: string | null | undefined,
): Coordinates {
  if (typeof city === 'string') {
    const match = CITY_COORDINATES[normaliseCityName(city)];
    if (match) {
      return match;
    }
  }

  return CITY_COORDINATES[DEFAULT_CITY];
}
