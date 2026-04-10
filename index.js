const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const urls = {
  uk: 'https://trends.google.com/trending?geo=GB&hl=en-GB&sort=search-volume&hours=24&status=active',
  us: 'https://trends.google.com/trending?geo=US&hl=en-US&sort=search-volume&hours=24&status=active',
  fr: 'https://trends.google.com/trending?geo=FR&hl=en-GB&sort=search-volume&hours=24&status=active',
  es: 'https://trends.google.com/trending?geo=ES&hl=en-GB&sort=search-volume&hours=24&status=active',
  de: 'https://trends.google.com/trending?geo=DE&hl=en-GB&sort=search-volume&hours=24&status=active',
  ar: 'https://trends.google.com/trending?geo=AR&hl=en-GB&sort=search-volume&hours=24&status=active',
  br: 'https://trends.google.com/trending?geo=BR&hl=en-GB&sort=search-volume&hours=24&status=active',
  baleares: 'https://trends.google.com/trending?geo=ES-IB&hl=es-ES&sort=search-volume&hours=24&status=active',
};

// Bug fix: use /trends/explore (correct path) instead of /explore
const buildExploreUrl = (geo, hl, query) =>
  `https://trends.google.com/trends/explore?geo=${encodeURIComponent(geo)}&hl=${encodeURIComponent(hl)}&q=${encodeURIComponent(query)}`;

function getFormattedDate(date) {
  let year = date.getFullYear();
  let month = (1 + date.getMonth()).toString().padStart(2, '0');
  let day = date.getDate().toString().padStart(2, '0');

  return month + '/' + day + '/' + year;
}

const run = async (url, region) => {
  const itemsExtracted = [];
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'] });

  // Bug fix: tbody[class=''] only matches <tbody class="">, not <tbody> with no class attribute.
  // Use the plain tbody selector so rows are always found.
  const rowSelector = "table > tbody > tr";
  const rowsFound = await page.waitForSelector(rowSelector, { timeout: 30000 }).catch(() => null);
  if (!rowsFound) {
    console.log('Warning: table rows not found within timeout. Page may not have loaded correctly.');
    await browser.close();
    return itemsExtracted;
  }

  const newsItems = await page.$$(rowSelector);
  console.log(`Found ${newsItems.length} news items`);
  
  for (let i = 0; i < newsItems.length; i++) {
    const newsItem = newsItems[i];
    if (!newsItem) {
      console.log('News item not found');
      continue;
    }

    const titleElement = await newsItem.$("td:nth-child(2) > div:first-child");
    const searchTrafficEl = await newsItem.$("td:nth-child(3) > div:first-child > div:first-child");
    const searchVolume = searchTrafficEl ? await searchTrafficEl.evaluate(el => el.textContent.trim()) : '';
    const title = titleElement ? await titleElement.evaluate(el => el.textContent.trim()) : '';

    if (!title) {
      console.log(`Row ${i}: no title found, skipping`);
      continue;
    }

    await newsItem.click();
    // Wait for the expansion panel to render instead of searching for language-specific text.
    // Bug fix: the old code searched for "Trend breakdown" (English only), causing ALL rows
    // to be skipped when the page language is not English (e.g. baleares uses hl=es-ES).
    // Use a language-agnostic structural selector; fall back to a fixed wait if not found.
    const trendTermsSelector =
      'div[jsaction][jscontroller] > div[class] > div[class] > div > div[jsaction][jscontroller]';
    await page.waitForSelector(trendTermsSelector, { timeout: 3000 }).catch(() => page.waitForTimeout(600));

    // Extract trending terms using page.evaluate() — much faster than iterating
    // Puppeteer element handles one by one (avoids thousands of round-trips).
    const trendingTerms = await page.evaluate((selector) => {
      const terms = [];
      const divs = document.querySelectorAll(selector);
      divs.forEach(divEl => {
        const wrapper = divEl.querySelector('span[data-is-tooltip-wrapper]');
        if (!wrapper) return;
        const button = wrapper.querySelector('button');
        if (!button) return;
        const spans = button.querySelectorAll('span');
        if (spans.length >= 4) {
          const text = spans[3].textContent.trim();
          if (text) terms.push(text);
        }
      });
      return terms;
    }, trendTermsSelector);

    const links = await page.evaluate(() => {
      const linksReferenced = [];
      const divs = document.querySelectorAll(
        'div[jsaction][jscontroller] > div > div:nth-child(2) > div[jsaction]'
      );
      divs.forEach(div => {
        const link = div.querySelector('a[target="_blank"]');
        if (link) {
          linksReferenced.push(link.href.split('?')[0]);
        }
      });
      return linksReferenced;
    });

    itemsExtracted.push({
      updatedAt: new Date().toISOString(),
      searchBy: title,
      links,
      searchVolume,
      country: region,
      createdAt: getFormattedDate(new Date()),
      trendingTerms,
    });
  }

  await browser.close();
  return itemsExtracted;
};

