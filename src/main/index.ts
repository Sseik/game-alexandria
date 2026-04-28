import 'dotenv/config';
import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { initializeSupabaseIntegration, startSupabaseLaunchListener } from './supabaseIntegration';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env["VITE_SUPABASE_URL"] as string;
const supabaseAnonKey = process.env["VITE_SUPABASE_ANON_KEY"] as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check .env.local for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

type GameRecord = {
  id: number;
  title: string;
  description: string | null;
  coverUrl: string | null;
  igdbId: number | null;
};

type AppUserWithPermissions = {
  id: number;
  username: string;
  email: string;
  passwordHash: string;
  roleId: number;
  createdAt: Date | null;
  role?: {
    id: number;
    name: string;
    permissions: Array<{ action: string }>;
  } | null;
};

type IgdbGame = {
  id: number;
  name?: string;
  summary?: string | null;
  cover?: { image_id?: string | null } | number | null;
  platforms?: Array<{ name?: string | null }>;
  websites?: Array<{ url?: string | null; category?: number | null }>;
  game_logos?: Array<{ image_id?: string | null }> | number[];
  artworks?: Array<{ image_id?: string | null }> | number[];
  screenshots?: Array<{ image_id?: string | null }> | number[];
  videos?: Array<{ video_id?: string | null }> | number[];
  total_rating?: number | null;
  rating?: number | null;
};

type ResolvedIgdbMedia = {
  name?: string;
  summary?: string | null;
  coverUrl?: string;
  logoUrl?: string;
  screenshots?: string[];
  videos?: string[];
  score?: number | null;
  platforms?: string[];
  platformLinks?: Array<{ platform: string; url: string; launchUrl?: string; category?: number }>;
};

type IgdbImportCandidate = {
  igdbId: number;
  title: string;
  description?: string;
  coverUrl?: string;
  score?: number | null;
  inDatabase: boolean;
  gameId?: string;
};

type AuditLogEntry = {
  actorEmail: string;
  action: string;
  targetType: 'user' | 'role' | 'permission' | 'rbac' | 'game';
  targetId?: string;
  details?: string;
};

const IGDB_TITLE_ID_FALLBACKS: Record<string, number> = {
  'fallout 1': 13,
  undertale: 12517,
  'risk of rain 1': 3173
};

const IGDB_WEBSITE_PLATFORM_MAP: Record<number, string> = {
  13: 'Steam',
  16: 'Epic Games',
  17: 'GOG'
};

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const IGDB_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_API_BASE = 'https://api.igdb.com/v4';

let igdbAccessToken: string | null = null;
let igdbAccessTokenExpiry = 0;
let igdbBackoffUntil = 0;
let igdbRateLimitNotifiedAt = 0;
type IgdbCacheEntry = {
  promise: Promise<ResolvedIgdbMedia | null>;
  expiresAt: number;
};

type GameDetailsCacheEntry = {
  value: unknown;
  expiresAt: number;
};

const IGDB_SUCCESS_CACHE_MS = 6 * 60 * 60 * 1000;
const IGDB_FAILURE_CACHE_MS = 45 * 1000;
const IGDB_INFLIGHT_CACHE_MS = 30 * 1000;
const GAME_DETAILS_CACHE_MS = 10 * 60 * 1000;
const igdbGameCache = new Map<string, IgdbCacheEntry>();
const gameDetailsCache = new Map<string, GameDetailsCacheEntry>();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const execFileAsync = promisify(require('node:child_process').execFile);
let activeRemoteUserEmail: string | null = null;

const trackedSessionIntervals = new Map<number, NodeJS.Timeout>();

type DeeplinkSessionTracker = {
  sessionId: number;
  userId: number;
  sawBlur: boolean;
  launcherKind: 'steam' | 'epic' | 'other';
  baselinePids: Set<number>;
  trackedPid?: number;
  fallbackTimer: NodeJS.Timeout;
  processProbeTimer?: NodeJS.Timeout;
  focusCloseTimer?: NodeJS.Timeout;
};

const DEEPLINK_EXPECT_BLUR_MS = 45000;
const DEEPLINK_FOCUS_SETTLE_MS = 12000;
const DEEPLINK_PROCESS_PROBE_MS = 7000;
const deeplinkSessionTrackers = new Map<number, DeeplinkSessionTracker>();
const activeDeeplinkSessionByUserId = new Map<number, number>();

type RunningProcess = {
  pid: number;
  parentPid: number;
  name: string;
  commandLine: string;
};

function toHttpsUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }

  return url.startsWith('//') ? `https:${url}` : url;
}

function normalizePlatformName(platformName: string): string {
  const normalized = platformName.trim().toLowerCase();

  if (normalized.includes('epic')) {
    return 'Epic Games';
  }

  if (normalized.includes('steam')) {
    return 'Steam';
  }

  if (normalized.includes('gog')) {
    return 'GOG';
  }

  return platformName.trim();
}

function inferLaunchUrl(platformName: string, websiteUrl: string): string | undefined {
  const normalizedPlatform = normalizePlatformName(platformName).toLowerCase();

  if (websiteUrl.startsWith('steam://') || websiteUrl.startsWith('com.epicgames.launcher://')) {
    return websiteUrl;
  }

  if (normalizedPlatform === 'steam') {
    const steamMatch = websiteUrl.match(/\/app\/(\d+)/i);
    if (steamMatch?.[1]) {
      return `steam://run/${steamMatch[1]}`;
    }
  }

  return undefined;
}

function escapeIgdbQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTitleMatch(source: string, candidate: string): number {
  const normalizedSource = normalizeTitle(source);
  const normalizedCandidate = normalizeTitle(candidate);

  if (!normalizedSource || !normalizedCandidate) return 0;
  if (normalizedSource === normalizedCandidate) return 1;

  const sourceTokens = normalizedSource.split(' ');
  const candidateTokens = normalizedCandidate.split(' ');

  const sSet = new Set(sourceTokens);
  const cSet = new Set(candidateTokens);
  const overlap = [...sSet].filter((token) => cSet.has(token)).length;
  const union = new Set([...sSet, ...cSet]).size;
  const baseScore = union === 0 ? 0 : overlap / union;

  const isPrefix =
    normalizedCandidate.startsWith(normalizedSource + ' ') ||
    normalizedSource.startsWith(normalizedCandidate + ' ');

  if (isPrefix) {
    const longerTokens =
      sourceTokens.length > candidateTokens.length ? sourceTokens : candidateTokens;
    const shorterTokens =
      sourceTokens.length > candidateTokens.length ? candidateTokens : sourceTokens;

    const firstExtraWord = longerTokens[shorterTokens.length];
    const isSequel = /^(\d+|i{1,3}|iv|v|vi{0,3}|ix|x)$/.test(firstExtraWord);

    if (isSequel) {
      return Math.max(baseScore, 0.4);
    } else {
      return 0.9;
    }
  }

  if (
    normalizedSource.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedSource)
  ) {
    return 0.85 - Math.abs(normalizedSource.length - normalizedCandidate.length) * 0.005;
  }

  return baseScore;
}

function isLikelyPackageTitle(value: string): boolean {
  const normalized = normalizeTitle(value);
  return /(bundle|pack|collection|edition|complete|trilogy)/.test(normalized);
}

function pickBestGameMatch(sourceTitle: string, candidates: IgdbGame[]): IgdbGame | null {
  if (!candidates.length) {
    return null;
  }

  let best: { game: IgdbGame; score: number } | null = null;
  const sourceIsPackage = isLikelyPackageTitle(sourceTitle);

  for (const candidate of candidates) {
    if (!sourceIsPackage && isLikelyPackageTitle(candidate.name || '')) {
      continue;
    }

    const score = scoreTitleMatch(sourceTitle, candidate.name || '');
    if (!best || score > best.score) {
      best = { game: candidate, score };
    }
  }

  // Reject weak matches to avoid displaying wrong game artwork.
  return best && best.score >= 0.45 ? best.game : null;
}

