import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Game, IgdbImportCandidate, LibraryPlatform } from '../../../shared/types';
import { useAuth } from '@renderer/context/AuthContext';
import GamesGrid from './GamesGrid';
import { shouldRetryVisibleIgdbMetadata } from '../shared/igdbRefresh';

type SortOption = 'relevance' | 'az' | 'za';
const PAGE_SIZE = 8;

function SearchedGames() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [libraryPlatforms, setLibraryPlatforms] = useState<LibraryPlatform[]>([]); // ДОДАНО: Стан для платформ
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const setCurrentPage = (page: number) => {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (page <= 1) {
        nextParams.delete('page');
      } else {
        nextParams.set('page', page.toString());
      }
      return nextParams;
    });
  };

  const [igdbGames, setIgdbGames] = useState<IgdbImportCandidate[]>([]);
  const [igdbLoading, setIgdbLoading] = useState(false);
  const [igdbError, setIgdbError] = useState<string | null>(null);
  const [importingGameId, setImportingGameId] = useState<number | null>(null);
  const lastVisibleIgdbRetryAt = useRef(0);

  const query = (searchParams.get('q') || '').trim();
  const canImportGames = Boolean(user?.role?.permissions?.includes('games.write'));

  // ДОДАНО: Одночасне завантаження ігор та списку платформ з БД
  const loadGames = async () => {
    const [fetchedGames, fetchedPlatforms] = await Promise.all([
      window.api.getGames(),
      window.api.getLibraryPlatforms()
    ]);
    setGames(fetchedGames);
    setLibraryPlatforms(fetchedPlatforms || []);
  };

  useEffect(() => {
    user ? loadGames() : navigate('/login');
  }, [navigate, user]);

  useEffect(() => {
    let cancelled = false;

    const loadIgdbResults = async () => {
      if (!query || !canImportGames) {
        setIgdbGames([]);
        setIgdbError(null);
        setIgdbLoading(false);
        return;
      }

      setIgdbLoading(true);
      setIgdbError(null);

      try {
        const results = await window.api.searchIgdbGames(query);
        if (!cancelled) {
          setIgdbGames(results);
        }
      } catch {
        if (!cancelled) {
          setIgdbError('Unable to load IGDB results right now.');
          setIgdbGames([]);
        }
      } finally {
        if (!cancelled) {
          setIgdbLoading(false);
        }
      }
    };

    void loadIgdbResults();

    return () => {
      cancelled = true;
    };
  }, [canImportGames, query]);

  // ВИПРАВЛЕНО: Тепер беремо платформи не з ігор, а з завантаженого списку БД
  const availablePlatforms = useMemo(() => {
    return libraryPlatforms.map((p) => ({ id: p.id, name: p.name }));
  }, [libraryPlatforms]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const baseGames = normalizedQuery
      ? games.filter((game) => game.title.toLowerCase().includes(normalizedQuery))
      : games;

    const platformFiltered = selectedPlatforms.length
      ? baseGames.filter((game) => {
          // Якщо у гри є ID платформи (вона вже в бібліотеці)
          if (game.platformId && selectedPlatforms.includes(game.platformId)) return true;

          // Якщо у гри є масив назв платформ (наприклад, з IGDB)
          if (Array.isArray(game.platforms)) {
            const selectedNames = libraryPlatforms
              .filter((p) => selectedPlatforms.includes(String(p.id)))
              .map((p) => p.name.toLowerCase());
            if (game.platforms.some((p) => selectedNames.includes(p.toLowerCase()))) return true;
          }

          return false;
        })
      : baseGames;

    if (sortBy === 'az') {
      return [...platformFiltered].sort((a, b) => a.title.localeCompare(b.title));
    }

    if (sortBy === 'za') {
      return [...platformFiltered].sort((a, b) => b.title.localeCompare(a.title));
    }

    return platformFiltered;
  }, [games, query, selectedPlatforms, sortBy, libraryPlatforms]);

  const prevQuery = useRef(query);
  const prevSortBy = useRef(sortBy);
  const prevPlatforms = useRef(selectedPlatforms);

  useEffect(() => {
    if (
      prevQuery.current !== query ||
      prevSortBy.current !== sortBy ||
      prevPlatforms.current !== selectedPlatforms
    ) {
      setCurrentPage(1);

      prevQuery.current = query;
      prevSortBy.current = sortBy;
      prevPlatforms.current = selectedPlatforms;
    }
  }, [query, sortBy, selectedPlatforms]);

  const totalPages = Math.max(1, Math.ceil(filteredGames.length / PAGE_SIZE));

  const pageGames = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredGames.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredGames, totalPages]);

  const pageNumbers = useMemo(() => {
    const maxPagesToShow = 5;

    let start = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let end = start + maxPagesToShow - 1;

    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxPagesToShow + 1);
    }

    return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  const togglePlatformFilter = (platformId: string) => {
    setSelectedPlatforms((current) =>
      current.includes(platformId)
        ? current.filter((id) => id !== platformId)
        : [...current, platformId]
    );
  };

  const handleImportGame = async (candidate: IgdbImportCandidate) => {
    if (!user) {
      navigate('/login');
      return;
    }

    setImportingGameId(candidate.igdbId);
    setIgdbError(null);

    const result = await window.api.importIgdbGame(user.id, candidate.igdbId);

    if (!result.success || !result.game) {
      setIgdbError(result.error || 'Unable to import this game.');
      setImportingGameId(null);
      return;
    }

    setImportingGameId(null);
    await loadGames();
    navigate(`/game/${result.game.id}`, { state: { game: result.game } });
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
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  {'>'}
                </button>
              </div>
            </>
          ) : (
            <p className="empty-state">No games found for this search.</p>
          )}

          {query && canImportGames ? (
            <section className="igdb-import-panel">
              <div className="igdb-import-head">
                <h3>Import from IGDB</h3>
                <p>
                  Add new games to your local catalog, then they become available in the normal
                  library and search views.
                </p>
              </div>

              {igdbLoading ? <p className="empty-state">Searching IGDB...</p> : null}
              {igdbError ? <p className="empty-state">{igdbError}</p> : null}

              {!igdbLoading && !igdbError && igdbGames.length ? (
                <div className="igdb-import-grid">
                  {igdbGames.map((candidate) => (
                    <article key={candidate.igdbId} className="igdb-import-card">
                      <div className="igdb-import-cover">
                        {candidate.coverUrl ? (
                          <img src={candidate.coverUrl} alt={`${candidate.title} cover`} />
                        ) : null}
                      </div>
                      <div className="igdb-import-content">
                        <div>
                          <h4>{candidate.title}</h4>
                          <p>{candidate.description || 'No description available.'}</p>
                        </div>
                        <div className="igdb-import-actions">
                          {candidate.inDatabase ? (
                            <button
                              type="button"
                              onClick={() =>
                                candidate.gameId && navigate(`/game/${candidate.gameId}`)
                              }
                            >
                              Open Game
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleImportGame(candidate)}
                              disabled={importingGameId === candidate.igdbId}
                            >
                              {importingGameId === candidate.igdbId ? 'Importing...' : 'Import'}
                            </button>
                          )}
                          {candidate.score ? (
                            <span>Rating {Math.round(candidate.score)}</span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {!igdbLoading && !igdbError && !igdbGames.length ? (
                <p className="empty-state">No IGDB matches found for this query.</p>
              ) : null}
            </section>
          ) : null}

          {query && !canImportGames ? (
            <p className="empty-state">
              You can search the local catalog, but IGDB import requires the games.write permission.
            </p>
          ) : null}
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
                      checked={selectedPlatforms.includes(String(platform.id))}
                      onChange={() => togglePlatformFilter(String(platform.id))}
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
