const puppeteer = require("puppeteer");

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

runAll(process.argv[2] || 'uk');
