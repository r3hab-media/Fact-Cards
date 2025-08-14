"use strict";

// Subjects
const SUBJECTS = [
	{ key: "all", label: "All categories" },
	{ key: "history", label: "History" },
	{ key: "science", label: "Science" },
	{ key: "space", label: "Space" },
	{ key: "nature", label: "Nature" },
	{ key: "tech", label: "Tech" },
];

// HTTP helper with timeout
function withTimeout(p, ms) {
	return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
async function getJSON(url) {
	const p = fetch(url, { headers: { Accept: "application/json" } }).then((r) => {
		if (!r.ok) throw new Error("HTTP " + r.status);
		return r.json();
	});
	return withTimeout(p, 3500);
}

// Wikipedia random summary from categories
async function wikiRandomFromCategories(categories) {
	const cat = categories[Math.floor(Math.random() * categories.length)];
	const listUrl = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(
		cat
	)}&cmlimit=50&format=json&origin=*`;
	const list = await getJSON(listUrl);
	const items = list?.query?.categorymembers?.filter((m) => m.ns === 0) || [];
	if (items.length === 0) throw new Error("No pages in category");
	const pick = items[Math.floor(Math.random() * items.length)];
	const titleEnc = encodeURIComponent(pick.title);
	const sum = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleEnc}`);
	const text = sum.extract || sum.description || pick.title;
	const url = sum.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${titleEnc}`;
	const imageUrl = sum.thumbnail?.source || sum.originalimage?.source || null;
	const title = sum.title || pick.title;
	return { title, text, sourceUrl: url, imageUrl };
}

// Providers
async function fetchHistory() {
	const r = await wikiRandomFromCategories(["History", "Historical_events", "Years"]);
	return { ...r, cat: "history" };
}
async function fetchScience() {
	const r = await wikiRandomFromCategories(["Science", "Physics", "Biology", "Chemistry"]);
	return { ...r, cat: "science" };
}
async function fetchSpace() {
	const r = await wikiRandomFromCategories(["Astronomy", "Spaceflight", "Planets"]);
	return { ...r, cat: "space" };
}
async function fetchNature() {
	try {
		const j = await getJSON("https://catfact.ninja/fact");
		return { title: "Cat Fact", text: j.fact, cat: "nature", sourceUrl: "https://catfact.ninja/", imageUrl: null };
	} catch {
		const r = await wikiRandomFromCategories(["Biology", "Animals", "Plants"]);
		return { ...r, cat: "nature" };
	}
}
async function fetchTech() {
	const r = await wikiRandomFromCategories(["Technology", "Computing"]);
	return { ...r, cat: "tech" };
}

// Registry and icons
const SUBJECT_PROVIDERS = { history: [fetchHistory], science: [fetchScience], space: [fetchSpace], nature: [fetchNature], tech: [fetchTech] };
const CATEGORY_ICONS = { history: "fa-landmark", science: "fa-flask", space: "fa-rocket", nature: "fa-leaf", tech: "fa-microchip" };

// Elements
const deckEl = document.getElementById("deck");
const categorySelect = document.getElementById("categorySelect");
const reshuffleBtn = document.getElementById("reshuffleBtn");

// Build select
function buildSelect() {
	categorySelect.innerHTML = SUBJECTS.map((s) => `<option value="${s.key}">${s.label}</option>`).join("");
	const saved = localStorage.getItem("lastSubject");
	categorySelect.value = saved && SUBJECTS.some((s) => s.key === saved) ? saved : "all";
}

// ID + colors
let idCounter = 0;
const usedIds = new Set();
function nextId() {
	let id;
	do {
		id = "card-" + ++idCounter;
	} while (usedIds.has(id));
	usedIds.add(id);
	return id;
}
function hslToRgb(h, s, l) {
	s /= 100;
	l /= 100;
	const k = (n) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
function relLuminance([r, g, b]) {
	const s = [r, g, b].map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
	return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}
function contrastRatio(a, b) {
	const L1 = relLuminance(a),
		L2 = relLuminance(b);
	const hi = Math.max(L1, L2),
		lo = Math.min(L1, L2);
	return (hi + 0.05) / (lo + 0.05);
}
function randomReadableColors() {
	const h = Math.floor(Math.random() * 360),
		s = 70 + Math.floor(Math.random() * 25),
		l = 48 + Math.floor(Math.random() * 10);
	const rgb = hslToRgb(h, s, l);
	const white = [255, 255, 255],
		black = [0, 0, 0];
	const fg = contrastRatio(rgb, white) >= contrastRatio(rgb, black) ? "#fff" : "#000";
	return { bg: `hsl(${h} ${s}% ${l}%)`, fg };
}

// Queue + fetching with instant paint + cache
let queue = [];
const VISIBLE = 5;
let fetching = false;

const FACT_SEED = [
	{ title: "Quick fact", text: "Honey never spoils.", cat: "history" },
	{ title: "Quick fact", text: "Bananas are berries.", cat: "science" },
	{ title: "Quick fact", text: "Neutron stars can spin fast.", cat: "space" },
	{ title: "Quick fact", text: "Octopuses have three hearts.", cat: "nature" },
	{ title: "Quick fact", text: "Apollo guidance had ~64KB RAM.", cat: "tech" },
];
function cacheKey(subject) {
	return `facts:${subject}`;
}
function loadCache(subject) {
	try {
		const j = localStorage.getItem(cacheKey(subject));
		return j ? JSON.parse(j) : [];
	} catch {
		return [];
	}
}
function saveCache(subject, items) {
	try {
		localStorage.setItem(cacheKey(subject), JSON.stringify(items.slice(0, 40)));
	} catch {}
}

async function primeInstant(subject) {
	try {
		const fast = await withTimeout(fetchBatch(subject, VISIBLE), 1200);
		if (Array.isArray(fast) && fast.length) {
			queue.push(...fast.slice(0, VISIBLE));
			return;
		}
	} catch {}
	const cached = loadCache(subject);
	const base = cached && cached.length ? cached.slice(0, VISIBLE) : FACT_SEED.map((x) => (subject === "all" ? x : { ...x, cat: subject }));
	queue.push(...base);
}
async function fetchBatch(subjectKey, count = 12) {
	const keys = subjectKey === "all" ? Object.keys(SUBJECT_PROVIDERS) : [subjectKey];
	const providers = keys.flatMap((k) => SUBJECT_PROVIDERS[k] || []);
	if (providers.length === 0) return [];
	const tasks = Array.from({ length: count }, (_, i) => providers[i % providers.length]());
	const settled = await Promise.allSettled(tasks.map((t) => withTimeout(t, 3500)));
	const out = settled.filter((r) => r.status === "fulfilled" && r.value?.text).map((r) => r.value);
	if (subjectKey !== "all" && out.length) saveCache(subjectKey, [...loadCache(subjectKey), ...out]);
	return out;
}
async function fillQueue(subjectKey, count = 8) {
	if (fetching) return;
	fetching = true;
	const out = await fetchBatch(subjectKey, count);
	queue.push(...out);
	fetching = false;
}

// Card factory (with clamp + expand)
const MAX_PREVIEW_LINES = 8;

function applyClamping(p, lines, btn) {
	// enforce clamp styles
	p.style.display = "-webkit-box";
	p.style.webkitBoxOrient = "vertical";
	p.style.overflow = "hidden";
	p.style.webkitLineClamp = String(lines);
	p.dataset.full = "false";

	// measure overflow
	void p.offsetHeight; // reflow
	const truncated = p.scrollHeight > p.clientHeight + 1;

	if (truncated) {
		p.classList.add("clamped");
		if (btn) btn.classList.remove("d-none");
	} else {
		p.classList.remove("clamped");
		if (btn) btn.classList.add("d-none"); // hide toggle if not needed
	}
}

function createCard(item) {
	const { bg, fg } = randomReadableColors();
	const id = nextId();
	const card = document.createElement("article");
	card.className = "card card-item";
	card.id = id;
	card.setAttribute("data-cat", item.cat);

	const srcLink = item.sourceUrl ? `<a target="_blank" rel="noopener" href="${item.sourceUrl}" class="link-light link-underline-opacity-25">source</a>` : "";

	let media = "";
	if (item.imageUrl) {
		media = `<div class="ratio ratio-16x9 card-media mb-2"><img class="card-media-img" src="${item.imageUrl}" alt="${item.cat} image" loading="lazy"></div>`;
	} else {
		const icon = CATEGORY_ICONS[item.cat] || "fa-circle-info";
		media = `<div class="card-icon mb-2" aria-hidden="true"><i class="fa-solid ${icon}" style="color:${fg};"></i></div>`;
	}

	const titleLine = item.title ? `<h3 class="h6 m-0">${item.title}</h3>` : "";

const factId = `${id}-fact`;
const btnId = `${id}-toggle`;

card.innerHTML = `
      <div class="badge-hint badge-nope">Nope</div>
      <div class="badge-hint badge-like">Keep</div>
      <div class="card-body" style="background:${bg}; color:${fg}">
        <div class="d-flex align-items-center justify-content-between">
          <span class="badge rounded-pill bg-dark border border-light-subtle">${item.cat}</span>
          <!--<small style="${fg === "#000" ? "color:rgba(0,0,0,.7)" : "color:rgba(255,255,255,.8)"}">ID: ${id}</small>-->
        </div>
        ${media}
        ${titleLine}
        <p id="${factId}" class="m-0 mt-1 fact-text" data-full="false">${item.text}</p>
        <div class="mt-auto d-flex justify-content-between align-items-center gap-2">
          <div>${srcLink}</div>
          <div class="d-flex gap-2">
            <button id="${btnId}" class="btn btn-sm btn-outline-light read-more d-none" type="button">Read more</button>
            <button class="btn btn-sm btn-outline-light share-btn" type="button"><i class="fa-solid fa-share-nodes me-1"></i>Share</button>
          </div>
        </div>
      </div>`;

const p = card.querySelector("#" + factId);
const btn = card.querySelector("#" + btnId);
// applyClamping(p, MAX_PREVIEW_LINES, btn);

setupSwipe(card);
setupShare(card, item);
setupClampToggle(card, factId, btnId);

if (item.text && item.text.length > 280) card.classList.add("long");

return card;
}

function clampParagraph(p, lines) {
	p.style.display = "-webkit-box";
	p.style.webkitBoxOrient = "vertical";
	p.style.overflow = "hidden";
	p.style.webkitLineClamp = String(lines);
	p.dataset.full = "false";
	p.classList.add("clamped");
}

// Layout and replenish
function layoutStack() {
	const cards = Array.from(deckEl.querySelectorAll(".card-item"));
	const topFirst = cards.slice().reverse();
	topFirst.forEach((c, depth) => {
		c.dataset.depth = String(Math.min(depth, 4));
		c.style.zIndex = String(100 - depth);
		c.style.transform = ""; // let CSS fan apply
		c.style.pointerEvents = depth === 0 ? "auto" : "none";
		c.classList.remove("dragging");
	});
}
function replenish() {
    const current = deckEl.querySelectorAll(".card-item").length;
    const need = Math.max(0, VISIBLE - current);
    for (let i = 0; i < need && queue.length; i++) {
        const item = queue.shift();
        const el = createCard(item);
        deckEl.insertBefore(el, deckEl.firstChild);
        // Ensure clamping runs after DOM insert
        const p = el.querySelector(".fact-text");
        const btn = el.querySelector(".read-more");
        applyClamping(p, MAX_PREVIEW_LINES, btn);
    }
    layoutStack();
    if (queue.length < VISIBLE) {
        fillQueue(categorySelect.value, 8);
    }
}

// Swipe mechanics
const DRAG = { startX: 0, startY: 0, dx: 0, dy: 0, active: false, el: null };
function setupSwipe(card) {
	card.addEventListener("pointerdown", onPointerDown);
}
function onPointerDown(e) {
	// Ignore drags started on interactive controls to allow clicks to work
	if (e.target.closest("button, a, select, .read-more, .share-btn")) return;

	const top = topCard();
	if (!top || e.currentTarget !== top) return;
	DRAG.active = true;
	DRAG.el = top;
	DRAG.startX = e.clientX;
	DRAG.startY = e.clientY;
	DRAG.dx = 0;
	DRAG.dy = 0;
	DRAG.el.setPointerCapture(e.pointerId);
	DRAG.el.classList.add("dragging");
	window.addEventListener("pointermove", onPointerMove);
	window.addEventListener("pointerup", onPointerUp, { once: true });
	window.addEventListener("pointercancel", cancelDrag, { once: true });
}
function onPointerMove(e) {
	if (!DRAG.active || !DRAG.el) return;
	DRAG.dx = e.clientX - DRAG.startX;
	DRAG.dy = e.clientY - DRAG.startY;
	const rotate = DRAG.dx * 0.06;
	DRAG.el.style.transform = `translate(${DRAG.dx}px, ${DRAG.dy}px) rotate(${rotate}deg)`;
	const like = DRAG.el.querySelector(".badge-like");
	const nope = DRAG.el.querySelector(".badge-nope");
	const mag = Math.min(1, Math.abs(DRAG.dx) / 120);
	if (DRAG.dx > 0) {
		like.style.opacity = mag;
		like.style.transform = `scale(${0.9 + mag * 0.2})`;
		nope.style.opacity = 0;
	} else if (DRAG.dx < 0) {
		nope.style.opacity = mag;
		nope.style.transform = `scale(${0.9 + mag * 0.2})`;
		like.style.opacity = 0;
	} else {
		like.style.opacity = 0;
		nope.style.opacity = 0;
	}
}
function onPointerUp() {
	if (!DRAG.active || !DRAG.el) return;
	const el = DRAG.el;
	const threshold = 120;
	const keep = DRAG.dx > threshold,
		skip = DRAG.dx < -threshold;
	window.removeEventListener("pointermove", onPointerMove);
	el.classList.remove("dragging");
	if (keep || skip) {
		const dir = keep ? 1 : -1;
		el.style.transition = "transform .25s ease, opacity .25s ease";
		el.style.transform = `translate(${dir * window.innerWidth}px, ${DRAG.dy}px) rotate(${dir * 30}deg)`;
		el.style.opacity = "0";
		setTimeout(() => {
			el.remove();
			replenish();
		}, 220);
	} else {
		el.style.transition = "transform .2s ease";
		el.style.transform = "translate(0,0) rotate(0deg)";
		const like = el.querySelector(".badge-like");
		const nope = el.querySelector(".badge-nope");
		like.style.opacity = 0;
		nope.style.opacity = 0;
		const tidy = () => {
			el.style.transform = "";
			el.removeEventListener("transitionend", tidy);
		};
		el.addEventListener("transitionend", tidy, { once: true });
	}
	DRAG.active = false;
	DRAG.el = null;
}
function cancelDrag() {
	DRAG.active = false;
	DRAG.el = null;
	window.removeEventListener("pointermove", onPointerMove);
}
function topCard() {
	const cards = deckEl.querySelectorAll(".card-item");
	return cards[cards.length - 1] || null;
}

// Share
function setupShare(card, item) {
	const btn = card.querySelector(".share-btn");
	if (!btn) return;
	const payload = { title: item.title || `Interesting ${item.cat} fact`, text: item.text, url: item.sourceUrl || undefined };
	if (navigator.share) {
		btn.addEventListener("click", async (e) => {
			e.stopPropagation();
			try {
				await navigator.share(payload);
			} catch {}
		});
	} else {
		btn.addEventListener("click", async (e) => {
			e.stopPropagation();
			const text = [payload.title, payload.text, payload.url || ""].filter(Boolean).join("\n\n");
			try {
				await navigator.clipboard.writeText(text);
				btn.textContent = "Copied";
				setTimeout(() => (btn.innerHTML = '<i class="fa-solid fa-share-nodes me-1"></i>Share'), 1200);
			} catch {
				alert("Copy failed.");
			}
		});
	}
}

// Clamp toggle
function setupClampToggle(card, factId, btnId) {
	const p = card.querySelector("#" + factId);
	const btn = card.querySelector("#" + btnId);
	if (!p || !btn) return;

	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		const expanded = p.dataset.full === "true";
		if (!expanded) {
			p.style.webkitLineClamp = "unset";
			p.style.display = "block";
			p.style.overflow = "visible";
			p.dataset.full = "true";
			p.classList.remove("clamped");
			btn.textContent = "Show less";
			const body = card.querySelector(".card-body");
			body.style.overflowY = "auto";
			body.style.webkitOverflowScrolling = "touch";
		} else {
			clampParagraph(p, MAX_PREVIEW_LINES);
			p.classList.add("clamped");
			btn.textContent = "Read more";
			const body = card.querySelector(".card-body");
			body.style.overflowY = "";
			body.scrollTop = 0;
		}
	});
}

// Events
categorySelect.addEventListener("change", async () => {
	const subj = categorySelect.value;
	localStorage.setItem("lastSubject", subj);
	deckEl.innerHTML = "";
	queue = [];
	await primeInstant(subj);
	replenish();
	fillQueue(subj, 10).then(replenish);
});
reshuffleBtn.addEventListener("click", async () => {
	const subj = categorySelect.value;
	deckEl.innerHTML = "";
	queue = [];
	await primeInstant(subj);
	replenish();
	fillQueue(subj, 10).then(replenish);
});

// Init
buildSelect();
const initialSubject = categorySelect.value || "all";
(async () => {
	await primeInstant(initialSubject);
	replenish();
})();
fillQueue(initialSubject, 12).then(() => {
	replenish();
	setTimeout(runTests, 0);
});

// Tests
function testUniqueIds() {
	const ids = Array.from(document.querySelectorAll(".card-item")).map((n) => n.id);
	const unique = new Set(ids);
	console.assert(unique.size === ids.length, "Duplicate card IDs found", { ids });
}
function testOrder() {
	const cards = deckEl.querySelectorAll(".card-item");
	if (cards.length < 2) return;
	const secondId = cards[cards.length - 2].id;
	cards[cards.length - 1].remove();
	replenish();
	const after = deckEl.querySelectorAll(".card-item");
	const newTopId = after[after.length - 1]?.id;
	console.assert(newTopId === secondId, "Order test failed", { expected: secondId, got: newTopId });
}
function testSelectBuilt() {
	console.assert(categorySelect.options.length >= SUBJECTS.length, "Select not populated correctly");
}
function testIconFallback() {
	const tmpItem = { title: "Dummy", text: "x", cat: "tech", sourceUrl: null, imageUrl: null };
	const el = createCard(tmpItem);
	console.assert(el.querySelector(".card-icon"), "Icon fallback missing when no imageUrl");
	el.remove();
}
function testShareButton() {
	const top = topCard();
	console.assert(!top || top.querySelector(".share-btn"), "Share button missing on card");
}
function testInstantPaint() {
	const atStart = document.querySelectorAll(".card-item").length;
	console.assert(atStart >= 1, "Instant paint failed to render any cards immediately");
}
function testFanApplied() {
	const cards = deckEl.querySelectorAll(".card-item");
	if (cards.length === 0) return;
	const top = cards[cards.length - 1];
	console.assert(top.dataset.depth === "0", "Top card depth should be 0 for fan effect");
}
function testClamp() {
	const top = topCard();
	if (!top) return;
	const p = top.querySelector(".fact-text");
	console.assert(p && p.dataset.full === "false" && p.classList.contains("clamped"), "Fact should start clamped with fade");
}
function runTests() {
	testUniqueIds();
	testOrder();
	testSelectBuilt();
	testIconFallback();
	testShareButton();
	testInstantPaint();
	testFanApplied();
	testClamp();
}
