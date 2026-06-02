// Cloudflare hosts this frontend, while Vercel hosts the FastAPI backend.
const API_BASE = "https://tamil-dictionary-odv1asyub-itsvinayprogrammers-projects.vercel.app";

const subjectSelect = document.getElementById("subject-select");
const fileSelect = document.getElementById("file-select");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const resultSummary = document.getElementById("result-summary");
const results = document.getElementById("results");
const apiStatus = document.getElementById("api-status");

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

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.textContent = isLoading ? "Searching..." : "Search";
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

async function fetchJson(path) {
  const response = await fetch(apiUrl(path));

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

async function loadFilters() {
  try {
    const [subjectData, fileData] = await Promise.all([
      fetchJson("/api/subjects"),
      fetchJson("/api/files"),
    ]);

    populateSelect(subjectSelect, subjectData.subjects || [], "All Subjects");
    populateSelect(fileSelect, fileData.files || [], "All Files");
    apiStatus.textContent = "Ready";
  } catch (error) {
    apiStatus.textContent = "Unable to load filters";
    resultSummary.textContent = "Check that the API is deployed and DATABASE_URL is set.";
  }
}

function renderResults(items, query) {
  results.innerHTML = "";

  if (items.length === 0) {
    resultSummary.textContent = `No results found for '${query}'`;
    results.innerHTML = '<div class="empty-state">No matching Tamil words found.</div>';
    return;
  }

  resultSummary.textContent = `${items.length} result${items.length === 1 ? "" : "s"} found`;
  results.innerHTML = items
    .map(
      (item) => `
        <article class="result-card">
          <p class="tamil-word">${escapeHtml(item.tamil || "-")}</p>
          <p class="english-word">${escapeHtml(item.english || "-")}</p>
          <div class="badge-row">
            <span class="badge">${escapeHtml(item.subject || "No subject")}</span>
            <span class="badge">${escapeHtml(item.file_name || "No file")}</span>
            <span class="badge">Row ${escapeHtml(item.row_number || "-")}</span>
            <span class="badge">${escapeHtml(item.volume || "No volume")}</span>
          </div>
        </article>
      `
    )
    .join("");
}

async function search() {
  const query = searchInput.value.trim();

  if (!query) {
    searchInput.focus();
    resultSummary.textContent = "Type an English word to search.";
    results.innerHTML = "";
    return;
  }

  const params = new URLSearchParams({
    q: query,
    limit: "50",
  });

  if (subjectSelect.value) {
    params.set("subject", subjectSelect.value);
  }

  if (fileSelect.value) {
    params.set("file_name", fileSelect.value);
  }

  setLoading(true);
  resultSummary.textContent = "Searching...";
  results.innerHTML = "";

  try {
    const data = await fetchJson(`/api/search?${params.toString()}`);
    renderResults(data.results || [], query);
  } catch (error) {
    resultSummary.textContent = "Search failed. Check the API connection and try again.";
  } finally {
    setLoading(false);
  }
}

searchButton.addEventListener("click", search);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    search();
  }
});

loadFilters();
