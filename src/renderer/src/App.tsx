import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Main from './components/Main';
import { HashRouter } from 'react-router-dom';

function App(): React.JSX.Element {
  return (
    <>
      <HashRouter>
        <Header />
        <Sidebar />
        <Main />
      </HashRouter>
    </>
  );
}

export default App;
