import { useEffect, useMemo, useRef, useState } from 'react';
import { Game } from '../../../shared/types';
import GamesGrid from './GamesGrid';
import { shouldRetryVisibleIgdbMetadata } from '../shared/igdbRefresh';

function GamesHome(): React.JSX.Element {
  const [games, setGames] = useState<Game[]>([]);
  const lastVisibleIgdbRetryAt = useRef(0);

  const loadGames = async () => {
    const fetchedGames = await window.api.getGames();
    setGames(fetchedGames);
  };

  useEffect(() => {
    void loadGames();
  }, []);

  const mostPopularGames = useMemo(() => {
    const scored = [...games].sort((a, b) => {
      const left = typeof a.score === 'number' ? a.score : -1;
      const right = typeof b.score === 'number' ? b.score : -1;
      return right - left;
    });

    return scored.slice(0, 4);
  }, [games]);

  const latestGames = useMemo(() => {
    const orderedByNewestId = [...games].sort((a, b) => Number(b.id) - Number(a.id));
    return orderedByNewestId.slice(0, 4);
  }, [games]);

  const visibleGames = useMemo(() => {
    const byId = new Map<string, Game>();
    for (const game of [
      ...mostPopularGames,
      ...(latestGames.length ? latestGames : mostPopularGames)
    ]) {
      byId.set(game.id, game);
    }
    return [...byId.values()];
  }, [latestGames, mostPopularGames]);

  useEffect(() => {
    if (!shouldRetryVisibleIgdbMetadata(visibleGames, lastVisibleIgdbRetryAt.current)) {
      return;
    }

    lastVisibleIgdbRetryAt.current = Date.now();
    const timer = setTimeout(() => {
      void loadGames();
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
  }, [visibleGames]);

  return (
    <section className="games-home">
      <h2>Most popular</h2>
      <GamesGrid games={mostPopularGames} />

      <h2>Latest</h2>
      <GamesGrid games={latestGames.length ? latestGames : mostPopularGames} />
    </section>
  );
}

export default GamesHome;
