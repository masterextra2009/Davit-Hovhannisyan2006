/** Открываем боевой сайт как обычный посетитель и смотрим, что показывается. */
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  .then(c => c.newPage());

const errors = [];
const bad = [];
page.on('pageerror', e => errors.push('JS: ' + String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 80)); });

const started = Date.now();
await page.goto('https://sever-18.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
console.log('открылось за', Math.round((Date.now() - started) / 100) / 10, 'с');
console.log('на экране:', text.slice(0, 200) || '(ПУСТО)');
console.log('плохие ответы:', bad.length ? bad.join(' | ') : 'нет');
console.log('ошибки:', errors.length ? errors.join(' | ') : 'нет');
await page.screenshot({ path: 'live-now.png' });
await browser.close();