async function getIgdbAccessToken(): Promise<string> {
  if (igdbAccessToken && Date.now() < igdbAccessTokenExpiry) {
    return igdbAccessToken;
  }

  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    throw new Error('Missing IGDB credentials');
  }

  const response = await fetch(
    `${IGDB_TOKEN_URL}?client_id=${encodeURIComponent(IGDB_CLIENT_ID)}&client_secret=${encodeURIComponent(IGDB_CLIENT_SECRET)}&grant_type=client_credentials`,
    { method: 'POST' }
  );

  if (!response.ok) {
    throw new Error(`IGDB auth failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  igdbAccessToken = data.access_token;
  igdbAccessTokenExpiry = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
  return igdbAccessToken;
}

async function igdbFetch(endpoint: string, body: string): Promise<IgdbGame[]> {
  if (Date.now() < igdbBackoffUntil) {
    throw new Error('IGDB request skipped during rate-limit backoff window');
  }

  const token = await getIgdbAccessToken();
  const response = await fetch(`${IGDB_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': IGDB_CLIENT_ID ?? '',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain'
    },
    body
  });

  if (response.status === 429) {
    const retryAfterRaw = response.headers.get('Retry-After');
    const retryAfterSeconds = Math.max(10, Number(retryAfterRaw || '60') || 60);
    igdbBackoffUntil = Date.now() + retryAfterSeconds * 1000;
    throw new Error(`IGDB rate-limited (429). Backing off for ${retryAfterSeconds}s`);
  }

  if (!response.ok) {
    throw new Error(`IGDB request failed: ${response.status}`);
  }

  return (await response.json()) as IgdbGame[];
}

async function appendAuditLogEntry(params: AuditLogEntry) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    actorEmail: params.actorEmail,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details,
    createdAt: new Date().toISOString()
  };

  const auditPath = join(app.getPath('userData'), 'admin-audit.log');
  await mkdir(dirname(auditPath), { recursive: true });
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function loadUserWithPermissions(userId: number): Promise<AppUserWithPermissions | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: {
            select: { action: true }
          }
        }
      }
    }
  });
}

function actorHasPermission(
  actor: AppUserWithPermissions | null | undefined,
  action: string
): boolean {
  return Boolean(actor?.role?.permissions.some((permission) => permission.action === action));
}

async function searchIgdbGames(query: string): Promise<IgdbImportCandidate[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const results = await igdbFetch(
    '/games',
    `search "${escapeIgdbQuery(normalizedQuery)}"; fields name,summary,cover.image_id,total_rating,rating; limit 10;`
  );

  const ids = results.map((game) => game.id);
  const existingGames = await prisma.game.findMany({
    where: {
      OR: [{ igdbId: { in: ids } }, { title: { in: results.map((game) => game.name || '') } }]
    },
    select: { id: true, title: true, igdbId: true }
  });

  const existingByIgdbId = new Map(
    existingGames.filter((game) => game.igdbId).map((game) => [game.igdbId as number, game])
  );
  const existingByTitle = new Map(existingGames.map((game) => [normalizeTitle(game.title), game]));

  return results.flatMap((game) => {
    const title = game.name?.trim();
    if (!title) {
      return [];
    }

    const coverImageId = extractImageId(game.cover);
    const matchedGame = existingByIgdbId.get(game.id) ?? existingByTitle.get(normalizeTitle(title));

    return [
      {
        igdbId: game.id,
        title,
        description: game.summary?.trim() || undefined,
        coverUrl: coverImageId ? buildIgdbImageUrl(coverImageId, 't_cover_big') : undefined,
        score: game.total_rating ?? game.rating ?? null,
        inDatabase: Boolean(matchedGame),
        gameId: matchedGame ? String(matchedGame.id) : undefined
      }
    ];
  });
}

async function importIgdbGameToDatabase(userId: number, igdbId: number) {
  const actor = await loadUserWithPermissions(userId);

  if (!actor) {
    return { success: false, created: false, error: 'User not found' };
  }

  if (!actorHasPermission(actor, 'games.write')) {
    return { success: false, created: false, error: 'Missing permission: games.write' };
  }

  const [igdbGame] = await igdbFetch(
    '/games',
    `where id = ${igdbId}; fields name,summary,cover.image_id; limit 1;`
  );

  if (!igdbGame?.name?.trim()) {
    return { success: false, created: false, error: 'IGDB game not found' };
  }

  const title = igdbGame.name.trim();
  const description = igdbGame.summary?.trim() || null;
  const coverImageId = extractImageId(igdbGame.cover);
  const coverUrl = coverImageId ? buildIgdbImageUrl(coverImageId, 't_cover_big') : null;

  const existingGame = await prisma.game.findFirst({
    where: {
      OR: [{ igdbId }, { title: { equals: title, mode: 'insensitive' } }]
    }
  });

  const savedGame = existingGame
    ? await prisma.game.update({
        where: { id: existingGame.id },
        data: {
          title,
          description,
          coverUrl: coverUrl ?? existingGame.coverUrl,
          igdbId,
          isCustom: false,
          addedByUserId: actor.id
        },
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          igdbId: true
        }
      })
    : await prisma.game.create({
        data: {
          title,
          description,
          coverUrl,
          igdbId,
          isCustom: false,
          addedByUserId: actor.id
        },
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          igdbId: true
        }
      });

  await appendAuditLogEntry({
    actorEmail: actor.email,
    action: existingGame ? 'import-game-from-igdb-update' : 'import-game-from-igdb-create',
    targetType: 'game',
    targetId: String(savedGame.id),
    details: `${title} (IGDB ${igdbId})`
  });

  return {
    success: true,
    created: !existingGame,
    game: toBasicGamePayload(savedGame)
  };
}

function extractImageId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const imageId = (value as { image_id?: unknown }).image_id;
  return typeof imageId === 'string' && imageId ? imageId : undefined;
}

function extractImageIds(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => extractImageId(value))
    .filter((value): value is string => Boolean(value));
}

function extractVideoIds(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => {
      if (!value || typeof value !== 'object') {
        return undefined;
      }

      const videoId = (value as { video_id?: unknown }).video_id;
      return typeof videoId === 'string' && videoId ? videoId : undefined;
    })
    .filter((value): value is string => Boolean(value));
}

