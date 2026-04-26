import { useState, useEffect, useMemo, useRef } from 'react';
import GamesGrid from './GamesGrid';
import { Game, LibraryPlatform } from '../../../shared/types';
import { useAuth } from '@renderer/context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_EVENTS, emitAppEvent, subscribeToAppEvents } from '../shared/appEvents';
import { shouldRetryVisibleIgdbMetadata } from '../shared/igdbRefresh';

const PAGE_SIZE = 8;

type SortOption = 'recent' | 'az' | 'za';

function Library() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const setCurrentPage = (page: number) => {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('page', page.toString());
      return nextParams;
    });
  };
  const [libraryPlatforms, setLibraryPlatforms] = useState<LibraryPlatform[]>([]);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [editingPlatformName, setEditingPlatformName] = useState('');
  const [editingExecutablePath, setEditingExecutablePath] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const lastVisibleIgdbRetryAt = useRef(0);

  const loadData = async (userId: number) => {
    const [fetchedGames, fetchedPlatforms] = await Promise.all([
      window.api.getLibrary(userId),
      window.api.getLibraryPlatforms()
    ]);
    setGames(fetchedGames);
    setLibraryPlatforms(fetchedPlatforms);
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    user ? loadData(user.id) : navigate('/login');
  }, [isLoading, navigate, user]);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    const refreshLibrary = () => {
      void loadData(user.id);
    };

    return subscribeToAppEvents(
      [APP_EVENTS.LIBRARY_UPDATED, APP_EVENTS.SESSION_UPDATED],
      refreshLibrary
    );
  }, [isLoading, user]);

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

  const visibleGames = useMemo(() => {
    const platformFiltered = selectedPlatforms.length
      ? games.filter((game) => selectedPlatforms.includes(game.platformId))
      : games;

    if (sortBy === 'az') {
      return [...platformFiltered].sort((a, b) => a.title.localeCompare(b.title));
    }

    if (sortBy === 'za') {
      return [...platformFiltered].sort((a, b) => b.title.localeCompare(a.title));
    }

    return platformFiltered;
  }, [games, selectedPlatforms, sortBy]);

  const totalPages = Math.max(1, Math.ceil(visibleGames.length / PAGE_SIZE));

  const pageGames = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return visibleGames.slice(start, start + PAGE_SIZE);
  }, [currentPage, totalPages, visibleGames]);

  const effectiveCurrentPage = Math.min(currentPage, totalPages);

  const prevSortBy = useRef(sortBy);
  const prevPlatforms = useRef(selectedPlatforms);

  useEffect(() => {
    if (prevSortBy.current !== sortBy || prevPlatforms.current !== selectedPlatforms) {
      setCurrentPage(1);

      prevSortBy.current = sortBy;
      prevPlatforms.current = selectedPlatforms;
    }
  }, [sortBy, selectedPlatforms]);

  const hasLoadedGames = useRef(false);

  useEffect(() => {
    if (games.length > 0) {
      hasLoadedGames.current = true;
    }
  }, [games]);

  useEffect(() => {
    // Якщо ігри ще не прилетіли з бекенду — не чіпаємо сторінку
    if (!hasLoadedGames.current && games.length === 0) return;

    // Якщо ігри є, і поточна сторінка більша за можливу — тоді скидаємо
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage, games.length]);

  useEffect(() => {
    if (
      isLoading ||
      !user ||
      !shouldRetryVisibleIgdbMetadata(pageGames, lastVisibleIgdbRetryAt.current)
    ) {
      return;
    }

    lastVisibleIgdbRetryAt.current = Date.now();
    const timer = setTimeout(() => {
      void loadData(user.id);
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoading, pageGames, user]);

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

  const handleLaunch = async (game: Game) => {
    if (!user) {
      navigate('/login');
      return;
    }

    const result = await window.api.launchLibraryGame(
      user.id,
      game.id,
      game.platformId || undefined
    );
    if (!result.success && result.error) {
      window.alert(result.error);
      return;
    }

    emitAppEvent(APP_EVENTS.SESSION_UPDATED);
  };

  const handleRemoveFromLibrary = async () => {
    if (!user || !editingGame || !editingGame.platformId) return;

    const confirmed = await window.api.showConfirmDialog(
      `Are you sure you want to remove ${editingGame.title} from your library?`
    );

    if (!confirmed) {
      return;
    }

    setIsSavingEdit(true);
    
    try {
      const result = await window.api.removeLibraryGameEntry(
        user.id,
        editingGame.id,
        editingGame.platformId
      );

      if (!result.success) {
        window.alert(result.error || 'Failed to remove game.');
        return;
      }

      const refreshed = await window.api.getLibrary(user.id);
      setGames(refreshed);
      emitAppEvent(APP_EVENTS.LIBRARY_UPDATED);
      closeEditLaunch();
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openEditLaunch = (game: Game) => {
    setEditingGame(game);
    setEditingPlatformName(game.platformName || 'Custom');
    setEditingExecutablePath(game.executablePath || '');
  };

  const closeEditLaunch = () => {
    setEditingGame(null);
    setEditingPlatformName('');
    setEditingExecutablePath('');
  };

  const handleSaveLaunchEdit = async () => {
    if (!user || !editingGame || !editingGame.platformId || !editingPlatformName.trim()) {
      return;
    }

    setIsSavingEdit(true);

    try {
      const result = await window.api.updateLibraryGameEntry(
        user.id,
        editingGame.id,
        editingGame.platformId,
        editingPlatformName.trim(),
        editingExecutablePath.trim() || undefined
      );

      if (!result.success) {
        window.alert(result.error || 'Failed to update launch target.');
        return;
      }

      const refreshed = await window.api.getLibrary(user.id);
      setGames(refreshed);
      emitAppEvent(APP_EVENTS.LIBRARY_UPDATED);
      closeEditLaunch();
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <section className="library">
      <h2>Library</h2>
      <div className="catalog-layout">
        <div className="catalog-content">
          <div className="library-controls">
            <label htmlFor="sorting-options">Sort: </label>
            <select
              name="sorting-options"
              id="sorting-options"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="recent">Recently Bought</option>
              <option value="az">By Name (A-Z)</option>
              <option value="za">By Name (Z-A)</option>
            </select>
          </div>

          {pageGames.length > 0 ? (
            <>
              <GamesGrid
                games={pageGames}
                showLaunchAction
                onLaunchGame={handleLaunch}
                showEditAction
                onEditGame={openEditLaunch}
              />
              <div className="catalog-pagination" aria-label="Library pages">
                <button
                  className="catalog-page-button"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={effectiveCurrentPage === 1}
                >
                  {'<'}
                </button>
                {pageNumbers.map((page) => (
                  <button
                    key={page}
                    className={`catalog-page-button ${page === effectiveCurrentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="catalog-page-button"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={effectiveCurrentPage === totalPages}
                >
                  {'>'}
                </button>
              </div>
            </>
          ) : (
            <p className="empty-state">No games found for current filters.</p>
          )}
        </div>

        <aside className="catalog-filters" aria-label="Library filters">
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

      {editingGame ? (
        <section className="library-edit-panel" aria-label="Edit launch target">
          <h3>Edit Launch Target</h3>
          <p className="library-edit-game-title">{editingGame.title}</p>

          <label htmlFor="edit-platform">Executable type</label>
          <select
            id="edit-platform"
            value={editingPlatformName}
            onChange={(event) => setEditingPlatformName(event.target.value)}
          >
            {libraryPlatforms.map((platform) => (
              <option key={platform.id} value={platform.name}>
                {platform.name}
              </option>
            ))}
          </select>

          <label htmlFor="edit-path">Executable path / deeplink</label>
          <input
            id="edit-path"
            type="text"
            value={editingExecutablePath}
            onChange={(event) => setEditingExecutablePath(event.target.value)}
            placeholder="steam://run/12345 or C:/Games/Game/game.exe"
          />

          <div
            className="library-edit-actions"
            style={{ display: 'flex', gap: '10px', width: '100%' }}
          >
            <button
              type="button"
              className="game-launch-button"
              onClick={handleSaveLaunchEdit}
              disabled={isSavingEdit}
            >
              {isSavingEdit ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="game-edit-button"
              onClick={closeEditLaunch}
              disabled={isSavingEdit}
            >
              Cancel
            </button>

            <button
              type="button"
              className="game-edit-button"
              onClick={handleRemoveFromLibrary}
              disabled={isSavingEdit}
              style={{
                marginLeft: 'auto',
                backgroundColor: 'var(--ev-danger-color, #d32f2f)',
                color: 'white',
                border: 'none'
              }}
            >
              Remove
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default Library;
