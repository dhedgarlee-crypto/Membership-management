// 아이콘 PNG 생성: node gen-icons.cjs (Playwright 필요)
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const svg = fs.readFileSync(__dirname + "/icons/icon.svg", "utf8");
  const browser = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    // iOS는 투명 모서리를 검게 칠하므로 180px은 꽉 찬 사각형으로
    const body = size === 180 ? svg.replace('rx="112"', 'rx="0"') : svg;
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${body.replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
    await page.screenshot({ path: `${__dirname}/icons/icon-${size}.png`, omitBackground: true });
  }
  await browser.close();
})();
