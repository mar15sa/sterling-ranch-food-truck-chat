const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/mar15/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const generated = 'C:/Users/mar15/.codex/generated_images/01a08cdc-82b2-7dc1-b958-27428da54492';
const output = path.resolve(__dirname, '../../public/weather-art');
const files = {
  partly: 'exec-0a5f6b4c-2324-41af-a270-413c6fa8a147.png',
  moon: 'exec-c2d956a8-30e7-4d6e-b52f-0a4f5197f54d.png',
  'night-cloud': 'exec-cbed5343-251c-4231-850a-19077b95313d.png',
  storm: 'exec-57a5f350-5960-4424-982b-20e1ef72a62a.png',
  rain: 'exec-d7041e2c-c6f5-4b55-87fa-faf16f3c4d88.png',
  snow: 'exec-b6cc3c46-f9ca-4201-a0cc-9ff22fa6fc26.png',
  sun: 'exec-67d8a2f6-9979-41c7-89dd-48fbc5e7a4c2.png',
  cloud: 'exec-23c2826f-2396-4d9f-ae05-8ef70e6ded1b.png',
  fog: 'exec-84d47363-53d4-4c3c-9812-224d429790cc.png',
  wind: 'exec-6223e8c3-a925-4bc2-b758-5667cb11ce82.png',
};
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const result = {};
  for (const [name, file] of Object.entries(files)) {
    result[name] = await sharp(path.join(generated, file)).resize(600, 450).webp({ quality: 85 }).toFile(path.join(output, name + '.webp'));
  }
  result.symbols = await sharp(path.join(generated, 'exec-6857c209-5079-4754-b3b3-dd513cd44ade.png')).resize(1000, 400).webp({quality:90}).toFile(path.join(output,'symbols.webp'));
  fs.writeFileSync(path.join(__dirname, 'asset-manifest.json'), JSON.stringify({ generated, files, result }, null, 2));
  console.log(Object.fromEntries(Object.entries(result).map(([name, value]) => [name, value.size])));
})().catch(error => { console.error(error); process.exitCode = 1; });
