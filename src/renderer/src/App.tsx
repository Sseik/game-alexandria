import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Main from './components/Main';
import { HashRouter } from 'react-router-dom';
import AuthProvider from './context/AuthContext';

function App(): React.JSX.Element {
  return (
    <>
      <AuthProvider>
        <HashRouter>
          <Header />
          <Sidebar />
          <Main />
        </HashRouter>
      </AuthProvider>
    </>
  );
}

export default App;
