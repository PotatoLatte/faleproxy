const axios = require('axios');
const cheerio = require('cheerio');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let server;
let tempAppPath;

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Mock external HTTP requests, but allow localhost (server under test)
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    const appPath = path.join(__dirname, '..', 'app.js');
    tempAppPath = path.join(__dirname, '..', 'app.test.js');

    // Create a temporary test app file (copy + in-file port replace) using Node APIs (cross-platform)
    const original = fs.readFileSync(appPath, 'utf8');
    const modified = original.replace('const PORT = 3001', `const PORT = ${TEST_PORT}`);
    fs.writeFileSync(tempAppPath, modified, 'utf8');

    // Start the test server
    server = spawn(process.execPath, [tempAppPath], {
      stdio: 'ignore'
    });

    // Give the server time to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 15000); // a little extra time for startup on CI

  afterAll(async () => {
    // Kill the test server and clean up
    if (server && server.pid) {
      try {
        server.kill('SIGTERM');
      } catch (_) {}
    }
    try {
      if (tempAppPath && fs.existsSync(tempAppPath)) {
        fs.unlinkSync(tempAppPath);
      }
    } catch (_) {}

    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for example.com
    nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

    // Make a request to our proxy app
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // Verify URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);

    // Verify link text is changed
    expect($('a').first().text()).toBe('About Fale');
  }, 15000);

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
