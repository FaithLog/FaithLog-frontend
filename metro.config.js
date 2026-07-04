const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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
