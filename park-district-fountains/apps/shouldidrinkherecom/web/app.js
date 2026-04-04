const DATA_URL = "fountains.json";
const HALF_MILE_METERS = 804.672;
const SAFETY_RANK = { danger: 0, caution: 1, safe: 2, unknown: 3 };

let allData = null;

// ---- Hash-based routing ----
// Hashes:  #           → near me
//          #all-parks  → all parks (empty search)
//          #all-parks/QUERY → all parks filtered
//          #park/ID    → park detail
//          #fountain/ID → fountain detail

function getHash() {
  return decodeURIComponent(window.location.hash.slice(1));
}

function setHash(hash, replace = false) {
  const url = "#" + encodeURIComponent(hash);
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

function activeTab() {
  const h = getHash();
  return h.startsWith("all-parks") ? "all-parks" : "near-me";
}

function show(id) {
  for (const el of document.querySelectorAll("main > div")) el.classList.add("hidden");
  document.getElementById(id).classList.remove("hidden");

  const atRoot = id === "results-screen" || id === "all-parks-screen" ||
                 id === "loading-screen" || id === "error-screen";
  document.getElementById("back-btn").classList.toggle("hidden", atRoot);
  document.getElementById("tab-bar").classList.toggle("hidden", !atRoot);

  const tab = activeTab();
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );
}

function goBack() {
  history.back();
}

// Route to the correct screen based on current hash (called on load + popstate)
function route() {
  if (!allData) return; // not loaded yet — boot() will call route() when ready
  const hash = getHash();

  if (hash.startsWith("fountain/")) {
    const id = hash.slice("fountain/".length);
    const f = findFountain(id);
    if (f) { renderFountainDetail(f); show("fountain-screen"); return; }
  }
  if (hash.startsWith("park/")) {
    const id = hash.slice("park/".length);
    const park = allData.parks.find((p) => p.park_id === id);
    if (park) { renderParkDetail(park); show("detail-screen"); return; }
  }
  if (hash.startsWith("all-parks")) {
    const q = hash.includes("/") ? hash.slice("all-parks/".length) : "";
    document.getElementById("search-input").value = q;
    renderAllParks(allData.parks, q);
    show("all-parks-screen");
    return;
  }
  // Default: near-me
  show("results-screen");
}

window.addEventListener("popstate", () => { route(); window.scrollTo(0, 0); });

// ---- Tabs ----

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === "all-parks") {
      const q = document.getElementById("search-input").value;
      setHash(q ? `all-parks/${q}` : "all-parks");
    } else {
      setHash("");
    }
    route();
  });
});

document.getElementById("header-text").style.cursor = "pointer";
document.getElementById("header-text").addEventListener("click", () => {
  const tab = activeTab();
  setHash(tab === "all-parks" ? "all-parks" : "");
  route();
  window.scrollTo(0, 0);
});

// ---- Boot ----

async function boot() {
  show("loading-screen");
  document.getElementById("loading-msg").textContent = "Loading data…";

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allData = await res.json();
  } catch {
    showError("Could not load fountain data. Make sure you're running this from a local server (python -m http.server).");
    return;
  }

  // If hash points to a park/fountain detail, go there immediately without geolocating
  const hash = getHash();
  if (hash.startsWith("park/") || hash.startsWith("fountain/") || hash.startsWith("all-parks")) {
    route();
    return;
  }

  if (!navigator.geolocation) {
    showError("Your browser doesn't support geolocation.");
    return;
  }

  document.getElementById("loading-msg").textContent = "Finding your location…";

  navigator.geolocation.getCurrentPosition(
    (pos) => onLocation(pos.coords.latitude, pos.coords.longitude),
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        showError("Location access was denied. Please allow location access and reload the page.");
      } else {
        showError("Could not get your location. Please try again.");
      }
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

// ---- Near Me ----

function onLocation(userLat, userLng) {
  const nearbyParks = [];

  for (const park of allData.parks) {
    if (park.lat == null || park.lng == null) continue;
    const dist = haversine(userLat, userLng, park.lat, park.lng);
    if (dist > HALF_MILE_METERS) continue;
    nearbyParks.push({ park, dist });
  }

  nearbyParks.sort((a, b) => {
    const ra = SAFETY_RANK[a.park.safety_level];
    const rb = SAFETY_RANK[b.park.safety_level];
    return ra !== rb ? ra - rb : a.dist - b.dist;
  });

  const summary = document.getElementById("results-summary");
  const list = document.getElementById("park-list");

  if (nearbyParks.length === 0) {
    summary.textContent = "No park fountains found within a half mile.";
    list.innerHTML = "";
  } else {
    summary.textContent = `${nearbyParks.length} park${nearbyParks.length !== 1 ? "s" : ""} within ½ mile`;
    list.innerHTML = nearbyParks.map(({ park, dist }) => parkCard(park, dist)).join("");
    bindParkCards(list, (id) => allData.parks.find((p) => p.park_id === id));
  }

  setHash("", true);
  show("results-screen");
}

