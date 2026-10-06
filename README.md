# ISM6427c – Owl Weather 🦉

A responsive weather app with live data from the free [Open-Meteo API](https://open-meteo.com/) (no API key needed). It defaults to **Boca Raton, FL (FAU)** and greets Latrell when the site loads.

## Features
- Live current conditions: temperature, feels like, humidity, wind and gusts, UV, rain chance, pressure, sunrise and sunset
- Hourly forecast for the next 24 hours and a 7-day forecast
- City search (Open-Meteo geocoding), "My location" (browser geolocation), and a Boca home button
- °F / °C toggle
- **Light, Dark, and System** themes (your choice is remembered)
- Responsive layout for phones, tablets, and desktops
- Refreshes automatically every 10 minutes and when you return to the tab
- A time-of-day greeting for Latrell
- **Email login** (passwordless magic link) through Supabase Auth

## Files
| File | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `styles.css` | Themes and responsive layout |
| `app.js` | Open-Meteo calls, rendering, search, theme and unit handling |
| `auth.js` | Supabase email login: sends the magic link, shows the app when signed in, sign out |
| `vendor/supabase.js` | Supabase JS client v2.117.2 (served from this site, no CDN) |
| `theme-init.js` | Applies the saved theme before the page paints |
| `netlify.toml` | Netlify config (no build step) and security headers |

## Email login (Supabase)
The app is locked behind a sign-in screen. You type your email, Supabase emails you a link, and clicking it signs you in. There's no password, and the session stays until you click **Sign out**.

- Supabase project: `ISM6427c` (`https://ygrlzdgzxpxvzrtkmdus.supabase.co`)
- The publishable key in `auth.js` is safe to be public. Never put the `service_role`/secret key in this repo.
- **One-time setup in Supabase:** Authentication → URL Configuration → set **Site URL** to `https://ism6427-c.netlify.app` and add `http://localhost:8080/**` under **Redirect URLs** for local testing. Without this, the email link sends you to `localhost:3000`.
- Supabase's built-in email sender only delivers to members of your Supabase organization, and only a few emails per hour. To let anyone sign in, add your own SMTP provider under Authentication → Emails → SMTP Settings.

## Run locally
There's no build step. Serve the folder with any static server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy to Netlify
1. In Netlify, choose **Add new site → Import an existing project** and pick this GitHub repo.
2. Branch: `main`. Leave the build command empty. Publish directory: `.` (already set in `netlify.toml`).
3. Click **Deploy**. New pushes to `main` redeploy automatically.

You can also drag and drop the project folder onto https://app.netlify.com/drop.

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
