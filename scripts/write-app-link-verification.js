const fs = require('fs');
const path = require('path');

const teamId = requireValue('APPLE_TEAM_ID', /^[A-Z0-9]{10}$/);
const androidSha256 = requireValue(
  'ANDROID_APP_SIGNING_SHA256',
  /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/,
);
const outputDir = path.join(__dirname, '..', 'hosting', 'public', '.well-known');
fs.mkdirSync(outputDir, {recursive: true});

writeJson('apple-app-site-association', {
  applinks: {
    apps: [],
    details: [{
      appID: `${teamId}.com.faithlog.app`,
      components: [
        {'/': '/campuses/*/polls/*'},
        {'/': '/campuses/*/announcements/*'},
      ],
    }],
  },
});
writeJson('assetlinks.json', [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'com.faithlog.app',
    sha256_cert_fingerprints: [androidSha256],
  },
}]);

function requireValue(name, pattern) {
  const value = process.env[name]?.trim();
  if (!value || !pattern.test(value)) throw new Error(`${name} is missing or invalid.`);
  return value;
}

function writeJson(fileName, value) {
  fs.writeFileSync(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}
