import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const root = process.cwd();

describe('native content link configuration', () => {
  it('configures only the FaithLog universal/app link host and allowed paths', () => {
    const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
    expect(appConfig).toContain("applinks:app.faithlog.kr");
    expect(appConfig).toContain("host: 'app.faithlog.kr'");
    expect(appConfig).toContain("pathPattern: '/campuses/.*/polls/.*'");
    expect(appConfig).toContain("pathPattern: '/campuses/.*/announcements/.*'");
    expect(appConfig).not.toContain("pathPrefix: '/campuses/'");
    expect(appConfig).not.toMatch(/run\.app[^\n]*(share|link)/i);
  });

  it('declares Kakao native SDK modules and no unofficial React Native Kakao wrapper', () => {
    const android = fs.readFileSync(
      path.join(root, 'modules/faithlog-kakao-share/android/build.gradle'), 'utf8');
    const podspec = fs.readFileSync(
      path.join(root, 'modules/faithlog-kakao-share/ios/FaithLogKakaoShare.podspec'), 'utf8');
    const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const plugin = fs.readFileSync(path.join(root, 'plugins/withFaithLogKakaoShare.js'), 'utf8');
    const moduleConfig = fs.readFileSync(
      path.join(root, 'modules/faithlog-kakao-share/expo-module.config.json'), 'utf8');
    const iosBridge = fs.readFileSync(
      path.join(root, 'modules/faithlog-kakao-share/ios/FaithLogKakaoShareBridge.m'), 'utf8');
    expect(android).toContain('com.kakao.sdk:v2-share:2.24.0');
    expect(android).toContain("versionName '1.0.0'");
    expect(podspec).not.toContain("s.dependency 'KakaoSDKShare'");
    expect(plugin).toContain('https://github.com/kakao/kakao-ios-sdk');
    expect(plugin).toContain("productName: 'KakaoSDKShare'");
    expect(plugin).toContain("KAKAO_IOS_PACKAGE_VERSION = '2.28.0'");
    expect(plugin).toContain("'FaithLogKakaoShareModule.swift', 'FaithLogKakaoShareBridge.m'");
    expect(plugin).toContain('project.addSourceFile(`FaithLog/${fileName}`');
    expect(moduleConfig).toContain('"platforms": ["android"]');
    expect(iosBridge).toContain('RCT_EXTERN_MODULE(FaithLogKakaoShare, NSObject)');
    expect(packageJson).not.toMatch(/react-native-kakao|kakao-share-link/i);
    expect(plugin).toContain('https://devrepo.kakao.com/nexus/content/groups/public/');
  });

  it('publishes exact platform verification and prepares a real share-card PNG', () => {
    const aasa = fs.readFileSync(
      path.join(root, 'hosting/public/.well-known/apple-app-site-association'), 'utf8');
    const assetLinks = fs.readFileSync(
      path.join(root, 'hosting/public/.well-known/assetlinks.json'), 'utf8');
    const firebase = fs.readFileSync(path.join(root, 'firebase.json'), 'utf8');
    const prepareHosting = fs.readFileSync(
      path.join(root, 'scripts/prepare-content-link-hosting.js'), 'utf8');
    const fallback = fs.readFileSync(path.join(root, 'hosting/public/index.html'), 'utf8');
    expect(aasa).toContain('966CYAR5L4.com.faithlog.app');
    expect(aasa).toContain('/campuses/*/polls/*');
    expect(aasa).toContain('/campuses/*/announcements/*');
    expect(assetLinks).toContain('com.faithlog.app');
    expect(assetLinks).not.toContain('REPLACE_WITH');
    expect(firebase).toContain('prepare-content-link-hosting.js');
    expect(fallback).toContain('FaithLog 앱에서 열기');
    expect(fallback).toContain('faithlog://');
    expect(fallback).toContain('location.pathname');
    expect(fallback).toContain('src="/og-faithlog.png"');
    expect(fallback).not.toContain('faithlog-share.svg');
    expect(prepareHosting).toContain("'assets', 'share-fallback-icon.png'");
  });
});
