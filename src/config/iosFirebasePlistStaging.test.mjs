import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {stageIosFirebasePlist} = require('../../scripts/stage-ios-firebase-plist.js');

const dirs = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'faithlog-ios-firebase-'));
  dirs.push(root);
  fs.mkdirSync(path.join(root, 'ios'), {recursive: true});
  return root;
}

afterEach(() => {
  for (const root of dirs.splice(0)) fs.rmSync(root, {recursive:true,force:true});
});

describe('EAS iOS Firebase SPM Crashlytics plist staging', () => {
  it('copies a supplied file to ios root without editing source or printing secrets', () => {
    const root = temporaryRoot();
    fs.mkdirSync(path.join(root, 'fixtures'), {recursive:true});
    const fixture = path.join(root,'fixtures','qa.plist');
    fs.writeFileSync(fixture,'<plist>test-only-synthetic</plist>');
    const env = {EAS_BUILD_PLATFORM:'ios',GOOGLE_SERVICE_INFO_PLIST_PATH:'./fixtures/qa.plist'};

    expect(stageIosFirebasePlist({root,env})).toBe('staged');
    expect(fs.readFileSync(path.join(root,'ios','GoogleService-Info.plist'),'utf8')).toBe('<plist>test-only-synthetic</plist>');
    expect(fs.readFileSync(fixture,'utf8')).toBe('<plist>test-only-synthetic</plist>');
    expect(stageIosFirebasePlist({root,env})).toBe('already-present');
  });

  it('finds Expo-generated app project plists when EAS environment path is omitted', () => {
    const root = temporaryRoot();
    const app = path.join(root, 'ios','FaithLog');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app,'GoogleService-Info.plist'),'<plist/>');
    expect(stageIosFirebasePlist({root,env:{EAS_BUILD_PLATFORM:'ios'}})).toBe('staged');
    expect(fs.readFileSync(path.join(root,'ios','GoogleService-Info.plist'),'utf8')).toBe('<plist/>');
  });

  it('does not touch Android or silently suppress missing iOS configuration', () => {
    const root = temporaryRoot();
    expect(stageIosFirebasePlist({root,env:{EAS_BUILD_PLATFORM:'android'}})).toBe('skipped-non-ios');
    expect(() => stageIosFirebasePlist({root,env:{EAS_BUILD_PLATFORM:'ios'}})).toThrow('Missing iOS Firebase plist');
  });
});
