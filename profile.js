"use strict";

// User profiles, stored in the Supabase "profiles" table (one row per user).
// Row-level security in the database makes sure each user can only read and
// change their own row, so the browser never sees anyone else's profile.
const Profiles = (() => {
  const COLUMNS =
    "id, display_name, home_name, home_label, home_latitude, home_longitude, temperature_unit, theme";
  const SCREENS = ["auth-screen", "loading-screen", "profile-screen", "app"];
  const el = (id) => document.getElementById(id);

  let sb = null;
  let user = null;
  let profile = null;
  let onDone = null;
  let pendingHome = null;
  let cityResults = [];
  let searchTimer = null;

  function showScreen(id) {
    SCREENS.forEach((s) => { el(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  function isComplete(p) {
    return Boolean(p && p.display_name && p.display_name.trim());
  }

  // Loads the signed-in user's profile, creating an empty one if it's missing.
  async function load(client, signedInUser) {
    sb = client;
    user = signedInUser;
    let { data, error } = await sb.from("profiles").select(COLUMNS).eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      ({ data, error } = await sb.from("profiles").insert({ id: user.id }).select(COLUMNS).single());
      if (error) throw error;
    }
    profile = data;
    window.OwlWeather.onPreferenceChange = savePreference;
    return profile;
  }

  // Header °F/°C and theme toggles save straight to the profile.
  async function savePreference(field, value) {
    if (!profile || profile[field] === value) return;
    profile = { ...profile, [field]: value };
    const { error } = await sb.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) console.error("Couldn't save preference", error);
  }

  // ---------- Form ----------
  function setMessage(text, kind = "info") {
    const m = el("profile-message");
    m.hidden = !text;
    m.textContent = text || "";
    m.className = `auth-message ${kind}`;
  }

  function setRadio(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((r) => { r.checked = r.value === value; });
  }
  function getRadio(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value;
  }

  function showHome(home) {
    el("profile-city-current").textContent =
      `Home: ${home.name}${home.sub ? ` · ${home.sub}` : ""}`;
  }

  // mode: "setup" (first sign-in, can't skip) or "edit" (from the header button).
  function open(mode, done) {
    onDone = done;
    const setup = mode === "setup";
    el("profile-title").textContent = setup ? "Create your profile" : "Your profile";
    el("profile-intro").hidden = !setup;
    el("profile-cancel").hidden = setup;
    el("profile-save").textContent = setup ? "Create profile" : "Save changes";

    el("profile-email").value = user.email || "";
    el("profile-name").value = profile.display_name || "";
    el("profile-city").value = "";
    pendingHome = {
      name: profile.home_name,
      sub: profile.home_label,
      latitude: profile.home_latitude,
      longitude: profile.home_longitude,
    };
    showHome(pendingHome);
    setRadio("profile-unit", profile.temperature_unit);
    setRadio("profile-theme", profile.theme);
    hideCityResults();
    setMessage("");

    showScreen("profile-screen");
    el("profile-name").focus();
  }

  function cancel() {
    // Undo any live theme preview.
    window.OwlWeather.applyProfile(profile);
    onDone?.(profile);
  }

  async function save(event) {
    event.preventDefault();
    const name = el("profile-name").value.trim();
    if (!name) {
      setMessage("Please enter your name.", "error");
      el("profile-name").focus();
      return;
    }

    const button = el("profile-save");
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    setMessage("");

    const changes = {
      display_name: name.slice(0, 50),
      home_name: pendingHome.name.slice(0, 100),
      home_label: (pendingHome.sub || "").slice(0, 150),
      home_latitude: pendingHome.latitude,
      home_longitude: pendingHome.longitude,
      temperature_unit: getRadio("profile-unit") || "fahrenheit",
      theme: getRadio("profile-theme") || "system",
    };
    const { data, error } = await sb.from("profiles").update(changes).eq("id", user.id).select(COLUMNS).single();

    button.disabled = false;
    button.textContent = label;
    if (error) {
      console.error(error);
      setMessage("Couldn't save your profile. Check your connection and try again.", "error");
      return;
    }
    profile = data;
    window.OwlWeather.applyProfile(profile);
    onDone?.(profile);
  }

  // ---------- Home city search ----------
  function hideCityResults() {
    el("profile-city-results").hidden = true;
    el("profile-city").setAttribute("aria-expanded", "false");
  }

  function chooseCity(r) {
    pendingHome = {
      name: r.name,
      sub: [r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
    };
    showHome(pendingHome);
    el("profile-city").value = "";
    hideCityResults();
  }

  function showCityResults(results) {
    cityResults = results;
    const list = el("profile-city-results");
    list.replaceChildren();
    if (!results.length) {
      const li = document.createElement("li");
      li.textContent = "No matching places found";
      li.setAttribute("aria-disabled", "true");
      list.append(li);
    }
    results.forEach((r) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.append(document.createTextNode(r.name));
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = [r.admin1, r.country].filter(Boolean).join(", ");
      li.append(sub);
      li.addEventListener("mousedown", (e) => { e.preventDefault(); chooseCity(r); });
      list.append(li);
    });
    list.hidden = false;
    el("profile-city").setAttribute("aria-expanded", "true");
  }

  async function runCitySearch(q) {
    try {
      const results = await window.OwlWeather.searchCities(q);
      if (el("profile-city").value.trim() === q) showCityResults(results);
      return results;
    } catch (err) {
      console.error(err);
      setMessage("City search is unavailable right now.", "error");
      return [];
    }
  }

  function initForm() {
    el("profile-form").addEventListener("submit", save);
    el("profile-cancel").addEventListener("click", cancel);

    // Preview the theme as soon as it's picked.
    document.querySelectorAll('input[name="profile-theme"]').forEach((r) =>
      r.addEventListener("change", () => {
        if (r.checked) window.OwlWeather.applyProfile({ ...profile, theme: r.value });
      })
    );

    const city = el("profile-city");
    city.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = city.value.trim();
      if (q.length < 2) { hideCityResults(); return; }
      searchTimer = setTimeout(() => runCitySearch(q), 300);
    });
    // Enter in the city box picks the first match instead of submitting the form.
    city.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") { hideCityResults(); return; }
      if (e.key !== "Enter") return;
      e.preventDefault();
      const q = city.value.trim();
      if (q.length < 2) return;
      const results = cityResults.length && !el("profile-city-results").hidden ? cityResults : await runCitySearch(q);
      if (results.length) chooseCity(results[0]);
    });
    city.addEventListener("blur", () => setTimeout(hideCityResults, 100));
  }

  initForm();

  return { showScreen, isComplete, load, open, get current() { return profile; } };
})();
