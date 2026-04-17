import { useAuth } from '@renderer/context/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Game } from '../../../shared/types';
import { APP_EVENTS, emitAppEvent, subscribeToAppEvents } from '../shared/appEvents';
import { shouldRetryVisibleIgdbMetadata } from '../shared/igdbRefresh';

function Wishlist(): React.JSX.Element {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'price-low' | 'price-high'>('recent');
  const lastVisibleIgdbRetryAt = useRef(0);

  const loadWishlist = async (userId: number) => {
    const fetchedGames = await window.api.getWishlist(userId);
    setGames(fetchedGames);
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    user ? loadWishlist(user.id) : navigate('/login');
  }, [isLoading, navigate, user]);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    const refreshWishlist = () => {
      void loadWishlist(user.id);
    };

    return subscribeToAppEvents([APP_EVENTS.WISHLIST_UPDATED], refreshWishlist);
  }, [isLoading, user]);

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query ? games.filter((game) => game.title.toLowerCase().includes(query)) : games;

    if (sortBy === 'price-low') {
      return [...base].sort(
        (left, right) => (left.targetPrice ?? Infinity) - (right.targetPrice ?? Infinity)
      );
    }

    if (sortBy === 'price-high') {
      return [...base].sort((left, right) => (right.targetPrice ?? 0) - (left.targetPrice ?? 0));
    }

    return [...base].sort((left, right) => {
      const a = left.addedAt ? new Date(left.addedAt).getTime() : 0;
      const b = right.addedAt ? new Date(right.addedAt).getTime() : 0;
      return b - a;
    });
  }, [games, search, sortBy]);

  const totalTargetPrice = filteredGames.reduce((sum, game) => sum + (game.targetPrice ?? 0), 0);

  useEffect(() => {
    if (
      isLoading ||
      !user ||
      !shouldRetryVisibleIgdbMetadata(filteredGames, lastVisibleIgdbRetryAt.current)
    ) {
      return;
    }

    lastVisibleIgdbRetryAt.current = Date.now();
    const timer = setTimeout(() => {
      void loadWishlist(user.id);
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
  }, [filteredGames, isLoading, user]);

  const handleRemove = async (gameId: string) => {
    if (isLoading || !user) {
      navigate('/login');
      return;
    }

    await window.api.removeFromWishlist(user.id, gameId);
    setGames((current) => current.filter((game) => game.id !== gameId));
    emitAppEvent(APP_EVENTS.WISHLIST_UPDATED);
  };

  return (
    <section className="wishlist-page">
      <div className="wishlist-hero">
        <div>
          <h2>My Wishlist</h2>
          <p>
            {filteredGames.length} games • Target total: ${totalTargetPrice.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="wishlist-toolbar">
        <input
          type="search"
          placeholder="Search games..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
          <option value="recent">Recently Added</option>
          <option value="price-low">Target Price: Low to High</option>
          <option value="price-high">Target Price: High to Low</option>
        </select>
      </div>

      {filteredGames.length ? (
        <div className="wishlist-list">
          {filteredGames.map((game) => (
            <article key={game.id} className="wishlist-item">
              <div className="wishlist-item-media">
                {game.coverUrl ? <img src={game.coverUrl} alt={`${game.title} cover`} /> : null}
              </div>
              <div className="wishlist-item-content">
                <div className="wishlist-item-head">
                  <h3>{game.title}</h3>
                  <strong>
                    {game.targetPrice ? `$${game.targetPrice.toFixed(2)}` : 'No target price'}
                  </strong>
                </div>
                <p>{game.description || 'No description available.'}</p>
                <div className="wishlist-item-actions">
                  <button
                    type="button"
                    onClick={() => navigate(`/game/${game.id}`, { state: { game } })}
                  >
                    Open Details
                  </button>
                  <button type="button" className="danger" onClick={() => handleRemove(game.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">Your wishlist is empty.</p>
      )}
    </section>
  );
}

export default Wishlist;
