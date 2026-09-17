/** Смотрим шапку главной на телефоне: не уезжает ли кнопка «Войти в кабинет». */
import { chromium } from 'playwright';

const browser = await chromium.launch();
for (const [name, size] of [['телефон', { width: 390, height: 844 }], ['узкий телефон', { width: 360, height: 740 }]]) {
  const page = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    .then(c => c.newPage());
  await page.goto('https://sever-18.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  // У Давида на телефоне крупный системный шрифт — повторяем это.
  await page.addStyleTag({ content: 'html { font-size: 140% !important; }' });
  await page.waitForTimeout(1500);

  const btn = page.getByRole('button', { name: /Кабинет|Войти в кабинет/i }).first();
  const box = await btn.boundingBox().catch(() => null);
  const header = await page.locator('header').first().boundingBox().catch(() => null);
  console.log(name, size.width + 'px:');
  console.log('   кнопка «Войти в кабинет»:', box ? `x=${Math.round(box.x)} y=${Math.round(box.y)} ш=${Math.round(box.width)} в=${Math.round(box.height)}` : 'не найдена');
  console.log('   шапка:', header ? `y=${Math.round(header.y)} высота=${Math.round(header.height)}` : '—');
  if (box) {
    console.log('   уезжает вверх:', box.y < 0, '| уезжает вправо:', Math.round(box.x + box.width) > size.width);
  }
  const hero = page.getByRole('button', { name: /Войти в личный кабинет/i }).first();
  const hbox = await hero.boundingBox().catch(() => null);
  console.log('   кнопка первого экрана:', hbox ? `ширина ${Math.round(hbox.width)}, помещается: ${Math.round(hbox.x + hbox.width) <= size.width}` : 'не найдена');
  await page.screenshot({ path: `landing-big-${size.width}.png` });
  await page.close();
}
await browser.close();
