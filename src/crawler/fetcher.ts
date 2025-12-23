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

export async function fetchMapServiceReports(): Promise<string[]> {
  const { googleApiKey, googleSearchEngineId } = botConfig;

  if (!googleApiKey || !googleSearchEngineId) {
    logger.warn('Google API credentials not configured');
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
      // Match both pubg.com/news/123 and pubg.com/en/news/123
      const linkMatch = item.link.match(/pubg\.com(?:\/(en|ko))?\/news\/(\d+)/);
      if (!linkMatch) continue;

      const versionMatch = item.title.match(/(\d+\.\d+)/);
      const version = versionMatch ? parseFloat(versionMatch[1]) : 0;

      // Normalize URL to /en/news/ format
      const postId = linkMatch[2];
      const normalizedUrl = `https://pubg.com/en/news/${postId}`;

      newsLinks.push({
        url: normalizedUrl,
        version,
        title: item.title,
      });
    }

    // Sort by version descending (highest = newest)
    newsLinks.sort((a, b) => b.version - a.version);

    return newsLinks.map(item => item.url).slice(0, 5);
  } catch (error) {
    logger.error('Google search failed', error);
    return [];
  }
}
