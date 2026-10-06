"use strict";

// ---------- Supabase config ----------
// The publishable key is meant to be public: it only allows what Supabase Auth
// and row-level security permit. Never put a secret/service_role key here.
const SUPABASE_URL = "https://ygrlzdgzxpxvzrtkmdus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NIoj5zRGb5PQ7eB63hAKtg_bgYs3amw";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const authEl = (id) => document.getElementById(id);
let appStarted = false;
let signedInUserId = null;

// After sign-in: load the profile, ask new users to create one, then show the app.
async function showSignedIn(user) {
  if (signedInUserId === user.id) return; // ignore token refreshes
  signedInUserId = user.id;
  authEl("user-menu").hidden = false;
  authEl("profile-btn").hidden = true; // shown once the profile exists
  Profiles.showScreen("loading-screen");
  try {
    const profile = await Profiles.load(sb, user);
    if (Profiles.isComplete(profile)) enterApp(profile);
    else Profiles.open("setup", enterApp);
  } catch (err) {
    console.error(err);
    signedInUserId = null;
    authEl("loading-screen").querySelector("p").textContent =
      "Couldn't load your profile. Refresh the page to try again.";
  }
}

function enterApp(profile) {
  Profiles.showScreen("app");
  authEl("profile-btn").hidden = false;
  authEl("user-name").textContent = profile.display_name;
  if (!appStarted) {
    appStarted = true;
    window.OwlWeather.start(profile);
  }
}

function showSignedOut() {
  signedInUserId = null;
  window.OwlWeather.onPreferenceChange = null;
  authEl("user-menu").hidden = true;
  Profiles.showScreen("auth-screen");
  if (appStarted) {
    // Reload so no weather state or timers carry over to the next user.
    window.location.replace(window.location.pathname);
  }
}

function setAuthMessage(text, kind = "info") {
  const el = authEl("auth-message");
  el.hidden = !text;
  el.textContent = text || "";
  el.className = `auth-message ${kind}`;
}

// Supabase puts errors from expired or reused links in the URL hash.
function readLinkError() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const description = hash.get("error_description");
  if (!description) return;
  setAuthMessage(`${description.replace(/\+/g, " ")}. Request a new link below.`, "error");
  history.replaceState(null, "", window.location.pathname);
}

async function sendMagicLink(event) {
  event.preventDefault();
  const email = authEl("auth-email").value.trim();
  const button = authEl("auth-submit");
  if (!email) return;

  button.disabled = true;
  button.textContent = "Sending…";
  setAuthMessage("");

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });

  button.disabled = false;
  button.textContent = "Email me a sign-in link";

  if (error) {
    const msg = error.status === 429
      ? "Too many sign-in emails were requested. Wait a minute and try again."
      : `Couldn't send the link: ${error.message}`;
    setAuthMessage(msg, "error");
    return;
  }
  setAuthMessage(`Check your inbox at ${email} and click the link to sign in. You can close this tab.`, "success");
}

async function signOut() {
  await sb.auth.signOut();
}

function initAuth() {
  readLinkError();
  authEl("auth-form").addEventListener("submit", sendMagicLink);
  authEl("signout-btn").addEventListener("click", signOut);
  authEl("profile-btn").addEventListener("click", () => Profiles.open("edit", enterApp));

  // Fires once on load with the stored session (or the one from a magic link),
  // then again on every sign-in or sign-out, including in other tabs.
  // Supabase calls made inside this callback can deadlock, so defer the work.
  sb.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (session?.user) {
        // Drop the leftover "#" from the magic-link redirect.
        if (window.location.href.includes("#")) {
          history.replaceState(null, "", window.location.pathname);
        }
        showSignedIn(session.user);
      } else {
        showSignedOut();
      }
    }, 0);
  });
}

initAuth();