// ---- All Parks ----

function renderAllParks(parks, query) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? parks.filter((p) => p.park_name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
    : [...parks].sort((a, b) => a.park_name.localeCompare(b.park_name));

  const summary = document.getElementById("search-summary");
  const list = document.getElementById("all-park-list");

  summary.textContent = q
    ? `${filtered.length} park${filtered.length !== 1 ? "s" : ""} matching "${query}"`
    : `${filtered.length} parks`;

  list.innerHTML = filtered.map((park) => parkCard(park, null)).join("");
  bindParkCards(list, (id) => allData.parks.find((p) => p.park_id === id));
}

document.getElementById("search-input").addEventListener("input", (e) => {
  const q = e.target.value;
  setHash(q ? `all-parks/${q}` : "all-parks", true); // replace so search typing doesn't bloat history
  if (allData) renderAllParks(allData.parks, q);
});

// ---- Park cards ----

function parkCard(park, dist) {
  const activeFountains = park.fountains.filter((f) => f.safety_level !== "unknown");
  const fixtureCount = activeFountains.length || park.total_fixture_count;
  const fixtureMeta = `${fixtureCount} fixture${fixtureCount !== 1 ? "s" : ""}`;
  const distMeta = dist != null ? ` &bull; ${metersToMiles(dist)}` : "";

  return `
    <div class="park-card" data-park-id="${esc(park.park_id)}" role="button" tabindex="0">
      <div class="park-card-top">
        <div>
          <p class="park-card-name">${esc(park.park_name)}</p>
          <p class="park-card-meta">${fixtureMeta}${distMeta}</p>
        </div>
        <span class="safety-badge ${park.safety_level}">${badgeLabel(park.safety_level)}</span>
      </div>
      <p class="park-card-address">${esc(park.address)}</p>
    </div>`;
}

function bindParkCards(container, findPark) {
  container.querySelectorAll(".park-card").forEach((el) => {
    const handler = () => {
      const park = findPark(el.dataset.parkId);
      if (park) openDetail(park);
    };
    el.addEventListener("click", handler);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") handler(); });
  });
}

// ---- Park detail ----

function openDetail(park) {
  setHash(`park/${park.park_id}`);
  renderParkDetail(park);
  show("detail-screen");
  window.scrollTo(0, 0);
}

function renderParkDetail(park) {
  document.getElementById("detail-park-name").textContent = park.park_name;
  document.getElementById("detail-park-address").textContent = park.address;
  document.getElementById("detail-park-badge").className = `safety-badge ${park.safety_level}`;
  document.getElementById("detail-park-badge").textContent = badgeLabel(park.safety_level);

  const outdoor = park.fountains.filter((f) => f.type === "outdoor");
  const indoor  = park.fountains.filter((f) => f.type !== "outdoor");
  let html = "";
  if (outdoor.length) html += fountainGroup("Outdoor", outdoor);
  if (indoor.length)  html += fountainGroup("Indoor", indoor);
  document.getElementById("detail-fountain-list").innerHTML = html;
  bindFountainRows(document.getElementById("detail-fountain-list"));
}

function fountainGroup(label, fountains) {
  const sorted = [...fountains].sort(
    (a, b) => SAFETY_RANK[a.safety_level] - SAFETY_RANK[b.safety_level]
  );
  return `<p class="group-label">${label} (${sorted.length})</p>` + sorted.map(fountainRow).join("");
}

function fountainRow(f) {
  const descHTML = f.location_description
    ? `<p class="f-desc">${esc(f.location_description)}</p>` : "";
  const bottleHTML = f.is_bottle_filler ? `<span class="tag bottle">Bottle filler</span>` : "";
  const statusHTML = f.status !== "ON" ? `<span class="tag status">${esc(f.status)}</span>` : "";
  const lastTested = f.tested_2025 ? "Tested in 2025" : (f.latest_result_ppb != null ? "Last tested before 2025" : "Never tested");

  return `
    <div class="fountain-row ${f.safety_level}" data-fountain-id="${esc(f.fountain_id)}" role="button" tabindex="0">
      <div class="f-top">
        <div class="f-left">
          <p class="f-location">${esc(f.location)}</p>
          ${descHTML}
          <div class="tags">${bottleHTML}${statusHTML}<span class="tag tested">${lastTested}</span></div>
        </div>
        <div class="f-right">
          <span class="safety-badge ${f.safety_level}">${badgeLabel(f.safety_level)}</span>
          <span class="f-chevron">›</span>
        </div>
      </div>
      <p class="rec ${f.safety_level}">${esc(f.recommendation)}</p>
    </div>`;
}

