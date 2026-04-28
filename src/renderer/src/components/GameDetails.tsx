import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Game, LibraryPlatform } from '../../../shared/types';
import { useAuth } from '@renderer/context/AuthContext';
import { APP_EVENTS, emitAppEvent, subscribeToAppEvents } from '../shared/appEvents';
import { IGDB_RETRY_INTERVAL_MS } from '../shared/igdbRefresh';

type LocalSettings = {
  defaultPlatform: string;
};

function readLocalSettings(): LocalSettings | null {
  const raw = localStorage.getItem('renderer.settings');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalSettings>;
    return {
      defaultPlatform: typeof parsed.defaultPlatform === 'string' ? parsed.defaultPlatform : 'steam'
    };
  } catch {
    return null;
  }
}

function calculateChartPoints(
  points: Array<{ label: string; price: number }>,
  globalMin: number,
  globalMax: number
) {
  if (!points || points.length === 0) return [];

  const width = 420;
  const height = 210;
  const valueRange = globalMax - globalMin;

  return points.map((point, index) => {
    // Якщо точка лише одна, ставимо її по центру
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    let y: number;

    if (valueRange === 0) {
      y = height / 2; // Ціна стабільна
    } else {
      const normalized = (point.price - globalMin) / valueRange;
      y = height - normalized * height;
    }

    return { x, y, price: point.price, label: point.label };
  });
}

function getYouTubeThumbnailFromEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const embedIndex = pathParts.findIndex((part) => part === 'embed');
    const embedId = embedIndex >= 0 ? pathParts[embedIndex + 1] : undefined;
    const queryId = parsed.searchParams.get('v') || undefined;
    const videoId = embedId || queryId;
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
}

type CarouselItem = { type: 'image' | 'video'; url: string; key: string };

