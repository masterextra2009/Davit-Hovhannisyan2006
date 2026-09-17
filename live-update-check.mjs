/**
 * Проверяем, появляется ли новое БЕЗ перезагрузки страницы.
 * Клиент сидит в кабинете, а мы со стороны сервера пишем ему сообщение в чат —
 * оно должно всплыть само в течение нескольких секунд.
 */
import { chromium } from 'playwright';

const EMAIL = process.argv[2];
const PASSWORD = 'Test-12345';
const MARK = process.argv[3] || 'проверка';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());
await page.goto('https://sever-18.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
await page.getByRole('button', { name: /Войти|Кабинет/i }).first().click().catch(() => {});
await page.waitForTimeout(2500);
await page.locator('input[type="email"]').first().fill(EMAIL);
await page.locator('input[type="password"]').first().fill(PASSWORD);
await page.getByRole('button', { name: /^Войти/i }).first().click().catch(() => {});
await page.waitForTimeout(7000);
console.log('вошли:', /Загрузка|Мои Заказы/i.test(await page.locator('body').innerText()));

// Открываем чат и ждём сообщение, отправленное со стороны сервера.
await page.getByText(/^Чат$/).first().click().catch(() => {});
await page.waitForTimeout(2500);
console.log('ждём сообщение «' + MARK + '» без перезагрузки…');
let seen = false;
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  if ((await page.locator('body').innerText()).includes(MARK)) { seen = true; console.log('   появилось через ~' + (i + 1) * 2.5 + ' с'); break; }
}
if (!seen) console.log('   НЕ появилось за 30 секунд');
await page.screenshot({ path: 'live-update.png' });
await browser.close();
