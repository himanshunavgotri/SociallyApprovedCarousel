/**
 * Socially Approved Carousel — Frontend
 * Talks to the backend at API_BASE for video metadata + like/share/comment actions.
 */

const API_BASE = "http://localhost:4000";

// A lightweight per-browser identity so /like can be toggled per user.
function getUserId() {
  let id = localStorage.getItem("sac_user_id");
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("sac_user_id", id);
  }
  return id;
}
const USER_ID = getUserId();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let videos = [];          // full list from backend
let currentIndex = 0;     // active slide index inside the modal
let likedIds = new Set(JSON.parse(localStorage.getItem("sac_liked") || "[]"));

const outerTrack = document.getElementById("outerTrack");
const outerSlider = document.getElementById("outerSlider");
const modal = document.getElementById("modal");
const innerTrack = document.getElementById("innerTrack");
const innerSlider = document.getElementById("innerSlider");

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
init();

async function init() {
  videos = await fetchVideos();
  renderOuterSlider();
  wireOuterDrag();
  wireOuterNav();
  wireModalChrome();
  wireInnerNav();
  wireInnerSwipe();
}

async function fetchVideos() {
  try {
    const res = await fetch(`${API_BASE}/videos`);
    if (!res.ok) throw new Error("Bad response");
    return await res.json();
  } catch (err) {
    console.error("Failed to load videos from backend:", err);
    outerTrack.innerHTML = `<p style="color:#9a9aa5;padding:20px;">
      Couldn't reach the backend at ${API_BASE}. Run <code>npm start</code> inside /backend.
    </p>`;
    return [];
  }
}

// ---------------------------------------------------------------------------
// OUTER SLIDER (30-40 thumbnails live in the DOM, but only nearby ones are
// ever given a real <video src>. IntersectionObserver lazy-loads metadata
// as thumbnails scroll into view and releases it again once they scroll
// back out, so 30-40 items in the DOM never means 30-40 open connections.)
// ---------------------------------------------------------------------------
let outerObserver = null;

function renderOuterSlider() {
  outerTrack.innerHTML = "";
  videos.forEach((video, index) => {
    const item = document.createElement("div");
    item.className = "outer-item";
    item.dataset.index = index;
    item.innerHTML = `
      <video data-src="${video.url}#t=0.5" preload="none" muted playsinline></video>
      <div class="outer-item__play">&#9654;</div>
      <div class="outer-item__overlay">
        <p class="outer-item__title">${escapeHtml(video.title)}</p>
        <p class="outer-item__author">${escapeHtml(video.author)}</p>
      </div>
    `;
    item.addEventListener("click", () => openModal(index));
    outerTrack.appendChild(item);
  });

  if (outerObserver) outerObserver.disconnect();
  outerObserver = new IntersectionObserver(handleOuterIntersection, {
    root: outerSlider,
    rootMargin: "200px", // start loading a little before it's on screen
    threshold: 0.01,
  });
  outerTrack.querySelectorAll(".outer-item").forEach((el) => outerObserver.observe(el));
}

function handleOuterIntersection(entries) {
  entries.forEach((entry) => {
    const videoEl = entry.target.querySelector("video");
    if (!videoEl) return;
    if (entry.isIntersecting) {
      if (!videoEl.src) videoEl.src = videoEl.dataset.src;
    } else if (videoEl.src) {
      // Scrolled far away — release the metadata fetch/decoded frame.
      videoEl.removeAttribute("src");
      videoEl.load();
    }
  });
}

function wireOuterDrag() {
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  outerSlider.addEventListener("mousedown", (e) => {
    isDown = true;
    outerSlider.classList.add("dragging");
    startX = e.pageX - outerSlider.offsetLeft;
    scrollLeft = outerSlider.scrollLeft;
  });
  ["mouseleave", "mouseup"].forEach((evt) =>
    outerSlider.addEventListener(evt, () => {
      isDown = false;
      outerSlider.classList.remove("dragging");
    })
  );
  outerSlider.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - outerSlider.offsetLeft;
    outerSlider.scrollLeft = scrollLeft - (x - startX) * 1.2;
  });
}

function wireOuterNav() {
  document.getElementById("outerPrev").addEventListener("click", () => {
    outerSlider.scrollBy({ left: -320, behavior: "smooth" });
  });
  document.getElementById("outerNext").addEventListener("click", () => {
    outerSlider.scrollBy({ left: 320, behavior: "smooth" });
  });
}

// ---------------------------------------------------------------------------
// MODAL / INNER SLIDER (3 visible at a time, lazy-loaded full players)
// ---------------------------------------------------------------------------
let innerObserver = null;

function openModal(index) {
  currentIndex = index;
  buildInnerSlides();
  modal.classList.remove("hidden");
  updateInnerPosition(false);
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  // Pause + release every player so nothing keeps playing off-screen
  innerTrack.querySelectorAll("video").forEach((v) => {
    v.pause();
    v.removeAttribute("src");
    v.load();
  });
  if (innerObserver) innerObserver.disconnect();
}

function wireModalChrome() {
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowRight") goTo(currentIndex + 1);
    if (e.key === "ArrowLeft") goTo(currentIndex - 1);
  });
}