function buildIgdbImageUrl(
  imageId: string,
  size: 't_cover_big' | 't_logo_med' | 't_screenshot_big' = 't_cover_big'
): string {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

async function resolveIgdbMedia(game: GameRecord): Promise<ResolvedIgdbMedia | null> {
  const fallbackIgdbId = game.igdbId
    ? null
    : (IGDB_TITLE_ID_FALLBACKS[normalizeTitle(game.title)] ?? null);
  const effectiveIgdbId = game.igdbId ?? fallbackIgdbId;
  const cacheKey = effectiveIgdbId ? `id:${effectiveIgdbId}` : `title:${game.title.toLowerCase()}`;
  const now = Date.now();
  const cached = igdbGameCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  if (cached && cached.expiresAt <= now) {
    igdbGameCache.delete(cacheKey);
  }

  const request = (async () => {
    try {
      const primaryQuery = effectiveIgdbId
        ? `fields name,summary,cover.image_id,platforms.name,websites.url,websites.category,game_logos.image_id,artworks.image_id,screenshots.image_id,videos.video_id,total_rating,rating; where id = ${effectiveIgdbId}; limit 1;`
        : `search "${escapeIgdbQuery(game.title)}"; fields name,summary,cover.image_id,platforms.name,websites.url,websites.category,game_logos.image_id,artworks.image_id,screenshots.image_id,videos.video_id,total_rating,rating; limit 10;`;

      // Some IGDB schemas/accounts may reject specific relation fields.
      const results = await igdbFetch('/games', primaryQuery).catch(async () => {
        const fallbackQuery = effectiveIgdbId
          ? `fields name,summary,cover.image_id,platforms.name,websites.url,websites.category,artworks.image_id,screenshots.image_id,videos.video_id,total_rating,rating; where id = ${effectiveIgdbId}; limit 1;`
          : `search "${escapeIgdbQuery(game.title)}"; fields name,summary,cover.image_id,platforms.name,websites.url,websites.category,artworks.image_id,screenshots.image_id,videos.video_id,total_rating,rating; limit 10;`;
        return igdbFetch('/games', fallbackQuery);
      });

      const matchedGame = effectiveIgdbId ? results[0] : pickBestGameMatch(game.title, results);
      if (!matchedGame) {
        return null;
      }

      const coverImageId = extractImageId(matchedGame.cover);
      const artworkImageId = extractImageIds(matchedGame.artworks)[0];
      const logoImageId = extractImageIds(matchedGame.game_logos)[0];
      const screenshotUrls = extractImageIds(matchedGame.screenshots)
        .slice(0, 6)
        .map((imageId) => buildIgdbImageUrl(imageId, 't_screenshot_big'));
      const videoUrls = extractVideoIds(matchedGame.videos)
        .slice(0, 2)
        .map((videoId) => `https://www.youtube.com/embed/${videoId}`);

      const coverUrl = coverImageId ? buildIgdbImageUrl(coverImageId, 't_cover_big') : null;
      const artworkUrl = artworkImageId ? buildIgdbImageUrl(artworkImageId, 't_cover_big') : null;
      const logoUrl = logoImageId ? buildIgdbImageUrl(logoImageId, 't_logo_med') : null;

      const resolvedCover = coverUrl || artworkUrl || screenshotUrls[0] || undefined;
      const resolvedLogo = logoUrl || resolvedCover;
      const score = matchedGame.total_rating ?? matchedGame.rating ?? null;
      const allPlatforms = new Set<string>();
      const platformLinks: Array<{
        platform: string;
        url: string;
        launchUrl?: string;
        category?: number;
      }> = [];

      for (const website of matchedGame.websites ?? []) {
        const rawUrl = toHttpsUrl(website.url);
        if (!rawUrl) {
          continue;
        }

        const platformFromCategory = website.category
          ? IGDB_WEBSITE_PLATFORM_MAP[website.category]
          : undefined;
        const inferredFromDomain = rawUrl.includes('steampowered.com')
          ? 'Steam'
          : rawUrl.includes('epicgames.com')
            ? 'Epic Games'
            : rawUrl.includes('gog.com')
              ? 'GOG'
              : undefined;
        const platform = platformFromCategory || inferredFromDomain;

        if (!platform) {
          continue;
        }

        const normalizedPlatform = normalizePlatformName(platform);
        allPlatforms.add(normalizedPlatform);

        platformLinks.push({
          platform: normalizedPlatform,
          url: rawUrl,
          launchUrl: inferLaunchUrl(normalizedPlatform, rawUrl),
          category: website.category ?? undefined
        });
      }

      for (const platform of matchedGame.platforms ?? []) {
        if (!platform?.name) {
          continue;
        }
        allPlatforms.add(normalizePlatformName(platform.name));
      }

      return {
        name: matchedGame.name,
        summary: matchedGame.summary,
        coverUrl: resolvedCover,
        logoUrl: resolvedLogo,
        screenshots: screenshotUrls,
        videos: videoUrls,
        score,
        platforms: [...allPlatforms],
        platformLinks
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimited = message.includes('429') || message.includes('rate-limit');

      if (isRateLimited) {
        const now = Date.now();
        if (now - igdbRateLimitNotifiedAt > 30000) {
          igdbRateLimitNotifiedAt = now;
          console.warn('IGDB rate-limited. Using local DB metadata until backoff expires.');
        }
      } else {
        console.error('Failed to resolve IGDB media', error);
      }

      return null;
    }
  })();

  igdbGameCache.set(cacheKey, {
    promise: request,
    expiresAt: now + IGDB_INFLIGHT_CACHE_MS
  });

  void request
    .then((resolved) => {
      const retryDelay = Math.max(IGDB_FAILURE_CACHE_MS, igdbBackoffUntil - Date.now() + 2000);
      igdbGameCache.set(cacheKey, {
        promise: Promise.resolve(resolved),
        expiresAt: Date.now() + (resolved ? IGDB_SUCCESS_CACHE_MS : retryDelay)
      });
    })
    .catch(() => {
      igdbGameCache.delete(cacheKey);
    });

  return request;
}

async function enrichGame(game: GameRecord) {
  const media = await resolveIgdbMedia(game);
  const coverUrl = toHttpsUrl(media?.coverUrl || media?.logoUrl || game.coverUrl);
  const logoUrl = toHttpsUrl(media?.logoUrl || media?.coverUrl || game.coverUrl);
  const screenshots =
    media?.screenshots
      ?.map((url) => toHttpsUrl(url))
      .filter((url) => Boolean(url && url !== coverUrl)) ?? [];
  const videos = media?.videos?.filter((url) => Boolean(url)) ?? [];

  return {
    id: String(game.id),
    title: media?.name || game.title,
    description: media?.summary ?? game.description ?? undefined,
    coverUrl,
    logoUrl: logoUrl || undefined,
    screenshots,
    videos,
    score: media?.score ?? null,
    platformId: '',
    path: undefined,
    igdbId: game.igdbId,
    platforms: media?.platforms ?? [],
    platformLinks: media?.platformLinks ?? []
  };
}

function toBasicGamePayload(game: GameRecord) {
  return {
    id: String(game.id),
    title: game.title,
    description: game.description ?? undefined,
    coverUrl: toHttpsUrl(game.coverUrl),
    logoUrl: undefined,
    screenshots: [],
    videos: [],
    score: null,
    platformId: '',
    path: undefined,
    igdbId: game.igdbId,
    platforms: [],
    platformLinks: []
  };
}

function formatUtcDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function getDefaultLaunchPrefix(platformName: string): string | null {
  const normalizedName = normalizePlatformName(platformName).toLowerCase();

  if (normalizedName === 'steam') {
    return 'steam://run/';
  }

  if (normalizedName === 'epic games') {
    return 'com.epicgames.launcher://store/product/';
  }

  return null;
}

async function getEpicLocalDeeplink(gameTitles: string[]): Promise<string | null> {
  if (process.platform !== 'win32') return null;

  const manifestsDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  let bestMatch: { score: number; link: string; name: string } | null = null;

  try {
    const files = await readdir(manifestsDir);

    for (const file of files) {
      if (!file.endsWith('.item')) continue;

      const content = await readFile(join(manifestsDir, file), 'utf8');
      const manifest = JSON.parse(content);
      if (!manifest.DisplayName) continue;

      // Шукаємо найвищий бал серед усіх варіантів назви для поточного маніфесту
      let highestScore = 0;
      for (const title of gameTitles) {
        if (!title) continue;
        const score = scoreTitleMatch(title, manifest.DisplayName);
        if (score > highestScore) highestScore = score;
      }

      if (highestScore >= 0.8) {
        const namespace = manifest.CatalogNamespace || manifest.Namespace;
        const catalogId = manifest.CatalogItemId || manifest.ItemId;
        const appName = manifest.AppName;

        if (namespace && catalogId && appName) {
          const link = `com.epicgames.launcher://apps/${namespace}%3A${catalogId}%3A${appName}?action=launch&silent=true`;

          // Зберігаємо тільки якщо це найкращий збіг з усіх файлів!
          if (!bestMatch || highestScore > bestMatch.score) {
            bestMatch = { score: highestScore, link, name: manifest.DisplayName };
          }
        }
      }
    }

    if (bestMatch) {
      console.log(`[Epic Magic] BEST MATCH: "${bestMatch.name}" with score ${bestMatch.score}`);
    } else {
      console.log(`[Epic Magic] No matches found for: ${gameTitles.join(', ')}`);
    }
  } catch (e) {
    console.error('Epic Games manifests not found or unreadable.');
  }

  return bestMatch ? bestMatch.link : null;
}

async function buildAutoLaunchTarget(
  platformName: string,
  launchPrefix: string | null | undefined,
  game: Pick<GameRecord, 'title' | 'igdbId'>
): Promise<string | null> {
  const normalizedPlatform = normalizePlatformName(platformName).toLowerCase();

  if (normalizedPlatform === 'epic games') {
    const titlesToTry = [
      game.title,
      game.title.split(':')[0].trim(),
      game.title.split('-')[0].trim(),
      game.title.replace(/\s+1$/i, '').trim() // Для "Fallout 1" -> "Fallout"
    ];
    // Передаємо масив усіх можливих назв
    return await getEpicLocalDeeplink(titlesToTry);
  }

  if (!launchPrefix) {
    return null;
  }

  if (game.igdbId && normalizedPlatform === 'steam') {
    return `${launchPrefix}${game.igdbId}`;
  }

  return null;
}

function computeSessionDurationMinutes(startedAt: Date, endedAt: Date): number {
  const diffMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
  return Math.max(1, Math.round(diffMs / 60000));
}

function looksLikeWindowsPath(target: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(target);
}

function getExternalLauncherKind(
  target: string,
  platformName?: string
): 'steam' | 'epic' | 'other' | null {
  const normalizedTarget = target.trim().toLowerCase();
  const normalizedPlatform = (platformName || '').trim().toLowerCase();

  if (looksLikeWindowsPath(normalizedTarget)) {
    return null;
  }

  if (normalizedTarget.startsWith('steam://') || normalizedPlatform.includes('steam')) {
    return 'steam';
  }

  if (
    normalizedTarget.startsWith('com.epicgames.launcher://') ||
    normalizedPlatform.includes('epic')
  ) {
    return 'epic';
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(normalizedTarget)) {
    return 'other';
  }

  return null;
}

async function listRunningProcesses(): Promise<RunningProcess[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  const script =
    "$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";

  const { stdout } = (await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 12
  })) as { stdout: string; stderr: string };

  const raw = stdout.trim();
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];

  return items
    .map((item) => {
      const processRow = item as {
        ProcessId?: number;
        ParentProcessId?: number;
        Name?: string;
        CommandLine?: string;
      };

      return {
        pid: Number(processRow.ProcessId || 0),
        parentPid: Number(processRow.ParentProcessId || 0),
        name: String(processRow.Name || ''),
        commandLine: String(processRow.CommandLine || '')
      };
    })
    .filter((entry) => entry.pid > 0 && entry.name);
}

