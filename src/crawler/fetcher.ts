import axios from 'axios';
import { botConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface GoogleSearchResult {
  items?: { link: string; title: string }[];
}

export async function fetchPage(url: string): Promise<string> {
  logger.info('Fetching page...', { url });

  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    timeout: 30000,
  });

  logger.info('Page fetched successfully', { status: response.status });
  return response.data;
}

async function searchWithGoogle(): Promise<string[]> {
  const { googleApiKey, googleSearchEngineId } = botConfig;

  if (!googleApiKey || !googleSearchEngineId) {
    logger.warn('Google API credentials not configured, skipping search');
    return [];
  }

  const query = 'pubg map service report';
  const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleSearchEngineId}&q=${encodeURIComponent(query)}`;

  logger.info('Searching for Map Service Reports via Google...', { query });

  try {
    const response = await axios.get<GoogleSearchResult>(url, { timeout: 10000 });
    const items = response.data.items || [];

    // Extract pubg.com news links and patch versions from title
    const newsLinks: { url: string; version: number; title: string }[] = [];

    for (const item of items) {
      // Filter only pubg.com news links (en or ko)
      const linkMatch = item.link.match(/pubg\.com\/(en|ko)\/news\/(\d+)/);
      if (!linkMatch) continue;

      // Extract version from title (e.g., "Update 39.1" -> 39.1)
      const versionMatch = item.title.match(/(\d+\.\d+)/);
      const version = versionMatch ? parseFloat(versionMatch[1]) : 0;

      newsLinks.push({
        url: item.link,
        version,
        title: item.title,
      });
    }

    // Sort by version descending (highest = newest)
    newsLinks.sort((a, b) => b.version - a.version);

    const top = newsLinks[0];
    if (top) {
      logger.info('Google search completed', { topVersion: top.version, topUrl: top.url });
    } else {
      logger.warn('No pubg.com news links found in search results');
    }

    const sortedUrls = newsLinks.map(item => item.url);

    return sortedUrls.slice(0, 5);
  } catch (error) {
    logger.error('Google search failed', error);
    return [];
  }
}

export async function fetchMapServiceReports(): Promise<string[]> {
  logger.info('Fetching news page to find Map Service Reports...');

  // Try Google Search API first
  const googleResults = await searchWithGoogle();
  if (googleResults.length > 0) {
    return googleResults;
  }

  // Fallback to direct page scraping (may not work due to SPA)
  logger.info('Falling back to direct page scraping...');
  const newsUrl = 'https://pubg.com/en/news';
  const html = await fetchPage(newsUrl);

  const linkPattern = /href="(\/en\/news\/\d+)"/g;
  const links: string[] = [];
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    links.push(`https://pubg.com${match[1]}`);
  }

  logger.info('Found news links', { count: links.length });
  return links;
}
