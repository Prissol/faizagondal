(function () {
  const gallery = document.querySelector("#gallery");
  const filters = document.querySelector("#filters");
  const seriesNote = document.querySelector("#series-note");
  const dialog = document.querySelector("#viewer");
  const flipInner = document.querySelector("#flip-inner");
  const viewerImg = document.querySelector("#viewer-img");
  const viewerBack = document.querySelector("#viewer-back");
  const viewerTitle = document.querySelector("#viewer-title");
  const viewerYear = document.querySelector("#viewer-year");
  const viewerSeries = document.querySelector("#viewer-series");
  const turn = document.querySelector("#turn");
  const heroButton = document.querySelector("[data-open]");

  let currentSeries = "all";
  let currentId = null;
  let visible = window.ARCHIVE.slice();

  function worksIn(seriesId) {
    if (seriesId === "all") return window.ARCHIVE.slice();
    return window.ARCHIVE.filter((work) => work.seriesId === seriesId);
  }

  function renderFilters() {
    filters.innerHTML = "";
    window.SERIES.forEach((series) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = series.label;
      button.setAttribute("aria-pressed", series.id === currentSeries ? "true" : "false");
      button.addEventListener("click", () => {
        currentSeries = series.id;
        visible = worksIn(series.id);
        seriesNote.textContent = series.note;
        renderFilters();
        renderGallery();
      });
      item.appendChild(button);
      filters.appendChild(item);
    });
  }

  let railFrame = 0;
  let railOffset = 0;
  let railDrag = false;
  let railMoved = 0;
  let railLastX = 0;
  let railPaused = false;
  let railResume = 0;
  const mobileQuery = window.matchMedia("(max-width: 800px)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function stopRail() {
    if (railFrame) cancelAnimationFrame(railFrame);
    railFrame = 0;
    window.clearTimeout(railResume);
    railDrag = false;
    railPaused = false;
    railOffset = 0;
  }

  function cardElement(work) {
    const card = document.createElement("article");
    card.className = "card";
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <span class="mat">
        <img src="${work.image}" alt="${work.alt}" loading="lazy">
      </span>
      <span class="card-meta">
        <span>
          <span class="card-title"></span>
          <span class="card-series"></span>
        </span>
        <span class="card-year"></span>
      </span>
      <span class="card-hint">History on the verso</span>
    `;
    button.querySelector(".card-title").textContent = work.title;
    button.querySelector(".card-series").textContent = work.series;
    button.querySelector(".card-year").textContent = work.year;
    button.addEventListener("click", () => openWork(work.id));
    card.appendChild(button);
    return card;
  }

  function renderGallery() {
    stopRail();
    gallery.innerHTML = "";
    const rail = document.createElement("div");
    rail.className = "rail";
    const track = document.createElement("div");
    track.className = "rail-track";
    const mobile = mobileQuery.matches;
    let list = visible.slice();
    if (mobile && list.length > 1 && list.length < 5) {
      const seed = list.slice();
      while (list.length < 5) list = list.concat(seed);
    }
    list.forEach((work, index) => {
      const card = cardElement(work);
      if (index % 2) card.classList.add("hang");
      track.appendChild(card);
    });
    rail.appendChild(track);
    gallery.appendChild(rail);
    if (mobile && list.length > 1) startRail(rail, track);
  }

  function cardStep(track) {
    const card = track.firstElementChild;
    if (!card) return 0;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return card.getBoundingClientRect().width + gap;
  }

  function startRail(rail, track) {
    let velocity = 0;
    let downAt = 0;
    let gesture = "tap";
    const samples = [];

    function place() {
      let width = cardStep(track);
      if (width > 0 && railOffset <= -width) {
        railOffset += width;
        track.appendChild(track.firstElementChild);
        width = cardStep(track);
      }
      if (railOffset > 0 && track.lastElementChild) {
        track.prepend(track.lastElementChild);
        railOffset -= cardStep(track);
      }
      track.style.transform = "translate3d(" + railOffset + "px,0,0)";
      const mid = rail.getBoundingClientRect().left + rail.clientWidth / 2;
      let best = null;
      let bestDist = Infinity;
      [...track.children].forEach((card) => {
        const rect = card.getBoundingClientRect();
        const dist = Math.abs(rect.left + rect.width / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = card;
        }
      });
      [...track.children].forEach((card) => card.classList.toggle("is-focus", card === best));
    }

    function frame() {
      const box = rail.getBoundingClientRect();
      const onScreen = box.bottom > 80 && box.top < window.innerHeight;
      if (!railDrag && Math.abs(velocity) > 0.55) {
        railOffset += velocity;
        velocity *= 0.94;
      } else if (!railDrag) {
        velocity = 0;
        if (!reduceMotion && !railPaused && onScreen && !dialog.open) railOffset -= 0.38;
      }
      place();
      railFrame = requestAnimationFrame(frame);
    }

    rail.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      railDrag = true;
      railPaused = true;
      velocity = 0;
      railMoved = 0;
      gesture = "tap";
      downAt = performance.now();
      railLastX = event.clientX;
      samples.length = 0;
      rail.classList.add("is-held");
      rail.setPointerCapture(event.pointerId);
    });
    rail.addEventListener("pointermove", (event) => {
      if (!railDrag) return;
      const now = performance.now();
      const dx = event.clientX - railLastX;
      const dt = Math.max(now - (samples.at(-1)?.t || downAt), 8);
      railLastX = event.clientX;
      railMoved += Math.abs(dx);
      railOffset += dx;
      samples.push({ v: dx / dt, t: now });
      if (samples.length > 5) samples.shift();
      if (railMoved > 12) gesture = "slide";
    });
    function endDrag(event) {
      if (!railDrag) return;
      railDrag = false;
      rail.classList.remove("is-held");
      const elapsed = performance.now() - downAt;
      if (railMoved <= 12 && elapsed >= 280) gesture = "hold";
      if (gesture === "slide") {
        const recent = samples.filter((sample) => performance.now() - sample.t < 80);
        const used = recent.length ? recent : samples.slice(-2);
        const pxPerMs = used.length ? used.reduce((sum, sample) => sum + sample.v, 0) / used.length : 0;
        velocity = Math.max(-62, Math.min(62, pxPerMs * 16.6 * 1.7));
        railPaused = false;
      } else {
        velocity = 0;
        railPaused = true;
        window.clearTimeout(railResume);
        railResume = window.setTimeout(() => { railPaused = false; }, gesture === "hold" ? 900 : 400);
      }
      if (event && event.pointerId != null && rail.hasPointerCapture(event.pointerId)) {
        rail.releasePointerCapture(event.pointerId);
      }
    }
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    rail.addEventListener("click", (event) => {
      if (gesture !== "tap") {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    place();
    railFrame = requestAnimationFrame(frame);
  }

  function indexOf(id) {
    return visible.findIndex((work) => work.id === id);
  }

  function fill(work) {
    currentId = work.id;
    flipInner.classList.remove("is-turned");
    turn.textContent = "Turn the canvas";
    turn.classList.remove("is-returned");
    viewerImg.src = work.image;
    viewerImg.alt = work.alt;
    viewerTitle.textContent = work.title;
    viewerYear.textContent = work.subtitle ? work.year + "  ·  " + work.subtitle : work.year;
    viewerSeries.textContent = work.series;
    viewerBack.innerHTML = `
      <div class="verso">
        <p class="verso-kicker">Verso  ·  ${work.year}</p>
        <h3></h3>
        <p class="subtitle" hidden></p>
        <dl class="register">
          <dt>Series</dt><dd></dd>
          <dt>Medium</dt><dd></dd>
          <dt>Size</dt><dd></dd>
          <dt>Where</dt><dd></dd>
        </dl>
        <p class="verso-history"></p>
      </div>
    `;
    viewerBack.querySelector("h3").textContent = work.title;
    const subtitle = viewerBack.querySelector(".subtitle");
    if (work.subtitle) {
      subtitle.hidden = false;
      subtitle.textContent = work.subtitle;
    }
    const fields = viewerBack.querySelectorAll("dd");
    fields[0].textContent = work.series;
    fields[1].textContent = work.medium;
    fields[2].textContent = work.size;
    fields[3].textContent = work.place;
    viewerBack.querySelector(".verso-history").textContent = work.history;
    history.replaceState(null, "", "#" + work.id);
  }

  function openWork(id) {
    const pool = visible.some((work) => work.id === id) ? visible : window.ARCHIVE;
    if (pool !== visible) visible = window.ARCHIVE.slice();
    const work = pool.find((item) => item.id === id);
    if (!work) return;
    fill(work);
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("viewer-open");
  }

  function step(direction) {
    const index = indexOf(currentId);
    if (index < 0) return;
    const next = visible[(index + direction + visible.length) % visible.length];
    fill(next);
  }

  turn.addEventListener("click", () => {
    const turned = flipInner.classList.toggle("is-turned");
    turn.textContent = turned ? "Return to the painting" : "Turn the canvas";
    turn.classList.toggle("is-returned", turned);
  });

  document.querySelector("#viewer-close").addEventListener("click", () => dialog.close());
  document.querySelector("#viewer-prev").addEventListener("click", () => step(-1));
  document.querySelector("#viewer-next").addEventListener("click", () => step(1));

  dialog.addEventListener("close", () => {
    document.body.classList.remove("viewer-open");
    flipInner.classList.remove("is-turned");
    history.replaceState(null, "", location.pathname);
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.addEventListener("keydown", (event) => {
    if (!dialog.open) return;
    if (event.key === "ArrowRight") step(1);
    if (event.key === "ArrowLeft") step(-1);
  });

  heroButton.addEventListener("click", () => openWork(heroButton.dataset.open));

  const nav = document.querySelector(".nav");
  document.addEventListener("scroll", () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }, { passive: true });

  renderFilters();
  seriesNote.textContent = window.SERIES[0].note;
  renderGallery();
  mobileQuery.addEventListener("change", renderGallery);

  const opening = location.hash.replace("#", "");
  if (opening && window.ARCHIVE.some((work) => work.id === opening)) openWork(opening);
})();
