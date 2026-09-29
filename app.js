"use strict";

// ---------- Config ----------
const USER_NAME = "Latrell";
const DEFAULT_LOCATION = {
  name: "Boca Raton",
  sub: "Florida Atlantic University · Florida, US",
  latitude: 26.3705,
  longitude: -80.1024,
};
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const REFRESH_MS = 10 * 60 * 1000; // refresh live data every 10 minutes

// WMO weather codes -> [description, day icon, night icon]
const WEATHER_CODES = {
  0: ["Clear sky", "☀️", "🌙"],
  1: ["Mainly clear", "🌤️", "🌙"],
  2: ["Partly cloudy", "⛅", "☁️"],
  3: ["Overcast", "☁️", "☁️"],
  45: ["Fog", "🌫️", "🌫️"],
  48: ["Freezing fog", "🌫️", "🌫️"],
  51: ["Light drizzle", "🌦️", "🌧️"],
  53: ["Drizzle", "🌦️", "🌧️"],
  55: ["Heavy drizzle", "🌧️", "🌧️"],
  56: ["Freezing drizzle", "🌧️", "🌧️"],
  57: ["Heavy freezing drizzle", "🌧️", "🌧️"],
  61: ["Light rain", "🌦️", "🌧️"],
  63: ["Rain", "🌧️", "🌧️"],
  65: ["Heavy rain", "🌧️", "🌧️"],
  66: ["Freezing rain", "🌧️", "🌧️"],
  67: ["Heavy freezing rain", "🌧️", "🌧️"],
  71: ["Light snow", "🌨️", "🌨️"],
  73: ["Snow", "🌨️", "🌨️"],
  75: ["Heavy snow", "❄️", "❄️"],
  77: ["Snow grains", "🌨️", "🌨️"],
  80: ["Light showers", "🌦️", "🌧️"],
  81: ["Showers", "🌧️", "🌧️"],
  82: ["Violent showers", "⛈️", "⛈️"],
  85: ["Snow showers", "🌨️", "🌨️"],
  86: ["Heavy snow showers", "❄️", "❄️"],
  95: ["Thunderstorm", "⛈️", "⛈️"],
  96: ["Thunderstorm with hail", "⛈️", "⛈️"],
  99: ["Severe thunderstorm with hail", "⛈️", "⛈️"],
};

// ---------- State ----------
const state = {
  location: DEFAULT_LOCATION,
  unit: readStorage("unit") === "celsius" ? "celsius" : "fahrenheit",
  lastData: null,
  refreshTimer: null,
  searchTimer: null,
  searchResults: [],
  activeIndex: -1,
};

const $ = (id) => document.getElementById(id);

// ---------- Storage helpers (never throw) ----------
function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

// ---------- Greeting ----------
function renderGreeting() {
  const hour = new Date().getHours();
  let part = "evening";
  let emoji = "🌙";
  if (hour >= 5 && hour < 12) { part = "morning"; emoji = "☀️"; }
  else if (hour >= 12 && hour < 17) { part = "afternoon"; emoji = "🌤️"; }
  $("greeting").textContent = `Good ${part}, ${USER_NAME}! ${emoji}`;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  $("greeting-sub").textContent = `Welcome back. Here's your weather for ${today}.`;
}

// ---------- Theme ----------
// "system" removes data-theme so the CSS prefers-color-scheme query takes over.
function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") {
    root.setAttribute("data-theme", choice);
    writeStorage("theme", choice);
  } else {
    choice = "system";
    root.removeAttribute("data-theme");
    writeStorage("theme", null);
  }
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.setAttribute("aria-checked", String(btn.dataset.themeChoice === choice));
  });
}

// ---------- Units ----------
function applyUnit(unit) {
  state.unit = unit;
  writeStorage("unit", unit);
  document.querySelectorAll("[data-unit]").forEach((btn) => {
    btn.setAttribute("aria-checked", String(btn.dataset.unit === unit));
  });
}

// ---------- Formatting ----------
const isMetric = () => state.unit === "celsius";
const fmtTemp = (v) => (v == null ? "--" : `${Math.round(v)}°`);
const fmtWind = (v) => (v == null ? "--" : `${Math.round(v)} ${isMetric() ? "km/h" : "mph"}`);
const fmtPressure = (hpa) => {
  if (hpa == null) return "--";
  return isMetric() ? `${Math.round(hpa)} hPa` : `${(hpa * 0.02953).toFixed(2)} inHg`;
};
function compass(deg) {
  if (deg == null) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}
function uvLabel(uv) {
  if (uv == null) return "--";
  const n = Math.round(uv);
  const level = n <= 2 ? "Low" : n <= 5 ? "Moderate" : n <= 7 ? "High" : n <= 10 ? "Very high" : "Extreme";
  return `${n} · ${level}`;
}
function weatherInfo(code, isDay = true) {
  const entry = WEATHER_CODES[code] || ["Unknown", "🌡️", "🌡️"];
  return { text: entry[0], icon: isDay ? entry[1] : entry[2] };
}