function wireInnerNav() {
  document.getElementById("innerPrev").addEventListener("click", () => goTo(currentIndex - 1));
  document.getElementById("innerNext").addEventListener("click", () => goTo(currentIndex + 1));
}

function wireInnerSwipe() {
  let startX = 0;
  let deltaX = 0;
  let dragging = false;

  innerSlider.addEventListener("touchstart", (e) => {
    dragging = true;
    startX = e.touches[0].clientX;
    innerTrack.style.transition = "none";
  });
  innerSlider.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    deltaX = e.touches[0].clientX - startX;
    const base = -(currentIndex - 1) * (100 / 3);
    innerTrack.style.transform = `translateX(calc(${base}% + ${deltaX}px))`;
  });
  innerSlider.addEventListener("touchend", () => {
    dragging = false;
    innerTrack.style.transition = "";
    if (deltaX > 60) goTo(currentIndex - 1);
    else if (deltaX < -60) goTo(currentIndex + 1);
    else updateInnerPosition(true);
    deltaX = 0;
  });
}

function goTo(index) {
  if (index < 0 || index >= videos.length) return;
  currentIndex = index;
  updateInnerPosition(true);
  refreshActiveWindow();
}

function updateInnerPosition(animate) {
  innerTrack.style.transition = animate ? "" : "none";
  // Each slide is 33.333% wide; center currentIndex as the middle-visible slide.
  const offset = -(currentIndex - 1) * (100 / 3);
  innerTrack.style.transform = `translateX(${offset}%)`;
}

// Build every slide once (so swiping across the whole set works) but keep
// each <video>'s src empty until it's near the viewport (lazy load), and
// aggressively drop far-away sources to respect the ~10 active-element budget.
function buildInnerSlides() {
  innerTrack.innerHTML = "";
  videos.forEach((video, index) => {
    const slide = document.createElement("div");
    slide.className = "slide";
    slide.dataset.index = index;
    slide.innerHTML = slideTemplate(video);
    innerTrack.appendChild(slide);
    wireSlideControls(slide, video);
  });

  if (innerObserver) innerObserver.disconnect();
  innerObserver = new IntersectionObserver(handleSlideIntersection, {
    root: innerSlider,
    threshold: 0.6,
  });
  innerTrack.querySelectorAll(".slide").forEach((s) => innerObserver.observe(s));

  refreshActiveWindow();
}

