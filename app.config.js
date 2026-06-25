const fs = require('fs');
const path = require('path');

const { expo: baseExpoConfig } = require('./app.json');

const EAS_PROJECT_ID = 'd44726b8-2e0c-4be8-8c24-7911ff0c740b';

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

module.exports = () => {
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
    ...baseExpoConfig,
    owner: 'josephuk77',
    ios: {
      ...baseExpoConfig.ios,
      ...(iosGoogleServicesFile
        ? { googleServicesFile: iosGoogleServicesFile }
        : {}),
    },
    android: {
      ...baseExpoConfig.android,
      ...(androidGoogleServicesFile
        ? { googleServicesFile: androidGoogleServicesFile }
        : {}),
    },
    extra: {
      ...baseExpoConfig.extra,
      appEnv: process.env.EXPO_PUBLIC_APP_ENV || 'local',
      apiBaseUrlConfigured: Boolean(process.env.EXPO_PUBLIC_API_BASE_URL),
      eas: {
        ...baseExpoConfig.extra?.eas,
        projectId: EAS_PROJECT_ID,
      },
    },
  };
};
