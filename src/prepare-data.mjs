import { mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const DEFAULT_PAGE_SIZE = 30;
const DEFAULT_LATEST_SIZE = 30;

export function paginateItems(items, pageSize = DEFAULT_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  return Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    const start = index * pageSize;

    return {
      page,
      pageSize,
      totalPages,
      totalItems: items.length,
      items: items.slice(start, start + pageSize)
    };
  });
}

export async function prepareStaticData({
  outDir = DEFAULT_DATA_DIR,
  items,
  status,
  pageSize = DEFAULT_PAGE_SIZE,
  latestSize = DEFAULT_LATEST_SIZE
} = {}) {
  const resolvedItems = items ?? (await readJson(path.join(outDir, 'news.json'), { items: [] })).items;
  const resolvedStatus =
    status ??
    (await readJson(path.join(outDir, 'status.json'), {
      generatedAt: new Date().toISOString(),
      sourceCount: 0,
      itemCount: resolvedItems.length,
      errors: []
    }));
  const pages = paginateItems(resolvedItems, pageSize);
  const manifest = createManifest(resolvedItems, resolvedStatus, pages);

  await mkdir(outDir, { recursive: true });
  await rm(path.join(outDir, 'pages'), { recursive: true, force: true });
  await mkdir(path.join(outDir, 'pages'), { recursive: true });

  await writeJson(path.join(outDir, 'latest.json'), {
    page: 1,
    pageSize: latestSize,
    totalItems: resolvedItems.length,
    items: resolvedItems.slice(0, latestSize)
  });
  await writeJson(path.join(outDir, 'manifest.json'), manifest);

  for (const page of pages) {
    await writeJson(path.join(outDir, 'pages', `${page.page}.json`), page);
  }

  const archives = await collectArchives(outDir);
  await writeJson(path.join(outDir, 'archives.json'), archives);

  return { pages, manifest };
}

async function collectArchives(outDir) {
  const archiveDir = path.join(outDir, 'archive');
  const archives = [];
  try {
    const dates = await readdir(archiveDir);
    for (const date of dates) {
      const datePath = path.join(archiveDir, date);
      const s = await stat(datePath);
      if (s.isDirectory()) {
        const files = await readdir(datePath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            archives.push({
              id: `${date}/${file.replace('.json', '')}`,
              date,
              time: file.replace('.json', ''),
              path: `/data/archive/${date}/${file}`
            });
          }
        }
      }
    }
  } catch {
    // No archives yet
  }
  return archives.sort((a, b) => b.path.localeCompare(a.path));
}

function createManifest(items, status, pages) {
  return {
    generatedAt: status.generatedAt,
    totalItems: items.length,
    pageSize: pages[0]?.pageSize ?? DEFAULT_PAGE_SIZE,
    totalPages: pages.length,
    categories: [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
    sources: createSourceStats(items),
    errors: status.errors ?? []
  };
}

function createSourceStats(items) {
  const sources = new Map();

  for (const item of items) {
    const current = sources.get(item.sourceName) ?? {
      name: item.sourceName,
      category: item.category,
      count: 0
    };
    current.count += 1;
    sources.set(item.sourceName, current);
  }

  return [...sources.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareStaticData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
