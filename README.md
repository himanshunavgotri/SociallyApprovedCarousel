# Socially Approved Carousel

Implementation of the assignment: an outer thumbnail slider that opens an
inner modal carousel (3-up, swipeable) with lazy-loaded video players, like
comment and share actions backed by a small Express API.

## Structure

```
socially-approved-carousel/
├── backend/
│   ├── server.js          # Express API: /videos, /like, /share, /comment
│   ├── data/videos.json   # dummy dataset (seed + persisted likes/shares)
│   └── package.json
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js              # all carousel logic, vanilla JS (no build step)
```

## Running it

**1. Start the backend**

```bash
cd backend
npm install
npm start
```

This serves the API on `http://localhost:4000`.
- `GET /videos` → returns the dummy video list (title, url, likes, shares, comments)
- `POST /like` `{ videoId, userId }` → toggles a like, returns `{ likes, liked }`
- `POST /share` `{ videoId, platform }` → increments share count
- `POST /comment` `{ videoId, user, text }` → appends a comment

**2. Open the frontend**

No build step — just open `frontend/index.html` in a browser, or serve it
statically, e.g.:

```bash
cd frontend
npx serve .
```

`app.js` points at `API_BASE = "http://localhost:4000"` — change that
constant if you deploy the backend elsewhere.

## How it maps to the spec

**Outer slider** — `outer-slider` in `app.js`/`style.css`. All 30-40
thumbnail elements exist in the DOM immediately, but each `<video>` starts
with `preload="none"` and no `src`. An `IntersectionObserver` on the strip
assigns `src` (lazy load, fetching just a frame + basic file info) as a
thumbnail scrolls near view, and removes it again once the thumbnail
scrolls back out — so the DOM can hold the full 30-40 item list without
30-40 open network requests at once. Supports mouse-drag scrolling and
prev/next buttons.

**Inner slider (modal)** — opens on thumbnail click, shows 3 slides at a
time (`flex: 0 0 33.333%`), navigated by buttons, arrow keys, or touch
swipe. `currentIndex` always renders centered.

**Lazy loading + performant DOM budget** — each slide's `<video>` starts
with `preload="none"` and no `src`; a shared `IntersectionObserver` on the
inner track:
  - assigns `src` (lazy load) and calls `.play()` once a slide crosses 60%
    visibility,
  - pauses videos as soon as they scroll out of view.

Separately, `refreshActiveWindow()` runs on every navigation, sorts every
slide by distance from `currentIndex`, and keeps `src` assigned only on the
nearest `MAX_ACTIVE_VIDEOS` (10) — every other slide's video is unloaded
(`removeAttribute('src')`). This is a hard cap, not just an approximate
window, so no more than 10 `<video>` elements ever hold real media at once,
even though all 30-40 slides exist in the DOM for swiping.

**Controls per video** — play/pause, mute/unmute, click-to-seek progress
bar synced via the `timeupdate` event, and a spinner toggled by the
`waiting`/`canplay` events.

**Like / Comment / Share** — optimistic UI update immediately, then a
`fetch` call to the matching backend route; like state is remembered per
browser via `localStorage` + a generated anonymous `userId` so the toggle
(like/unlike) is consistent across reloads. Share uses the native
`navigator.share` sheet when available, falling back to copy-link.

## Notes / things to swap for production

- The dummy dataset uses public sample MP4s (MDN + Google's GTV sample
  bucket) — swap `backend/data/videos.json` for real content/CDN URLs.
- Likes/shares/comments persist to the JSON file on disk for this demo;
  swap `persist()` in `server.js` for a real database.
- `likesByUser` (used to allow toggling a like) is in-memory only and
  resets on server restart — move it to the DB alongside the video rows
  for a real deployment.
