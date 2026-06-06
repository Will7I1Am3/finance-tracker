import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./ThemeContext";
import { AuthProvider, useAuth } from "./AuthContext";
import { DataRefreshProvider } from "./DataRefreshContext";
import NavBar from "./components/NavBar";
import UploadModal from "./components/UploadModal";
import Dashboard from "./pages/Dashboard";
import Statements from "./pages/Statements";
import Transactions from "./pages/Transactions";
import Cards from "./pages/Cards";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import styles from "./App.module.css";

function AppRoutes() {
  const { user, loading } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);

  if (loading) return null;
  if (!user) return <Login />;

  return (
    <BrowserRouter>
      <NavBar />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/statements" element={<Statements />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
      <button className={styles.fab} onClick={() => setUploadOpen(true)}>
        + Upload
      </button>
      {uploadOpen && (
        <UploadModal onClose={() => setUploadOpen(false)} />
      )}
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataRefreshProvider>
          <AppRoutes />
        </DataRefreshProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
