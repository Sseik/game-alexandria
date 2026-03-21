import Library from './Library';
import { Route, Routes } from 'react-router-dom';
import Login from './Login';

function Main() {
  return (
    <main>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/library" element={<Library />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </main>
  );
}

export default Main;
