import './styles.css';

import { site } from './config.mjs';
import {
  canLoadNextPage,
  filterItems,
  formatDate,
  getCategories,
  getLeadItem,
  shouldEnableCursorEffects,
  summarizeStatus
} from './news-ui.mjs';

const app = document.querySelector('#app');

async function bootstrap() {
  const [latestResponse, statusResponse, manifestResponse, briefResponse, archivesResponse] = await Promise.all([
    fetchJson('/data/latest.json', { items: [] }),
    fetchJson('/data/status.json', { generatedAt: '', sourceCount: 0, itemCount: 0, errors: [] }),
    fetchJson('/data/manifest.json', { totalPages: 1, categories: [], sources: [], totalItems: 0 }),
    fetchJson('/data/daily-brief.json', null),
    fetchJson('/data/archives.json', [])
  ]);

  renderShell(latestResponse.items ?? [], statusResponse, manifestResponse, briefResponse, archivesResponse);
}

async function fetchJson(url, fallback) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return fallback;
    }
    return response.json();
  } catch {
    return fallback;
  }
}

function renderShell(initialItems, status, manifest, dailyBrief, archives) {
  const state = {
    items: [...initialItems],
    archiveItems: [],
    currentPage: 1,
    totalPages: manifest.totalPages || 1,
    isLoading: false,
    isArchive: false
  };
  const lead = getLeadItem(initialItems);
  const categories = manifest.categories?.length ? manifest.categories : getCategories(initialItems);

  app.innerHTML = `
    <header class="site-header">
      <nav class="nav">
        <a class="brand" href="/">
          <img class="brand-mark" src="/logo.svg" alt="" aria-hidden="true">
          <span>${escapeHtml(site.title)}</span>
        </a>
      </nav>
      <section class="hero">
        <div class="hero-copy">
          <p class="kicker">Automated Palimpsest</p>
          <h1>${escapeHtml(site.tagline)}</h1>
          <p class="deck">${escapeHtml(site.description)} Every item links back to its original source.</p>
        </div>
        ${lead ? renderLead(lead) : '<div class="lead-panel empty-panel">No lead item available.</div>'}
      </section>
    </header>

    <main class="page">
      ${dailyBrief ? renderDailyBrief(dailyBrief) : ''}

      <section class="briefing-bar" aria-label="Briefing status">
        <div>
          <span class="label">Status</span>
          <strong>${escapeHtml(summarizeStatus(status))}</strong>
        </div>
        <div>
          <span class="label">Updated</span>
          <strong>${escapeHtml(formatDate(status.generatedAt))}</strong>
        </div>
      </section>

      <section class="controls" aria-label="Filters">
        <label class="search-field">
          <span>Search</span>
          <input id="search" type="search" placeholder="Search title, summary, or source">
        </label>
        <label>
          <span>Category</span>
          <select id="category">
            <option value="">All categories</option>
            ${categories.map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join('')}
          </select>
        </label>
        ${archives.length > 0 ? `
        <label>
          <span>Archive</span>
          <select id="archive">
            <option value="">Current (Latest)</option>
            ${archives.map((a) => `<option value="${escapeAttr(a.path)}">${escapeHtml(a.date + ' ' + a.time)}</option>`).join('')}
          </select>
        </label>` : ''}
        <button id="knife-toggle" class="knife-btn" aria-label="Toggle scraping knife" title="Scrape and rewrite content">
          <svg viewBox="0 0 32 32" width="24" height="24" fill="none">
            <path d="M 12 10 L 26 2 L 30 6 L 16 16 Z" fill="#5a524e" stroke="#312117" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M 12 10 L 16 16 L 10 24 C 6 28, 4 30, 2 30 C 2 28, 5 22, 6 18 Z" fill="#e2dac9" stroke="#312117" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M 6 18 L 12 10" stroke="#ffffff" stroke-width="1"/>
          </svg>
        </button>
      </section>

      <section class="content-grid">
        <aside class="source-panel">
          <span class="label">Sources</span>
          ${renderSources(manifest.sources ?? [])}
        </aside>
        <section>
          <div class="section-heading">
            <div>
              <span class="label">Latest</span>
              <h2>Briefing Queue</h2>
            </div>
            <span id="result-count" class="result-count"></span>
          </div>
          <div id="feed" class="feed" aria-live="polite"></div>
          <div id="load-sentinel" class="load-sentinel" aria-live="polite"></div>
        </section>
      </section>
    </main>

    <footer class="site-footer">
      <p>${escapeHtml(site.disclaimer)}</p>
    </footer>
  `;

  const search = document.querySelector('#search');
  const category = document.querySelector('#category');
  const archive = document.querySelector('#archive');
  const feed = document.querySelector('#feed');
  const resultCount = document.querySelector('#result-count');
  const loadSentinel = document.querySelector('#load-sentinel');

  function renderList() {
    const filtered = filterItems(state.items, {
      query: search.value,
      category: category.value
    });

    resultCount.textContent = `${filtered.length} loaded · ${state.isArchive ? state.archiveItems.length : (manifest.totalItems ?? state.items.length)} total`;
    feed.innerHTML =
      filtered.length > 0
        ? filtered.map(renderItem).join('')
        : '<div class="empty-state">No matching briefings.</div>';

    loadSentinel.textContent = getLoadStateText(state);
    loadSentinel.hidden = state.currentPage >= state.totalPages && !state.isLoading;
  }

  async function loadNextPage() {
    if (!canLoadNextPage(state)) {
      return;
    }

    state.isLoading = true;
    renderList();

    try {
      const nextPage = state.currentPage + 1;
      if (state.isArchive) {
        const start = state.currentPage * 30;
        const newItems = state.archiveItems.slice(start, start + 30);
        state.items.push(...newItems);
        state.currentPage = nextPage;
      } else {
        const page = await fetchJson(`/data/pages/${nextPage}.json`, { items: [], page: nextPage });
        state.items.push(...(page.items ?? []));
        state.currentPage = page.page ?? nextPage;
      }
    } finally {
      state.isLoading = false;
      renderList();
    }
  }

  search.addEventListener('input', renderList);
  category.addEventListener('change', renderList);

  if (archive) {
    archive.addEventListener('change', async () => {
      const path = archive.value;
      if (!path) {
        state.items = [...initialItems];
        state.archiveItems = [];
        state.currentPage = 1;
        state.totalPages = manifest.totalPages || 1;
        state.isArchive = false;
        renderList();
      } else {
        state.isLoading = true;
        renderList();
        try {
          const data = await fetchJson(path, { items: [] });
          state.archiveItems = data.items || [];
          state.items = state.archiveItems.slice(0, 30);
          state.currentPage = 1;
          state.totalPages = Math.ceil(state.archiveItems.length / 30) || 1;
          state.isArchive = true;
        } finally {
          state.isLoading = false;
          renderList();
        }
      }
    });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadNextPage();
        }
      },
      { rootMargin: '360px 0px' }
    );
    observer.observe(loadSentinel);
  }

  const knifeToggle = document.querySelector('#knife-toggle');
  if (knifeToggle) {
    knifeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('knife-mode');
      knifeToggle.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!document.documentElement.classList.contains('knife-mode')) return;
      if (knifeToggle.contains(e.target)) return;

      e.preventDefault();
      e.stopPropagation();

      const target = e.target;
      if (['P', 'H1', 'H2', 'H3', 'SPAN', 'STRONG', 'A', 'DIV'].includes(target.tagName) && !target.classList.contains('controls')) {
        if (!target.isContentEditable) {
          target.classList.add('scraped');
          target.setAttribute('contenteditable', 'true');
          target.textContent = '';
          target.focus();
        }
      }
    }, true);
  }

  renderList();
}

