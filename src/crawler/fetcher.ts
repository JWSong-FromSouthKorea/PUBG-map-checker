import axios from 'axios';
import { logger } from '../utils/logger.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
  const newsUrl = 'https://pubg.com/en/news';
  logger.info('Fetching news page to find Map Service Reports...');

  const html = await fetchPage(newsUrl);

  // Extract links to Map Service Report articles
  const linkPattern = /href="(\/en\/news\/\d+)"/g;
  const links: string[] = [];
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    links.push(`https://pubg.com${match[1]}`);
  }

  logger.info('Found news links', { count: links.length });
  return links;
}
