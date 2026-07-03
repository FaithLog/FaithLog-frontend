const fs = require('fs');
const path = require('path');

const EAS_PROJECT_ID = 'd44726b8-2e0c-4be8-8c24-7911ff0c740b';
const buildPropertiesPlugin = [
  'expo-build-properties',
  {
    ios: {
      useFrameworks: 'static',
    },
  },
];
const firebasePlugins = [
  '@react-native-firebase/app',
  '@react-native-firebase/messaging',
];

function firebaseConfigFile(envName, fallbackPath, base64EnvName) {
  const configuredPath = process.env[envName]?.trim() || fallbackPath;
  if (!configuredPath) {
    return undefined;
  }

  const absolutePath = path.resolve(__dirname, configuredPath);
  return fs.existsSync(absolutePath) || process.env[base64EnvName]?.trim()
    ? configuredPath
    : undefined;
}

module.exports = ({config}) => {
  const androidGoogleServicesFile = firebaseConfigFile(
    'GOOGLE_SERVICES_JSON_PATH',
    './google-services.json',
    'GOOGLE_SERVICES_JSON_BASE64',
  );
  const iosGoogleServicesFile = firebaseConfigFile(
    'GOOGLE_SERVICE_INFO_PLIST_PATH',
    './GoogleService-Info.plist',
    'GOOGLE_SERVICE_INFO_PLIST_BASE64',
  );

  return {
    ...config,
    owner: 'josephuk77',
    plugins: [
      ...(config.plugins || []),
      buildPropertiesPlugin,
      ...firebasePlugins,
    ],
    ios: {
      ...config.ios,
      ...(iosGoogleServicesFile
        ? { googleServicesFile: iosGoogleServicesFile }
        : {}),
    },
    android: {
      ...config.android,
      ...(androidGoogleServicesFile
        ? { googleServicesFile: androidGoogleServicesFile }
        : {}),
    },
    extra: {
      ...config.extra,
      appEnv: process.env.EXPO_PUBLIC_APP_ENV || 'local',
      apiBaseUrlConfigured: Boolean(process.env.EXPO_PUBLIC_API_BASE_URL),
      eas: {
        ...config.extra?.eas,
        projectId: EAS_PROJECT_ID,
      },
    },
  };
};
