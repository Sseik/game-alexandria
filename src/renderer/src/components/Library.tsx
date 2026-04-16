import { useState, useEffect, useMemo, useRef } from 'react';
import GamesGrid from './GamesGrid';
import { Game, LibraryPlatform } from '../../../shared/types';
import { useAuth } from '@renderer/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { APP_EVENTS, emitAppEvent, subscribeToAppEvents } from '../shared/appEvents';
import { shouldRetryVisibleIgdbMetadata } from '../shared/igdbRefresh';

const PAGE_SIZE = 8;

type SortOption = 'recent' | 'az' | 'za';

function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
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
    user ? loadData(user.id) : navigate('/login');
  }, [navigate, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshLibrary = () => {
      void loadData(user.id);
    };

    return subscribeToAppEvents(
      [APP_EVENTS.LIBRARY_UPDATED, APP_EVENTS.SESSION_UPDATED],
      refreshLibrary
    );
  }, [user]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [sortBy, selectedPlatforms]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!user || !shouldRetryVisibleIgdbMetadata(pageGames, lastVisibleIgdbRetryAt.current)) {
      return;
    }

    lastVisibleIgdbRetryAt.current = Date.now();
    const timer = setTimeout(() => {
      void loadData(user.id);
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
  }, [pageGames, user]);

  const pageNumbers = useMemo(() => {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }, [totalPages]);

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
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
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
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
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

          <div className="library-edit-actions">
            <button type="button" className="game-launch-button" onClick={handleSaveLaunchEdit}>
              {isSavingEdit ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="game-edit-button" onClick={closeEditLaunch}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default Library;
