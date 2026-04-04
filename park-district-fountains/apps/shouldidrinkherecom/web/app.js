const DATA_URL = "../../../data/build/fountains.json";
const HALF_MILE_METERS = 804.672;
const SAFETY_RANK = { danger: 0, caution: 1, safe: 2, unknown: 3 };

// ---- Screens ----

function show(id) {
  for (const el of document.querySelectorAll("main > div")) {
    el.classList.add("hidden");
  }
  document.getElementById(id).classList.remove("hidden");
}

// ---- Boot: auto-locate immediately ----

async function boot() {
  setLoading("Loading data…");

  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    showError("Could not load fountain data. Make sure you're running this from a local server (python -m http.server).");
    return;
  }

  if (!navigator.geolocation) {
    showError("Your browser doesn't support geolocation.");
    return;
  }

  setLoading("Finding your location…");

  navigator.geolocation.getCurrentPosition(
    (pos) => onLocation(pos.coords.latitude, pos.coords.longitude, data),
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

function setLoading(msg) {
  document.getElementById("loading-msg").textContent = msg;
  show("loading-screen");
}

// ---- Find nearby parks ----

function onLocation(userLat, userLng, data) {
  const nearbyParks = [];

  for (const park of data.parks) {
    if (park.lat == null || park.lng == null) continue;
    const dist = haversine(userLat, userLng, park.lat, park.lng);
    if (dist > HALF_MILE_METERS) continue;
    nearbyParks.push({ park, dist });
  }

  // Sort: worst safety first, then by distance
  nearbyParks.sort((a, b) => {
    const ra = SAFETY_RANK[a.park.safety_level];
    const rb = SAFETY_RANK[b.park.safety_level];
    return ra !== rb ? ra - rb : a.dist - b.dist;
  });

  renderResults(nearbyParks);
}

// ---- Results list (one card per park) ----

function renderResults(nearbyParks) {
  const summary = document.getElementById("results-summary");
  const list = document.getElementById("park-list");

  if (nearbyParks.length === 0) {
    summary.textContent = "No park fountains found within a half mile.";
    list.innerHTML = "";
  } else {
    summary.textContent = `${nearbyParks.length} park${nearbyParks.length !== 1 ? "s" : ""} within ½ mile`;
    list.innerHTML = nearbyParks.map(({ park, dist }) => parkCard(park, dist)).join("");

    list.querySelectorAll(".park-card").forEach((el) => {
      el.addEventListener("click", () => {
        const park = nearbyParks.find((n) => n.park.park_id === el.dataset.parkId)?.park;
        if (park) openDetail(park);
      });
    });
  }

  document.getElementById("back-btn").classList.add("hidden");
  show("results-screen");
}

function parkCard(park, dist) {
  const activeFountains = park.fountains.filter((f) => f.safety_level !== "unknown");
  const meta = activeFountains.length
    ? `${activeFountains.length} active fixture${activeFountains.length !== 1 ? "s" : ""}`
    : `${park.total_fixture_count} fixture${park.total_fixture_count !== 1 ? "s" : ""}`;

  return `
    <div class="park-card" data-park-id="${esc(park.park_id)}" role="button" tabindex="0">
      <div class="park-card-top">
        <div>
          <p class="park-card-name">${esc(park.park_name)}</p>
          <p class="park-card-meta">${meta} &bull; ${metersToMiles(dist)}</p>
        </div>
        <span class="safety-badge ${park.safety_level}">${badgeLabel(park.safety_level)}</span>
      </div>
      <p class="park-card-address">${esc(park.address)}</p>
    </div>`;
}

// ---- Park detail ----

function openDetail(park) {
  document.getElementById("detail-park-name").textContent = park.park_name;
  document.getElementById("detail-park-address").textContent = park.address;
  document.getElementById("detail-park-badge").className = `safety-badge ${park.safety_level}`;
  document.getElementById("detail-park-badge").textContent = badgeLabel(park.safety_level);

  const outdoor = park.fountains.filter((f) => f.type === "outdoor");
  const indoor  = park.fountains.filter((f) => f.type !== "outdoor");
  let html = "";
  if (outdoor.length) html += group("Outdoor", outdoor);
  if (indoor.length)  html += group("Indoor", indoor);
  document.getElementById("detail-fountain-list").innerHTML = html;

  document.getElementById("back-btn").classList.remove("hidden");
  show("detail-screen");
  window.scrollTo(0, 0);
}

function group(label, fountains) {
  // Sort by safety severity within each group
  const sorted = [...fountains].sort(
    (a, b) => SAFETY_RANK[a.safety_level] - SAFETY_RANK[b.safety_level]
  );
  return `<p class="group-label">${label} (${sorted.length})</p>` +
    sorted.map(fountainRow).join("");
}

function fountainRow(f) {
  const descHTML = f.location_description
    ? `<p class="f-desc">${esc(f.location_description)}</p>` : "";
  const bottleHTML = f.is_bottle_filler ? `<span class="tag bottle">Bottle filler</span>` : "";
  const statusHTML = f.status !== "ON" ? `<span class="tag status">${esc(f.status)}</span>` : "";

  const lastTested = f.tested_2025 ? "Tested in 2025" : (f.latest_result_ppb != null ? "Last tested before 2025" : "Never tested");
  const testedHTML = `<span class="tag tested">${lastTested}</span>`;

  let remediationHTML = "";
  if (f.remediation_plan) {
    const label = f.remediated ? "Remediated" : "Remediation in progress";
    remediationHTML = `<p class="f-remediation ${f.remediated ? 'done' : 'pending'}">${label}: ${esc(f.remediation_plan)}</p>`;
  }

  const historyHTML = f.ever_elevated && f.max_lead_ever_ppb != null
    ? `<p class="f-history">Historical high: ${f.max_lead_ever_ppb} ppb</p>` : "";

  return `
    <div class="fountain-row ${f.safety_level}">
      <div class="f-top">
        <div class="f-left">
          <p class="f-location">${esc(f.location)}</p>
          ${descHTML}
          <div class="tags">${bottleHTML}${statusHTML}${testedHTML}</div>
        </div>
        <span class="safety-badge ${f.safety_level}">${badgeLabel(f.safety_level)}</span>
      </div>
      <p class="rec ${f.safety_level}">${esc(f.recommendation)}</p>
      ${remediationHTML}
      ${historyHTML}
    </div>`;
}

// ---- Back button ----

document.getElementById("back-btn").addEventListener("click", () => {
  document.getElementById("back-btn").classList.add("hidden");
  show("results-screen");
  window.scrollTo(0, 0);
});

// ---- Error ----

function showError(msg) {
  document.getElementById("error-msg").textContent = msg;
  show("error-screen");
}

document.getElementById("error-retry-btn").addEventListener("click", boot);

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
