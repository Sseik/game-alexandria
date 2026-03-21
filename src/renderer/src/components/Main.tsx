import Library from './Library';
import { Route, Routes } from 'react-router-dom';
import Login from './Login';

function Main() {
  return (
    <main>
      <Routes>
        <Route path="/library" element={<Library />} />
        <Route path="/" element={<Login />} />
      </Routes>
    </main>
  );
}

export default Main;
