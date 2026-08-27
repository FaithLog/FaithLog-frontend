const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withDangerousMod,
  withAndroidManifest,
  withInfoPlist,
  withProjectBuildGradle,
  withXcodeProject,
} = require('expo/config-plugins');

const KAKAO_KEY_ENV = 'EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY';
const KAKAO_IOS_PACKAGE_URL = 'https://github.com/kakao/kakao-ios-sdk';
const KAKAO_IOS_PACKAGE_VERSION = '2.28.0';

function ensureKakaoSwiftPackage(project) {
  const objects = project.hash.project.objects;
  const pbxProjectSection = objects.PBXProject;
  const pbxTargetSection = objects.PBXNativeTarget;
  const projectEntry = Object.entries(pbxProjectSection).find(([key]) => !key.endsWith('_comment'));
  const targetEntry = Object.entries(pbxTargetSection).find(([key]) => !key.endsWith('_comment'));
  if (!projectEntry || !targetEntry) {
    throw new Error('Unable to locate the iOS project target for Kakao Share.');
  }

  const [, projectObject] = projectEntry;
  const [, targetObject] = targetEntry;
  const remotePackages = objects.XCRemoteSwiftPackageReference || {};
  const existingPackageEntry = Object.entries(remotePackages).find(
    ([key, value]) => !key.endsWith('_comment') && value.repositoryURL === `\"${KAKAO_IOS_PACKAGE_URL}\"`,
  );
  const packageReferenceId = existingPackageEntry?.[0] || project.generateUuid();

  objects.XCRemoteSwiftPackageReference = remotePackages;
  if (!existingPackageEntry) {
    remotePackages[packageReferenceId] = {
      isa: 'XCRemoteSwiftPackageReference',
      repositoryURL: `\"${KAKAO_IOS_PACKAGE_URL}\"`,
      requirement: {
        kind: 'exactVersion',
        version: `\"${KAKAO_IOS_PACKAGE_VERSION}\"`,
      },
    };
    remotePackages[`${packageReferenceId}_comment`] = 'XCRemoteSwiftPackageReference "kakao-ios-sdk"';
  }

  projectObject.packageReferences = projectObject.packageReferences || [];
  if (!projectObject.packageReferences.some((reference) => reference.value === packageReferenceId)) {
    projectObject.packageReferences.push({
      value: packageReferenceId,
      comment: 'XCRemoteSwiftPackageReference "kakao-ios-sdk"',
    });
  }

  const productDependencies = objects.XCSwiftPackageProductDependency || {};
  const existingProductEntry = Object.entries(productDependencies).find(
    ([key, value]) => !key.endsWith('_comment') && value.productName === 'KakaoSDKShare',
  );
  const productDependencyId = existingProductEntry?.[0] || project.generateUuid();
  objects.XCSwiftPackageProductDependency = productDependencies;
  if (!existingProductEntry) {
    productDependencies[productDependencyId] = {
      isa: 'XCSwiftPackageProductDependency',
      package: packageReferenceId,
      package_comment: 'XCRemoteSwiftPackageReference "kakao-ios-sdk"',
      productName: 'KakaoSDKShare',
    };
    productDependencies[`${productDependencyId}_comment`] = 'KakaoSDKShare';
  }

  targetObject.packageProductDependencies = targetObject.packageProductDependencies || [];
  if (!targetObject.packageProductDependencies.some((dependency) => dependency.value === productDependencyId)) {
    targetObject.packageProductDependencies.push({value: productDependencyId, comment: 'KakaoSDKShare'});
  }

  const frameworkBuildPhaseEntry = Object.entries(objects.PBXFrameworksBuildPhase || {}).find(
    ([key]) => !key.endsWith('_comment'),
  );
  if (!frameworkBuildPhaseEntry) {
    throw new Error('Unable to locate the iOS frameworks build phase for Kakao Share.');
  }
  const [, frameworkBuildPhase] = frameworkBuildPhaseEntry;
  const buildFiles = objects.PBXBuildFile || {};
  const existingBuildFileEntry = Object.entries(buildFiles).find(
    ([key, value]) => !key.endsWith('_comment') && value.productRef === productDependencyId,
  );
  const buildFileId = existingBuildFileEntry?.[0] || project.generateUuid();
  objects.PBXBuildFile = buildFiles;
  if (!existingBuildFileEntry) {
    buildFiles[buildFileId] = {
      isa: 'PBXBuildFile',
      productRef: productDependencyId,
      productRef_comment: 'KakaoSDKShare',
    };
    buildFiles[`${buildFileId}_comment`] = 'KakaoSDKShare in Frameworks';
  }
  frameworkBuildPhase.files = frameworkBuildPhase.files || [];
  if (!frameworkBuildPhase.files.some((file) => file.value === buildFileId)) {
    frameworkBuildPhase.files.push({value: buildFileId, comment: 'KakaoSDKShare in Frameworks'});
  }

  return project;
}

