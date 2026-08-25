(function () {
  "use strict";

  var PAGE_SIZE = 20;
  var LONG_MIN = -9223372036854775808n;
  var LONG_MAX = 9223372036854775807n;
  var state = {
    params: {
      userSeed: "123456789",
      locale: "",
      likes: 3,
      reviews: 3
    },
    view: "table",
    tablePage: 1,
    tableMovies: [],
    galleryPage: 0,
    galleryMovies: [],
    tableLoading: false,
    galleryLoading: false,
    version: 0,
    tableController: null,
    galleryController: null,
    players: new Map()
  };

  var refs = {
    locale: document.getElementById("locale"),
    seed: document.getElementById("seed"),
    randomSeed: document.getElementById("random-seed"),
    likes: document.getElementById("likes"),
    likesValue: document.getElementById("likes-value"),
    reviews: document.getElementById("reviews"),
    reviewsValue: document.getElementById("reviews-value"),
    tableView: document.getElementById("table-view"),
    galleryView: document.getElementById("gallery-view"),
    tableBody: document.getElementById("movie-table-body"),
    gallery: document.getElementById("movie-gallery"),
    gallerySentinel: document.getElementById("gallery-sentinel"),
    previous: document.getElementById("previous-page"),
    next: document.getElementById("next-page"),
    pageLabel: document.getElementById("page-label"),
    resultStatus: document.getElementById("result-status"),
    error: document.getElementById("error-message"),
    errorCopy: document.getElementById("error-copy"),
    retry: document.getElementById("retry-button"),
    viewButtons: Array.prototype.slice.call(document.querySelectorAll("[data-view]"))
  };

  var refreshTimer = 0;
  var galleryObserver = null;
  var galleryPreviewObserver = null;
  var uiConfig = {};
  var uiLocales = {};
  var uiText = {};

  function firstConfiguredLocale() {
    return Array.isArray(uiConfig.locales) && uiConfig.locales.length
      ? String(uiConfig.locales[0].code || "")
      : "";
  }

  function localeLabel(locale, displayLocale) {
    var labels = locale.labels || {};
    return labels[displayLocale] || labels[uiConfig.defaultLocale] || locale.code;
  }

  function renderLocaleOptions(selectedLocale) {
    refs.locale.innerHTML = "";
    (uiConfig.locales || []).forEach(function (locale) {
      if (!locale || !locale.code) {
        return;
      }
      var option = document.createElement("option");
      option.value = locale.code;
      option.textContent = localeLabel(locale, selectedLocale);
      refs.locale.appendChild(option);
    });
    refs.locale.value = selectedLocale;
  }

  function t(key, values) {
    var value = uiText[key] || key;
    Object.keys(values || {}).forEach(function (name) {
      value = value.replace(new RegExp("\\{" + name + "\\}", "g"), String(values[name]));
    });
    return value;
  }

  function applyUiLocale(locale) {
    uiText = uiLocales[locale] || uiLocales[uiConfig.defaultLocale] || uiLocales[firstConfiguredLocale()] || {};
    document.documentElement.lang = locale;
    renderLocaleOptions(locale);
    document.title = t("pageTitle");
    Array.prototype.slice.call(document.querySelectorAll("[data-i18n]")).forEach(function (element) {
      element.textContent = t(element.getAttribute("data-i18n"));
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-i18n-aria]")).forEach(function (element) {
      element.setAttribute("aria-label", t(element.getAttribute("data-i18n-aria")));
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-i18n-title]")).forEach(function (element) {
      element.title = t(element.getAttribute("data-i18n-title"));
    });
    refs.pageLabel.textContent = t("page", { page: state.tablePage });
  }

  async function loadUiLocale() {
    try {
      var response = await fetch("/ui-locales.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load UI translations.");
      }
      uiConfig = await response.json();
      uiLocales = uiConfig.translations || {};
      state.params.locale = uiConfig.defaultLocale || firstConfiguredLocale();
      if (!state.params.locale || !uiLocales[state.params.locale]) {
        throw new Error("The UI locale configuration is incomplete.");
      }
    } catch (error) {
      refs.locale.disabled = true;
      uiLocales = {};
      return false;
    }
    applyUiLocale(state.params.locale);
    return true;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character];
    });
  }

  function read(object, lowerName, upperName, fallback) {
    if (object && object[lowerName] !== undefined && object[lowerName] !== null) {
      return object[lowerName];
    }
    if (object && object[upperName] !== undefined && object[upperName] !== null) {
      return object[upperName];
    }
    return fallback;
  }

  function normaliseMovie(movie) {
    var trailer = read(movie, "trailerConfig", "TrailerConfig", {});
    var clips = read(trailer, "clips", "Clips", []);
    return {
      title: read(movie, "title", "Title", t("untitled")),
      actors: read(movie, "actors", "Actors", []),
      genre: read(movie, "genre", "Genre", t("unknown")),
      year: read(movie, "year", "Year", "—"),
      likes: read(movie, "likes", "Likes", 0),
      reviewCount: read(movie, "reviewCount", "ReviewCount", 0),
      reviews: read(movie, "reviews", "Reviews", []),
      trailer: {
        animation: read(trailer, "animation", "Animation", "fade"),
        transition: read(trailer, "transition", "Transition", "fade"),
        texts: read(trailer, "texts", "Texts", []),
        clips: Array.prototype.slice.call(clips || []).map(function (clip) {
          return {
            url: read(clip, "url", "Url", ""),
            playbackRate: Number(read(clip, "playbackRate", "PlaybackRate", 1)) || 1,
            duration: Number(read(clip, "duration", "Duration", 2)) || 2
          };
        }),
        audioUrl: read(trailer, "audioUrl", "AudioUrl", "")
      }
    };
  }

  function setRangeBackground(input) {
    var percentage = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.background = "linear-gradient(to right, var(--cyan) 0%, var(--cyan) " + percentage + "%, rgba(133, 179, 212, 0.22) " + percentage + "%, rgba(133, 179, 212, 0.22) 100%)";
  }

  function updateControlReadouts() {
    refs.likesValue.value = Number(refs.likes.value).toFixed(1);
    refs.reviewsValue.value = Number(refs.reviews.value).toFixed(1);
    refs.likesValue.textContent = Number(refs.likes.value).toFixed(1);
    refs.reviewsValue.textContent = Number(refs.reviews.value).toFixed(1);
    setRangeBackground(refs.likes);
    setRangeBackground(refs.reviews);
  }

  function showError(message) {
    refs.error.hidden = false;
    refs.errorCopy.textContent = message;
  }

  function clearError() {
    refs.error.hidden = true;
    refs.errorCopy.textContent = "";
  }

  function setStatus(message) {
    refs.resultStatus.textContent = message;
  }

  function validateSeed(seed) {
    if (!/^-?\d+$/.test(seed)) {
      return t("seedWholeNumber");
    }
    try {
      var value = BigInt(seed);
      if (value < LONG_MIN || value > LONG_MAX) {
        return t("seed64Bit");
      }
    } catch (error) {
      return t("seedValid");
    }
    return "";
  }

  function makeRandomSeed() {
    var values = new Uint32Array(2);
    window.crypto.getRandomValues(values);
    var seed = (BigInt(values[0] & 2147483647) << 32n) | BigInt(values[1]);
    return seed.toString();
  }

  function queryForPage(page) {
    var parameters = new URLSearchParams();
    parameters.set("userSeed", state.params.userSeed);
    parameters.set("page", String(page));
    parameters.set("pageSize", String(PAGE_SIZE));
    parameters.set("likes", String(state.params.likes));
    parameters.set("reviews", String(state.params.reviews));
    parameters.set("locale", state.params.locale);
    return "/movies?" + parameters.toString();
  }

  async function requestMovies(page, signal) {
    var response = await fetch(queryForPage(page), {
      headers: { "Accept": "application/json" },
      signal: signal
    });
    if (!response.ok) {
      var responseMessage = "";
      try {
        responseMessage = await response.text();
      } catch (ignore) {
        responseMessage = "";
      }
      throw new Error(responseMessage || t("serverReturned", { status: response.status }));
    }
    var payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error(t("serverResponseList"));
    }
    return payload.map(normaliseMovie);
  }

  function renderTableSkeleton() {
    var skeleton = "";
    for (var index = 0; index < 9; index += 1) {
      skeleton += '<tr class="skeleton-row"><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td></tr>';
    }
    refs.tableBody.innerHTML = skeleton;
  }

  function detailsMarkup(movie, key) {
    var reviews = Array.isArray(movie.reviews) && movie.reviews.length
      ? movie.reviews.map(function (review) { return "<li>" + escapeHtml(review) + "</li>"; }).join("")
      : '<p class="review-list-empty">' + escapeHtml(t("noReviews")) + "</p>";
    var reviewLabel = movie.reviewCount === 1 ? t("review") : t("reviews");
    return '<div class="movie-details">'
      + '<div class="detail-layout">'
      + '<div class="trailer-host" data-trailer-key="' + escapeHtml(key) + '"></div>'
      + '<aside class="detail-aside">'
      + '<dl class="detail-facts">'
      + "<div><dt>" + escapeHtml(t("releaseYear")) + "</dt><dd>" + escapeHtml(movie.year) + "</dd></div>"
      + "<div><dt>" + escapeHtml(t("genre")) + "</dt><dd>" + escapeHtml(movie.genre) + "</dd></div>"
      + "<div><dt>" + escapeHtml(t("likes")) + "</dt><dd>" + escapeHtml(movie.likes) + "</dd></div>"
      + "<div><dt>" + escapeHtml(t("audience")) + "</dt><dd>" + escapeHtml(movie.reviewCount) + " " + escapeHtml(reviewLabel) + "</dd></div>"
      + "</dl>"
      + '<div class="reviews-block"><h3>' + escapeHtml(t("audienceNotes")) + "</h3>"
      + (reviews.indexOf("<li>") === 0 ? '<ul class="review-list">' + reviews + "</ul>" : reviews)
      + "</div>"
      + "</aside>"
      + "</div>"
      + "</div>";
  }

  function tableRowMarkup(movie, absoluteIndex, arrayIndex) {
    var key = "table-" + state.tablePage + "-" + arrayIndex;
    var cast = Array.isArray(movie.actors) ? movie.actors.join(", ") : "";
    return '<tr class="movie-row" data-row-key="' + key + '" data-movie-array-index="' + arrayIndex + '" tabindex="0" aria-expanded="false" aria-label="' + escapeHtml(t("showDetails", { title: movie.title })) + '">'
      + '<td class="movie-index">' + String(absoluteIndex).padStart(3, "0") + "</td>"
      + '<td><div class="movie-title" title="' + escapeHtml(movie.title) + '">' + escapeHtml(movie.title) + "</div></td>"
      + '<td><div class="cast" title="' + escapeHtml(cast) + '">' + escapeHtml(cast) + "</div></td>"
      + "<td>" + escapeHtml(movie.year) + "</td>"
      + '<td><span class="genre-pill">' + escapeHtml(movie.genre) + "</span></td>"
      + "</tr>"
      + '<tr class="detail-row" data-detail-key="' + key + '" hidden><td colspan="5">' + detailsMarkup(movie, key) + "</td></tr>";
  }

  function renderTable() {
    if (!state.tableMovies.length) {
      refs.tableBody.innerHTML = '<tr><td colspan="5" class="empty-row">' + escapeHtml(t("noMovies")) + "</td></tr>";
      return;
    }
    var firstIndex = (state.tablePage - 1) * PAGE_SIZE + 1;
    refs.tableBody.innerHTML = state.tableMovies.map(function (movie, arrayIndex) {
      return tableRowMarkup(movie, firstIndex + arrayIndex, arrayIndex);
    }).join("");
    refs.pageLabel.textContent = t("page", { page: state.tablePage });
    refs.previous.disabled = state.tablePage === 1;
    refs.next.disabled = false;
  }

  function galleryCardMarkup(movie, absoluteIndex, arrayIndex) {
    var key = "gallery-" + state.galleryPage + "-" + arrayIndex;
    var cast = Array.isArray(movie.actors) ? movie.actors.join(", ") : "";
    var previewClip = movie.trailer.clips.find(function (clip) { return clip.url; });
    var previewUrl = previewClip ? previewClip.url : "";
    return '<article class="movie-card" data-card-key="' + key + '" data-movie-array-index="' + (absoluteIndex - 1) + '" tabindex="0" aria-label="' + escapeHtml(t("playTrailer", { title: movie.title })) + '">'
      + '<div class="card-poster">'
      + '<div class="card-preview" data-preview-url="' + escapeHtml(previewUrl) + '" aria-hidden="true"></div>'
      + '<div class="card-trailer-host" data-trailer-key="gallery-preview-' + key + '" hidden></div>'
      + '<span class="card-number">FILM ' + String(absoluteIndex).padStart(3, "0") + "</span>"
      + "<h3>" + escapeHtml(movie.title) + "</h3>"
      + "<p>" + escapeHtml(movie.genre) + "</p>"
      + "</div>"
      + '<div class="card-content">'
      + '<p class="card-cast">' + escapeHtml(cast) + "</p>"
      + '<div class="card-meta"><span>' + escapeHtml(movie.year) + "</span></div>"
      + '<button class="card-info-button" type="button" aria-controls="gallery-details-' + key + '" aria-label="' + escapeHtml(t("showDetails", { title: movie.title })) + '">' + escapeHtml(t("details")) + "</button>"
      + "</div>"
      + galleryDetailsMarkup(movie, key)
      + "</article>";
  }

  function appendGallery(movies, page) {
    var firstIndex = (page - 1) * PAGE_SIZE + 1;
    var fragment = document.createDocumentFragment();
    var container = document.createElement("div");
    container.innerHTML = movies.map(function (movie, arrayIndex) {
      return galleryCardMarkup(movie, firstIndex + arrayIndex, arrayIndex);
    }).join("");
    while (container.firstChild) {
      fragment.appendChild(container.firstChild);
    }
    refs.gallery.appendChild(fragment);
    observeGalleryPreviews();
  }

  function mountGalleryPreview(preview) {
    var previewUrl = preview.getAttribute("data-preview-url");
    if (!previewUrl || preview.hasAttribute("data-preview-loaded")) {
      return;
    }
    preview.setAttribute("data-preview-loaded", "");
    var video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.tabIndex = -1;
    video.setAttribute("aria-hidden", "true");

    var reveal = function () {
      preview.classList.add("is-ready");
    };
    video.addEventListener("loadedmetadata", function () {
      if (!Number.isFinite(video.duration) || video.duration <= 0.35) {
        reveal();
        return;
      }
      try {
        video.currentTime = 0.35;
      } catch (error) {
        reveal();
      }
    }, { once: true });
    video.addEventListener("loadeddata", reveal, { once: true });
    video.addEventListener("seeked", reveal, { once: true });
    video.addEventListener("error", function () {
      preview.removeAttribute("data-preview-loaded");
    }, { once: true });
    preview.appendChild(video);
    video.src = previewUrl;
    video.load();
  }

  function observeGalleryPreviews() {
    Array.prototype.slice.call(refs.gallery.querySelectorAll(".card-preview[data-preview-url]:not([data-preview-observed])")).forEach(function (preview) {
      if (!preview.getAttribute("data-preview-url")) {
        return;
      }
      preview.setAttribute("data-preview-observed", "");
      if (galleryPreviewObserver) {
        galleryPreviewObserver.observe(preview);
      } else {
        mountGalleryPreview(preview);
      }
    });
  }

  function galleryDetailsMarkup(movie, key) {
    var cast = Array.isArray(movie.actors) ? movie.actors.join(", ") : "";
    var reviews = Array.isArray(movie.reviews) && movie.reviews.length
      ? '<ul class="review-list">' + movie.reviews.map(function (review) {
        return "<li>" + escapeHtml(review) + "</li>";
      }).join("") + "</ul>"
      : '<p class="review-list-empty">' + escapeHtml(t("noReviews")) + "</p>";
    var reviewLabel = movie.reviewCount === 1 ? t("review") : t("reviews");
    return '<section id="gallery-details-' + key + '" class="card-details-overlay" hidden aria-label="' + escapeHtml(t("detailsFor", { title: movie.title })) + '">'
      + '<button class="card-overlay-close" type="button" aria-label="' + escapeHtml(t("closeDetails")) + '">×</button>'
      + '<p class="overlay-kicker">' + escapeHtml(t("movieDetails")) + "</p>"
      + '<h3 class="overlay-title">' + escapeHtml(movie.title) + "</h3>"
      + '<p class="overlay-cast">' + escapeHtml(cast) + "</p>"
      + '<dl class="overlay-facts">'
      + "<div><dt>" + escapeHtml(t("releaseYear")) + "</dt><dd>" + escapeHtml(movie.year) + "</dd></div>"
      + "<div><dt>" + escapeHtml(t("genre")) + "</dt><dd>" + escapeHtml(movie.genre) + "</dd></div>"
      + "<div><dt>" + escapeHtml(t("likes")) + "</dt><dd>" + escapeHtml(movie.likes) + "</dd></div>"
      + "<div><dt>" + escapeHtml(t("audience")) + "</dt><dd>" + escapeHtml(movie.reviewCount) + " " + escapeHtml(reviewLabel) + "</dd></div>"
      + "</dl>"
      + '<section class="overlay-reviews"><h3>' + escapeHtml(t("audienceNotes")) + "</h3>" + reviews + "</section>"
      + "</section>";
  }

  function createTrailerMarkup(movie) {
    var text = Array.isArray(movie.trailer.texts) && movie.trailer.texts.length
      ? movie.trailer.texts[0]
      : "";
    return '<div class="trailer-player" data-animation="' + escapeHtml(movie.trailer.animation) + '" data-transition="' + escapeHtml(movie.trailer.transition) + '">'
      + '<video playsinline preload="metadata" aria-label="' + escapeHtml(t("trailerPreview", { title: movie.title })) + '"></video>'
      + '<audio preload="none"></audio>'
      + '<span class="trailer-state">' + escapeHtml(t("trailerReady")) + "</span>"
      + '<div class="trailer-caption"><small class="trailer-title">' + escapeHtml(movie.title) + '</small><span>' + escapeHtml(text) + "</span></div>"
      + '<div class="trailer-controls">'
      + '<button type="button" class="trailer-control" data-trailer-action="play">▶ ' + escapeHtml(t("play")) + "</button>"
      + "</div>"
      + '<div class="trailer-progress"><i></i></div>'
      + "</div>";
  }

  function stopPlayer(key) {
    var player = state.players.get(key);
    if (player) {
      player.destroy();
      state.players.delete(key);
    }
  }

  function mountPlayer(key, movie) {
    stopPlayer(key);
    var host = document.querySelector('[data-trailer-key="' + CSS.escape(key) + '"]');
    if (!host) {
      return;
    }
    host.innerHTML = createTrailerMarkup(movie);
    var player = new TrailerPlayer(host.firstElementChild, movie);
    state.players.set(key, player);
  }

  function stopAllPlayers() {
    state.players.forEach(function (player) {
      player.destroy();
    });
    state.players.clear();
  }

  function TrailerPlayer(root, movie) {
    this.root = root;
    this.movie = movie;
    this.clips = movie.trailer.clips.filter(function (clip) { return clip.url; });
    this.video = root.querySelector("video");
    this.audio = root.querySelector("audio");
    this.caption = root.querySelector(".trailer-caption span");
    this.stateLabel = root.querySelector(".trailer-state");
    this.progress = root.querySelector(".trailer-progress i");
    this.playButton = root.querySelector('[data-trailer-action="play"]');
    this.index = 0;
    this.isPlaying = false;
    this.timer = 0;
    this.startedAt = 0;
    this.totalDuration = this.clips.reduce(function (sum, clip) { return sum + (clip.duration / clip.playbackRate); }, 0);
    this.completedDuration = 0;
    this.onPlayClick = this.toggle.bind(this);
    this.onVideoError = this.handleVideoError.bind(this);
    this.playButton.addEventListener("click", this.onPlayClick);
    this.video.addEventListener("error", this.onVideoError);
    if (this.audio && movie.trailer.audioUrl) {
      this.audio.src = movie.trailer.audioUrl;
      this.audio.volume = 0.55;
    }
    if (this.clips.length) {
      this.loadClip(0, false);
    } else {
      this.stateLabel.textContent = t("previewUnavailable");
      this.playButton.disabled = true;
    }
  }

  TrailerPlayer.prototype.handleVideoError = function () {
    if (!this.isPlaying) {
      this.stateLabel.textContent = t("previewUnavailable");
    }
  };

  TrailerPlayer.prototype.loadClip = function (index, autoplay) {
    var clip = this.clips[index];
    if (!clip) {
      this.finish();
      return;
    }
    window.clearTimeout(this.timer);
    this.index = index;
    this.video.src = clip.url;
    this.video.playbackRate = clip.playbackRate;
    this.video.load();
    this.updateCaption();
    if (autoplay) {
      var self = this;
      var begin = function () {
        self.video.removeEventListener("canplay", begin);
        self.beginClip();
      };
      this.video.addEventListener("canplay", begin);
    }
  };

  TrailerPlayer.prototype.beginClip = function () {
    if (!this.isPlaying) {
      return;
    }
    var self = this;
    var clip = this.clips[this.index];
    this.startedAt = Date.now();
    this.video.play().catch(function () {
      self.stateLabel.textContent = t("tapPlay");
      self.isPlaying = false;
      self.playButton.textContent = "▶ " + t("play");
    });
    this.timer = window.setTimeout(function () {
      self.nextClip();
    }, Math.max(450, (clip.duration / clip.playbackRate) * 1000));
    this.tickProgress();
  };

  TrailerPlayer.prototype.nextClip = function () {
    if (!this.isPlaying) {
      return;
    }
    var current = this.clips[this.index];
    this.completedDuration += current.duration / current.playbackRate;
    if (this.index >= this.clips.length - 1) {
      this.finish();
      return;
    }
    var self = this;
    this.root.classList.add("is-transitioning", "transition-" + this.movie.trailer.transition);
    window.setTimeout(function () {
      self.root.classList.remove("is-transitioning", "transition-" + self.movie.trailer.transition);
      self.loadClip(self.index + 1, true);
    }, this.movie.trailer.transition === "cut" ? 160 : 280);
  };

  TrailerPlayer.prototype.updateCaption = function () {
    var trailerTexts = this.movie.trailer.texts || [];
    var text = trailerTexts.length ? trailerTexts[this.index % trailerTexts.length] : "";
    this.caption.textContent = text;
    this.root.querySelector(".trailer-caption").style.animation = "none";
    void this.root.offsetWidth;
    this.root.querySelector(".trailer-caption").style.animation = "";
  };

  TrailerPlayer.prototype.tickProgress = function () {
    var self = this;
    if (!this.isPlaying) {
      return;
    }
    var elapsed = (Date.now() - this.startedAt) / 1000;
    var percentage = this.totalDuration ? ((this.completedDuration + elapsed) / this.totalDuration) * 100 : 0;
    this.progress.style.width = Math.min(100, percentage) + "%";
    window.requestAnimationFrame(function () {
      self.tickProgress();
    });
  };

  TrailerPlayer.prototype.toggle = function () {
    if (this.isPlaying) {
      this.pause();
      return;
    }
    this.play();
  };

  TrailerPlayer.prototype.play = function () {
    if (!this.clips.length) {
      return;
    }
    if (this.progress.style.width === "100%") {
      this.index = 0;
      this.completedDuration = 0;
      this.progress.style.width = "0%";
      if (this.audio) {
        this.audio.currentTime = 0;
      }
    }
    this.isPlaying = true;
    this.playButton.textContent = "Ⅱ " + t("pause");
    this.stateLabel.textContent = t("nowPlaying");
    if (this.audio && this.audio.src) {
      this.audio.play().catch(function () {});
    }
    this.loadClip(this.index, true);
  };

  TrailerPlayer.prototype.pause = function () {
    this.isPlaying = false;
    window.clearTimeout(this.timer);
    this.video.pause();
    if (this.audio) {
      this.audio.pause();
    }
    this.playButton.textContent = "▶ " + t("resume");
    this.stateLabel.textContent = t("paused");
  };

  TrailerPlayer.prototype.finish = function () {
    this.isPlaying = false;
    window.clearTimeout(this.timer);
    this.video.pause();
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.completedDuration = 0;
    this.progress.style.width = "100%";
    this.playButton.textContent = "↻ " + t("replay");
    this.stateLabel.textContent = t("trailerComplete");
    this.caption.textContent = this.movie.trailer.texts && this.movie.trailer.texts.length
      ? this.movie.trailer.texts[0]
      : "";
  };

  TrailerPlayer.prototype.destroy = function () {
    window.clearTimeout(this.timer);
    this.isPlaying = false;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    this.playButton.removeEventListener("click", this.onPlayClick);
    this.video.removeEventListener("error", this.onVideoError);
  };

  function toggleTableRow(row) {
    var key = row.getAttribute("data-row-key");
    var detail = document.querySelector('[data-detail-key="' + CSS.escape(key) + '"]');
    var movieIndex = Number(row.getAttribute("data-movie-array-index"));
    var opening = detail.hidden;

    Array.prototype.slice.call(refs.tableBody.querySelectorAll(".movie-row.is-expanded")).forEach(function (openRow) {
      var openKey = openRow.getAttribute("data-row-key");
      if (openKey !== key) {
        openRow.classList.remove("is-expanded");
        openRow.setAttribute("aria-expanded", "false");
        var openDetail = document.querySelector('[data-detail-key="' + CSS.escape(openKey) + '"]');
        if (openDetail) {
          openDetail.hidden = true;
        }
        stopPlayer(openKey);
      }
    });

    if (opening) {
      detail.hidden = false;
      row.classList.add("is-expanded");
      row.setAttribute("aria-expanded", "true");
      mountPlayer(key, state.tableMovies[movieIndex]);
    } else {
      detail.hidden = true;
      row.classList.remove("is-expanded");
      row.setAttribute("aria-expanded", "false");
      stopPlayer(key);
    }
  }

  function stopGalleryPreviews(exceptKey) {
    Array.from(state.players.keys()).forEach(function (key) {
      if (key.indexOf("gallery-preview-") === 0 && key !== exceptKey) {
        stopPlayer(key);
        var host = document.querySelector('[data-trailer-key="' + CSS.escape(key) + '"]');
        if (host) {
          host.innerHTML = "";
          host.hidden = true;
        }
      }
    });
  }

  function openGalleryDetails(card) {
    var key = card.getAttribute("data-card-key");
    var previewKey = "gallery-preview-" + key;
    var previewHost = card.querySelector('[data-trailer-key="' + CSS.escape(previewKey) + '"]');
    stopGalleryPreviews("");
    if (previewHost) {
      previewHost.innerHTML = "";
      previewHost.hidden = true;
    }
    card.querySelector(".card-details-overlay").hidden = false;
  }

  function closeGalleryDetails(card) {
    card.querySelector(".card-details-overlay").hidden = true;
  }

  function playGalleryTrailer(card) {
    var key = card.getAttribute("data-card-key");
    var detailsOverlay = card.querySelector(".card-details-overlay");
    if (!detailsOverlay.hidden) {
      return;
    }
    var movieIndex = Number(card.getAttribute("data-movie-array-index"));
    var previewKey = "gallery-preview-" + key;
    var currentPlayer = state.players.get(previewKey);
    if (currentPlayer) {
      if (!currentPlayer.isPlaying) {
        currentPlayer.play();
      }
      return;
    }
    stopGalleryPreviews(previewKey);
    var host = card.querySelector('[data-trailer-key="' + CSS.escape(previewKey) + '"]');
    if (!host) {
      return;
    }
    host.hidden = false;
    mountPlayer(previewKey, state.galleryMovies[movieIndex]);
    var player = state.players.get(previewKey);
    if (player) {
      player.play();
    }
  }

  async function loadTable() {
    if (state.tableLoading) {
      return;
    }
    state.tableLoading = true;
    clearError();
    if (!state.tableMovies.length) {
      renderTableSkeleton();
    } else {
      refs.tableBody.classList.add("is-updating");
    }
    refs.previous.disabled = true;
    refs.next.disabled = true;
    setStatus(t("generatingPage", { page: state.tablePage }));
    if (state.tableController) {
      state.tableController.abort();
    }
    state.tableController = new AbortController();
    var version = state.version;
    try {
      var movies = await requestMovies(state.tablePage, state.tableController.signal);
      if (version !== state.version) {
        return;
      }
      state.tableMovies = movies;
      renderTable();
      setStatus(t("filmsPage", { count: movies.length, page: state.tablePage }));
    } catch (error) {
      if (error.name !== "AbortError" && version === state.version) {
        if (!state.tableMovies.length) {
          refs.tableBody.innerHTML = "";
        }
        showError(error.message || t("checkApi"));
        setStatus(t("catalogueUnavailable"));
      }
    } finally {
      if (version === state.version) {
        state.tableLoading = false;
        refs.tableBody.classList.remove("is-updating");
      }
    }
  }

  async function loadGallery(reset) {
    if (state.galleryLoading) {
      return;
    }
    state.galleryLoading = true;
    clearError();
    if (reset) {
      refs.gallery.classList.add("is-updating");
      if (galleryPreviewObserver) {
        galleryPreviewObserver.disconnect();
      }
    }
    refs.gallerySentinel.hidden = false;
    var nextPage = reset ? 1 : state.galleryPage + 1;
    refs.gallerySentinel.lastElementChild.textContent = nextPage === 1 ? t("loadingFirstReel") : t("loadingAnotherReel");
    if (state.galleryController) {
      state.galleryController.abort();
    }
    state.galleryController = new AbortController();
    var version = state.version;
    try {
      var movies = await requestMovies(nextPage, state.galleryController.signal);
      if (version !== state.version) {
        return;
      }
      if (reset) {
        state.galleryPage = nextPage;
        state.galleryMovies = movies;
        refs.gallery.innerHTML = "";
      } else {
        state.galleryPage = nextPage;
        state.galleryMovies = state.galleryMovies.concat(movies);
      }
      appendGallery(movies, nextPage);
      setStatus(t("filmsLoaded", { count: state.galleryMovies.length }));
    } catch (error) {
      if (error.name !== "AbortError" && version === state.version) {
        showError(error.message || t("checkApi"));
        setStatus(t("catalogueUnavailable"));
      }
    } finally {
      if (version === state.version) {
        state.galleryLoading = false;
        refs.gallery.classList.remove("is-updating");
        refs.gallerySentinel.hidden = false;
      }
    }
  }

  function setView(view) {
    if (view === state.view) {
      return;
    }
    stopAllPlayers();
    state.view = view;
    var tableActive = view === "table";
    refs.tableView.hidden = !tableActive;
    refs.galleryView.hidden = tableActive;
    refs.viewButtons.forEach(function (button) {
      var active = button.getAttribute("data-view") === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (tableActive) {
      if (!state.tableMovies.length) {
        loadTable();
      } else {
        setStatus(t("filmsPage", { count: state.tableMovies.length, page: state.tablePage }));
      }
    } else if (!state.galleryMovies.length) {
      loadGallery(true);
    } else {
      setStatus(t("filmsLoaded", { count: state.galleryMovies.length }));
    }
  }

  function refreshForParameters() {
    window.clearTimeout(refreshTimer);
    var seed = refs.seed.value.trim();
    var validationError = validateSeed(seed);
    if (validationError) {
      showError(validationError);
      setStatus(t("waitingSeed"));
      return;
    }
    state.params.userSeed = seed;
    state.params.locale = refs.locale.value;
    state.params.likes = Number(refs.likes.value);
    state.params.reviews = Number(refs.reviews.value);
    state.version += 1;
    state.tablePage = 1;
    state.galleryPage = 0;
    state.galleryMovies = [];
    stopAllPlayers();
    if (state.tableController) {
      state.tableController.abort();
    }
    if (state.galleryController) {
      state.galleryController.abort();
    }
    state.tableLoading = false;
    state.galleryLoading = false;
    if (state.view === "gallery") {
      loadGallery(true);
    } else {
      loadTable();
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshForParameters, 330);
  }

  function initialiseEvents() {
    refs.locale.addEventListener("change", function () {
      applyUiLocale(refs.locale.value);
      refreshForParameters();
    });
    refs.seed.addEventListener("input", scheduleRefresh);
    refs.seed.addEventListener("change", refreshForParameters);
    refs.randomSeed.addEventListener("click", function () {
      refs.seed.value = makeRandomSeed();
      refreshForParameters();
    });
    refs.likes.addEventListener("input", function () {
      updateControlReadouts();
      scheduleRefresh();
    });
    refs.reviews.addEventListener("input", function () {
      updateControlReadouts();
      scheduleRefresh();
    });
    refs.viewButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setView(button.getAttribute("data-view"));
      });
    });
    refs.previous.addEventListener("click", function () {
      if (state.tablePage > 1 && !state.tableLoading) {
        state.tablePage -= 1;
        stopAllPlayers();
        loadTable();
      }
    });
    refs.next.addEventListener("click", function () {
      if (!state.tableLoading) {
        state.tablePage += 1;
        stopAllPlayers();
        loadTable();
      }
    });
    refs.tableBody.addEventListener("click", function (event) {
      var row = event.target.closest(".movie-row");
      if (row) {
        toggleTableRow(row);
      }
    });
    refs.tableBody.addEventListener("keydown", function (event) {
      var row = event.target.closest(".movie-row");
      if (row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggleTableRow(row);
      }
    });
    refs.gallery.addEventListener("click", function (event) {
      if (event.target.closest(".trailer-control")) {
        return;
      }
      var overlayCloseButton = event.target.closest(".card-overlay-close");
      if (overlayCloseButton) {
        closeGalleryDetails(overlayCloseButton.closest(".movie-card"));
        return;
      }
      var detailsButton = event.target.closest(".card-info-button");
      if (detailsButton) {
        var detailsCard = detailsButton.closest(".movie-card");
        openGalleryDetails(detailsCard);
        return;
      }
      if (event.target.closest(".card-details-overlay")) {
        return;
      }
      var card = event.target.closest(".movie-card");
      if (card) {
        playGalleryTrailer(card);
      }
    });
    refs.gallery.addEventListener("keydown", function (event) {
      if (event.target.closest(".trailer-control") || event.target.closest(".card-info-button") || event.target.closest(".card-details-overlay")) {
        return;
      }
      var card = event.target.closest(".movie-card");
      if (card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        playGalleryTrailer(card);
      }
    });
    refs.retry.addEventListener("click", function () {
      if (state.view === "gallery") {
        loadGallery(state.galleryMovies.length === 0);
      } else {
        loadTable();
      }
    });
  }

  function initialiseInfiniteScroll() {
    if (!("IntersectionObserver" in window)) {
      return;
    }
    galleryObserver = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })
        && state.view === "gallery"
        && !state.galleryLoading) {
        loadGallery(false);
      }
    }, { rootMargin: "550px 0px" });
    galleryObserver.observe(refs.gallerySentinel);
  }

  function initialiseGalleryPreviews() {
    if (!("IntersectionObserver" in window)) {
      return;
    }
    galleryPreviewObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          galleryPreviewObserver.unobserve(entry.target);
          mountGalleryPreview(entry.target);
        }
      });
    }, { rootMargin: "220px 0px" });
  }

  async function initialiseApp() {
    if (!await loadUiLocale()) {
      showError("Could not load the user interface configuration.");
      return;
    }
    updateControlReadouts();
    initialiseEvents();
    initialiseGalleryPreviews();
    initialiseInfiniteScroll();
    refreshForParameters();
  }

  initialiseApp();
}());
