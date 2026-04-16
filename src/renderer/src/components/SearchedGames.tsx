import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Game } from '../../../shared/types';
import { useAuth } from '@renderer/context/AuthContext';
import GamesGrid from './GamesGrid';
import { shouldRetryVisibleIgdbMetadata } from '../shared/igdbRefresh';

type SortOption = 'relevance' | 'az' | 'za';
const PAGE_SIZE = 8;

function SearchedGames() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const lastVisibleIgdbRetryAt = useRef(0);

  const query = (searchParams.get('q') || '').trim();

  const loadGames = async () => {
    const fetchedGames = await window.api.getGames();
    setGames(fetchedGames);
  };

  useEffect(() => {
    user ? loadGames() : navigate('/login');
  }, [navigate, user]);

  const availablePlatforms = useMemo(() => {
    const byId = new Map<string, string>();

    for (const game of games) {
      if (!game.platformId) {
        continue;
      }

      byId.set(game.platformId, game.platformName || game.platformId);
    }

    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [games]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const baseGames = normalizedQuery
      ? games.filter((game) => game.title.toLowerCase().includes(normalizedQuery))
      : games;

    const platformFiltered = selectedPlatforms.length
      ? baseGames.filter((game) => selectedPlatforms.includes(game.platformId))
      : baseGames;

    if (sortBy === 'az') {
      return [...platformFiltered].sort((a, b) => a.title.localeCompare(b.title));
    }

    if (sortBy === 'za') {
      return [...platformFiltered].sort((a, b) => b.title.localeCompare(a.title));
    }

    return platformFiltered;
  }, [games, query, selectedPlatforms, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, selectedPlatforms, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredGames.length / PAGE_SIZE));

  const pageGames = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredGames.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredGames, totalPages]);

  const pageNumbers = useMemo(() => {
    const pages = [1, currentPage, totalPages].filter(
      (value, index, arr) => arr.indexOf(value) === index
    );
    return pages.sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  const togglePlatformFilter = (platformId: string) => {
    setSelectedPlatforms((current) =>
      current.includes(platformId)
        ? current.filter((id) => id !== platformId)
        : [...current, platformId]
    );
  };

  useEffect(() => {
    if (!user || !shouldRetryVisibleIgdbMetadata(pageGames, lastVisibleIgdbRetryAt.current)) {
      return;
    }

    lastVisibleIgdbRetryAt.current = Date.now();
    const timer = setTimeout(() => {
      void loadGames();
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
  }, [pageGames, user]);

  return (
    <section className="library searched-games">
      <h2>{query ? `Searched: ${query}` : 'All Games'}</h2>
      <div className="catalog-layout">
        <div className="catalog-content">
          <div className="library-controls">
            <label htmlFor="searched-sorting-options">Sort: </label>
            <select
              name="searched-sorting-options"
              id="searched-sorting-options"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="relevance">Relevance</option>
              <option value="az">By Name (A-Z)</option>
              <option value="za">By Name (Z-A)</option>
            </select>
          </div>

          {pageGames.length > 0 ? (
            <>
              <GamesGrid games={pageGames} />
              <div className="catalog-pagination" aria-label="Search pages">
                <button
                  className="catalog-page-button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  {'<'}
                </button>
                {pageNumbers.map((page) => (
                  <button
                    key={page}
                    className={`catalog-page-button ${page === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="catalog-page-button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  {'>'}
                </button>
              </div>
            </>
          ) : (
            <p className="empty-state">No games found for this search.</p>
          )}
        </div>

        <aside className="catalog-filters" aria-label="Search filters">
          <h3>Filters</h3>
          <div className="catalog-filter-section">
            <p>Platform</p>
            {availablePlatforms.length ? (
              <div className="catalog-filter-options">
                {availablePlatforms.map((platform) => (
                  <label key={platform.id}>
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(platform.id)}
                      onChange={() => togglePlatformFilter(platform.id)}
                    />
                    <span>{platform.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="empty-state">No platform data.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default SearchedGames;
