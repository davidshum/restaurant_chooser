# 🍽️ Family Restaurant Chooser

A small website that helps the family decide where to eat:

- **Weekly rotation.** Each week it's someone else's pick. The rotation moves forward every Monday, and you can skip ahead or switch whose turn it is.
- **Per-person preferences.** Each person has cuisines they love or avoid, dietary needs (vegetarian, vegan, gluten-free), a price range, a max distance and a minimum rating.
- **Recommendations.** Searches **Yelp** and **Google Places** together, merges duplicate listings and ranks the results for the chooser's tastes or the whole family's. Every result lists the reasons behind its rank ("Kid loves tacos", "You went here 6 days ago").
- **Summary page.** For each restaurant: photos, Yelp and Google ratings, a wait-time panel that refreshes every 2 minutes, and buttons for **Reserve** (Yelp Reservations, OpenTable, Reserve with Google, call), **Order online** (restaurant site, Yelp, DoorDash, Uber Eats, Grubhub), **Menu**, **Directions** and **Call**.
- **History.** Tap "We're going here!" to log a visit. Places you've been in the last 4 weeks rank lower so you get variety.
- Works on phones. There are no dependencies and no build step: just Node.

## Quick start

```bash
cp .env.example .env     # add your API keys (optional: no keys = demo mode)
npm start                # http://localhost:3000
npm test                 # unit tests
```

Requires Node 20.12 or newer. With no keys, the app runs in **demo mode** with made-up restaurants so you can try everything.

## Getting API keys

| Source | What it provides | How to get a key |
|---|---|---|
| **Yelp Fusion** (`YELP_API_KEY`) | Search, ratings, categories, photos, price, menu URL (when available), delivery/pickup/reservation support | [yelp.com/developers](https://www.yelp.com/developers/v3/manage_app). Yelp now charges for Fusion after a free trial. |
| **Google Places API (New)** (`GOOGLE_PLACES_API_KEY`) | Ratings, open now, hours, website, phone, whether it takes reservations, takeout/delivery flags, vegetarian options, photos | Google Cloud Console: enable **Places API (New)** and create a key. Restrict the key to that API. |
| **BestTime.app** (`BESTTIME_API_KEY_PRIVATE`, optional) | **Live** foot traffic, used for live wait times | [besttime.app](https://besttime.app). Paid, with credits. |

You can use Yelp only, Google only, or both. Both gives the best results, because ratings are combined and each source fills the other's gaps.

**Cost:** each search makes 1 Yelp call and up to 3 Google Text Search calls, and opening a restaurant makes 1 details call to each. The Google fields used (reservable, takeout, vegetarian options and so on) are billed at the *Enterprise + Atmosphere* tier, so set a budget alert in Google Cloud.

## What the APIs can and can't do

- **Live wait times.** Yelp, Google and OpenTable don't publish wait times through any public API. Google's "Live busyness" shows in Maps but isn't in the Places API. Without BestTime, the app shows an **estimated** wait based on time of day, day of week, popularity and price, and labels it as an estimate. With a BestTime key it shows **live** busyness where BestTime has data and falls back to the estimate otherwise.
- **OpenTable.** OpenTable's API is only for approved partners. The Reserve button opens OpenTable already searched for the restaurant, party size and tonight at 7pm, so it's one tap to pick a time. If the restaurant takes reservations through Yelp, Yelp is offered first.
- **Menus.** Neither Places API returns menu items. The Menu button opens Yelp's menu URL when Yelp has one, then falls back to Yelp's menu page, the Google Maps listing (which shows menus) and the restaurant's website.
- **Online ordering.** There's no universal ordering API. The app links to the restaurant's own site when Google says it offers takeout or delivery, to Yelp when Yelp lists delivery or pickup, and otherwise to DoorDash, Uber Eats and Grubhub already searched for the restaurant.

## Hosting it for the family

Family data (people, preferences, rotation, history) is stored on the server in `data/family.json`, so everyone sees the same thing. Any host that runs Node and keeps a persistent disk works, such as Render, Railway, Fly.io or a home server or Raspberry Pi. Set the API keys as environment variables on the host. Set `DATA_FILE` to put the data file somewhere else.

There's no login. Anyone with the URL can edit the family settings, so keep the URL private or put the app behind your host's basic auth.

## Project layout

```
server.js            HTTP server + JSON API (no framework)
lib/yelp.js          Yelp Fusion client
lib/google.js        Google Places (New) client + photo proxy (keeps the key server-side)
lib/besttime.js      Optional live busyness
lib/merge.js         De-duplicates Yelp/Google listings, combines ratings
lib/score.js         Ranks restaurants against each person's preferences
lib/wait.js          Wait-time estimate / live mapping
lib/links.js         Reserve / order / menu / directions links
lib/store.js         Family, rotation and history (JSON file)
lib/demo.js          Fictional restaurants for demo mode
public/              Front end (vanilla JS single-page app)
test/                node:test unit tests
```
