const fs = require('fs');
const path = require('path');

const targets = [
  {
    envName: 'GOOGLE_SERVICES_JSON_BASE64',
    outputEnvName: 'GOOGLE_SERVICES_JSON_PATH',
    defaultOutput: 'google-services.json',
    label: 'Android Firebase config',
  },
  {
    envName: 'GOOGLE_SERVICE_INFO_PLIST_BASE64',
    outputEnvName: 'GOOGLE_SERVICE_INFO_PLIST_PATH',
    defaultOutput: 'GoogleService-Info.plist',
    label: 'iOS Firebase config',
  },
];

for (const target of targets) {
  const encoded = process.env[target.envName]?.trim();
  if (!encoded) {
    console.log(`${target.label}: skipped; ${target.envName} is not set.`);
    continue;
  }

  const outputPath = process.env[target.outputEnvName]?.trim() || target.defaultOutput;
  const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, Buffer.from(encoded, 'base64'), { mode: 0o600 });
  console.log(`${target.label}: wrote ${outputPath}.`);
}