function hasLauncherAncestor(
  processByPid: Map<number, RunningProcess>,
  processEntry: RunningProcess,
  launcherNames: Set<string>
): boolean {
  let current = processEntry;
  for (let index = 0; index < 7; index += 1) {
    const next = processByPid.get(current.parentPid);
    if (!next) {
      return false;
    }

    if (launcherNames.has(next.name.toLowerCase())) {
      return true;
    }

    current = next;
  }

  return false;
}

function pickLauncherChildProcess(
  processes: RunningProcess[],
  baselinePids: Set<number>,
  launcherKind: 'steam' | 'epic'
): RunningProcess | null {
  const launcherNames =
    launcherKind === 'steam'
      ? new Set(['steam.exe'])
      : new Set(['epicgameslauncher.exe', 'epicwebhelper.exe']);

  const ignoredNames = new Set([
    'steam.exe',
    'epicgameslauncher.exe',
    'epicwebhelper.exe',
    'eosoverlayrenderer-win64-shipping.exe',
    'eosoverlayrenderer-win32-shipping.exe',
    'conhost.exe',
    'cmd.exe',
    'powershell.exe',
    'explorer.exe',
    'gamealexandria.exe',
    'electron.exe'
  ]);

  const processByPid = new Map<number, RunningProcess>(processes.map((item) => [item.pid, item]));

  const candidates = processes.filter((processEntry) => {
    const normalizedName = processEntry.name.toLowerCase();
    if (baselinePids.has(processEntry.pid)) {
      return false;
    }

    if (ignoredNames.has(normalizedName)) {
      return false;
    }

    if (!hasLauncherAncestor(processByPid, processEntry, launcherNames)) {
      return false;
    }

    return true;
  });

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftScore = left.commandLine.length;
    const rightScore = right.commandLine.length;
    return rightScore - leftScore;
  });

  return candidates[0] ?? null;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function closeSessionById(sessionId: number, endedAt = new Date()): Promise<void> {
  clearDeeplinkSessionTracker(sessionId);

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      startedAt: true,
      endedAt: true
    }
  });

  if (!session || session.endedAt) {
    return;
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      endedAt,
      durationMinutes: computeSessionDurationMinutes(session.startedAt, endedAt)
    }
  });
}

function clearDeeplinkSessionTracker(sessionId: number): void {
  const tracker = deeplinkSessionTrackers.get(sessionId);
  if (!tracker) {
    return;
  }

  clearTimeout(tracker.fallbackTimer);
  if (tracker.processProbeTimer) {
    clearInterval(tracker.processProbeTimer);
  }
  if (tracker.focusCloseTimer) {
    clearTimeout(tracker.focusCloseTimer);
  }

  deeplinkSessionTrackers.delete(sessionId);

  const activeForUser = activeDeeplinkSessionByUserId.get(tracker.userId);
  if (activeForUser === sessionId) {
    activeDeeplinkSessionByUserId.delete(tracker.userId);
  }
}

function startDeeplinkSessionTracker(
  sessionId: number,
  userId: number,
  launcherKind: 'steam' | 'epic' | 'other',
  baselinePids: Set<number>
): void {
  const previousSessionId = activeDeeplinkSessionByUserId.get(userId);
  if (typeof previousSessionId === 'number') {
    clearDeeplinkSessionTracker(previousSessionId);
  }

  const fallbackTimer = setTimeout(() => {
    const tracker = deeplinkSessionTrackers.get(sessionId);
    if (!tracker || tracker.sawBlur) {
      return;
    }

    void closeSessionById(sessionId);
  }, DEEPLINK_EXPECT_BLUR_MS);

  deeplinkSessionTrackers.set(sessionId, {
    sessionId,
    userId,
    sawBlur: false,
    launcherKind,
    baselinePids,
    fallbackTimer
  });
  activeDeeplinkSessionByUserId.set(userId, sessionId);

  if (launcherKind === 'steam' || launcherKind === 'epic') {
    const probeTimer = setInterval(() => {
      const tracker = deeplinkSessionTrackers.get(sessionId);
      if (!tracker || tracker.trackedPid || !tracker.sawBlur) {
        return;
      }

      void (async () => {
        const running = await listRunningProcesses();
        const match = pickLauncherChildProcess(running, tracker.baselinePids, launcherKind);
        if (!match) {
          return;
        }

        tracker.trackedPid = match.pid;
        if (tracker.focusCloseTimer) {
          clearTimeout(tracker.focusCloseTimer);
          tracker.focusCloseTimer = undefined;
        }
        startSessionProcessTracker(sessionId, match.pid);
      })();
    }, DEEPLINK_PROCESS_PROBE_MS);

    const tracker = deeplinkSessionTrackers.get(sessionId);
    if (tracker) {
      tracker.processProbeTimer = probeTimer;
    }
  }
}

function markDeeplinkSessionsBlurred(): void {
  for (const tracker of deeplinkSessionTrackers.values()) {
    tracker.sawBlur = true;

    if (tracker.focusCloseTimer) {
      clearTimeout(tracker.focusCloseTimer);
      tracker.focusCloseTimer = undefined;
    }
  }
}

function scheduleDeeplinkCloseOnFocus(): void {
  for (const tracker of deeplinkSessionTrackers.values()) {
    if (!tracker.sawBlur || tracker.trackedPid) {
      continue;
    }

    if (tracker.focusCloseTimer) {
      clearTimeout(tracker.focusCloseTimer);
    }

    tracker.focusCloseTimer = setTimeout(() => {
      if (!BrowserWindow.getFocusedWindow()) {
        return;
      }

      void closeSessionById(tracker.sessionId);
    }, DEEPLINK_FOCUS_SETTLE_MS);
  }
}

function startSessionProcessTracker(sessionId: number, pid: number): void {
  const existingInterval = trackedSessionIntervals.get(sessionId);
  if (existingInterval) {
    clearInterval(existingInterval);
  }

  const interval = setInterval(() => {
    if (isProcessAlive(pid)) {
      return;
    }

    clearInterval(interval);
    trackedSessionIntervals.delete(sessionId);
    void closeSessionById(sessionId);
  }, 15000);

  trackedSessionIntervals.set(sessionId, interval);
}

async function endOpenSessionsForUser(userId: number, endedAt: Date): Promise<void> {
  const openSessions = await prisma.gameSession.findMany({
    where: {
      appUserId: userId,
      endedAt: null
    },
    select: {
      id: true,
      startedAt: true
    }
  });

  for (const openSession of openSessions) {
    clearDeeplinkSessionTracker(openSession.id);

    const trackedInterval = trackedSessionIntervals.get(openSession.id);
    if (trackedInterval) {
      clearInterval(trackedInterval);
      trackedSessionIntervals.delete(openSession.id);
    }

    await prisma.gameSession.update({
      where: { id: openSession.id },
      data: {
        endedAt,
        durationMinutes: computeSessionDurationMinutes(openSession.startedAt, endedAt)
      }
    });
  }
}

