const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { sampleHtmlWithYale } = require('./test-utils');

// Ports
const HOST = '127.0.0.1';
const TEST_PORT = 3099;   // proxy app (your app.js) runs here
const SOURCE_PORT = 3101; // local source server serves sampleHtmlWithYale here

let appServer;     // child process running app.test.js
let tempAppPath;   // path to temp app file with patched port
let sourceServer;  // local HTTP server serving sampleHtmlWithYale

describe('Integration Tests', () => {
  beforeAll(async () => {
    // 1) Create a temporary copy of app.js with TEST_PORT
    const appPath = path.join(__dirname, '..', 'app.js');
    tempAppPath = path.join(__dirname, '..', 'app.test.js');

    const original = fs.readFileSync(appPath, 'utf8');
    const modified = original.replace('const PORT = 3001', `const PORT = ${TEST_PORT}`);
    fs.writeFileSync(tempAppPath, modified, 'utf8');

    // 2) Start the proxy app (child process)
    appServer = spawn(process.execPath, [tempAppPath], {
      stdio: 'ignore'
    });

    // 3) Start a local source server that serves sampleHtmlWithYale
    sourceServer = http.createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(sampleHtmlWithYale);
    });

    await new Promise((resolve, reject) => {
      sourceServer.listen(SOURCE_PORT, HOST, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // 4) Give the proxy app a moment to boot
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }, 20000);

  afterAll(async () => {
    // Stop proxy app
    if (appServer && appServer.pid) {
      try {
        appServer.kill('SIGTERM');
      } catch (_) {}
    }
    // Remove temp file
    try {
      if (tempAppPath && fs.existsSync(tempAppPath)) {
        fs.unlinkSync(tempAppPath);
      }
    } catch (_) {}

    // Stop source server
    if (sourceServer) {
      await new Promise((resolve) => sourceServer.close(() => resolve()));
    }
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Ask the proxy to fetch our local source server
    const response = await axios.post(`http://${HOST}:${TEST_PORT}/fetch`, {
      url: `http://${HOST}:${SOURCE_PORT}/`
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // URLs should remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) hasYaleUrl = true;
    });
    expect(hasYaleUrl).toBe(true);

    // Link text changed
    expect($('a').first().text()).toBe('About Fale');
  }, 15000);

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://${HOST}:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Our server returns a 500 for invalid fetches
      expect(error.response && error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://${HOST}:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response && error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
