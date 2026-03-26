import { Routes, Route } from 'react-router-dom'
import { CompareProvider } from './context/CompareContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Compare from './pages/Compare'
import Stats from './pages/Stats'

export default function App() {
  return (
    <CompareProvider>
      <div className="min-h-screen bg-slate-900 text-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </div>
    </CompareProvider>
  )
}
