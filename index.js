const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const urls = {
  uk: 'https://trends.google.com/trending?geo=GB&hl=en-GB&sort=search-volume&hours=24&&status=active',
  us: 'https://trends.google.com/trending?geo=US&hl=en-US&sort=search-volume&hours=24&status=active',
  fr: 'https://trends.google.com/trending?geo=FR&hl=en-GB&sort=search-volume&hours=24&status=active',
  es: 'https://trends.google.com/trending?geo=ES&hl=en-GB&sort=search-volume&hours=24&status=active',
  de: 'https://trends.google.com/trending?geo=DE&hl=en-GB&sort=search-volume&hours=24&status=active',
  ar: 'https://trends.google.com/trending?geo=AR&hl=en-GB&sort=search-volume&hours=24&status=active',
  br: 'https://trends.google.com/trending?geo=BR&hl=en-GB&sort=search-volume&hours=24&status=active',
  baleares: 'https://trends.google.com/trending?geo=ES-IB&hl=es-ES&sort=search-volume&hours=24&status=active',
};

const buildExploreUrl = (geo, hl, query) =>
  `https://trends.google.com/explore?geo=${encodeURIComponent(geo)}&hl=${encodeURIComponent(hl)}&q=${encodeURIComponent(query)}`;

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
  await page.goto(url, { waitUntil: ['domcontentloaded','networkidle2'] });
  await page.waitForSelector("table > tbody[class=''] > tr");
  
  const newsItems = await page.$$("table > tbody[class=''] > tr");
  console.log(`Found ${newsItems.length} news items`);
  
  let trendingTerms = [];
  let term = null;
  for (let i = 0; i < newsItems.length; i++) {
    trendingTerms = [];
    term = null;

    const newsItem = newsItems[i];
    if (!newsItem) {
      console.log('News item not found');
      continue;
    }
    
    await newsItem.click();

    const titleElement = await newsItem.$("td:nth-child(2) > div:first-child");
    const searchTrafficEl = await newsItem.$("td:nth-child(3) > div:first-child > div:first-child");
    const searchVolume = searchTrafficEl ? await searchTrafficEl.evaluate(el => el.textContent.trim()) : '';
    const title = titleElement ? await titleElement.evaluate(el => el.textContent.trim()) : '';

    const allDivs = await page.$$('div');
    const trendHeaderDivs = [];
    for (const div of allDivs) {
      const textContent = await div.evaluate(el => el.textContent);
      if (textContent.includes('Trend breakdown')) {
        trendHeaderDivs.push(div);
      }
    }
    const trendHeaderDiv = trendHeaderDivs.length > 0 ? trendHeaderDivs[0] : null;

    if (!trendHeaderDiv) {
      console.log('Trend breakdown div not found');
      continue;
    }

    const divs = await page.$$('div[jsaction][jscontroller] > div[class] > div[class] > div > div[jsaction][jscontroller]');

    for (const div of divs) {
       term = await div.evaluate(divEl => {
        const wrapper = divEl.querySelector('span[data-is-tooltip-wrapper]');
        if (!wrapper) return null;

        const button = wrapper.querySelector('button');
        if (!button) return null;

        const spans = button.querySelectorAll('span');
        if (spans.length >= 4) {
          return spans[3].textContent.trim();
        }

        return null;
      });

      if (term) trendingTerms.push(term);
    }


    const links = await page.evaluate(() => {
      const linksReferenced = [];
      const divs = document.querySelectorAll('div[jsaction][jscontroller] > div > div:nth-child(2) > div[jsaction]');
    
      divs.forEach(div => {
        const link = div.querySelector('a[target="_blank"]');
        if (link) {
          linksReferenced.push(link.href.split('?')[0]);
        }
      });

      return linksReferenced;
    });

    const newItem = {
      updatedAt: new Date().toISOString(),
      searchBy: title,
      links,
      searchVolume,
      country: region,
      createdAt: getFormattedDate(new Date()),
      trendingTerms: trendingTerms.filter(term => term)
    }

    itemsExtracted.push(newItem);
  }

  await browser.close();
  return itemsExtracted;
};

const runAll = async (region) => {
  console.log('Starting...');
  if(!urls[region]) {
    console.log('Region not found', region);
    process.exit(0);
  }

  const newItems = await run(urls[region], region);
  console.log('New items', newItems?.length);
  console.log(newItems[0]);
  return newItems;
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

        return sections;
      };

      return {
        query: q,
        geo: g,
        hl: h,
        url: scrapedUrl,
        relatedTopics: extractWidgetRows('related_topics'),
        relatedQueries: extractWidgetRows('related_searches'),
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

const escapeCsvField = (field) => {
  const str = String(field ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
  const query = process.argv[5] || '/m/0dvkx';
  runExplore(geo, hl, query).then(result => {
    if (result) {
      writeExploreCsv(result, 'output');
    }
  }).catch(err => {
    console.error('Explore scrape failed:', err);
    process.exit(1);
  });
} else {
  runAll(mode || 'uk');
}
