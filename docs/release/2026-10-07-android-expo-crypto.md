# Android 시작 충돌: ExpoCrypto

## 확인된 장애

Firebase Crashlytics의 Android 이벤트는 `1.2.6 (74)`에서 발생했다.
2026-10-07 15:42:18 KST, Android 16 / SM-S947N이며 같은 문제의 이벤트 3개가 기록됐다.
운영 트랙의 72번과 이 이벤트를 혼동하면 안 된다. 72번 충돌 원인은 이 로그만으로 확정할 수 없다.

Tombstone의 종료 원인:

```
[runtime not ready]: Error: Cannot find native module 'ExpoCrypto'
```

74번 SDK 58 후보의 로컬 릴리스 APK에서도 같은 오류를 재현했다.
그 직전 로그는 다음과 같았다.

```
Cannot collect Expo Modules v2 modules: java.lang.NoSuchMethodException: ke.<init> []
```

## 원인과 수정

새 Expo Modules v2는 `ExpoModulesV2ModuleList`를 이름으로 조회하고
발견된 모듈을 reflection으로 생성한다. 기본 consumer ProGuard 규칙에
이 등록 경로의 보존 규칙이 빠져 있어 R8가 생성자와 생성된 JS binding을 제거한다.
수정 전 `usage.txt`에서 `CryptoModule`의 생성자와 `define$ExpoModulesV2` 등
삭제가 확인됐고, 최적화 전 provider bytecode에는 CryptoModule이 등록돼 있었다.

`plugins/androidExpoModulesV2KeepRules.js`에서 provider의 이름·생성자·getModules와
v2 Module 구현을 보존한다. `app.config.js`의 expo-build-properties
`android.extraProguardRules`로 공급하므로 EAS prebuild에서도 적용된다.
최적화·난독화·리소스 축소는 유지한다.

생성자만 보존한 첫 APK에서는 등록이 다음 단계로 진행했지만
`NoSuchFieldError: nativePointer in io.github.expo.kolibri.NativeObject`로 종료했다.
R8 mapping에서 해당 필드가 `r`로 난독화된 것을 확인했고, Kolibri의
`NativeObject.h`에서는 JNI가 이 Java 객체의 long 필드를 조회한다.
따라서 v2 엔진(`io.github.expo.modules.v2`, `io.github.expo.kolibri`)과
현재 v2 모듈의 codec/enum을 포함한 crypto/application 패키지까지 보존한다.
이는 같은 신규 라이브러리들의 consumer JNI/reflection 보존 규칙 누락을 보완한다.

주 작업 소스는 SDK 56을 유지한다. 이번 실행 검증 대상은 장애가 발생한
`/private/tmp/faithlog-play-fix`의 SDK 58 후보에 동일 수정이 반영된 빌드다.

## 검증

- 수정 전 설정 fixture에서 새 회귀 테스트 실패 확인.
- 수정 후 릴리스 설정 테스트 2개 파일 / 5개 테스트 통과.
- SDK 58 후보 전체 테스트 234개 파일 / 1,891개 테스트 통과.
- 후보 TypeScript 검사 통과. ESLint 오류 0개, 기존 미사용 변수 경고 1개.
- 최종 후보 릴리스 빌드 성공: 7분 10초 / 525개 task.
- Android 15 에뮬레이터에서 APK 설치와 실행 성공. `Expo Modules v2 installed 2 module(s)`
  및 React Native `Running "main"` 로그 확인. 시작 충돌 없이 프로세스 유지.
- 로컬 APK는 versionCode=1이므로 운영 Remote Config의 최소 버전 정책에 따라
  업데이트 안내 화면으로 진입한다. Play 서명 74번 또는 새 배포 빌드의 설치 검증과는 다르다.
- 로컬 native Kakao 키는 테스트용 placeholder다. 공유 기능 검증/배포용 APK가 아니다.
- 주 작업 소스의 최종 릴리스 설정 테스트 2개 파일 / 5개 테스트 통과.
- 에뮬레이터 재부팅 후에도 다시 실행했고, 모듈 2개 등록 및 `Running "main"` 확인.
  FaithLog 프로세스가 유지됐으며 기존 시작 충돌은 재발하지 않았다.
- 에뮬레이터의 별도 `System UI isn't responding` 팝업이 업데이트 화면을 가린다.
  따라서 깨끗한 화면 전체 QA와 Android 16 실기기 검증은 완료된 것으로 취급하지 않는다.

## 배포 상태

사용자가 테스트 통과 후 Play Console 업로드를 명시적으로 승인했다.
검증한 SDK 58 후보 소스를 EAS에 업로드했고, 기존 운영 서명으로
1.2.6 (75) 빌드와 Google Play 내부 테스트 제출이 모두 완료됐다.

- 빌드 ID: `b957dbe8-4273-452a-9595-139c7cad3a58`
- 프로필: `androidRecommendations` (production 상속, Node 24 / 최신 이미지)
- 제출 대상: Google Play 내부 테스트 (`internal`)
- 빌드: `FINISHED`, Gradle `BUILD SUCCESSFUL in 7m 54s`
- 제출: `FINISHED`, ID `17d8c7ec-362d-41e5-ac0a-8f53b84344a6`
- Play Console에서도 버전 코드 75 / 최종 업데이트 10월 7일 오후 4:42 확인.
- 기존 내부 테스트 트랙은 일시중지 상태이므로 테스터 수신은 트랙 재개 후 가능하다.

배포 재개 시 테스트한 후보 소스와 이번 수정이 함께 포함됐는지 확인한다.
기존 워크스페이스(SDK 56)만 업로드하면 후보에서 검증한 SDK 58 빌드와 달라진다.
새 Android versionCode 75를 Google Play 내부 테스트에 제출했다.
후속 검증: Play 서명 설치본에서 시작·로그인·공유 확인.

참고: [Android R8 reflection 보존 규칙](https://developer.android.com/topic/performance/app-optimization/keep-rule-examples)
