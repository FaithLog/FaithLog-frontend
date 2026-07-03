const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /\/android\/app\/build\/.*/,
  /\/android\/build\/.*/,
  /\/docs\/qa\/.*/,
  /\/ios\/build\/.*/,
  /\/node_modules\/\.cache\/.*/,
];

module.exports = config;
