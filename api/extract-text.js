// Lightweight URL text extraction.
// PDF support deferred (would require pdf-parse + multipart upload handling).
// For now: paste the PDF text manually into the wizard, or share via URL.

import * as cheerio from 'cheerio';

export const config = { maxDuration: 30 };

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MedNoteAI-extractor/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const body = req.body || {};
  const url = (body.url || '').trim();

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" field in request body.' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http(s) URLs are supported.' });
  }

  // Block private IPs / localhost as a basic SSRF guard
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('169.254.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return res.status(400).json({ error: 'URL points to a private host.' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(502).json({
        error: `Source returned ${response.status} ${response.statusText}`,
        url
      });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    // Check size before reading
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 5_000_000) {
      return res.status(413).json({ error: 'Source is too large (>5MB). Try a more specific URL.' });
    }

    if (!contentType.includes('html') && !contentType.includes('xml') && !contentType.includes('text/plain')) {
      return res.status(400).json({
        error: `Unsupported content-type: ${contentType}. Supports HTML / XML / plain text only. PDF / DOCX support coming soon — for now, copy the text and paste it directly into the wizard.`
      });
    }

    const html = await response.text();
    if (html.length > 5_000_000) {
      return res.status(413).json({ error: 'Source body is too large.' });
    }

    let text, title;
    if (contentType.includes('text/plain')) {
      text = html;
      title = parsed.hostname + parsed.pathname;
    } else {
      const $ = cheerio.load(html);

      // Strip non-content elements
      $('script, style, noscript, iframe, nav, header, footer, aside, form, button').remove();
      $('[role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]').remove();

      // Try to find the main content
      const mainSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.article-body',
        '.post-content',
        '.entry-content',
        '#content',
        '#main-content'
      ];
      let mainNode = null;
      for (const sel of mainSelectors) {
        const node = $(sel).first();
        if (node.length && node.text().trim().length > 200) {
          mainNode = node;
          break;
        }
      }
      const root = mainNode || $('body');

      title = ($('title').first().text() || $('h1').first().text() || '').trim().slice(0, 200);

      // Get text, normalize whitespace
      text = root
        .text()
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();
    }

    // Cap output to a reasonable size for downstream LLM
    const MAX_CHARS = 60000;
    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }

    if (text.length < 50) {
      return res.status(422).json({
        error: 'Could not extract meaningful text from this URL (too short or behind authentication).',
        url
      });
    }

    return res.status(200).json({
      text,
      title: title || parsed.hostname,
      char_count: text.length,
      truncated,
      source: {
        type: 'url',
        url,
        hostname: parsed.hostname
      }
    });
  } catch (err) {
    console.error('extract-text error:', err);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Source took too long to respond (timeout).' });
    }
    return res.status(500).json({
      error: err.message || 'Fetch failed',
      type: err.constructor?.name || 'Error'
    });
  }
}
