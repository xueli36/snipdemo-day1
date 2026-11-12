#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const os = require('node:os');

const API_BASE = (process.env.SNIP_API || 'http://localhost:3000').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10_000;

function usage() {
  return [
    'Usage: snip <command>',
    '',
    'Commands:',
    '  add <url>    Create a short link',
    '  ls           List links and hit counts',
    '  open <code>  Open a short link in your browser',
    '  help         Show this help',
  ].join('\n');
}

function validateHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Please provide a valid http or https URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Please provide a valid http or https URL.');
  }
  return url.href;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }
    throw new Error(`Cannot reach Snip API at ${API_BASE}: ${error.message}`);
  }
  return response;
}

async function readError(response) {
  let message = `API request failed (${response.status} ${response.statusText}).`;
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error.trim()) {
      message = body.error;
    }
  } catch {
    // Keep the HTTP status message when the server does not return JSON.
  }
  return message;
}

async function add(url) {
  const response = await request('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: validateHttpUrl(url) }),
  });
  if (response.status !== 201) {
    throw new Error(await readError(response));
  }
  const link = await response.json();
  if (!link || typeof link.shortUrl !== 'string') {
    throw new Error('API returned an invalid link response.');
  }
  process.stdout.write(`${link.shortUrl}\n`);
}

async function list() {
  const response = await request('/api/links');
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const links = await response.json();
  if (!Array.isArray(links)) {
    throw new Error('API returned an invalid links response.');
  }
  if (links.length === 0) {
    process.stdout.write('No links yet.\n');
    return;
  }
  const codeWidth = Math.max(4, ...links.map((link) => String(link.code).length));
  const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
  process.stdout.write(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL\n`);
  for (const link of links) {
    process.stdout.write(
      `${String(link.code).padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}\n`,
    );
  }
}

function browserLaunch(platform, url) {
  if (platform === 'win32') {
    return {
      command: 'explorer.exe',
      args: [url],
      options: { detached: true, stdio: 'ignore' },
    };
  }
  return {
    command: platform === 'darwin' ? 'open' : 'xdg-open',
    args: [url],
    options: { detached: true, stdio: 'ignore' },
  };
}

function launchBrowser(url) {
  const { command, args, options } = browserLaunch(os.platform(), url);
  const child = spawn(command, args, options);
  child.on('error', (error) => {
    process.stderr.write(`Could not launch the browser: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.unref();
}

async function open(code) {
  const response = await request(`/${encodeURIComponent(code)}`, { redirect: 'manual' });
  if (response.status < 300 || response.status >= 400) {
    if (response.status === 404) {
      throw new Error(`No link found for code "${code}".`);
    }
    throw new Error(await readError(response));
  }
  const location = response.headers.get('location');
  if (!location) {
    throw new Error('API redirect did not include a Location header.');
  }
  let target;
  try {
    target = new URL(location, API_BASE);
  } catch {
    throw new Error('API returned an invalid redirect URL.');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('API returned an unsupported redirect URL.');
  }
  launchBrowser(target.href);
}

async function main(args) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'add') {
    if (rest.length !== 1) throw new Error('Usage: snip add <url>');
    await add(rest[0]);
    return;
  }
  if (command === 'ls') {
    if (rest.length !== 0) throw new Error('Usage: snip ls');
    await list();
    return;
  }
  if (command === 'open') {
    if (rest.length !== 1 || !rest[0]) throw new Error('Usage: snip open <code>');
    await open(rest[0]);
    return;
  }
  throw new Error(`Unknown command "${command}".\n\n${usage()}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { browserLaunch, main, validateHttpUrl };