function getLoadStateText(state) {
  if (state.isLoading) {
    return 'Loading...';
  }

  return state.currentPage >= state.totalPages ? 'End of briefing.' : 'Scroll for more.';
}

function renderDailyBrief(brief) {
  return `
    <section class="daily-brief" aria-label="Daily brief">
      <div class="daily-brief-copy">
        <span class="label">Daily Brief</span>
        <p>${escapeHtml(brief.narrative || 'No daily brief available.')}</p>
        <div class="brief-meta">
          <span>${escapeHtml(brief.generatedBy === 'gemini' ? 'Gemini-assisted' : 'Local fallback')}</span>
          <span>${escapeHtml(formatDate(brief.generatedAt))}</span>
        </div>
      </div>
      <div class="topic-strip">
        ${(brief.topics ?? []).slice(0, 4).map(renderTopic).join('')}
      </div>
    </section>
  `;
}

function renderTopic(topic) {
  return `
    <div class="topic-pill">
      <strong>${escapeHtml(topic.name)}</strong>
      <span>${escapeHtml(topic.itemCount)} items</span>
    </div>
  `;
}

function renderLead(item) {
  return `
    <article class="lead-panel">
      <span class="label">Top Signal</span>
      <h2><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.summary || 'No summary provided by source.')}</p>
      <div class="item-meta">
        <span>${escapeHtml(item.sourceName)}</span>
        <span>${escapeHtml(item.category)}</span>
        <time datetime="${escapeAttr(item.publishedAt)}">${escapeHtml(formatDate(item.publishedAt))}</time>
      </div>
    </article>
  `;
}

function renderSources(sources) {
  return sources
    .map(
      (source) => `
        <div class="source-row">
          <span>${escapeHtml(source.name)}</span>
          <strong>${source.count}</strong>
        </div>
      `
    )
    .join('');
}

function renderItem(item) {
  return `
    <article class="briefing-item">
      <div class="item-meta">
        <span>${escapeHtml(item.sourceName)}</span>
        <span>${escapeHtml(item.category)}</span>
        <time datetime="${escapeAttr(item.publishedAt)}">${escapeHtml(formatDate(item.publishedAt))}</time>
      </div>
      <h3><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>
      <p>${escapeHtml(item.summary || 'No summary provided by source.')}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

bootstrap().catch((error) => {
  app.innerHTML = `<main class="page"><div class="empty-state">Failed to load briefing data: ${escapeHtml(error.message)}</div></main>`;
});

setupMagicMouseCursor();

async function setupMagicMouseCursor() {
  const hover = window.matchMedia('(hover: hover)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!shouldEnableCursorEffects({ hover, finePointer, reducedMotion })) {
    return;
  }

  try {
    document.documentElement.classList.add('has-magic-mouse');
  } catch {
    document.documentElement.classList.remove('has-magic-mouse');
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}
