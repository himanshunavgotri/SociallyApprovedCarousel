/**
 * Socially Approved Carousel — Backend
 * Endpoints:
 *   GET  /videos          -> list of video metadata
 *   POST /like            -> { videoId, userId } toggles a like, returns updated count
 *   POST /share           -> { videoId, platform } records a share, returns updated count
 *   POST /comment         -> { videoId, user, text } adds a comment (bonus, optional per spec)
 *
 * Data is stored in-memory (seeded from data/videos.json) and persisted back to
 * that file on change so a restart doesn't wipe your testing data.
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;
const DATA_FILE = path.join(__dirname, "data", "videos.json");

app.use(cors());
app.use(express.json());

// ---- In-memory store, seeded from disk ------------------------------------
let videos = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));

// Track which userId has liked which videoId so likes can be toggled
// (in-memory only — a real app would put this in a DB table, not the JSON file)
const likesByUser = new Map(); // videoId -> Set(userId)
videos.forEach((v) => likesByUser.set(v.id, new Set()));

function persist() {
  fs.writeFile(DATA_FILE, JSON.stringify(videos, null, 2), (err) => {
    if (err) console.error("Failed to persist videos.json:", err.message);
  });
}

function findVideo(videoId) {
  return videos.find((v) => v.id === videoId);
}

// ---- Routes -----------------------------------------------------------------

app.get("/videos", (req, res) => {
  res.json(videos);
});

app.post("/like", (req, res) => {
  const { videoId, userId } = req.body || {};
  if (!videoId || !userId) {
    return res.status(400).json({ error: "videoId and userId are required" });
  }

  const video = findVideo(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });

  const likedSet = likesByUser.get(videoId);
  let liked;
  if (likedSet.has(userId)) {
    likedSet.delete(userId);
    video.likes = Math.max(0, video.likes - 1);
    liked = false;
  } else {
    likedSet.add(userId);
    video.likes += 1;
    liked = true;
  }

  persist();
  res.json({ videoId, likes: video.likes, liked });
});

app.post("/share", (req, res) => {
  const { videoId, platform } = req.body || {};
  if (!videoId) return res.status(400).json({ error: "videoId is required" });

  const video = findVideo(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });

  video.shares += 1;
  persist();
  console.log(`[share] video=${videoId} platform=${platform || "unknown"}`);
  res.json({ videoId, shares: video.shares });
});

app.post("/comment", (req, res) => {
  const { videoId, user, text } = req.body || {};
  if (!videoId || !text) {
    return res.status(400).json({ error: "videoId and text are required" });
  }

  const video = findVideo(videoId);
  if (!video) return res.status(404).json({ error: "video not found" });

  const comment = { user: user || "anonymous", text };
  video.comments.push(comment);
  persist();
  res.json({ videoId, comments: video.comments });
});

app.listen(PORT, () => {
  console.log(`Socially Approved Carousel API running on http://localhost:${PORT}`);
});
