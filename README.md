# Google Trends Scraper

A Node.js scraper that extracts trending topics and related data from Google Trends using Puppeteer. This tool scrapes trending search terms, search volumes, related links, and trending breakdowns for multiple regions.

## Features

- Scrapes trending topics from Google Trends (`/trending` endpoint)
- Scrapes explore data for specific topics or queries (`/explore` endpoint)
- Supports multiple regions (UK, US, France, Spain, Germany, Argentina, Brazil)
- Extracts search volume, trending terms, and related links
- Extracts related topics and related queries from the explore view
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

### Running the Trending Scraper

The scraper can be run for different regions. By default, it's configured to run for the UK region.

1. **Run the trending scraper**:
```bash
node index.js [region]
```

Available regions: `uk`, `us`, `fr`, `es`, `de`, `ar`, `br`, `baleares`.

```bash
node index.js uk        # United Kingdom (default)
node index.js es        # Spain
node index.js baleares  # Islas Baleares
```

### Running the Explore Scraper

Scrape the Google Trends explore page for a specific topic or search term:

```bash
node index.js explore <geo> <hl> <query>
```

- `geo` — Geographic region code (e.g. `ES`, `US`, `GB`)
- `hl` — Language/locale (e.g. `es-ES`, `en-US`)
- `query` — A free-text keyword or a Google Knowledge Graph topic ID (e.g. `/m/0dvkx`)

**Examples:**

```bash
# Explore a topic by its Google Knowledge Graph ID for Spain
node index.js explore ES es-ES /m/0dvkx

# Explore a keyword for the US
node index.js explore US en-US football
```

### Supported Trending Regions

- `uk` - United Kingdom
- `us` - United States
- `fr` - France
- `es` - Spain
- `de` - Germany
- `ar` - Argentina
- `br` - Brazil
- `baleares` - Islas Baleares

## Output Format

### Trending scraper

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

### Explore scraper

The explore scraper returns a single object containing:

```javascript
{
  query: "/m/0dvkx",                      // The queried topic or keyword
  geo: "ES",                              // Geographic region
  hl: "es-ES",                            // Language/locale
  url: "https://trends.google.com/...",  // Full explore URL
  relatedTopics: {
    top: [{ term: "Topic A", value: "100" }, ...],
    rising: []
  },
  relatedQueries: {
    top: [{ term: "query 1", value: "100" }, ...],
    rising: []
  },
  scrapedAt: "2024-01-15T10:30:00.000Z"  // ISO timestamp
}
```

## How It Works

### Trending scraper

1. Launches a headless Chrome browser using Puppeteer
2. Navigates to the Google Trends `/trending` page for the selected region
3. Waits for the trending topics table to load
4. Clicks on each trending item to expand details
5. Extracts:
   - Topic title
   - Search volume
   - Trending breakdown terms
   - Related article links
6. Returns all extracted data as a structured array

### Explore scraper

1. Builds the `/explore` URL from the supplied `geo`, `hl`, and `query` parameters
2. Launches a headless Chrome browser using Puppeteer
3. Navigates to the explore page and waits for Angular widgets to render
4. Extracts related topics and related queries from the corresponding widgets
5. Returns the structured result object

## Notes

- The scraper uses a headless browser, so it may take some time to complete
- Google Trends pages may change their structure, which could require updates to the selectors
- The scraper waits for network idle to ensure all content is loaded
- Make sure you have a stable internet connection when running the scraper