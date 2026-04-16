import GamesHome from './GamesHome';
import Library from './Library';
import { Route, Routes } from 'react-router-dom';
import Login from './Login';
import SearchedGames from './SearchedGames';
import Settings from './Settings';
import Register from './Register';
import GameDetails from './GameDetails';
import Wishlist from './Wishlist';
import ProfilePage from './ProfilePage';
import AdminPanel from './AdminPanel';

function Main() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<GamesHome />} />
        <Route path="/games" element={<GamesHome />} />
        <Route path="/library" element={<Library />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/search" element={<SearchedGames />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/register" element={<Register />} />
        <Route path="/game/:gameId" element={<GameDetails />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </main>
  );
}

export default Main;
