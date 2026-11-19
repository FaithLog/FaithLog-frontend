const fs = require('node:fs');
const path = require('node:path');

// EAS runs this hook AFTER iOS prebuild and pod install, and before Xcode build.
// RNFirebase 26's SPM Crashlytics dSYM script expects the plist at ios root.
// Never synthesize or print real Firebase credentials.
function stageIosFirebasePlist({root = process.cwd(), env = process.env} = {}) {
  if (env.EAS_BUILD_PLATFORM !== 'ios') return 'skipped-non-ios';

  const iosRoot = path.join(root, 'ios');
  if (!fs.existsSync(iosRoot)) throw new Error('Expected generated iOS directory before EAS post-install');

  const dest = path.join(iosRoot, 'GoogleService-Info.plist');
  if (fs.existsSync(dest)) return 'already-present';

  const candidates = [
    env.GOOGLE_SERVICE_INFO_PLIST_PATH,
    env.GOOGLE_SERVICE_INFO_PLIST,
    '.eas/firebase/GoogleService-Info.plist',
    'GoogleService-Info.plist',
    ...fs.readdirSync(iosRoot,{withFileTypes:true})
      .filter(item => item.isDirectory())
      .map(item => path.join('ios',item.name,'GoogleService-Info.plist')),
  ]
    .filter(source => typeof source === 'string' && source.trim().length > 0)
    .map(source => path.resolve(root, source));

  const source = candidates.find(candidate => candidate !== dest && fs.existsSync(candidate));
  if (!source) {
    throw new Error('Missing iOS Firebase plist for Crashlytics: configure GOOGLE_SERVICE_INFO_PLIST_BASE64 for the target EAS environment.');
  }

  fs.copyFileSync(source, dest);
  fs.chmodSync(dest, 0o600);
  return 'staged';
}

if (require.main === module) {
  const result = stageIosFirebasePlist();
  console.log('iOS Firebase Crashlytics plist staging:', result);
}

module.exports = {stageIosFirebasePlist};