const escapeCsvField = (field) => {
  const str = String(field ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const filterByKeyword = (items, keyword) => {
  if (!keyword || !keyword.trim()) return items;
  const kw = keyword.trim().toLowerCase();
  return items.filter(item => {
    const inTitle = item.searchBy && item.searchBy.toLowerCase().includes(kw);
    const inTerms = item.trendingTerms && item.trendingTerms.some(t => t.toLowerCase().includes(kw));
    return inTitle || inTerms;
  });
};

const writeTrendingCsv = (items, region, outputDir) => {
  const rows = [];
  rows.push(['rank', 'searchBy', 'searchVolume', 'trendingTerms', 'links', 'country', 'createdAt', 'updatedAt'].join(','));

  items.forEach((item, index) => {
    rows.push([
      index + 1,
      escapeCsvField(item.searchBy),
      escapeCsvField(item.searchVolume),
      escapeCsvField((item.trendingTerms || []).join(' | ')),
      escapeCsvField((item.links || []).join(' | ')),
      escapeCsvField(item.country),
      escapeCsvField(item.createdAt),
      escapeCsvField(item.updatedAt),
    ].join(','));
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `trending_${region}_${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filepath, rows.join('\n'), 'utf8');
  console.log(`CSV saved to: ${filepath}`);
  return filepath;
};

const runAll = async (region, keyword) => {
  console.log('Starting...');
  if (!urls[region]) {
    console.log('Region not found', region);
    process.exit(0);
  }

  const newItems = await run(urls[region], region);
  const filteredItems = filterByKeyword(newItems, keyword);

  if (keyword) {
    console.log(`Filter: "${keyword}" — ${filteredItems.length} of ${newItems?.length} items match`);
  } else {
    console.log('New items', newItems?.length);
  }

  if (filteredItems && filteredItems.length > 0) {
    console.log(filteredItems[0]);
    writeTrendingCsv(filteredItems, region, 'output');
  } else {
    console.log('No items found');
  }
  return filteredItems;
}

const runExplore = async (geo, hl, query) => {
  const url = buildExploreUrl(geo, hl, query);
  console.log('Starting explore scrape...');
  console.log('Navigating to:', url);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'] });

    await page.waitForFunction(
      () => document.querySelectorAll('widget').length > 0,
      { timeout: 30000 }
    ).catch(() => console.log('Warning: widgets not found within timeout. Proceeding with extraction, but results may be incomplete.'));

    const result = await page.evaluate((q, g, h, scrapedUrl) => {
      const extractWidgetRows = (widgetTitle) => {
        const widgets = Array.from(document.querySelectorAll('widget'));
        const widget = widgets.find(w =>
          (w.getAttribute('title') || '').toLowerCase().includes(widgetTitle.toLowerCase()) ||
          (w.getAttribute('type') || '').toLowerCase().includes(widgetTitle.toLowerCase())
        );
        if (!widget) return { top: [], rising: [] };

        const sections = { top: [], rising: [] };
        const seenTerms = new Set();

        // Strategy 1: table rows
        const tables = widget.querySelectorAll('table');
        tables.forEach(table => {
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const term = cells[0]?.textContent?.trim();
              const value = cells[1]?.textContent?.trim();
              if (term && !seenTerms.has(term)) {
                seenTerms.add(term);
                sections.top.push({ term, value: value || '' });
              }
            }
          });
        });

        // Strategy 2: list items
        const listItems = widget.querySelectorAll('li');
        listItems.forEach(li => {
          const termEl = li.querySelector('a, span');
          const valueEl = li.querySelectorAll('span')[1];
          const term = termEl?.textContent?.trim();
          const value = valueEl?.textContent?.trim() || '';
          if (term && !seenTerms.has(term)) {
            seenTerms.add(term);
            sections.top.push({ term, value });
          }
        });

        // Strategy 3: feed-list-item / .label + .value pattern (Angular widget internals)
        const feedItems = widget.querySelectorAll('feed-list-item, .feed-list-item');
        feedItems.forEach(fi => {
          const termEl = fi.querySelector('.label a, .label span, a');
          const valueEl = fi.querySelector('.value span, .value');
          const term = termEl?.textContent?.trim();
          const value = valueEl?.textContent?.trim() || '';
          if (term && !seenTerms.has(term)) {
            seenTerms.add(term);
            sections.top.push({ term, value });
          }
        });

        return sections;
      };

      return {
        query: q,
        geo: g,
        hl: h,
        url: scrapedUrl,
        relatedTopics: extractWidgetRows('related_topics'),
        // Bug fix: was 'related_searches' which never matched the widget type 'fe_related_queries'
        relatedQueries: extractWidgetRows('related_queries'),
        scrapedAt: new Date().toISOString()
      };
    }, query, geo, hl, url);

    console.log('Related topics found:', result.relatedTopics.top.length);
    console.log('Related queries found:', result.relatedQueries.top.length);
    console.log(result);
    return result;
  } finally {
    await browser.close();
  }
};

const writeExploreCsv = (result, outputDir) => {
  const rows = [];
  rows.push(['type', 'term', 'value', 'query', 'geo', 'hl', 'url', 'scrapedAt'].join(','));

  for (const item of result.relatedTopics.top) {
    rows.push([
      'relatedTopic',
      escapeCsvField(item.term),
      escapeCsvField(item.value),
      escapeCsvField(result.query),
      escapeCsvField(result.geo),
      escapeCsvField(result.hl),
      escapeCsvField(result.url),
      escapeCsvField(result.scrapedAt)
    ].join(','));
  }

  for (const item of result.relatedQueries.top) {
    rows.push([
      'relatedQuery',
      escapeCsvField(item.term),
      escapeCsvField(item.value),
      escapeCsvField(result.query),
      escapeCsvField(result.geo),
      escapeCsvField(result.hl),
      escapeCsvField(result.url),
      escapeCsvField(result.scrapedAt)
    ].join(','));
  }

  const safeFilenameChars = /[^a-zA-Z0-9_-]/g;
  const safeQuery = result.query.replace(safeFilenameChars, '_');
  const safeGeo = result.geo.replace(safeFilenameChars, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `explore_${safeGeo}_${safeQuery}_${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filepath, rows.join('\n'), 'utf8');
  console.log(`CSV saved to: ${filepath}`);
  return filepath;
};

const mode = process.argv[2];

if (mode === 'explore') {
  const geo = process.argv[3] || 'ES';
  const hl = process.argv[4] || 'es-ES';
  const query = process.argv[5];
  if (!query || !query.trim()) {
    console.error('Error: a search query is required for explore mode. Usage: node index.js explore <geo> <hl> <query>');
    process.exit(1);
  }
  runExplore(geo, hl, query.trim()).then(result => {
    if (result) {
      writeExploreCsv(result, 'output');
    }
  }).catch(err => {
    console.error('Explore scrape failed:', err);
    process.exit(1);
  });
} else {
  const keyword = process.argv[3];
  runAll(mode || 'uk', keyword);
}
