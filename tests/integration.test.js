const axios = require('axios');
const cheerio = require('cheerio');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Use a non-conflicting port for the test server
const TEST_PORT = 3099;
const HOST = '127.0.0.1'; // ensure it matches what Nock allows
let server;
let tempAppPath;

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Block all real net connects EXCEPT to our local test server
    nock.disableNetConnect();
    // Allow either 127.0.0.1 or localhost just in case
    nock.enableNetConnect(new RegExp(`^(localhost|${HOST})(:\\d+)?$`));

    const appPath = path.join(__dirname, '..', 'app.js');
    tempAppPath = path.join(__dirname, '..', 'app.test.js');

    // Copy app.js and patch the PORT to the test port (cross-platform)
    const original = fs.readFileSync(appPath, 'utf8');
    const modified = original.replace('const PORT = 3001', `const PORT = ${TEST_PORT}`);
    fs.writeFileSync(tempAppPath, modified, 'utf8');

    // Start the test server
    server = spawn(process.execPath, [tempAppPath], {
      stdio: 'ignore'
    });

    // Give the server a moment to boot
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 15000);

  afterAll(async () => {
    // Stop server and clean up temp file
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
    // Mock the upstream page
    nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

    // Call our app
    const response = await axios.post(`http://${HOST}:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
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
      // Our server returns a 500 with an error message for invalid fetches
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://${HOST}:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