function addKakaoBridgeSources(project) {
  const groupKey = project.findPBXGroupKey({name: 'FaithLog'});
  const targetId = project.getFirstTarget().uuid;
  if (!groupKey || !targetId) {
    throw new Error('Unable to locate the iOS app source group for Kakao Share.');
  }
  for (const fileName of ['FaithLogKakaoShareModule.swift', 'FaithLogKakaoShareBridge.m']) {
    if (!project.hasFile(fileName)) {
      project.addSourceFile(`FaithLog/${fileName}`, {target: targetId}, groupKey);
    }
  }
  return project;
}

module.exports = function withFaithLogKakaoShare(config) {
  const nativeKey = process.env[KAKAO_KEY_ENV]?.trim();
  if (!nativeKey && process.env.EXPO_PUBLIC_APP_ENV === 'production') {
    throw new Error(`${KAKAO_KEY_ENV} is required for production builds.`);
  }
  if (!nativeKey) return config;

  config = withInfoPlist(config, (result) => {
    result.modResults.KAKAO_NATIVE_APP_KEY = nativeKey;
    const schemes = new Set(result.modResults.LSApplicationQueriesSchemes || []);
    schemes.add('kakaolink');
    schemes.add('kakaokompassauth');
    result.modResults.LSApplicationQueriesSchemes = [...schemes];
    const urlTypes = result.modResults.CFBundleURLTypes || [];
    if (!urlTypes.some((item) => item.CFBundleURLSchemes?.includes(`kakao${nativeKey}`))) {
      urlTypes.push({CFBundleURLSchemes: [`kakao${nativeKey}`]});
    }
    result.modResults.CFBundleURLTypes = urlTypes;
    return result;
  });

  config = withProjectBuildGradle(config, (result) => {
    const kakaoRepository = "maven { url 'https://devrepo.kakao.com/nexus/content/groups/public/' }";
    if (!result.modResults.contents.includes(kakaoRepository)) {
      result.modResults.contents = result.modResults.contents.replace(
        /allprojects\s*\{\s*repositories\s*\{/,
        (match) => `${match}\n    ${kakaoRepository}`,
      );
    }
    return result;
  });

  config = withXcodeProject(config, (result) => {
    result.modResults = ensureKakaoSwiftPackage(result.modResults);
    result.modResults = addKakaoBridgeSources(result.modResults);
    return result;
  });

  config = withDangerousMod(config, ['ios', async (result) => {
    const appDirectory = path.join(result.modRequest.platformProjectRoot, 'FaithLog');
    const sourceDirectory = path.join(
      result.modRequest.projectRoot,
      'modules/faithlog-kakao-share/ios',
    );
    fs.copyFileSync(
      path.join(sourceDirectory, 'FaithLogKakaoShareModule.swift'),
      path.join(appDirectory, 'FaithLogKakaoShareModule.swift'),
    );
    fs.copyFileSync(
      path.join(sourceDirectory, 'FaithLogKakaoShareBridge.m'),
      path.join(appDirectory, 'FaithLogKakaoShareBridge.m'),
    );
    return result;
  }]);

  return withAndroidManifest(config, (result) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    application['meta-data'] = application['meta-data'] || [];
    if (!application['meta-data'].some((item) => item.$?.['android:name'] === 'com.kakao.sdk.AppKey')) {
      application['meta-data'].push({$: {'android:name': 'com.kakao.sdk.AppKey', 'android:value': nativeKey}});
    }
    return result;
  });
};
