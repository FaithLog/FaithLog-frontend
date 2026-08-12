const fs = require('fs');
const path = require('path');

const EAS_PROJECT_ID = 'd44726b8-2e0c-4be8-8c24-7911ff0c740b';
const buildPropertiesPlugin = [
  'expo-build-properties',
  {
    android: {
      enableMinifyInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
    },
    ios: {
      useFrameworks: 'static',
    },
  },
];
const announcementImagePickerPlugin = [
  'expo-image-picker',
  {
    cameraPermission: false,
    microphonePermission: false,
    photosPermission: '공지에 첨부할 사진을 선택하려면 사진 보관함 접근이 필요합니다.',
  },
];
const firebasePlugins = [
  '@react-native-firebase/app',
  [
    '@react-native-firebase/analytics',
    {
      ios: {
        withoutAdIdSupport: true,
      },
    },
  ],
  '@react-native-firebase/messaging',
  '@react-native-firebase/crashlytics',
];
const iosApsEnvironment =
  process.env.EXPO_PUBLIC_APP_ENV === 'development' ? 'development' : 'production';

const generatedFirebaseConfigDir = path.join(__dirname, '.eas', 'firebase');

function firebaseConfigFile({
  pathEnvName,
  fileEnvName,
  fallbackPath,
  base64EnvName,
  generatedFileName,
}) {
  const configuredPath = process.env[pathEnvName]?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  const fileEnvPath = process.env[fileEnvName]?.trim();
  if (fileEnvPath) {
    return fileEnvPath;
  }

  const base64Value = process.env[base64EnvName]?.trim();
  if (base64Value) {
    return writeFirebaseConfigFromBase64(generatedFileName, base64Value);
  }

  const absolutePath = path.resolve(__dirname, fallbackPath);
  return fs.existsSync(absolutePath) ? fallbackPath : undefined;
}

function writeFirebaseConfigFromBase64(fileName, base64Value) {
  fs.mkdirSync(generatedFirebaseConfigDir, {recursive: true});

  const outputPath = path.join(generatedFirebaseConfigDir, fileName);
  fs.writeFileSync(outputPath, Buffer.from(base64Value, 'base64'), {mode: 0o600});
  fs.chmodSync(outputPath, 0o600);

  return `./${path.relative(__dirname, outputPath).replace(/\\/g, '/')}`;
}

module.exports = ({config}) => {
  const androidGoogleServicesFile = firebaseConfigFile({
    pathEnvName: 'GOOGLE_SERVICES_JSON_PATH',
    fileEnvName: 'GOOGLE_SERVICES_JSON',
    fallbackPath: './google-services.json',
    base64EnvName: 'GOOGLE_SERVICES_JSON_BASE64',
    generatedFileName: 'google-services.json',
  });
  const iosGoogleServicesFile = firebaseConfigFile({
    pathEnvName: 'GOOGLE_SERVICE_INFO_PLIST_PATH',
    fileEnvName: 'GOOGLE_SERVICE_INFO_PLIST',
    fallbackPath: './GoogleService-Info.plist',
    base64EnvName: 'GOOGLE_SERVICE_INFO_PLIST_BASE64',
    generatedFileName: 'GoogleService-Info.plist',
  });

  return {
    ...config,
    owner: 'josephuk77',
    plugins: [
      ...(config.plugins || []),
      './plugins/withAndroidNavigationMode',
      './plugins/withTossRemittance',
      './plugins/withFirebaseAnalyticsScreenReporting',
      buildPropertiesPlugin,
      announcementImagePickerPlugin,
      'expo-sharing',
      ...firebasePlugins,
      './plugins/withAndroidReleaseRecommendations',
    ],
    ios: {
      ...config.ios,
      infoPlist: {
        ...(config.ios?.infoPlist || {}),
        FirebaseAutomaticScreenReportingEnabled: false,
      },
      entitlements: {
        ...(config.ios?.entitlements || {}),
        'aps-environment': iosApsEnvironment,
      },
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
