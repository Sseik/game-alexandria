import { useState, useEffect } from 'react';
import GamesGrid from './GamesGrid';
import { Game } from '../../../shared/types';
import { useAuth } from '@renderer/context/AuthContext';
import { useNavigate } from 'react-router-dom';

function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  useEffect(() => {
    const loadGames = async (userId: number) => {
      const fetchedGames = await window.api.getLibrary(userId);
      setGames(fetchedGames);
    };
    user ? loadGames(user.id) : navigate('/login');
  }, []);

  console.log(games);

  return (
    <section className="library">
      <h2>Library</h2>
      <label htmlFor="sorting-options">Sort: </label>
      <select name="sorting-options" id="sorting-options">
        <option value="name">Recently Bought</option>
        <option value="name">Recently Played</option>
        <option value="name">By Name (A-Z)</option>
        <option value="name">By Name (Z-A)</option>
        <option value="name">In-Game Time</option>
      </select>
      <GamesGrid games={games} />
    </section>
  );
}

export default Library;