function bindFountainRows(container) {
  container.querySelectorAll(".fountain-row").forEach((el) => {
    const handler = () => {
      const fountain = findFountain(el.dataset.fountainId);
      if (fountain) openFountainDetail(fountain);
    };
    el.addEventListener("click", handler);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") handler(); });
  });
}

function findFountain(fountainId) {
  for (const park of allData.parks) {
    const f = park.fountains.find((f) => f.fountain_id === fountainId);
    if (f) return f;
  }
}

function openFountainDetail(f) {
  setHash(`fountain/${f.fountain_id}`);
  renderFountainDetail(f);
  show("fountain-screen");
  window.scrollTo(0, 0);
}

function renderFountainDetail(f) {
  const lastTested = f.tested_2025 ? "2025" : (f.latest_result_ppb != null ? "Before 2025" : "Never");
  const ppbHTML = f.latest_result_ppb != null
    ? `<div class="fd-stat"><span class="fd-stat-label">Latest result</span><span class="fd-stat-value">${f.latest_result_ppb} ppb</span></div>`
    : "";
  const maxPpbHTML = f.max_lead_ever_ppb != null
    ? `<div class="fd-stat"><span class="fd-stat-label">Historical high</span><span class="fd-stat-value ${f.ever_elevated ? "elevated" : ""}">${f.max_lead_ever_ppb} ppb</span></div>`
    : "";
  const remediationHTML = f.remediation_plan ? `
    <div class="fd-section">
      <p class="fd-section-label">Remediation</p>
      <p class="fd-section-value">${esc(f.remediation_plan)}</p>
      <p class="f-remediation ${f.remediated ? "done" : "pending"} fd-inline">${f.remediated ? "Complete" : "In progress"}</p>
    </div>` : "";

  const historyHTML = f.test_history && f.test_history.length
    ? `<div class="fd-section">
        <p class="fd-section-label">Test history</p>
        <table class="test-history">
          <thead><tr><th>Date</th><th>Round</th><th>Result</th></tr></thead>
          <tbody>
            ${f.test_history.map((t) => {
              const ppb = t.result_ppb;
              const lvl = ppb == null ? "unknown" : ppb < 5 ? "safe" : ppb <= 15 ? "caution" : "danger";
              return `<tr>
                <td>${t.date ?? "—"}</td>
                <td>${esc(t.round)}</td>
                <td class="th-result ${lvl}">${ppb != null ? ppb + " ppb" : "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : "";

  document.getElementById("fountain-detail").innerHTML = /* html */`
    <div class="fd-header ${f.safety_level}">
      <div>
        <h2 class="fd-title">${esc(f.location)}</h2>
        ${f.location_description ? `<p class="fd-subtitle">${esc(f.location_description)}</p>` : ""}
      </div>
      <span class="safety-badge ${f.safety_level}">${badgeLabel(f.safety_level)}</span>
    </div>

    <p class="rec ${f.safety_level} fd-rec">${esc(f.recommendation)}</p>

    <div class="fd-stats">
      ${ppbHTML}
      ${maxPpbHTML}
      <div class="fd-stat"><span class="fd-stat-label">Last tested</span><span class="fd-stat-value">${lastTested}</span></div>
      <div class="fd-stat"><span class="fd-stat-label">Type</span><span class="fd-stat-value">${esc(f.type)}</span></div>
      <div class="fd-stat"><span class="fd-stat-label">Status</span><span class="fd-stat-value">${esc(f.status)}</span></div>
      <div class="fd-stat"><span class="fd-stat-label">Bottle filler</span><span class="fd-stat-value">${f.is_bottle_filler ? "Yes" : "No"}</span></div>
      <div class="fd-stat"><span class="fd-stat-label">Ever elevated</span><span class="fd-stat-value ${f.ever_elevated ? "elevated" : ""}">${f.ever_elevated ? "Yes" : "No"}</span></div>
    </div>

    ${remediationHTML}
    ${historyHTML}

    <p class="fd-id">Fixture ID: ${esc(f.fountain_id)}</p>
  `;

}

// ---- Back button ----

document.getElementById("back-btn").addEventListener("click", goBack);

// ---- Error ----

function showError(msg) {
  document.getElementById("error-msg").textContent = msg;
  show("error-screen");
}
document.getElementById("error-retry-btn").addEventListener("click", () => {
  setHash("", true);
  boot();
});

// ---- Utils ----

function badgeLabel(level) {
  return { safe: "Safe", caution: "Caution", danger: "Do not drink", unknown: "No data" }[level] || level;
}
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function rad(deg) { return deg * Math.PI / 180; }
function metersToMiles(m) {
  const mi = m / 1609.344;
  return mi < 0.1 ? `${Math.round(m * 3.281)} ft` : `${mi.toFixed(2)} mi`;
}
function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

boot();