async function openLaunchTarget(target: string): Promise<void> {
  const normalizedTarget = target.trim();
  const looksLikeProtocol =
    !looksLikeWindowsPath(normalizedTarget) && /^[a-z][a-z\d+.-]*:/i.test(normalizedTarget);

  if (looksLikeProtocol) {
    await shell.openExternal(normalizedTarget);
    return;
  }

  if (/\.(exe|bat|cmd|com)$/i.test(normalizedTarget)) {
    try {
      const child = spawn(normalizedTarget, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
      return;
    } catch {
      // Fall through to shell.openPath for non-standard launch targets.
    }
  }

  const openPathError = await shell.openPath(normalizedTarget);
  if (openPathError) {
    throw new Error(openPathError);
  }
}

async function openLaunchTargetWithProcess(target: string): Promise<number | null> {
  const normalizedTarget = target.trim();
  const looksLikeProtocol =
    !looksLikeWindowsPath(normalizedTarget) && /^[a-z][a-z\d+.-]*:/i.test(normalizedTarget);

  if (looksLikeProtocol) {
    await shell.openExternal(normalizedTarget);
    return null;
  }

  if (/\.(exe|bat|cmd|com)$/i.test(normalizedTarget)) {
    try {
      const child = spawn(normalizedTarget, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
      return typeof child.pid === 'number' ? child.pid : null;
    } catch {
      // Fall through to shell.openPath.
    }
  }

  await openLaunchTarget(normalizedTarget);
  return null;
}

async function launchLibraryGameInternal(
  userId: number,
  gameId: string,
  platformId?: string
): Promise<{ success: boolean; error?: string }> {
  const libraryEntry = await prisma.userLibrary.findFirst({
    where: {
      appUserId: userId,
      gameId: Number(gameId),
      ...(platformId ? { platformId: Number(platformId) } : {})
    },
    select: {
      gameId: true,
      executablePath: true,
      platformId: true,
      platform: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      addedAt: 'desc'
    }
  });

  if (!libraryEntry?.executablePath) {
    return { success: false, error: 'Launch path is not configured for this game.' };
  }

  try {
    const launchedAt = new Date();
    const launcherKind = getExternalLauncherKind(
      libraryEntry.executablePath,
      libraryEntry.platform?.name
    );
    const baselineProcesses =
      launcherKind === 'steam' || launcherKind === 'epic' ? await listRunningProcesses() : [];
    const baselinePids = new Set<number>(baselineProcesses.map((processEntry) => processEntry.pid));

    const trackedPid = await openLaunchTargetWithProcess(libraryEntry.executablePath);

    await endOpenSessionsForUser(userId, launchedAt);

    const createdSession = await prisma.gameSession.create({
      data: {
        appUserId: userId,
        gameId: libraryEntry.gameId,
        startedAt: launchedAt,
        endedAt: null,
        durationMinutes: null
      },
      select: {
        id: true
      }
    });

    if (trackedPid) {
      startSessionProcessTracker(createdSession.id, trackedPid);
    } else {
      startDeeplinkSessionTracker(createdSession.id, userId, launcherKind || 'other', baselinePids);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to launch game', error);
    return { success: false, error: 'Unable to launch this game from its configured target.' };
  }
}

async function launchLibraryGameByEmail(
  email: string,
  gameId: string,
  platformName?: string
): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });

  if (!user) {
    return { success: false, error: 'No local desktop user found for this email.' };
  }

  const matchedEntry = await prisma.userLibrary.findFirst({
    where: {
      appUserId: user.id,
      gameId: Number(gameId),
      ...(platformName
        ? {
            platform: {
              name: {
                equals: platformName,
                mode: 'insensitive'
              }
            }
          }
        : {})
    },
    select: {
      platformId: true
    }
  });

  return launchLibraryGameInternal(
    user.id,
    gameId,
    matchedEntry?.platformId ? String(matchedEntry.platformId) : undefined
  );
}

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  const mainWindow = createWindow();
  await initializeSupabaseIntegration(mainWindow);
  startSupabaseLaunchListener({
    getActiveUserEmail: () => activeRemoteUserEmail,
    onLaunchCommand: async (command) => {
      const result = await launchLibraryGameByEmail(
        command.targetEmail,
        command.gameId,
        command.platformName
      );

      return {
        status: result.success ? 'success' : 'failed',
        message: result.error
      };
    }
  });

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('browser-window-blur', () => {
    markDeeplinkSessionsBlurred();
  });

  app.on('browser-window-focus', () => {
    scheduleDeeplinkCloseOnFocus();
  });

  ipcMain.handle('get-games', async () => {
    const games = await prisma.game.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        coverUrl: true,
        igdbId: true
      }
    });

    return games.map((game) => toBasicGamePayload(game));
  });

  ipcMain.handle('igdb:search-games', async (_, query: string) => {
    try {
      return await searchIgdbGames(query);
    } catch (error) {
      console.error('Failed to search IGDB games', error);
      return [];
    }
  });

  ipcMain.handle('igdb:import-game', async (_, userId: number, igdbId: number) => {
    try {
      return await importIgdbGameToDatabase(userId, igdbId);
    } catch (error) {
      console.error('Failed to import IGDB game', error);
      return {
        success: false,
        created: false,
        error: error instanceof Error ? error.message : 'Unable to import game'
      };
    }
  });

  ipcMain.handle('dev:seed-covers', async () => {
    const covers: Record<string, string> = {
      'Fallout 3': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2ibb.jpg',
      "Don't Starve Together": 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1iq5.jpg',
      'Stardew Valley': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r67.jpg',
      'Darkest Dungeon': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1s0l.jpg',
      Terraria: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1vyz.jpg',
      Factorio: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1s34.jpg',
      'The Witcher: Enhanced Edition':
        'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r3o.jpg',
      Undertale: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1s8h.jpg',
      'Phoenix Wright: Ace Attorney Trilogy':
        'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rby.jpg',
      'Octopath Traveler': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1t4h.jpg',
      'Fallout 1': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2ib8.jpg',
      'Disco Elysium': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1s29.jpg',
      'S.T.A.L.K.E.R.: Shadow of Chornobyl':
        'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rn8.jpg',
      'The Elder Scrolls V: Skyrim Special Edition':
        'https://images.igdb.com/igdb/image/upload/t_cover_big/co1t4c.jpg',
      'Risk of Rain 1': 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1sao.jpg'
    };

    const updated = await Promise.all(
      Object.entries(covers).map(([title, coverUrl]) =>
        prisma.game.updateMany({
          where: { title },
          data: { coverUrl }
        })
      )
    );

    return { success: true, updated: updated.length };
  });

  ipcMain.handle('get-game-details', async (_, gameId: string) => {
    const cached = gameDetailsCache.get(gameId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const game = await prisma.game.findUnique({
      where: { id: Number(gameId) },
      select: {
        id: true,
        title: true,
        description: true,
        coverUrl: true,
        igdbId: true,
        priceHistory: {
          select: {
            price: true,
            recordedAt: true,
            platform: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            recordedAt: 'asc'
          }
        },
        userLibraries: {
          select: {
            platform: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (!game) {
      return null;
    }

    const enrichedGame = await enrichGame(game);
    const platformNames = [
      ...new Set([
        ...(enrichedGame.platforms ?? []),
        ...game.userLibraries.map((entry) => entry.platform.name),
        ...game.priceHistory.map((entry) => entry.platform.name)
      ])
    ];

    const rawPricePoints = game.priceHistory.map((entry) => ({
      label: entry.recordedAt
        ? new Date(entry.recordedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric' // Показуємо "Apr 24" замість "Apr 2026"
          })
        : 'Unknown',
      price: Number(entry.price)
    }));

    // Віддаємо всі крапки, ліміт прибрано
    const priceHistory = rawPricePoints;
    const prices = rawPricePoints.map((point) => point.price);
    const priceStats = prices.length
      ? {
          current: prices[prices.length - 1],
          lowest: Math.min(...prices),
          highest: Math.max(...prices)
        }
      : undefined;

    const cleanTitle = game.title.split(':')[0].trim();
    let cheapsharkUrl: string | undefined =
      `https://gg.deals/games/?title=${encodeURIComponent(cleanTitle)}`;
    try {
      const csRes = await fetch(
        `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(cleanTitle)}&limit=1`
      );
      const csData = await csRes.json();
      if (csData && csData.length > 0) {
        // Отримуємо посилання на гру (CheapShark вимагає вказувати їх як джерело)
        cheapsharkUrl = `https://www.cheapshark.com/redirect?dealID=${csData[0].cheapestDealID}`;
      }
    } catch (e) {
      console.error('CheapShark error', e);
    }

    const detailedPayload = {
      ...enrichedGame,
      platformId: '',
      platforms: platformNames,
      priceHistory,
      priceStats,
      cheapsharkUrl
    };

    gameDetailsCache.set(gameId, {
      value: detailedPayload,
      expiresAt: Date.now() + GAME_DETAILS_CACHE_MS
    });

    return detailedPayload;
  });

  ipcMain.handle('dialog:open-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Executables', extensions: ['exe', 'bat', 'cmd', 'com', 'lnk'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('dialog:confirm', async (_, message: string) => {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Remove', 'Cancel'],
      defaultId: 1,
      title: 'Confirm Action',
      message: message
    });
    return response === 0;
  });

  ipcMain.handle('auth:reset-password', async (_, email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://game-alexandria.vercel.app/'
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: "Помилка зв'язку з сервером" };
    }
  });

  // 2. РЕЄСТРАЦІЯ (З використанням Supabase)
  ipcMain.handle(
    'auth:register',
    async (_, payload: { email: string; password?: string; username: string }) => {
      const { email, password, username } = payload;
      try {
        // Реєстрація в Supabase Auth
        const { error: authError } = await supabase.auth.signUp({
          email,
          password: password || '' // пароль може бути порожнім, якщо реєстрація через провайдера, але тут потрібен
        });

        if (authError) return { success: false, error: authError.message };

        // Синхронізація з локальною БД Prisma
        const userRole = await prisma.role.findFirst({
          where: { name: { equals: 'User', mode: 'insensitive' } }
        });

        const newUser = await prisma.user.upsert({
          where: { email },
          update: { roleId: userRole?.id },
          create: {
            email,
            username: username || email.split('@')[0],
            passwordHash: 'SUPABASE_AUTH',
            roleId: userRole?.id || 1
          },
          include: {
            role: { include: { permissions: { select: { action: true } } } }
          }
        });

        activeRemoteUserEmail = newUser.email;
        return {
          success: true,
          user: {
            ...newUser,
            role: { ...newUser.role, permissions: newUser.role?.permissions.map((p) => p.action) }
          }
        };
      } catch (err) {
        return { success: false, error: 'Помилка синхронізації профілю' };
      }
    }
  );

  // 3. ВХІД (З використанням Supabase)
  ipcMain.handle('auth:login', async (_, { email, password }) => {
    try {
      // Вхід через Supabase Auth
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) return { success: false, error: authError.message };

      // Отримання даних користувача з нашої БД
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          role: { include: { permissions: { select: { action: true } } } }
        }
      });

      if (!user) return { success: false, error: 'Профіль не знайдено в локальній БД' };

      activeRemoteUserEmail = user.email;

      return {
        success: true,
        user: {
          ...user,
          passwordHash: undefined, // прибираємо хеш для безпеки
          role: { ...user.role, permissions: user.role?.permissions.map((p) => p.action) }
        }
      };
    } catch (err) {
      return { success: false, error: 'Помилка авторизації' };
    }
  });

  ipcMain.handle('auth:set-active-user', async (_, userId: number) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    activeRemoteUserEmail = user?.email ?? null;
    return { success: true };
  });

  ipcMain.handle('auth:get-user', async (_, userId: number) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              select: { action: true }
            }
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    const { passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      role: safeUser.role
        ? {
            ...safeUser.role,
            permissions: safeUser.role.permissions.map((permission) => permission.action)
          }
        : undefined
    };
  });

  ipcMain.handle('auth:clear-active-user', async () => {
    activeRemoteUserEmail = null;
    return { success: true };
  });

  ipcMain.handle('get-library', async (_, userId: number) => {
    const games = await prisma.userLibrary.findMany({
      select: {
        id: true,
        executablePath: true,
        game: {
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            igdbId: true
          }
        },
        platform: {
          select: {
            id: true,
            name: true,
            launchPrefix: true
          }
        }
      },
      where: {
        appUserId: userId
      }
    });

    const enrichedGames = games.map((item) => ({
      libraryEntryId: String(item.id),
      id: String(item.game.id),
      title: item.game.title,
      coverUrl: toHttpsUrl(item.game.coverUrl),
      logoUrl: undefined,
      description: item.game.description ?? undefined,
      executablePath: item.executablePath,
      platformId: String(item.platform.id),
      platformName: item.platform.name,
      platforms: [],
      platformLinks: [],
      igdbId: item.game.igdbId,
      score: null,
      screenshots: [],
      videos: [],
      path: undefined
    }));

    return enrichedGames;
  });

  ipcMain.handle('get-wishlist', async (_, userId: number) => {
    const wishlistItems = await prisma.wishlist.findMany({
      where: {
        appUserId: userId
      },
      orderBy: {
        addedAt: 'desc'
      },
      select: {
        id: true,
        targetPrice: true,
        addedAt: true,
        game: {
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            igdbId: true
          }
        }
      }
    });

    const enrichedGames = wishlistItems.map((item) => ({
      ...toBasicGamePayload(item.game),
      targetPrice: item.targetPrice ? Number(item.targetPrice) : null,
      addedAt: item.addedAt?.toISOString()
    }));

    return enrichedGames;
  });

  ipcMain.handle(
    'wishlist:add',
    async (_, userId: number, gameId: string, targetPrice?: number) => {
      await prisma.wishlist.upsert({
        where: {
          appUserId_gameId: {
            appUserId: userId,
            gameId: Number(gameId)
          }
        },
        update: {
          targetPrice: typeof targetPrice === 'number' ? targetPrice : null
        },
        create: {
          appUserId: userId,
          gameId: Number(gameId),
          targetPrice: typeof targetPrice === 'number' ? targetPrice : null
        }
      });

      return { success: true };
    }
  );

  ipcMain.handle(
    'library:update-entry',
    async (
      _,
      userId: number,
      gameId: string,
      currentPlatformId: string,
      platformName: string,
      executablePath?: string
    ) => {
      const normalizedName = normalizePlatformName(platformName);
      const numericGameId = Number(gameId);
      const numericCurrentPlatformId = Number(currentPlatformId);

      const [user, game, currentEntry] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true }
        }),
        prisma.game.findUnique({
          where: { id: numericGameId },
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            igdbId: true
          }
        }),
        prisma.userLibrary.findUnique({
          where: {
            appUserId_gameId_platformId: {
              appUserId: userId,
              gameId: numericGameId,
              platformId: numericCurrentPlatformId
            }
          },
          select: {
            id: true
          }
        })
      ]);

      if (!user) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }

      if (!game) {
        return { success: false, error: 'Game not found.' };
      }

      if (!currentEntry) {
        return { success: false, error: 'Library entry not found.' };
      }

      const existingPlatform = await prisma.platform.findFirst({
        where: {
          name: {
            equals: normalizedName,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          launchPrefix: true
        }
      });

      const platform =
        existingPlatform ??
        (await prisma.platform.create({
          data: {
            name: normalizedName,
            launchPrefix: getDefaultLaunchPrefix(normalizedName)
          },
          select: {
            id: true,
            name: true,
            launchPrefix: true
          }
        }));

      let resolvedLaunchTarget = executablePath?.trim() || null;

      if (!resolvedLaunchTarget) {
        const media = await resolveIgdbMedia(game);
        const matchedLink = media?.platformLinks?.find(
          (link) => link.platform.toLowerCase() === normalizedName.toLowerCase() && link.launchUrl
        );

        resolvedLaunchTarget =
          (await buildAutoLaunchTarget(normalizedName, platform.launchPrefix, game)) ||
          matchedLink?.launchUrl?.trim() ||
          null;
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.userLibrary.upsert({
          where: {
            appUserId_gameId_platformId: {
              appUserId: userId,
              gameId: numericGameId,
              platformId: platform.id
            }
          },
          update: {
            executablePath: resolvedLaunchTarget
          },
          create: {
            appUserId: userId,
            gameId: numericGameId,
            platformId: platform.id,
            executablePath: resolvedLaunchTarget
          }
        });

        if (platform.id !== numericCurrentPlatformId) {
          await transaction.userLibrary.delete({
            where: { id: currentEntry.id }
          });
        }
      });

      return { success: true };
    }
  );

  ipcMain.handle('wishlist:contains', async (_, userId: number, gameId: string) => {
    const item = await prisma.wishlist.findUnique({
      where: {
        appUserId_gameId: {
          appUserId: userId,
          gameId: Number(gameId)
        }
      },
      select: {
        id: true
      }
    });

    return { exists: Boolean(item) };
  });

  ipcMain.handle('wishlist:remove', async (_, userId: number, gameId: string) => {
    await prisma.wishlist.deleteMany({
      where: {
        appUserId: userId,
        gameId: Number(gameId)
      }
    });

    return { success: true };
  });

  ipcMain.handle('library:get-platforms', async () => {
    const platforms = await prisma.platform.findMany({
      orderBy: {
        name: 'asc'
      },
      select: {
        id: true,
        name: true,
        launchPrefix: true
      }
    });

    return platforms;
  });

  ipcMain.handle(
    'library:add-game',
    async (_, userId: number, gameId: string, platformName: string, executablePath?: string) => {
      const normalizedName = normalizePlatformName(platformName);
      const numericGameId = Number(gameId);

      const [user, game] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true }
        }),
        prisma.game.findUnique({
          where: { id: numericGameId },
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            igdbId: true
          }
        })
      ]);

      if (!user) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }

      if (!game) {
        return { success: false, error: 'Game not found.' };
      }

      const existingPlatform = await prisma.platform.findFirst({
        where: {
          name: {
            equals: normalizedName,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          launchPrefix: true
        }
      });

      const platform =
        existingPlatform ??
        (await prisma.platform.create({
          data: {
            name: normalizedName,
            launchPrefix: getDefaultLaunchPrefix(normalizedName)
          },
          select: {
            id: true,
            name: true,
            launchPrefix: true
          }
        }));

      let resolvedLaunchTarget = executablePath?.trim() || null;

      if (!resolvedLaunchTarget) {
        const media = await resolveIgdbMedia(game);
        const matchedLink = media?.platformLinks?.find(
          (link) => link.platform.toLowerCase() === normalizedName.toLowerCase() && link.launchUrl
        );

        resolvedLaunchTarget =
          (await buildAutoLaunchTarget(normalizedName, platform.launchPrefix, game)) ||
          matchedLink?.launchUrl?.trim() ||
          null;
      }

      await prisma.userLibrary.upsert({
        where: {
          appUserId_gameId_platformId: {
            appUserId: userId,
            gameId: numericGameId,
            platformId: platform.id
          }
        },
        update: {
          executablePath: resolvedLaunchTarget
        },
        create: {
          appUserId: userId,
          gameId: numericGameId,
          platformId: platform.id,
          executablePath: resolvedLaunchTarget
        }
      });

      return { success: true };
    }
  );

  ipcMain.handle(
    'library:remove-entry',
    async (_, userId: number, gameId: string, platformId: string) => {
      try {
        await prisma.userLibrary.deleteMany({
          where: {
            appUserId: userId,
            gameId: Number(gameId),
            platformId: Number(platformId)
          }
        });
        return { success: true };
      } catch (error) {
        console.error('Failed to remove game', error);
        return { success: false, error: 'Failed to remove game from library' };
      }
    }
  );

  ipcMain.handle(
    'library:launch',
    async (_, userId: number, gameId: string, platformId?: string) => {
      return launchLibraryGameInternal(userId, gameId, platformId);
    }
  );

  ipcMain.handle('sessions:recent-games', async (_, userId: number, limit = 4) => {
    const recentSessions = await prisma.gameSession.findMany({
      where: {
        appUserId: userId
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: Math.max(12, Math.min(limit * 6, 72)),
      select: {
        gameId: true,
        startedAt: true,
        game: {
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            igdbId: true
          }
        }
      }
    });

    const dedupedByGame = new Map<number, { game: GameRecord; startedAt: Date }>();
    for (const session of recentSessions) {
      if (!dedupedByGame.has(session.gameId)) {
        dedupedByGame.set(session.gameId, { game: session.game, startedAt: session.startedAt });
      }
    }

    const launchableGames = await Promise.all(
      [...dedupedByGame.values()].slice(0, limit).map(async (entry) => {
        const libraryEntry = await prisma.userLibrary.findFirst({
          where: {
            appUserId: userId,
            gameId: entry.game.id
          },
          orderBy: {
            addedAt: 'desc'
          },
          select: {
            platformId: true,
            executablePath: true,
            platform: {
              select: {
                name: true
              }
            }
          }
        });

        return {
          gameId: String(entry.game.id),
          title: entry.game.title,
          image: toHttpsUrl(entry.game.coverUrl),
          platformId: libraryEntry?.platformId ? String(libraryEntry.platformId) : undefined,
          platformName: libraryEntry?.platform.name,
          canLaunch: Boolean(libraryEntry?.executablePath),
          lastPlayedAt: entry.startedAt.toISOString()
        };
      })
    );

    return launchableGames;
  });

  ipcMain.handle('profile:get-dashboard', async (_, userId: number) => {
    const sessions = await prisma.gameSession.findMany({
      where: {
        appUserId: userId
      },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        game: {
          select: {
            title: true
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    const normalizedSessions = sessions.map((session) => ({
      id: session.id,
      gameTitle: session.game.title,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMinutes:
        session.durationMinutes ??
        computeSessionDurationMinutes(session.startedAt, session.endedAt ?? new Date())
    }));

    const totalMinutes = normalizedSessions.reduce(
      (sum, session) => sum + session.durationMinutes,
      0
    );
    const averageMinutes = normalizedSessions.length
      ? Math.round(totalMinutes / normalizedSessions.length)
      : 0;

    const now = new Date();
    const activityMap = new Map<string, number>();
    for (let index = 11; index >= 0; index -= 1) {
      const day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - index)
      );
      activityMap.set(formatUtcDateLabel(day), 0);
    }

    for (const session of normalizedSessions) {
      const label = formatUtcDateLabel(session.startedAt);
      if (!activityMap.has(label)) {
        continue;
      }
      activityMap.set(label, (activityMap.get(label) || 0) + session.durationMinutes);
    }

    const durationBuckets = [
      { label: '0-60 min', count: 0 },
      { label: '61-120 min', count: 0 },
      { label: '121-180 min', count: 0 },
      { label: '180+ min', count: 0 }
    ];

    for (const session of normalizedSessions) {
      if (session.durationMinutes <= 60) {
        durationBuckets[0].count += 1;
      } else if (session.durationMinutes <= 120) {
        durationBuckets[1].count += 1;
      } else if (session.durationMinutes <= 180) {
        durationBuckets[2].count += 1;
      } else {
        durationBuckets[3].count += 1;
      }
    }

    const gameMap = new Map<string, { sessions: number; totalMinutes: number }>();
    for (const session of normalizedSessions) {
      const current = gameMap.get(session.gameTitle) ?? { sessions: 0, totalMinutes: 0 };
      current.sessions += 1;
      current.totalMinutes += session.durationMinutes;
      gameMap.set(session.gameTitle, current);
    }

    const byGame = [...gameMap.entries()]
      .map(([gameTitle, values]) => ({
        gameTitle,
        sessions: values.sessions,
        totalMinutes: values.totalMinutes,
        averageMinutes: values.sessions ? Math.round(values.totalMinutes / values.sessions) : 0
      }))
      .sort((left, right) => right.sessions - left.sessions);

    return {
      sessions: normalizedSessions.length,
      totalMinutes,
      averageMinutes,
      recentActivity: [...activityMap.entries()].map(([label, minutes]) => ({ label, minutes })),
      durationBuckets,
      byGame,
      sessionHistory: normalizedSessions.slice(0, 12).map((session) => ({
        id: session.id,
        gameTitle: session.gameTitle,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString(),
        durationMinutes: session.durationMinutes
      }))
    };
  });

  type AdminAuditTarget = 'user' | 'role' | 'permission' | 'rbac' | 'game';

  const getAdminAuditLogPath = () => join(app.getPath('userData'), 'admin-audit.log');

  const logAdminAction = async (params: {
    actorEmail: string;
    action: string;
    targetType: AdminAuditTarget;
    targetId?: string;
    details?: string;
  }) => {
    await appendAuditLogEntry(params);
  };

  const readAdminAuditLog = async (limit = 80) => {
    const safeLimit = Math.max(1, Math.min(limit, 300));

    try {
      const content = await readFile(getAdminAuditLogPath(), 'utf8');
      const rows = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as {
              id: string;
              actorEmail: string;
              action: string;
              targetType: AdminAuditTarget;
              targetId?: string;
              details?: string;
              createdAt: string;
            };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      return rows.slice(-safeLimit).reverse();
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';

      if (code === 'ENOENT') {
        return [];
      }

      console.warn('Failed to read admin audit log', error);
      return [];
    }
  };

  const requireAdminAccess = async () => {
    if (!activeRemoteUserEmail) {
      throw new Error('Not authenticated');
    }

    const actor = await prisma.user.findUnique({
      where: { email: activeRemoteUserEmail },
      include: {
        role: {
          include: {
            permissions: {
              select: {
                action: true
              }
            }
          }
        }
      }
    });

    if (!actor || actor.role.name.toLowerCase() !== 'admin') {
      throw new Error('Admin access required');
    }

    return actor;
  };

  const actorHasPermission = (
    actor: Awaited<ReturnType<typeof requireAdminAccess>>,
    action: string
  ) => {
    return actor.role.permissions.some((permission) => permission.action === action);
  };

  const buildAdminAccessData = async () => {
    const [users, roles, permissions] = await Promise.all([
      prisma.user.findMany({
        include: {
          role: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }),
      prisma.role.findMany({
        include: {
          permissions: {
            select: {
              id: true,
              action: true
            }
          },
          users: {
            select: {
              id: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }),
      prisma.permission.findMany({
        select: {
          id: true,
          action: true,
          description: true
        },
        orderBy: {
          id: 'asc'
        }
      })
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        roleId: user.roleId,
        roleName: user.role.name,
        createdAt: user.createdAt?.toISOString()
      })),
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissionIds: role.permissions.map((permission) => permission.id),
        usersCount: role.users.length
      })),
      permissions: permissions.map((permission) => ({
        id: permission.id,
        action: permission.action,
        description: permission.description ?? undefined
      }))
    };
  };

  ipcMain.handle('admin:get-rbac-summary', async () => {
    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({
        include: {
          users: {
            select: {
              id: true
            }
          },
          permissions: {
            select: {
              action: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }),
      prisma.permission.findMany({
        include: {
          roles: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      })
    ]);

    return {
      rolesCount: roles.length,
      permissionsCount: permissions.length,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        usersCount: role.users.length,
        permissions: role.permissions.map((permission) => permission.action)
      })),
      permissions: permissions.map((permission) => ({
        id: permission.id,
        action: permission.action,
        description: permission.description ?? undefined,
        usedInRoles: permission.roles.map((role) => role.name)
      }))
    };
  });

  ipcMain.handle('admin:delete-game', async (_, gameId: string) => {
    // 1. Перевіряємо, чи це робить адмін
    const actor = await requireAdminAccess();
    const numericGameId = Number(gameId);

    // 2. Знаходимо гру, щоб зберегти її назву для логів
    const game = await prisma.game.findUnique({
      where: { id: numericGameId },
      select: { title: true }
    });

    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    try {
      // 3. Видаляємо гру та ВСІ пов'язані з нею дані через транзакцію (каскадне видалення)
      await prisma.$transaction([
        prisma.priceHistory.deleteMany({ where: { gameId: numericGameId } }),
        prisma.userLibrary.deleteMany({ where: { gameId: numericGameId } }),
        prisma.wishlist.deleteMany({ where: { gameId: numericGameId } }),
        prisma.gameSession.deleteMany({ where: { gameId: numericGameId } }),
        prisma.game.delete({ where: { id: numericGameId } })
      ]);

      // 4. Записуємо дію в аудит-лог
      await logAdminAction({
        actorEmail: actor.email,
        action: 'delete-game',
        targetType: 'game',
        targetId: gameId,
        details: `Deleted game: ${game.title}`
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to delete game:', error);
      return { success: false, error: 'Failed to delete game and its relations' };
    }
  });

  ipcMain.handle('admin:get-access-data', async () => {
    await requireAdminAccess();
    return buildAdminAccessData();
  });

  ipcMain.handle('admin:get-audit-log', async (_, limit?: number) => {
    await requireAdminAccess();
    return readAdminAuditLog(limit ?? 80);
  });

  ipcMain.handle('admin:update-user-role', async (_, targetUserId: number, roleId: number) => {
    const actor = await requireAdminAccess();

    const [nextRole, targetUser] = await Promise.all([
      prisma.role.findUnique({
        where: { id: roleId },
        select: {
          id: true,
          name: true
        }
      }),
      prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          role: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    ]);

    if (!nextRole) {
      return { success: false, error: 'Role not found' };
    }

    if (!targetUser) {
      return { success: false, error: 'Target user not found' };
    }

    const isTargetCurrentlyAdmin = targetUser.role.name.toLowerCase() === 'admin';
    const isAssigningAdmin = nextRole.name.toLowerCase() === 'admin';
    const touchesAdminRole = isTargetCurrentlyAdmin || isAssigningAdmin;

    if (touchesAdminRole && !actorHasPermission(actor, 'admin.modify_admins')) {
      return {
        success: false,
        error: 'Missing permission: admin.modify_admins (required to grant/revoke Admin role)'
      };
    }

    if (actor.id === targetUserId && nextRole.name.toLowerCase() !== 'admin') {
      return { success: false, error: 'You cannot remove your own admin role' };
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        roleId
      },
      include: {
        role: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    await logAdminAction({
      actorEmail: actor.email,
      action: 'update-user-role',
      targetType: 'user',
      targetId: String(targetUserId),
      details: `Assigned role ${updated.role.name} (#${roleId})`
    });

    return {
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        roleId: updated.roleId,
        roleName: updated.role.name,
        createdAt: updated.createdAt?.toISOString()
      }
    };
  });

  ipcMain.handle(
    'admin:update-role-permissions',
    async (_, roleId: number, permissionIds: number[]) => {
      const actor = await requireAdminAccess();

      const role = await prisma.role.findUnique({
        where: { id: roleId },
        include: {
          permissions: {
            select: {
              id: true,
              action: true
            }
          }
        }
      });

      if (!role) {
        return { success: false, error: 'Role not found' };
      }

      const uniquePermissionIds = [
        ...new Set(permissionIds.filter((value) => Number.isInteger(value)))
      ];
      const availablePermissions = await prisma.permission.findMany({
        where: {
          id: {
            in: uniquePermissionIds
          }
        },
        select: {
          id: true,
          action: true
        }
      });

      if (availablePermissions.length !== uniquePermissionIds.length) {
        return { success: false, error: 'One or more selected permissions do not exist' };
      }

      await prisma.role.update({
        where: { id: roleId },
        data: {
          permissions: {
            set: uniquePermissionIds.map((id) => ({ id }))
          }
        }
      });

      const previousActions = role.permissions
        .map((permission) => permission.action)
        .sort()
        .join(', ');
      const nextActions = availablePermissions
        .map((permission) => permission.action)
        .sort()
        .join(', ');

      await logAdminAction({
        actorEmail: actor.email,
        action: 'update-role-permissions',
        targetType: 'rbac',
        targetId: String(roleId),
        details: `Role ${role.name}: [${previousActions}] -> [${nextActions}]`
      });

      return { success: true };
    }
  );

  ipcMain.handle('admin:create-role', async (_, name: string) => {
    const actor = await requireAdminAccess();
    const normalizedName = name.trim();

    if (!normalizedName) {
      return { success: false, error: 'Role name is required' };
    }

    const exists = await prisma.role.findFirst({
      where: {
        name: {
          equals: normalizedName,
          mode: 'insensitive'
        }
      },
      select: {
        id: true
      }
    });

    if (exists) {
      return { success: false, error: 'Role already exists' };
    }

    const created = await prisma.role.create({
      data: {
        name: normalizedName
      },
      select: {
        id: true,
        name: true
      }
    });

    await logAdminAction({
      actorEmail: actor.email,
      action: 'create-role',
      targetType: 'role',
      targetId: String(created.id),
      details: created.name
    });

    return { success: true };
  });

  ipcMain.handle('admin:delete-role', async (_, roleId: number) => {
    const actor = await requireAdminAccess();

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        users: {
          select: {
            id: true
          }
        }
      }
    });

    if (!role) {
      return { success: false, error: 'Role not found' };
    }

    if (role.name.toLowerCase() === 'admin') {
      return { success: false, error: 'Admin role cannot be deleted' };
    }

    if (role.users.length > 0) {
      return { success: false, error: 'Move users to another role before deleting this role' };
    }

    await prisma.role.delete({
      where: {
        id: roleId
      }
    });

    await logAdminAction({
      actorEmail: actor.email,
      action: 'delete-role',
      targetType: 'role',
      targetId: String(roleId),
      details: role.name
    });

    return { success: true };
  });

  ipcMain.handle('admin:create-permission', async (_, action: string, description?: string) => {
    const actor = await requireAdminAccess();
    const normalizedAction = action.trim();

    if (!normalizedAction) {
      return { success: false, error: 'Permission action is required' };
    }

    const exists = await prisma.permission.findFirst({
      where: {
        action: {
          equals: normalizedAction,
          mode: 'insensitive'
        }
      },
      select: {
        id: true
      }
    });

    if (exists) {
      return { success: false, error: 'Permission action already exists' };
    }

    const created = await prisma.permission.create({
      data: {
        action: normalizedAction,
        description: description?.trim() || null
      },
      select: {
        id: true,
        action: true
      }
    });

    await logAdminAction({
      actorEmail: actor.email,
      action: 'create-permission',
      targetType: 'permission',
      targetId: String(created.id),
      details: created.action
    });

    return { success: true };
  });

  ipcMain.handle('admin:delete-permission', async (_, permissionId: number) => {
    const actor = await requireAdminAccess();

    const permission = await prisma.permission.findUnique({
      where: { id: permissionId },
      include: {
        roles: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!permission) {
      return { success: false, error: 'Permission not found' };
    }

    if (permission.action === 'admin.rbac') {
      return { success: false, error: 'admin.rbac permission cannot be deleted' };
    }

    await prisma.$transaction([
      ...permission.roles.map((role) =>
        prisma.role.update({
          where: { id: role.id },
          data: {
            permissions: {
              disconnect: { id: permissionId }
            }
          }
        })
      ),
      prisma.permission.delete({
        where: { id: permissionId }
      })
    ]);

    await logAdminAction({
      actorEmail: actor.email,
      action: 'delete-permission',
      targetType: 'permission',
      targetId: String(permissionId),
      details: `${permission.action} (used in ${permission.roles.length} roles)`
    });

    return { success: true };
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
