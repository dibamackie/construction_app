import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Quote from './pages/Quote';

function App() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';

  return (
    <>
      {!isAuthPage && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/quote" element={<Quote />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
