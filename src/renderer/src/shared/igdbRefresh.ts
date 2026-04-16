import { Game } from '../../../shared/types';

export const IGDB_RETRY_INTERVAL_MS = 60 * 1000;

export function hasMissingVisualMetadata(game: Game): boolean {
  return !game.coverUrl || !game.description;
}

export function shouldRetryVisibleIgdbMetadata(
  games: Game[],
  lastRetryAt: number,
  now: number = Date.now()
): boolean {
  if (!games.length) {
    return false;
  }

  if (now - lastRetryAt < IGDB_RETRY_INTERVAL_MS) {
    return false;
  }

  return games.some((game) => hasMissingVisualMetadata(game));
}
