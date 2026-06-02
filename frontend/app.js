// Cloudflare hosts this frontend, while Vercel hosts the FastAPI backend.
const API_BASE = "https://tamil-dictionary.vercel.app";
const PAGE_SIZE = 50;
const SUGGESTION_LIMIT = 8;
const SUGGESTION_DELAY = 250;

const subjectSelect = document.getElementById("subject-select");
const fileSelect = document.getElementById("file-select");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const resetButton = document.getElementById("reset-button");
const loadMoreButton = document.getElementById("load-more-button");
const suggestions = document.getElementById("suggestions");
const resultSummary = document.getElementById("result-summary");
const results = document.getElementById("results");
const apiStatus = document.getElementById("api-status");

let currentQuery = "";
let currentOffset = 0;
let loadedCount = 0;
let hasMoreResults = false;
let suggestionTimer = null;
let suggestionController = null;
const displayedResultKeys = new Set();

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(value, query) {
  const text = String(value ?? "");
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return escapeHtml(text);
  }

  const pattern = new RegExp(`(${escapeRegExp(trimmedQuery)})`, "ig");
  return escapeHtml(text).replace(pattern, "<mark>$1</mark>");
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.textContent = isLoading ? "Searching..." : "Search";
}

function setLoadMoreLoading(isLoading) {
  loadMoreButton.disabled = isLoading;
  loadMoreButton.textContent = isLoading ? "Loading..." : "Load more";
}

