const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sourceIcon = path.join(root, 'assets', 'icon.png');
const destinationIcon = path.join(root, 'hosting', 'public', 'og-faithlog.png');
const assetLinks = path.join(root, 'hosting', 'public', '.well-known', 'assetlinks.json');

if (!fs.existsSync(assetLinks)) {
  throw new Error('assetlinks.json must be generated from the Play app-signing certificate first.');
}
fs.mkdirSync(path.dirname(destinationIcon), {recursive: true});
fs.copyFileSync(sourceIcon, destinationIcon);
