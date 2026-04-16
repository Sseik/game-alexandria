import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Game, LibraryPlatform } from '../../../shared/types';
import { useAuth } from '@renderer/context/AuthContext';
import { APP_EVENTS, emitAppEvent } from '../shared/appEvents';
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

function buildPolyline(points: Array<{ label: string; price: number }>): string {
  if (points.length < 2) {
    return '';
  }

  const width = 420;
  const height = 210;
  const minPrice = Math.min(...points.map((point) => point.price));
  const maxPrice = Math.max(...points.map((point) => point.price));
  const valueRange = Math.max(1, maxPrice - minPrice);

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const normalized = (point.price - minPrice) / valueRange;
      const y = height - normalized * height;
      return `${x},${y}`;
    })
    .join(' ');
}

function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

type CarouselItem = {
  type: 'image' | 'video';
  url: string;
  key: string;
};

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

      if (cancelled) {
        return;
      }

      if (fetchedGame) {
        setGame(fetchedGame);
        return;
      }

      if (!locationGame) {
        navigate('/library');
      }
    };

    void loadGame();

    return () => {
      cancelled = true;
    };
  }, [locationGame, navigate, params.gameId]);

  const priceHistory = game?.priceHistory ?? [];
  const chartPolyline = buildPolyline(priceHistory);
  const priceStats = game?.priceStats;

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
    if (!game?.id) {
      return;
    }

    const hasMissingMetadata = !game.coverUrl || !game.description;
    if (!hasMissingMetadata) {
      return;
    }

    const now = Date.now();
    if (now - lastVisibleIgdbRetryAt.current < IGDB_RETRY_INTERVAL_MS) {
      return;
    }

    lastVisibleIgdbRetryAt.current = now;
    const timer = setTimeout(async () => {
      const refreshed = await window.api.getGameDetails(game.id);
      if (refreshed) {
        setGame(refreshed);
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
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

    // Only include platforms that have launch URLs (verified available via IGDB)
    for (const link of platformLinks) {
      if (link.launchUrl) {
        options.add(link.platform);
      }
    }

    // Always allow custom platform option
    options.add('__custom__');

    return [...options].sort((a, b) => {
      if (a === '__custom__') return 1;
      if (b === '__custom__') return -1;
      return a.localeCompare(b);
    });
  }, [platformLinks]);

  const selectedLibraryPlatform = useMemo(() => {
    if (!selectedPlatform) {
      return undefined;
    }

    return libraryPlatforms.find(
      (platform) => platform.name.toLowerCase() === selectedPlatform.toLowerCase()
    );
  }, [libraryPlatforms, selectedPlatform]);

  const selectedPlatformLink = useMemo(() => {
    if (!selectedPlatform) {
      return undefined;
    }

    return platformLinks.find(
      (link) => link.platform.toLowerCase() === selectedPlatform.toLowerCase() && link.launchUrl
    );
  }, [platformLinks, selectedPlatform]);

  const automaticLaunchTarget = useMemo(() => {
    if (selectedPlatform === '__custom__' || !selectedPlatform) {
      return undefined;
    }

    if (selectedPlatformLink?.launchUrl) {
      return selectedPlatformLink.launchUrl;
    }

    const launchPrefix = selectedLibraryPlatform?.launchPrefix;
    if (!launchPrefix) {
      return undefined;
    }

    if (game?.igdbId) {
      return `${launchPrefix}${game.igdbId}`;
    }

    if (selectedPlatform.toLowerCase() === 'epic games' && game?.title) {
      const slug = slugifyTitle(game.title);
      return slug ? `${launchPrefix}${slug}` : undefined;
    }

    return undefined;
  }, [
    game?.igdbId,
    game?.title,
    selectedLibraryPlatform?.launchPrefix,
    selectedPlatform,
    selectedPlatformLink?.launchUrl
  ]);

  const hasAutomaticLaunchTarget = Boolean(
    selectedPlatform !== '__custom__' && automaticLaunchTarget
  );

  const handleTrackPrice = async () => {
    if (!user || !game?.id) {
      navigate('/login');
      return;
    }

    const promptValue = window.prompt('Target price (USD):', '19.99');
    if (promptValue === null) {
      return;
    }

    const parsed = Number(promptValue);
    if (Number.isNaN(parsed)) {
      return;
    }

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

  const openPlatformPage = (url: string) => {
    window.open(url, '_blank');
  };

  const goToPreviousImage = () => {
    if (!carouselItems.length) {
      return;
    }

    setActiveImageIndex((current) => (current === 0 ? carouselItems.length - 1 : current - 1));
  };

  const goToNextImage = () => {
    if (!carouselItems.length) {
      return;
    }

    setActiveImageIndex((current) => (current === carouselItems.length - 1 ? 0 : current + 1));
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
                    {platform}
                  </option>
                ))}
                <option value="__custom__">Another platform...</option>
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
                  <input
                    type="text"
                    value={customExecutablePath}
                    onChange={(event) => setCustomExecutablePath(event.target.value)}
                    placeholder="D:/Games/MyGame/game.exe or custom://launch"
                  />
                </label>
              </>
            ) : (
              <>
                {hasAutomaticLaunchTarget ? (
                  <p className="auto-launch-hint">
                    Auto launch target detected: {automaticLaunchTarget}
                  </p>
                ) : (
                  <label>
                    Executable or deeplink
                    <input
                      type="text"
                      value={manualExecutablePath}
                      onChange={(event) => setManualExecutablePath(event.target.value)}
                      placeholder="steam://run/12345, com.epicgames.launcher://..., or C:/Game/game.exe"
                    />
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
              <div className="price-chart-wrap">
                <svg viewBox="0 0 420 210" role="img" aria-label="Price history chart">
                  <polyline points={chartPolyline} />
                </svg>
              </div>
              {priceStats ? (
                <div className="price-stats">
                  <div>
                    <label>Current Price</label>
                    <strong>${priceStats.current.toFixed(2)}</strong>
                  </div>
                  <div>
                    <label>Lowest Price</label>
                    <strong className="positive">${priceStats.lowest.toFixed(2)}</strong>
                  </div>
                  <div>
                    <label>Highest Price</label>
                    <strong className="negative">${priceStats.highest.toFixed(2)}</strong>
                  </div>
                </div>
              ) : null}
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