function GameDetails(): React.JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const params = useParams();
  const locationGame =
    location.state && 'game' in location.state ? (location.state.game as Game) : null;

  const [game, setGame] = useState<Game | null>(locationGame);
  const [wishlistState, setWishlistState] = useState<'idle' | 'saving' | 'saved' | 'already'>(
    'idle'
  );
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [libraryPlatforms, setLibraryPlatforms] = useState<LibraryPlatform[]>([]);
  const [addedPlatforms, setAddedPlatforms] = useState<string[]>([]);

  const [showLibraryForm, setShowLibraryForm] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(
    readLocalSettings()?.defaultPlatform ?? ''
  );
  const [customPlatform, setCustomPlatform] = useState('');
  const [customExecutablePath, setCustomExecutablePath] = useState('');
  const [manualExecutablePath, setManualExecutablePath] = useState('');
  const [libraryState, setLibraryState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const lastVisibleIgdbRetryAt = useRef(0);

  useEffect(() => {
    const gameId = params.gameId;
    if (!gameId) {
      navigate('/library');
      return;
    }
    let cancelled = false;
    const loadGame = async () => {
      const fetchedGame = await window.api.getGameDetails(gameId);
      if (cancelled) return;
      if (fetchedGame) {
        setGame(fetchedGame);
        return;
      }
      if (!locationGame) navigate('/library');
    };
    void loadGame();
    return () => {
      cancelled = true;
    };
  }, [locationGame, navigate, params.gameId]);

  useEffect(() => {
    const loadAddedPlatforms = async () => {
      if (!user || !game?.id) return;
      const lib = await window.api.getLibrary(user.id);
      const added = lib
        .filter((entry) => entry.id === game.id)
        .map((e) => e.platformName.toLowerCase());
      setAddedPlatforms(added);
    };

    loadAddedPlatforms();
    return subscribeToAppEvents([APP_EVENTS.LIBRARY_UPDATED], loadAddedPlatforms);
  }, [user, game?.id]);

  const priceHistory = game?.priceHistory ?? [];
  const priceStats = game?.priceStats;
  const chartData = calculateChartPoints(
    priceHistory,
    priceStats?.lowest ?? 0,
    priceStats?.highest ?? 0
  );
  const chartPolyline = chartData.map((p) => `${p.x},${p.y}`).join(' ');
  const platformLinks = game?.platformLinks ?? [];
  const logoUrl = game?.logoUrl || game?.coverUrl;

  const carouselItems = useMemo<CarouselItem[]>(() => {
    const images = (game?.screenshots ?? [])
      .filter((url, index, list): url is string => Boolean(url) && list.indexOf(url) === index)
      .map((url) => ({ type: 'image' as const, url, key: `img:${url}` }));
    const videos = (game?.videos ?? [])
      .filter((url, index, list): url is string => Boolean(url) && list.indexOf(url) === index)
      .map((url) => ({ type: 'video' as const, url, key: `vid:${url}` }));
    return [...images, ...videos];
  }, [game?.screenshots, game?.videos]);

  const activeCarouselItem = carouselItems[activeImageIndex] || null;

  useEffect(() => {
    setActiveImageIndex(0);
  }, [game?.id]);

  useEffect(() => {
    if (!game?.id) return;
    const hasMissingMetadata = !game.coverUrl || !game.description;
    if (!hasMissingMetadata) return;
    const now = Date.now();
    if (now - lastVisibleIgdbRetryAt.current < IGDB_RETRY_INTERVAL_MS) return;
    lastVisibleIgdbRetryAt.current = now;

    const timer = setTimeout(async () => {
      const refreshed = await window.api.getGameDetails(game.id);
      if (refreshed) setGame(refreshed);
    }, 1500);
    return () => clearTimeout(timer);
  }, [game]);

  useEffect(() => {
    const loadPlatforms = async () => {
      const fetchedPlatforms = await window.api.getLibraryPlatforms();
      setLibraryPlatforms(fetchedPlatforms);
    };
    void loadPlatforms();
  }, []);

  useEffect(() => {
    const checkWishlist = async () => {
      if (!user || !game?.id) {
        setWishlistState('idle');
        return;
      }
      const status = await window.api.isInWishlist(user.id, game.id);
      setWishlistState(status.exists ? 'already' : 'idle');
    };
    void checkWishlist();
  }, [user, game?.id]);

  const allPlatformOptions = useMemo(() => {
    const options = new Set<string>();

    libraryPlatforms.forEach((p) => options.add(p.name));

    for (const link of platformLinks) {
      options.add(link.platform);
    }

    const sorted = [...options].sort((a, b) => a.localeCompare(b));
    sorted.push('__custom__');
    return sorted;
  }, [libraryPlatforms, platformLinks]);

  const selectedLibraryPlatform = useMemo(() => {
    if (!selectedPlatform) return undefined;
    return libraryPlatforms.find((p) => p.name.toLowerCase() === selectedPlatform.toLowerCase());
  }, [libraryPlatforms, selectedPlatform]);

  const selectedPlatformLink = useMemo(() => {
    if (!selectedPlatform) return undefined;
    return platformLinks.find(
      (link) => link.platform.toLowerCase() === selectedPlatform.toLowerCase() && link.launchUrl
    );
  }, [platformLinks, selectedPlatform]);

  const automaticLaunchTarget = useMemo(() => {
    if (selectedPlatform === '__custom__' || !selectedPlatform) return undefined;
    if (selectedPlatformLink?.launchUrl) return selectedPlatformLink.launchUrl;

    const launchPrefix = selectedLibraryPlatform?.launchPrefix;
    if (!launchPrefix) return undefined;

    if (game?.igdbId && selectedPlatform.toLowerCase() !== 'epic games') {
      return `${launchPrefix}${game.igdbId}`;
    }

    return undefined;
  }, [
    game?.igdbId,
    selectedLibraryPlatform?.launchPrefix,
    selectedPlatform,
    selectedPlatformLink?.launchUrl
  ]);

  const hasAutomaticLaunchTarget = Boolean(
    (selectedPlatform !== '__custom__' && automaticLaunchTarget) ||
    selectedPlatform.toLowerCase() === 'epic games'
  );

  // Функція видалення гри з бази даних
  const handleDeleteGame = async () => {
    if (!game) return;

    // Використовуємо твій діалог з бекенду (якщо ти додав його раніше)
    // Або стандартний browser confirm:
    const confirmed = window.confirm(
      'Are you sure you want to completely delete this game? This will remove all library entries, wishlists, and price history for all users.'
    );

    if (!confirmed) return;

    try {
      // Викликаємо метод з preload
      const result = await window.api.deleteGame(game.id);

      if (result.success) {
        // Повертаємось на головну сторінку після успішного видалення
        window.location.hash = '#/'; // або navigate('/'), залежно від твого роутера
      } else {
        alert(result.error);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to delete game');
    }
  };

  const handleTrackPrice = async () => {
    if (!user || !game?.id) {
      navigate('/login');
      return;
    }
    const promptValue = window.prompt('Target price (USD):', '19.99');
    if (promptValue === null) return;
    const parsed = Number(promptValue);
    if (Number.isNaN(parsed)) return;
    setWishlistState('saving');
    await window.api.addToWishlist(user.id, game.id, parsed);
    setWishlistState('saved');
    emitAppEvent(APP_EVENTS.WISHLIST_UPDATED);
  };

  const handleAddToWishlist = async () => {
    if (!user || !game?.id) {
      navigate('/login');
      return;
    }
    setWishlistState('saving');
    await window.api.addToWishlist(user.id, game.id);
    setWishlistState('saved');
    emitAppEvent(APP_EVENTS.WISHLIST_UPDATED);
  };

  const handleWishlistButton = async () => {
    if (wishlistState === 'already' || wishlistState === 'saved') {
      navigate('/wishlist');
      return;
    }
    await handleAddToWishlist();
  };

  const handleAddToLibrary = async () => {
    if (!user || !game?.id) {
      navigate('/login');
      return;
    }
    setLibraryError(null);
    setLibraryState('idle');

    const useCustomPlatform = selectedPlatform === '__custom__';
    const platformName = useCustomPlatform ? customPlatform.trim() : selectedPlatform.trim();
    const launchTarget = useCustomPlatform
      ? customExecutablePath.trim()
      : (automaticLaunchTarget || manualExecutablePath).trim();

    if (!platformName) {
      setLibraryError('Select a platform or provide a custom one.');
      setLibraryState('error');
      return;
    }

    if (addedPlatforms.includes(platformName.toLowerCase())) {
      setLibraryError(`This game is already in your library for ${platformName}.`);
      setLibraryState('error');
      return;
    }

    if (!launchTarget && !hasAutomaticLaunchTarget) {
      setLibraryError(
        'Provide executable/deeplink path or select a platform with auto-launch link.'
      );
      setLibraryState('error');
      return;
    }

    setLibraryState('saving');
    const result = await window.api.addGameToLibrary(user.id, game.id, platformName, launchTarget);
    if (!result.success) {
      setLibraryError(result.error || 'Unable to save this game to your library.');
      setLibraryState('error');
      return;
    }

    setLibraryState('saved');
    emitAppEvent(APP_EVENTS.LIBRARY_UPDATED);
  };

  const openPlatformPage = (url: string) => window.open(url, '_blank');

  const goToPreviousImage = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (carouselItems.length <= 1) return;
    setActiveImageIndex((current) => (current <= 0 ? carouselItems.length - 1 : current - 1));
  };

  const goToNextImage = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (carouselItems.length <= 1) return;
    setActiveImageIndex((current) => (current >= carouselItems.length - 1 ? 0 : current + 1));
  };

  return (
    <section className="game-details">
      <div className="game-details-left">
        <h2>{game?.title || 'Game Title'}</h2>
        <div className="game-details-cover">
          {activeCarouselItem?.type === 'image' ? (
            <img src={activeCarouselItem.url} alt={game?.title ? `${game.title} screenshot` : ''} />
          ) : null}
          {activeCarouselItem?.type === 'video' ? (
            <iframe
              src={activeCarouselItem.url}
              title={game?.title ? `${game.title} video` : 'Game video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : null}
          {carouselItems.length > 1 ? (
            <>
              <button
                type="button"
                className="carousel-control prev"
                onClick={goToPreviousImage}
                aria-label="Previous image"
              >
                {'<'}
              </button>
              <button
                type="button"
                className="carousel-control next"
                onClick={goToNextImage}
                aria-label="Next image"
              >
                {'>'}
              </button>
            </>
          ) : null}
        </div>
        {carouselItems.length > 1 ? (
          <div className="carousel-dots" aria-label="Image selector">
            {carouselItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={`carousel-dot ${index === activeImageIndex ? 'active' : ''}`}
                aria-label={`Go to item ${index + 1}`}
                onClick={() => setActiveImageIndex(index)}
              />
            ))}
          </div>
        ) : null}
        {carouselItems.length > 1 ? (
          <div className="carousel-thumbs" aria-label="Media thumbnails">
            {carouselItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={`carousel-thumb ${item.type === 'video' ? 'video' : ''} ${index === activeImageIndex ? 'active' : ''}`}
                aria-label={`Select ${item.type} ${index + 1}`}
                onClick={() => setActiveImageIndex(index)}
              >
                {item.type === 'image' ? <img src={item.url} alt="" /> : null}
                {item.type === 'video' ? (
                  <span className="carousel-video-thumb">
                    {getYouTubeThumbnailFromEmbedUrl(item.url) ? (
                      <img src={getYouTubeThumbnailFromEmbedUrl(item.url) || ''} alt="" />
                    ) : null}
                    <span className="carousel-video-play">▶</span>
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="game-details-actions">
          <button type="button" onClick={handleTrackPrice}>
            Track Price
          </button>
          <button type="button" onClick={handleWishlistButton}>
            {wishlistState === 'saving'
              ? 'Saving...'
              : wishlistState === 'saved' || wishlistState === 'already'
                ? 'Open Wishlist'
                : 'Add to Wishlist'}
          </button>
          <button type="button" onClick={() => setShowLibraryForm((current) => !current)}>
            {showLibraryForm ? 'Hide Library Form' : 'Add to Library'}
          </button>
          {user?.role?.name?.toLowerCase() === 'admin' && (
            <button
              onClick={handleDeleteGame}
              style={{ backgroundColor: '#712434', color: '#fff' }}
              title="Delete this game completely from the database"
            >
              Delete from DB
            </button>
          )}
        </div>

        {showLibraryForm ? (
          <div className="library-add-panel">
            <h4>Add This Game To Library</h4>
            <label>
              Platform
              <select
                value={selectedPlatform}
                onChange={(event) => {
                  setSelectedPlatform(event.target.value);
                  setLibraryState('idle');
                  setLibraryError(null);
                }}
              >
                <option value="">Select platform</option>
                {allPlatformOptions.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform === '__custom__' ? 'Custom Platform...' : platform}
                  </option>
                ))}
              </select>
            </label>

            {selectedPlatform === '__custom__' ? (
              <>
                <label>
                  Custom platform name
                  <input
                    type="text"
                    value={customPlatform}
                    onChange={(event) => setCustomPlatform(event.target.value)}
                    placeholder="My Emulator"
                  />
                </label>
                <label>
                  Executable or deeplink
                  <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                    <input
                      type="text"
                      value={customExecutablePath}
                      onChange={(event) => setCustomExecutablePath(event.target.value)}
                      placeholder="D:/Games/MyGame/game.exe or custom://launch"
                      style={{ flex: 1, marginBottom: 0 }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const path = await window.api.dialogOpenFile();
                        if (path) setCustomExecutablePath(path);
                      }}
                      style={{ marginBottom: 0, whiteSpace: 'nowrap' }}
                    >
                      Browse...
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <>
                {hasAutomaticLaunchTarget ? (
                  <p
                    className="auto-launch-hint"
                    style={{ color: '#4caf50', fontSize: '0.9rem', marginTop: '5px' }}
                  >
                    {selectedPlatform.toLowerCase() === 'epic games'
                      ? '✓ Launch path will be resolved automatically from Epic Games files.'
                      : `✓ Auto launch target detected: ${automaticLaunchTarget}`}
                  </p>
                ) : (
                  <label>
                    Executable or deeplink
                    <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                      <input
                        type="text"
                        value={manualExecutablePath}
                        onChange={(event) => setManualExecutablePath(event.target.value)}
                        placeholder="steam://run/12345, or C:/Game/game.exe"
                        style={{ flex: 1, marginBottom: 0 }}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const path = await window.api.dialogOpenFile();
                          if (path) setManualExecutablePath(path);
                        }}
                        style={{ marginBottom: 0, whiteSpace: 'nowrap' }}
                      >
                        Browse...
                      </button>
                    </div>
                  </label>
                )}
              </>
            )}

            {libraryError ? <p className="library-form-error">{libraryError}</p> : null}

            <button type="button" onClick={handleAddToLibrary} disabled={libraryState === 'saving'}>
              {libraryState === 'saving'
                ? 'Saving...'
                : libraryState === 'saved'
                  ? 'Saved to Library'
                  : 'Save to Library'}
            </button>
          </div>
        ) : null}

        <h3>Game Description</h3>
        <p className="game-details-description">
          {game?.description || 'Description is unavailable for this game.'}
        </p>

        <h3>Available On</h3>
        {platformLinks.length ? (
          <ul className="game-platforms">
            {[...new Map(platformLinks.map((link) => [link.platform.toLowerCase(), link])).values()]
              .sort((a, b) => a.platform.localeCompare(b.platform))
              .map((link) => (
                <li key={`${link.platform}-${link.url}`}>
                  <button
                    type="button"
                    aria-label={`Open ${link.platform}`}
                    className="platform-row-button"
                    onClick={() => openPlatformPage(link.url)}
                  >
                    <span>{link.platform}</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="empty-state">No verified API platform links available.</p>
        )}
      </div>

      <div className="game-details-right">
        <div className="game-details-logo" aria-hidden="true">
          {logoUrl ? <img src={logoUrl} alt={game?.title ? `${game.title} logo` : ''} /> : null}
        </div>

        <div className="price-history-card">
          <h3>Price History</h3>
          {priceHistory.length ? (
            <>
              <div
                className="price-chart-wrap"
                style={{ position: 'relative', marginLeft: '30px' }}
              >
                <svg viewBox="0 -10 420 260" style={{ overflow: 'visible' }}>
                  {/* Горизонтальні лінії сітки */}
                  {[0, 0.5, 1].map((v) => (
                    <line
                      key={v}
                      x1="0"
                      y1={210 - v * 210}
                      x2="420"
                      y2={210 - v * 210}
                      stroke="rgba(255,255,255,0.1)"
                      strokeDasharray="4"
                    />
                  ))}

                  {/* Лінія графіка */}
                  {chartPolyline && (
                    <polyline
                      points={chartPolyline}
                      fill="none"
                      stroke="var(--ev-accent-color)"
                      strokeWidth="3"
                    />
                  )}

                  {/* Точки та дати знизу */}
                  {chartData.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="4" fill="var(--ev-accent-color)" />
                      {/* Дата під кутом, щоб не налізали одна на одну */}
                      <text
                        x={p.x}
                        y="235"
                        fill="var(--ev-text-muted)"
                        fontSize="10"
                        textAnchor="end"
                        transform={`rotate(-35 ${p.x} 235)`}
                      >
                        {p.label}
                      </text>
                    </g>
                  ))}
                </svg>
                {priceStats && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '-35px',
                      top: 0,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      opacity: 0.6
                    }}
                  >
                    <span>${priceStats.highest.toFixed(0)}</span>
                    <span>${priceStats.lowest.toFixed(0)}</span>
                  </div>
                )}
              </div>

              {/* СТАТИСТИКА ЦІН */}
              {priceStats && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '10px',
                    marginTop: '20px',
                    padding: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--ev-text-muted)',
                        textTransform: 'uppercase',
                        marginBottom: '4px'
                      }}
                    >
                      Current
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                      ${priceStats.current.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--ev-text-muted)',
                        textTransform: 'uppercase',
                        marginBottom: '4px'
                      }}
                    >
                      Lowest
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#4caf50' }}>
                      ${priceStats.lowest.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--ev-text-muted)',
                        textTransform: 'uppercase',
                        marginBottom: '4px'
                      }}
                    >
                      Highest
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#f44336' }}>
                      ${priceStats.highest.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* НОРМАЛЬНА КНОПКА */}
              {game?.cheapsharkUrl && (
                <div style={{ marginTop: '15px' }}>
                  <button
                    type="button"
                    className="platform-row-button"
                    onClick={() => window.open(game.cheapsharkUrl, '_blank')}
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      backgroundColor: 'var(--ev-accent-color)',
                      border: 'none'
                    }}
                  >
                    <span>Find Cheapest Deal</span>
                    <span style={{ marginLeft: '8px' }}>↗</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="empty-state">No price history recorded for this game.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default GameDetails;