// Open-Meteo returns local times like "2026-09-29T14:00" (timezone=auto).
// Parse the parts ourselves so the location's local time is shown, not the browser's.
function parseLocal(iso) {
  const [date, time = "00:00"] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return { y, m, d, hh, mm };
}
function fmtClock({ hh, mm }) {
  const suffix = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}
function fmtHour({ hh }) {
  const suffix = hh >= 12 ? "PM" : "AM";
  return `${hh % 12 || 12} ${suffix}`;
}
function dayName(iso, index) {
  if (index === 0) return "Today";
  const { y, m, d } = parseLocal(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

// ---------- Status ----------
function setStatus(message, isError = false) {
  const el = $("status");
  if (!message) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("error", isError);
}

// ---------- Data ----------
async function fetchWeather(loc) {
  const params = new URLSearchParams({
    latitude: loc.latitude,
    longitude: loc.longitude,
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
      "precipitation", "weather_code", "pressure_msl", "wind_speed_10m",
      "wind_direction_10m", "wind_gusts_10m", "uv_index",
    ].join(","),
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
    temperature_unit: state.unit,
    wind_speed_unit: isMetric() ? "kmh" : "mph",
    precipitation_unit: isMetric() ? "mm" : "inch",
    timezone: "auto",
    forecast_days: "7",
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`Weather service responded with ${res.status}`);
  return res.json();
}

async function loadWeather({ quiet = false } = {}) {
  if (!quiet) setStatus("Loading live weather…");
  try {
    const data = await fetchWeather(state.location);
    state.lastData = data;
    render(data);
    setStatus(null);
  } catch (err) {
    console.error(err);
    setStatus("Couldn't load the weather right now. Check your connection and try again.", true);
  }
  scheduleRefresh();
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => loadWeather({ quiet: true }), REFRESH_MS);
}

// ---------- Rendering ----------
function render(data) {
  const { current, hourly, daily } = data;
  const loc = state.location;
  const info = weatherInfo(current.weather_code, current.is_day === 1);

  $("place-name").textContent = loc.name;
  $("place-sub").textContent = loc.sub || "";
  $("current-icon").textContent = info.icon;
  $("current-temp").textContent = fmtTemp(current.temperature_2m);
  $("current-desc").textContent = info.text;
  $("current-hilo").textContent =
    `H: ${fmtTemp(daily.temperature_2m_max[0])}  ·  L: ${fmtTemp(daily.temperature_2m_min[0])}`;

  $("stat-feels").textContent = fmtTemp(current.apparent_temperature);
  $("stat-humidity").textContent = `${Math.round(current.relative_humidity_2m)}%`;
  $("stat-wind").textContent = `${fmtWind(current.wind_speed_10m)} ${compass(current.wind_direction_10m)}`.trim();
  $("stat-gusts").textContent = fmtWind(current.wind_gusts_10m);
  $("stat-uv").textContent = uvLabel(current.uv_index ?? daily.uv_index_max[0]);
  $("stat-rain").textContent =
    daily.precipitation_probability_max[0] == null ? "--" : `${daily.precipitation_probability_max[0]}%`;
  $("stat-pressure").textContent = fmtPressure(current.pressure_msl);
  $("stat-sun").textContent =
    `${fmtClock(parseLocal(daily.sunrise[0]))} / ${fmtClock(parseLocal(daily.sunset[0]))}`;

  const localNow = parseLocal(current.time);
  $("updated").textContent =
    `Live data · local time ${fmtClock(localNow)} (${data.timezone_abbreviation || data.timezone}) · ` +
    `last checked ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  renderHourly(hourly, current.time);
  renderDaily(daily);
}

function renderHourly(hourly, currentTime) {
  const container = $("hourly");
  container.replaceChildren();
  const currentHour = currentTime.slice(0, 13); // "YYYY-MM-DDTHH"
  let start = hourly.time.findIndex((t) => t.slice(0, 13) >= currentHour);
  if (start < 0) start = 0;

  hourly.time.slice(start, start + 24).forEach((t, i) => {
    const idx = start + i;
    const info = weatherInfo(hourly.weather_code[idx], hourly.is_day[idx] === 1);
    const rain = hourly.precipitation_probability[idx];

    const el = document.createElement("div");
    el.className = "hour";
    el.append(
      makeEl("div", "t", i === 0 ? "Now" : fmtHour(parseLocal(t))),
      makeEl("div", "i", info.icon, info.text),
      makeEl("div", "v", fmtTemp(hourly.temperature_2m[idx])),
      makeEl("div", "p", rain ? `💧${rain}%` : "")
    );
    container.append(el);
  });
}

function renderDaily(daily) {
  const list = $("daily");
  list.replaceChildren();
  const weekMin = Math.min(...daily.temperature_2m_min);
  const weekMax = Math.max(...daily.temperature_2m_max);
  const span = Math.max(weekMax - weekMin, 1);

  daily.time.forEach((t, i) => {
    const info = weatherInfo(daily.weather_code[i], true);
    const lo = daily.temperature_2m_min[i];
    const hi = daily.temperature_2m_max[i];
    const rain = daily.precipitation_probability_max[i];

    const li = document.createElement("li");
    li.className = "day";

    const range = makeEl("div", "range");
    const bar = makeEl("div", "bar");
    const fill = document.createElement("span");
    fill.style.left = `${((lo - weekMin) / span) * 100}%`;
    fill.style.width = `${Math.max(((hi - lo) / span) * 100, 4)}%`;
    bar.append(fill);
    range.append(makeEl("span", "lo", fmtTemp(lo)), bar, makeEl("span", "hi", fmtTemp(hi)));

    li.append(
      makeEl("span", "name", dayName(t, i)),
      makeEl("span", "icon", info.icon, info.text),
      makeEl("span", "rain", rain ? `💧${rain}%` : ""),
      range
    );
    list.append(li);
  });
}

function makeEl(tag, className, text, title) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  if (title) { el.title = title; el.setAttribute("aria-label", title); el.setAttribute("role", "img"); }
  return el;
}

// ---------- Search ----------
async function searchCities(query) {
  const params = new URLSearchParams({ name: query, count: "6", language: "en", format: "json" });
  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`Geocoding responded with ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

function showResults(results) {
  const list = $("search-results");
  const input = $("search-input");
  state.searchResults = results;
  state.activeIndex = -1;
  list.replaceChildren();

  if (!results.length) {
    const li = makeEl("li", null, "No matching places found");
    li.setAttribute("aria-disabled", "true");
    list.append(li);
  }
  results.forEach((r, i) => {
    const li = document.createElement("li");
    li.id = `result-${i}`;
    li.setAttribute("role", "option");
    li.append(document.createTextNode(r.name));
    li.append(makeEl("span", "sub", [r.admin1, r.country].filter(Boolean).join(", ")));
    li.addEventListener("mousedown", (e) => { e.preventDefault(); chooseResult(i); });
    list.append(li);
  });
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function hideResults() {
  $("search-results").hidden = true;
  $("search-input").setAttribute("aria-expanded", "false");
  state.activeIndex = -1;
}

function highlight(index) {
  const items = $("search-results").querySelectorAll("[role=option]");
  items.forEach((el, i) => el.setAttribute("aria-selected", String(i === index)));
  state.activeIndex = index;
  if (items[index]) items[index].scrollIntoView({ block: "nearest" });
}

function chooseResult(i) {
  const r = state.searchResults[i];
  if (!r) return;
  setLocation({
    name: r.name,
    sub: [r.admin1, r.country].filter(Boolean).join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
  });
  $("search-input").value = "";
  hideResults();
}

function setLocation(loc) {
  state.location = loc;
  loadWeather();
}

function initSearch() {
  const input = $("search-input");
  const form = $("search-form");

  input.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { hideResults(); return; }
    state.searchTimer = setTimeout(async () => {
      try {
        const results = await searchCities(q);
        if (input.value.trim() === q) showResults(results);
      } catch (err) {
        console.error(err);
        setStatus("City search is unavailable right now.", true);
      }
    }, 300);
  });

  input.addEventListener("keydown", (e) => {
    const count = state.searchResults.length;
    if ($("search-results").hidden || !count) return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlight((state.activeIndex + 1) % count); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight((state.activeIndex - 1 + count) % count); }
    else if (e.key === "Escape") { hideResults(); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.activeIndex >= 0) { chooseResult(state.activeIndex); return; }
    const q = input.value.trim();
    if (q.length < 2) return;
    try {
      const results = await searchCities(q);
      state.searchResults = results;
      if (results.length) chooseResult(0);
      else showResults(results);
    } catch (err) {
      console.error(err);
      setStatus("City search is unavailable right now.", true);
    }
  });

  input.addEventListener("blur", () => setTimeout(hideResults, 100));
}

// ---------- Geolocation ----------
function useMyLocation() {
  if (!("geolocation" in navigator)) {
    setStatus("Your browser doesn't support location access.", true);
    return;
  }
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLocation({
        name: "My location",
        sub: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    },
    () => setStatus("Location permission was denied. Showing the last location instead.", true),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
  );
}

// ---------- Init ----------
function init() {
  renderGreeting();
  setInterval(renderGreeting, 60 * 1000);

  applyTheme(readStorage("theme") || "system");
  document.querySelectorAll("[data-theme-choice]").forEach((btn) =>
    btn.addEventListener("click", () => applyTheme(btn.dataset.themeChoice))
  );

  applyUnit(state.unit);
  document.querySelectorAll("[data-unit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.unit === state.unit) return;
      applyUnit(btn.dataset.unit);
      loadWeather();
    })
  );

  initSearch();
  $("locate-btn").addEventListener("click", useMyLocation);
  $("home-btn").addEventListener("click", () => setLocation(DEFAULT_LOCATION));

  // Refresh when the tab comes back into view so data stays current.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadWeather({ quiet: true });
  });

  loadWeather();
}

init();
