'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { after, before, test } = require('node:test');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'cli.js');
let server;
let apiBase;
let links = [];
let apiError = false;

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/links') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { url } = JSON.parse(raw);
      if (apiError) {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Invalid URL' }));
        return;
      }
      const link = { code: 'a1B2c3', url, shortUrl: `${apiBase}/a1B2c3`, hits: 0, createdAt: new Date().toISOString() };
      links = [link];
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(link));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/links') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(links));
      return;
    }
    if (req.method === 'GET' && req.url === '/a1B2c3') {
      res.writeHead(302, { location: 'https://example.test/original?x=1' }).end();
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      env: { ...process.env, SNIP_API: apiBase, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('help works with no arguments and explicit help', async () => {
  const noArgs = await runCli([]);
  const help = await runCli(['help']);
  assert.equal(noArgs.code, 0);
  assert.match(noArgs.stdout, /Usage: snip <command>/);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /add <url>/);
});

test('add validates URLs and prints the returned short URL', async () => {
  const invalid = await runCli(['add', 'javascript:alert(1)']);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /http or https/);

  const created = await runCli(['add', 'https://example.test/page']);
  assert.equal(created.code, 0);
  assert.equal(created.stdout, `${apiBase}/a1B2c3\n`);

  apiError = true;
  const rejected = await runCli(['add', 'https://example.test']);
  apiError = false;
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /Invalid URL/);
});

test('ls handles empty and populated results', async () => {
  links = [];
  const empty = await runCli(['ls']);
  assert.equal(empty.code, 0);
  assert.equal(empty.stdout, 'No links yet.\n');

  links = [{ code: 'abc123', url: 'https://example.test', hits: 7 }];
  const populated = await runCli(['ls']);
  assert.equal(populated.code, 0);
  assert.match(populated.stdout, /CODE\s+HITS\s+URL/);
  assert.match(populated.stdout, /abc123\s+7\s+https:\/\/example\.test/);
});

test('unknown commands and codes fail with actionable errors', async () => {
  const unknownCommand = await runCli(['wat']);
  assert.equal(unknownCommand.code, 1);
  assert.match(unknownCommand.stderr, /Unknown command/);

  const unknownCode = await runCli(['open', 'missing']);
  assert.equal(unknownCode.code, 1);
  assert.match(unknownCode.stderr, /No link found/);
});

test('network errors are reported and return exit code 1', async () => {
  const unavailable = await runCli(['ls'], { SNIP_API: 'http://127.0.0.1:1' });
  assert.equal(unavailable.code, 1);
  assert.match(unavailable.stderr, /Cannot reach Snip API/);
});

test('open follows the redirect manually and launches the platform browser', async (t) => {
  if (os.platform() === 'win32') {
    t.skip('Windows browser launching is verified through the platform command selection test.');
    return;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snip-browser-'));
  const argsFile = path.join(directory, 'args.json');
  const command = os.platform() === 'darwin' ? 'open' : 'xdg-open';
  const shim = path.join(directory, command);
  fs.writeFileSync(
    shim,
    '#!/bin/sh\nprintf "%s" "$1" > "$SNIP_BROWSER_ARGS_FILE"\n',
  );
  fs.chmodSync(shim, 0o755);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = await runCli(['open', 'a1B2c3'], {
    PATH: `${directory}${path.delimiter}${process.env.PATH}`,
    SNIP_BROWSER_ARGS_FILE: argsFile,
  });
  assert.equal(result.code, 0, result.stderr);

  for (let attempt = 0; attempt < 50 && !fs.existsSync(argsFile); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.readFileSync(argsFile, 'utf8'), 'https://example.test/original?x=1');
});

test('browser commands are selected for Windows, macOS, and Linux', () => {
  const { browserLaunch } = require('../cli');
  assert.equal(browserLaunch('win32', 'https://example.test').command, 'explorer.exe');
  assert.deepEqual(browserLaunch('darwin', 'https://example.test').args, ['https://example.test']);
  assert.equal(browserLaunch('darwin', 'https://example.test').command, 'open');
  assert.deepEqual(browserLaunch('linux', 'https://example.test').args, ['https://example.test']);
  assert.equal(browserLaunch('linux', 'https://example.test').command, 'xdg-open');
});