function populateSelect(select, values, label) {
  select.innerHTML = `<option value="">${label}</option>`;

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

async function fetchJson(path, options = {}) {
  const response = await fetch(apiUrl(path), options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function loadFilters() {
  try {
    const cachedSubjects = sessionStorage.getItem("subjects");
    const cachedFiles = sessionStorage.getItem("files");

    if (cachedSubjects && cachedFiles) {
      populateSelect(subjectSelect, JSON.parse(cachedSubjects), "All Subjects");
      populateSelect(fileSelect, JSON.parse(cachedFiles), "All Files");
      apiStatus.textContent = "Ready";
      return;
    }

    const [subjectData, fileData] = await Promise.all([
      fetchJson("/api/subjects"),
      fetchJson("/api/files"),
    ]);

    const subjectsData = subjectData.subjects || [];
    const filesData = fileData.files || [];

    populateSelect(subjectSelect, subjectsData, "All Subjects");
    populateSelect(fileSelect, filesData, "All Files");
    sessionStorage.setItem("subjects", JSON.stringify(subjectsData));
    sessionStorage.setItem("files", JSON.stringify(filesData));
    apiStatus.textContent = "Ready";
  } catch (error) {
    apiStatus.textContent = "Unable to load filters";
    resultSummary.textContent = "Unable to connect. Please refresh or try again later.";
  }
}

function showSkeletonCards() {
  results.innerHTML = Array.from(
    { length: 6 },
    () => `
      <article class="result-card skeleton-card" aria-hidden="true">
        <div class="skeleton-line tamil-skeleton"></div>
        <div class="skeleton-line english-skeleton"></div>
        <div class="skeleton-badges">
          <span></span><span></span><span></span>
        </div>
      </article>
    `
  ).join("");
}

function updateLoadMore() {
  loadMoreButton.hidden = !hasMoreResults;
}

function compactFileName(fileName) {
  return String(fileName || "No file").replaceAll("_", " ");
}

function isMasterFile(item) {
  return String(item.file_name || "").toLowerCase().includes("master");
}

function resultKey(item) {
  return [
    item.english || "",
    item.tamil || "",
    item.subject || "",
    item.volume || "",
  ]
    .map((value) => String(value).trim().toLowerCase())
    .join("|");
}

function dedupeResults(items, append = false) {
  const byKey = new Map();

  items.forEach((item) => {
    const key = resultKey(item);
    const existing = byKey.get(key);

    if (!existing || (isMasterFile(existing) && !isMasterFile(item))) {
      byKey.set(key, item);
    }
  });

  return Array.from(byKey.entries())
    .filter(([key]) => !append || !displayedResultKeys.has(key))
    .map(([key, item]) => {
      displayedResultKeys.add(key);
      return item;
    });
}

function resultCard(item, query) {
  const tamil = item.tamil || "-";
  const english = item.english || "-";
  const subject = item.subject || "No subject";
  const fileName = compactFileName(item.file_name);
  const rowNumber = item.row_number || "-";
  const volume = item.volume || "No volume";

  return `
    <article class="result-card">
      <div class="result-main">
        <div class="word-group">
          <p class="field-label">Tamil</p>
          <p class="tamil-word">${escapeHtml(tamil)}</p>
        </div>
        <button class="copy-button" type="button" data-copy="${escapeHtml(tamil)}" aria-label="Copy Tamil word">
          Copy
        </button>
      </div>
      <div class="english-block">
        <p class="field-label">English</p>
        <p class="english-word">${highlightMatch(english, query)}</p>
      </div>
      <div class="meta-grid">
        <div class="meta-item">
          <span>Subject</span>
          <strong>${escapeHtml(subject)}</strong>
        </div>
        <div class="meta-item">
          <span>Source</span>
          <strong>${escapeHtml(fileName)}</strong>
        </div>
        <div class="meta-item">
          <span>Row</span>
          <strong>${escapeHtml(rowNumber)}</strong>
        </div>
        <div class="meta-item">
          <span>Volume</span>
          <strong>${escapeHtml(volume)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderResults(items, query, append = false) {
  if (!append) {
    results.innerHTML = "";
    loadedCount = 0;
    displayedResultKeys.clear();
  }

  const displayItems = dedupeResults(items, append);

  if (displayItems.length === 0 && !append) {
    resultSummary.textContent = `No results found for '${query}'`;
    results.innerHTML = '<div class="empty-state">No matching Tamil words found.</div>';
    updateLoadMore();
    return;
  }

  loadedCount += displayItems.length;
  resultSummary.textContent = `Showing ${loadedCount} result${loadedCount === 1 ? "" : "s"} for '${query}'`;
  results.insertAdjacentHTML("beforeend", displayItems.map((item) => resultCard(item, query)).join(""));
  updateLoadMore();
}

function buildSearchParams(query, offset = 0) {
  const params = new URLSearchParams({
    q: query,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });

  if (subjectSelect.value) {
    params.set("subject", subjectSelect.value);
  }

  if (fileSelect.value) {
    params.set("file_name", fileSelect.value);
  }

  return params;
}

async function search({ append = false } = {}) {
  const query = searchInput.value.trim();

  if (!query) {
    searchInput.focus();
    resultSummary.textContent = "Type an English word to search.";
    results.innerHTML = "";
    hasMoreResults = false;
    updateLoadMore();
    return;
  }

  hideSuggestions();

  const offset = append ? currentOffset : 0;
  const params = buildSearchParams(query, offset);

  if (append) {
    setLoadMoreLoading(true);
  } else {
    currentQuery = query;
    currentOffset = 0;
    hasMoreResults = false;
    setLoading(true);
    resultSummary.textContent = "Searching...";
    showSkeletonCards();
    updateLoadMore();
  }

  try {
    const data = await fetchJson(`/api/search?${params.toString()}`);
    currentOffset = data.next_offset ?? offset + (data.results || []).length;
    hasMoreResults = Boolean(data.has_more);
    renderResults(data.results || [], query, append);
  } catch (error) {
    resultSummary.textContent = "Unable to connect. Please refresh or try again later.";
    if (!append) {
      results.innerHTML = "";
    }
  } finally {
    setLoading(false);
    setLoadMoreLoading(false);
  }
}

function resetSearch() {
  subjectSelect.value = "";
  fileSelect.value = "";
  searchInput.value = "";
  currentQuery = "";
  currentOffset = 0;
  loadedCount = 0;
  hasMoreResults = false;
  displayedResultKeys.clear();
  resultSummary.textContent = "";
  results.innerHTML = "";
  hideSuggestions();
  updateLoadMore();
  searchInput.focus();
}

function hideSuggestions() {
  suggestions.innerHTML = "";
  suggestions.classList.remove("is-visible");
}

async function loadSuggestions() {
  const query = searchInput.value.trim();

  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  if (suggestionController) {
    suggestionController.abort();
  }

  suggestionController = new AbortController();

  const params = new URLSearchParams({
    q: query,
    limit: String(SUGGESTION_LIMIT),
  });

  if (subjectSelect.value) {
    params.set("subject", subjectSelect.value);
  }

  if (fileSelect.value) {
    params.set("file_name", fileSelect.value);
  }

  try {
    const data = await fetchJson(`/api/suggestions?${params.toString()}`, {
      signal: suggestionController.signal,
    });
    const items = data.suggestions || [];

    if (items.length === 0) {
      hideSuggestions();
      return;
    }

    suggestions.innerHTML = items
      .map(
        (item) => `
          <button class="suggestion-item" type="button" role="option">
            ${highlightMatch(item, query)}
          </button>
        `
      )
      .join("");
    suggestions.classList.add("is-visible");
  } catch (error) {
    if (error.name !== "AbortError") {
      hideSuggestions();
    }
  }
}

function scheduleSuggestions() {
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(loadSuggestions, SUGGESTION_DELAY);
}

async function copyTamil(button) {
  const text = button.dataset.copy || "";
  if (!text || text === "-") {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1200);
  } catch (error) {
    button.textContent = "Copy failed";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1200);
  }
}

searchButton.addEventListener("click", () => search());
resetButton.addEventListener("click", resetSearch);
loadMoreButton.addEventListener("click", () => {
  if (currentQuery && hasMoreResults) {
    search({ append: true });
  }
});

searchInput.addEventListener("input", scheduleSuggestions);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    search();
  }

  if (event.key === "Escape") {
    hideSuggestions();
  }
});

subjectSelect.addEventListener("change", hideSuggestions);
fileSelect.addEventListener("change", hideSuggestions);

suggestions.addEventListener("mousedown", (event) => {
  const item = event.target.closest(".suggestion-item");
  if (!item) {
    return;
  }

  searchInput.value = item.textContent.trim();
  hideSuggestions();
  search();
});

results.addEventListener("click", (event) => {
  const button = event.target.closest(".copy-button");
  if (button) {
    copyTamil(button);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-field")) {
    hideSuggestions();
  }
});

loadFilters();
