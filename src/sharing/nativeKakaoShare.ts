import {requireOptionalNativeModule} from 'expo-modules-core';
import {NativeModules, Platform} from 'react-native';

import type {ShareContent} from './contentSharing';

type NativeKakaoShareModule = {
  share(title: string, description: string, buttonTitle: string, url: string): Promise<'completed'>;
};

const nativeModule = Platform.OS === 'ios'
  ? NativeModules.FaithLogKakaoShare as NativeKakaoShareModule | undefined
  : requireOptionalNativeModule<NativeKakaoShareModule>('FaithLogKakaoShare');

export async function shareWithKakaoTalk(content: ShareContent) {
  if (!nativeModule) throw new Error('카카오톡 공유를 사용할 수 없습니다.');
  await nativeModule.share(content.title, content.description, content.buttonTitle, content.url);
  return {status: 'completed' as const};
}
