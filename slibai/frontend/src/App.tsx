import { Routes, Route } from 'react-router-dom'
import { CompareProvider } from './context/CompareContext'
import { AuthProvider } from './context/AuthContext'
import { BookmarkProvider } from './context/BookmarkContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Compare from './pages/Compare'
import Stats from './pages/Stats'
import Admin from './pages/Admin'
import AdminReports from './pages/AdminReports'
import AdminAllUsers from './pages/AdminAllUsers'
import Profile from './pages/Profile'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

export default function App() {
  return (
    <AuthProvider>
      <BookmarkProvider>
        <CompareProvider>
          <div className="min-h-screen bg-slate-900 text-white">
            <Routes>
              {/* Auth pages — full screen, no Navbar */}
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* App pages — with Navbar */}
              <Route path="*" element={
                <>
                  <Navbar />
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/compare" element={<Compare />} />
                    <Route path="/stats" element={<Stats />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/reports" element={<AdminReports />} />
                    <Route path="/admin/users" element={<AdminAllUsers />} />
                    <Route path="/profile" element={<Profile />} />
                  </Routes>
                </>
              } />
            </Routes>
          </div>
        </CompareProvider>
      </BookmarkProvider>
    </AuthProvider>
  )
}
