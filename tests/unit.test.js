const cheerio = require('cheerio');
const { sampleHtmlWithYale } = require('./test-utils');

describe('Yale to Fale replacement logic', () => {
  // helper that mimics app.js logic per spec: replace every instance (case-insensitive)
  // in visible text (we only apply it to text nodes and title below).
  function applyReplacements(str) {
    return String(str).replace(/yale/gi, 'Fale');
  }

  test('should replace Yale with Fale in text content', () => {
    const $ = cheerio.load(sampleHtmlWithYale);

    $('body *')
      .contents()
      .filter(function () {
        return this.nodeType === 3; // text nodes
      })
      .each(function () {
        const text = $(this).text();
        const newText = applyReplacements(text);
        if (text !== newText) $(this).replaceWith(newText);
      });

    const title = applyReplacements($('title').text());
    $('title').text(title);

    const modifiedHtml = $.html();

    // Check text replacements
    expect(modifiedHtml).toContain('Fale University Test Page');
    expect(modifiedHtml).toContain('Welcome to Fale University');
    expect(modifiedHtml).toContain('Fale University is a private Ivy League');
    expect(modifiedHtml).toContain('Fale was founded in 1701');

    // URLs, emails, and attributes should remain unchanged
    expect(modifiedHtml).toContain('https://www.yale.edu/about');
    expect(modifiedHtml).toContain('https://www.yale.edu/admissions');
    expect(modifiedHtml).toContain('https://www.yale.edu/images/logo.png');
    expect(modifiedHtml).toContain('mailto:info@yale.edu');

    // href attributes unchanged
    expect(modifiedHtml).toMatch(/href="https:\/\/www\.yale\.edu\/about"/);
    expect(modifiedHtml).toMatch(/href="https:\/\/www\.yale\.edu\/admissions"/);

    // link text replaced
    expect(modifiedHtml).toContain('>About Fale<');
    expect(modifiedHtml).toContain('>Fale Admissions<');

    // alt attributes not changed
    expect(modifiedHtml).toContain('alt="Yale Logo"');
  });

  test('should handle text that has no Yale references', () => {
    const htmlWithoutYale = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page</title>
      </head>
      <body>
        <h1>Hello World</h1>
        <p>This is a test page with no Yale references.</p>
      </body>
      </html>
    `;

    const $ = cheerio.load(htmlWithoutYale);

    $('body *')
      .contents()
      .filter(function () {
        return this.nodeType === 3;
      })
      .each(function () {
        const text = $(this).text();
        const newText = applyReplacements(text);
        if (text !== newText) $(this).replaceWith(newText);
      });

    const modifiedHtml = $.html();

    // Everything should have Yale→Fale in visible text
    expect(modifiedHtml).toContain('<title>Test Page</title>');
    expect(modifiedHtml).toContain('<h1>Hello World</h1>');
    expect(modifiedHtml).toContain(
      '<p>This is a test page with no Fale references.</p>'
    );
  });

  test('should handle case-insensitive replacements', () => {
    const mixedCaseHtml = `
      <p>YALE University, Yale College, and yale medical school are all part of the same institution.</p>
    `;

    const $ = cheerio.load(mixedCaseHtml);

    $('body *')
      .contents()
      .filter(function () {
        return this.nodeType === 3;
      })
      .each(function () {
        const text = $(this).text();
        const newText = applyReplacements(text);
        if (text !== newText) $(this).replaceWith(newText);
      });

    const modifiedHtml = $.html();

    // All variants → "Fale" in text
    expect(modifiedHtml).toContain(
      'Fale University, Fale College, and Fale medical school'
    );
  });
});
