/**
 * Manual smoke test for AiService against the live Groq API.
 *
 * Not part of `npm test` — it costs a real request and needs a real key. Use it
 * when tuning the prompt: it prints the verbatim reply alongside the parsed and
 * validated forms, so a validation failure can be traced to the exact wording
 * that caused it.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/groq-smoke.ts
 *
 * Force the timeout path (expect kind=timeout, near-instantly):
 *
 *   GROQ_TIMEOUT=1 npx ts-node -r tsconfig-paths/register scripts/groq-smoke.ts
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';

loadEnv({ path: `.env.${process.env.NODE_ENV || 'development'}` });

import aiConfig from '../src/config/ai.config';
import { AiService } from '../src/modules/recommendation/services/ai.service';
import { AiServiceError } from '../src/modules/recommendation/services/ai.errors';
import { AmbiancePreference } from '../src/modules/user/entities/user-preference.entity';
import {
  AiFanzoneCandidate,
  AiUserProfile,
  GenerateRecommendationParams,
} from '../src/modules/recommendation/services/ai.types';

const TUNIS_ZONE_ID = '3f1b7c2a-5d4e-4a91-8b2f-6c1d9e0a7b31';
const BIZERTE_ZONE_ID = '7a2c4e6b-8d0f-4132-9a5b-1c3d5e7f9a0b';
const SOUSSE_ZONE_ID = '9c8d7e6f-1a2b-4c3d-9e8f-7a6b5c4d3e2f';

/**
 * A fan zone with its real coordinates.
 *
 * `AiFanzoneCandidate` has no lat/long on purpose: in the running application
 * PostGIS computes the distance in the same query that selects the candidates
 * (`FanzoneService.distanceKmExpression()`), so the service never sees a raw
 * coordinate pair. This script has no database, so it carries the coordinates
 * itself and derives `distanceKm` below — which keeps the fixture honest when
 * you move the user around.
 */
type ZoneFixture = Omit<AiFanzoneCandidate, 'distanceKm'> & {
  latitude: number;
  longitude: number;
};

/** Move the user and every distance below follows. */
const USER: AiUserProfile = {
  email: 'fan@example.com',
  favoriteTeams: ['Tunisia'],
  preferredAmbiance: AmbiancePreference.ANIMATED,
  // Bizerte
  latitude: 37.2744,
  longitude: 9.8739,
};

const ZONES: ZoneFixture[] = [
  {
    id: TUNIS_ZONE_ID,
    name: 'Bab Bhar Fan Zone',
    city: 'Tunis',
    latitude: 36.8008,
    longitude: 10.1817,
    occupancyPercentage: 60,
    teamsSupported: ['Tunisia'],
    description: 'Central square with a large screen and drumming sections.',
  },
  {
    id: BIZERTE_ZONE_ID,
    name: 'Bizerte Corniche Zone',
    city: 'Bizerte',
    latitude: 37.276,
    longitude: 9.864,
    occupancyPercentage: 35,
    teamsSupported: ['Tunisia', 'France'],
    description: 'Seafront terrace, families welcome.',
  },
  {
    id: SOUSSE_ZONE_ID,
    name: 'Sousse Beach Zone',
    city: 'Sousse',
    latitude: 35.8256,
    longitude: 10.636,
    occupancyPercentage: 20,
    teamsSupported: ['France'],
    description: null,
  },
];

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * A spherical approximation, not the ellipsoidal figure `ST_Distance(::geography)`
 * returns — they differ by well under a percent at these latitudes, which is far
 * below anything the model reasons about. Production still uses PostGIS; this
 * exists only so the script's numbers move when you move the user.
 */
function haversineKm(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLon = toRadians(toLon - fromLon);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

function toCandidate(zone: ZoneFixture): AiFanzoneCandidate {
  const { latitude, longitude, ...rest } = zone;

  return {
    ...rest,
    distanceKm: haversineKm(USER.latitude, USER.longitude, latitude, longitude),
  };
}

const SAMPLE: GenerateRecommendationParams = {
  userProfile: USER,
  match: {
    homeTeam: 'Tunisia',
    awayTeam: 'France',
    matchDate: new Date('2026-06-18T18:00:00.000Z'),
    stadium: 'Stade de Rades',
  },
  // Nearest first, mirroring the ORDER BY the real candidate query uses.
  candidates: ZONES.map(toCandidate).sort(
    (left, right) => left.distanceKm - right.distanceKm,
  ),
};

async function main(): Promise<void> {
  const config = aiConfig();
  // A bare ConfigService over the loaded namespace — no Nest container needed
  // for a single provider with a single dependency.
  const configService = {
    get: () => config,
  } as unknown as ConfigService;

  const service = new AiService(configService);

  console.log(`model: ${config.groqModel}`);
  console.log(`timeout: ${config.groqTimeoutMs}ms`);
  console.log(
    `user: ${USER.latitude}, ${USER.longitude} — ` +
      `teams ${USER.favoriteTeams.join(', ') || 'none'}, ambiance ${USER.preferredAmbiance ?? 'none'}`,
  );
  console.log('--- computed distances ---');
  for (const candidate of SAMPLE.candidates) {
    console.log(`  ${candidate.name}: ${candidate.distanceKm.toFixed(1)} km`);
  }

  const startedAt = Date.now();

  try {
    const result = await service.generateRecommendation(SAMPLE);

    console.log(`elapsed: ${Date.now() - startedAt}ms`);
    console.log('--- parsed + validated ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('--- validation --- OK');

    const picked = SAMPLE.candidates.find(
      (candidate) => candidate.id === result.fanzoneId,
    );

    console.log(
      `picked: ${picked?.name ?? result.fanzoneId} — ` +
        `${picked?.distanceKm.toFixed(1) ?? '?'} km, ` +
        `supports ${picked?.teamsSupported.join(', ') ?? '?'}`,
    );
  } catch (error) {
    console.log(`elapsed: ${Date.now() - startedAt}ms`);

    if (error instanceof AiServiceError) {
      console.error(`AiServiceError: kind=${error.kind} — ${error.message}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

void main();
