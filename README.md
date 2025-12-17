# Google Trends Scraper

A Node.js scraper that extracts trending topics and related data from Google Trends using Puppeteer. This tool scrapes trending search terms, search volumes, related links, and trending breakdowns for multiple regions.

## Features

- Scrapes trending topics from Google Trends
- Supports multiple regions (UK, US, France, Spain, Germany, Argentina, Brazil)
- Extracts search volume, trending terms, and related links
- Uses headless browser automation with Puppeteer
- Worked fine using Github actions to run it daily

## Prerequisites

- Node.js (v14 or higher recommended)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd google-trends-scraper
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Running the Scraper

The scraper can be run for different regions. By default, it's configured to run for the UK region.

1. **Edit the region in `index.js`**:
   
   At the bottom of `index.js`, uncomment the region you want to scrape:
   
   ```javascript
   runAll('uk');    // United Kingdom
   // runAll('us');  // United States
   // runAll('fr');  // France
   // runAll('es');  // Spain
   // runAll('de');  // Germany
   // runAll('ar');  // Argentina
   // runAll('br');  // Brazil
   ```

2. **Run the scraper**:
```bash
node index.js
```

### Supported Regions

- `uk` - United Kingdom
- `us` - United States
- `fr` - France
- `es` - Spain
- `de` - Germany
- `ar` - Argentina
- `br` - Brazil

## Output Format

The scraper returns an array of objects, each containing:

```javascript
{
  updatedAt: "2024-01-15T10:30:00.000Z",  // ISO timestamp
  searchBy: "Trending Topic Title",       // Main trending topic
  links: ["url1", "url2", ...],           // Array of related links
  searchVolume: "100K+",                  // Search volume indicator
  country: "uk",                          // Region code
  createdAt: "01/15/2024",               // Formatted date
  trendingTerms: ["term1", "term2", ...]  // Array of related trending terms
}
```

## How It Works

1. Launches a headless Chrome browser using Puppeteer
2. Navigates to the Google Trends page for the selected region
3. Waits for the trending topics table to load
4. Clicks on each trending item to expand details
5. Extracts:
   - Topic title
   - Search volume
   - Trending breakdown terms
   - Related article links
6. Returns all extracted data as a structured array

## Notes

- The scraper uses a headless browser, so it may take some time to complete
- Google Trends pages may change their structure, which could require updates to the selectors
- The scraper waits for network idle to ensure all content is loaded
- Make sure you have a stable internet connection when running the scraper