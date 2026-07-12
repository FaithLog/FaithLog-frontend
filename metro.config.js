const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_PUBLIC_APP_ENV === 'production') {
  const defaultResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === './mockAdapter') {
      return {
        filePath: path.join(__dirname, 'src/api/mockAdapter.production.ts'),
        type: 'sourceFile',
      };
    }
    return defaultResolveRequest
      ? defaultResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

config.resolver.blockList = [
  /\/\.codex-artifacts\/.*/,
  /\/\.git\.dataless-backup-[^/]+\/.*/,
  /\/android\/app\/build\/.*/,
  /\/android\/build\/.*/,
  /\/docs\/qa\/.*/,
  /\/docs\/store-screenshots\/.*/,
  /\/ios\/build\/.*/,
  /\/node_modules\/\.cache\/.*/,
];

module.exports = config;
