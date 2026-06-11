import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { DataProvider, useData } from "./DataContext";
import NearMe from "./pages/NearMe";
import AllParks from "./pages/AllParks";
import ParkDetail from "./pages/ParkDetail";
import FountainDetail from "./pages/FountainDetail";
import About from "./pages/About";

function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  const isDetail =
    location.pathname.startsWith("/parks/") ||
    location.pathname.startsWith("/fountains/");

  function handleLogoClick() {
    const isAllParks = location.pathname.startsWith("/parks");
    navigate(isAllParks ? "/parks" : "/");
    window.scrollTo(0, 0);
  }

  return (
    <>
      <header>
        {isDetail && (
          <button id="back-btn" onClick={() => { navigate(-1); window.scrollTo(0, 0); }}>
            ← Back
          </button>
        )}
        <div id="header-text" onClick={handleLogoClick} style={{ cursor: "pointer" }}>
          <h1>Should I Drink Here?</h1>
          <p className="subtitle">Chicago park fountain lead data</p>
        </div>
      </header>

      {!isDetail && (
        <div id="tab-bar">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            Near Me
          </NavLink>
          <NavLink
            to="/parks"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            All Parks
          </NavLink>
          <NavLink
            to="/about"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            About
          </NavLink>
        </div>
      )}
    </>
  );
}

function AppShell() {
  const { loading, error } = useData();

  if (loading) {
    return (
      <div id="app">
        <Header />
        <main>
          <div id="loading-screen">
            <div className="spinner" />
            <p>Loading data…</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div id="app">
        <Header />
        <main>
          <div id="error-screen">
            <p id="error-msg">Could not load fountain data: {error}</p>
            <button onClick={() => window.location.reload()}>Try again</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="app">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<NearMe />} />
          <Route path="/parks" element={<AllParks />} />
          <Route path="/parks/:parkId" element={<ParkDetail />} />
          <Route path="/fountains/:fountainId" element={<FountainDetail />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AppShell />
      </DataProvider>
    </BrowserRouter>
  );
}