function slideTemplate(video) {
  const isLiked = likedIds.has(video.id);
  return `
    <div class="slide__inner">
      <video data-src="${video.url}" muted playsinline preload="none"></video>

      <div class="slide__spinner"><div class="spinner"></div></div>

      <div class="slide__top">
        <div class="slide__meta">
          <strong>${escapeHtml(video.author)}</strong>
          ${escapeHtml(video.title)}
        </div>
        <button class="icon-btn btn-mute" title="Mute/Unmute">&#128264;</button>
      </div>

      <div class="slide__bottom">
        <p class="slide__desc">${escapeHtml(video.description)}</p>

        <div class="slide__progress">
          <div class="slide__progress-fill"></div>
        </div>

        <div class="slide__actions">
          <button class="action-btn btn-play" title="Play/Pause">&#9654; Play</button>
          <button class="action-btn btn-like ${isLiked ? "liked" : ""}" title="Like">
            &#9829; <span class="like-count">${video.likes}</span>
          </button>
          <button class="action-btn btn-comment" title="Comments">
            &#128172; <span class="comment-count">${video.comments.length}</span>
          </button>
          <button class="action-btn btn-share" title="Share">
            &#8599; <span class="share-count">${video.shares}</span>
          </button>
        </div>

        <div class="slide__comments">
          <div class="comment-list">
            ${video.comments
              .map((c) => `<div class="comment-item"><strong>${escapeHtml(c.user)}:</strong> ${escapeHtml(c.text)}</div>`)
              .join("")}
          </div>
          <div class="comment-form">
            <input type="text" placeholder="Add a comment..." maxlength="140" />
            <button class="btn-comment-submit">Post</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireSlideControls(slide, video) {
  const videoEl = slide.querySelector("video");
  const spinner = slide.querySelector(".slide__spinner");
  const playBtn = slide.querySelector(".btn-play");
  const muteBtn = slide.querySelector(".btn-mute");
  const progress = slide.querySelector(".slide__progress");
  const progressFill = slide.querySelector(".slide__progress-fill");
  const likeBtn = slide.querySelector(".btn-like");
  const likeCount = slide.querySelector(".like-count");
  const commentBtn = slide.querySelector(".btn-comment");
  const commentsPanel = slide.querySelector(".slide__comments");
  const commentInput = slide.querySelector(".comment-form input");
  const commentSubmit = slide.querySelector(".btn-comment-submit");
  const commentList = slide.querySelector(".comment-list");
  const commentCount = slide.querySelector(".comment-count");
  const shareBtn = slide.querySelector(".btn-share");
  const shareCount = slide.querySelector(".share-count");

  // Loading spinner lifecycle
  videoEl.addEventListener("waiting", () => spinner.classList.remove("hidden"));
  videoEl.addEventListener("canplay", () => spinner.classList.add("hidden"));
  videoEl.addEventListener("loadeddata", () => spinner.classList.add("hidden"));

  // Play / pause
  playBtn.addEventListener("click", () => {
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  });
  videoEl.addEventListener("play", () => (playBtn.innerHTML = "&#10073;&#10073; Pause"));
  videoEl.addEventListener("pause", () => (playBtn.innerHTML = "&#9654; Play"));

  // Mute / unmute
  videoEl.muted = true;
  muteBtn.addEventListener("click", () => {
    videoEl.muted = !videoEl.muted;
    muteBtn.innerHTML = videoEl.muted ? "&#128264;" : "&#128266;";
  });

  // Progress bar
  videoEl.addEventListener("timeupdate", () => {
    if (!videoEl.duration) return;
    progressFill.style.width = `${(videoEl.currentTime / videoEl.duration) * 100}%`;
  });
  progress.addEventListener("click", (e) => {
    if (!videoEl.duration) return;
    const rect = progress.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoEl.currentTime = pct * videoEl.duration;
  });

  // Like (optimistic UI + backend call)
  likeBtn.addEventListener("click", async () => {
    const wasLiked = likedIds.has(video.id);
    likedIds[wasLiked ? "delete" : "add"](video.id);
    likeBtn.classList.toggle("liked", !wasLiked);
    likeCount.textContent = Number(likeCount.textContent) + (wasLiked ? -1 : 1);
    localStorage.setItem("sac_liked", JSON.stringify([...likedIds]));

    try {
      const res = await fetch(`${API_BASE}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, userId: USER_ID }),
      });
      const data = await res.json();
      if (typeof data.likes === "number") likeCount.textContent = data.likes;
    } catch (err) {
      console.error("Like request failed:", err);
    }
  });

  // Comments
  commentBtn.addEventListener("click", () => commentsPanel.classList.toggle("open"));
  commentSubmit.addEventListener("click", () => submitComment());
  commentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitComment();
  });
  async function submitComment() {
    const text = commentInput.value.trim();
    if (!text) return;
    const row = document.createElement("div");
    row.className = "comment-item";
    row.innerHTML = `<strong>you:</strong> ${escapeHtml(text)}`;
    commentList.appendChild(row);
    commentInput.value = "";
    commentCount.textContent = Number(commentCount.textContent) + 1;

    try {
      await fetch(`${API_BASE}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, user: "you", text }),
      });
    } catch (err) {
      console.error("Comment request failed:", err);
    }
  }

  // Share
  shareBtn.addEventListener("click", async () => {
    const shareUrl = `${location.origin}${location.pathname}?video=${video.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: video.title, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        shareBtn.title = "Link copied!";
      }
    } catch (err) {
      // user cancelled share sheet — not an error worth logging
    }
    shareCount.textContent = Number(shareCount.textContent) + 1;
    try {
      await fetch(`${API_BASE}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id, platform: navigator.share ? "native" : "clipboard" }),
      });
    } catch (err) {
      console.error("Share request failed:", err);
    }
  });
}

// ---------------------------------------------------------------------------
// Lazy loading + "active element budget" via IntersectionObserver
// ---------------------------------------------------------------------------
// Hard cap: no more than this many <video> elements may hold a real `src`
// at once, regardless of how many slides exist (30-40) in the DOM. This is
// enforced by distance-from-currentIndex, not just a fixed +/- window, so
// it stays true even for the first/last slides in the set.
const MAX_ACTIVE_VIDEOS = 10;

function handleSlideIntersection(entries) {
  entries.forEach((entry) => {
    const videoEl = entry.target.querySelector("video");
    if (!videoEl) return;
    if (entry.isIntersecting) {
      loadSlideVideo(videoEl);
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }
  });
}

function loadSlideVideo(videoEl) {
  if (videoEl.src) return; // already loaded
  const src = videoEl.dataset.src;
  if (src) videoEl.src = src;
}

function unloadSlideVideo(videoEl) {
  if (!videoEl.src) return;
  videoEl.pause();
  videoEl.removeAttribute("src");
  videoEl.load();
}

// Called after every navigation: keep only the MAX_ACTIVE_VIDEOS slides
// nearest to currentIndex loaded, and unload every other <video> element's
// src — regardless of how many total slides (30-40) exist in the DOM.
function refreshActiveWindow() {
  const slides = Array.from(innerTrack.querySelectorAll(".slide"));

  const sortedByDistance = slides
    .map((slide) => ({
      slide,
      distance: Math.abs(Number(slide.dataset.index) - currentIndex),
    }))
    .sort((a, b) => a.distance - b.distance);

  const keepActive = new Set(sortedByDistance.slice(0, MAX_ACTIVE_VIDEOS).map((s) => s.slide));

  slides.forEach((slide) => {
    const videoEl = slide.querySelector("video");
    if (keepActive.has(slide)) {
      loadSlideVideo(videoEl);
    } else {
      unloadSlideVideo(videoEl);
    }
  });
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
