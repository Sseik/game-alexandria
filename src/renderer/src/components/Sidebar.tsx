import Menu from './Menu';
import QuickLaunch from './QuickLaunch';
import { useAuth } from '@renderer/context/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { RecentSessionGame } from '../../../shared/types';
import { APP_EVENTS, emitAppEvent, subscribeToAppEvents } from '../shared/appEvents';
import { IGDB_RETRY_INTERVAL_MS } from '../shared/igdbRefresh';

function Sidebar(): React.JSX.Element {
  const { user } = useAuth();
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentSessionGame[]>([]);
  const lastImageRetryAt = useRef(0);

  const loadRecentlyPlayed = async (userId: number) => {
    const recent = await window.api.getRecentSessionGames(userId, 4);
    setRecentlyPlayed(recent);
  };

  useEffect(() => {
    if (user) {
      void loadRecentlyPlayed(user.id);
    } else {
      setRecentlyPlayed([]);
    }

    const handleSessionUpdate = () => {
      if (user) {
        void loadRecentlyPlayed(user.id);
      }
    };

    return subscribeToAppEvents([APP_EVENTS.SESSION_UPDATED], handleSessionUpdate);
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const interval = setInterval(() => {
      const hasMissingImages = recentlyPlayed.some((game) => !game.image);
      if (!hasMissingImages) {
        return;
      }

      const now = Date.now();
      if (now - lastImageRetryAt.current < IGDB_RETRY_INTERVAL_MS) {
        return;
      }

      lastImageRetryAt.current = now;
      void loadRecentlyPlayed(user.id);
    }, 12000);

    return () => {
      clearInterval(interval);
    };
  }, [recentlyPlayed, user]);

  const handleLaunch = async (gameId: string, platformId?: string) => {
    if (!user) {
      return;
    }

    const result = await window.api.launchLibraryGame(user.id, gameId, platformId);
    if (!result.success && result.error) {
      window.alert(result.error);
      return;
    }

    emitAppEvent(APP_EVENTS.SESSION_UPDATED);
    void loadRecentlyPlayed(user.id);
  };

  return (
    <section className="sidebar">
      <Menu />
      <QuickLaunch recentlyPlayed={recentlyPlayed} onLaunch={handleLaunch} />
    </section>
  );
}

export default Sidebar;
