# FaithLog 스토어 배포

Expo EAS 프로젝트: `josephuk77/faithlog-frontend`.
앱 식별자(iOS/Android): `com.faithlog.app`.
이번 앱 버전: `1.2.6`. 빌드 번호와 versionCode는 EAS가 자동 증가합니다.

## 빌드

```sh
npm ci
npm run ci
eas whoami
npm run build:store
```

production은 store 배포, Android AAB, 실제 HTTPS API, mock 비활성화를 사용합니다.
Firebase 설정은 EAS production의 `GOOGLE_SERVICES_JSON_BASE64`와
`GOOGLE_SERVICE_INFO_PLIST_BASE64` 비밀 변수로 공급합니다.
서명은 EAS에 저장된 iOS 배포 인증서/프로비저닝과 Android keystore를 사용합니다.
키와 비밀 값은 소스나 로그에 넣지 않습니다.

## 제출

성공한 **이번 빌드 ID**를 사용합니다. `--latest`는 다른 작업의 빌드를 선택할 수 있어 피합니다.

```sh
npm run submit:ios -- --id <IOS_BUILD_ID>
npm run submit:android -- --id <ANDROID_BUILD_ID>
```

iOS는 App Store Connect 앱 `6784053598`로 업로드합니다. 업로드 후 TestFlight 처리,
App Store 버전의 빌드 선택, 심사 정보/스크린샷/개인정보 항목 작성과 심사 제출이 필요합니다.

Android 기본 제출 대상은 내부 테스트 트랙입니다. Play 서비스 계정 제출 키가 EAS에
등록되어 있어야 합니다. 내부 테스트 확인 후 Play Console에서 production으로 승격하고
스토어 정보·데이터 보안·앱 액세스·콘텐츠 등급 및 심사 항목을 완료합니다.

EAS Submit 성공은 스토어 공개 완료를 의미하지 않습니다.

## 검증 및 복구

빌드 링크에서 각 플랫폼의 성공 여부와 산출물(IPA/AAB)을 확인합니다.
TestFlight/Play 내부 테스트 설치본에서 로그인, 투표 조회·종료·미참여자 명단과 푸시를 확인합니다.
문제가 있으면 공개 롤아웃을 중단하고 수정 버전을 새 빌드 번호로 제출합니다.
이 프로젝트에는 EAS Update 배포를 설정하지 않았으므로 JS 변경도 새 스토어 빌드가 필요합니다.

참고: https://docs.expo.dev/build/eas-json/
https://docs.expo.dev/submit/ios/
https://docs.expo.dev/submit/android/

## 2026-10-01 업로드 결과

앱 버전 `1.2.5`의 EAS Build와 EAS Submit이 양쪽 모두 `FINISHED`로 확인되었습니다.

| 플랫폼 | 빌드 번호 | 빌드 | 제출 |
| --- | --- | --- | --- |
| iOS | 38 | https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/builds/24c80b7c-892c-41c0-a914-2296136cd327 | https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/submissions/cfb78652-a4a4-40e2-8fa5-3c58375b1ead |
| Android | 70 | https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/builds/3347e84e-4171-47a8-ab46-b255f9c5be04 | https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/submissions/8ad96ef4-78b8-469b-ad25-135e37e2559c |

iOS는 App Store Connect 업로드, Android는 내부 테스트 업로드 완료입니다.
스토어 심사 승인 또는 일반 사용자 공개 상태는 아직 확인하지 않았습니다.
전체 자동 테스트 112개 파일/1,094개, TypeScript, ESLint 통과.

빌드의 Expo Doctor는 SDK 56 Hermes V1 메모리 회귀와 SDK 권장 패키지 버전 차이를
경고했습니다. 네이티브 빌드는 성공했지만 이 경고는 해결된 것으로 처리하지 않습니다.
SDK 57 업그레이드와 TestFlight/Play 설치본의 메모리·실행 검증을 공개 전 권장합니다.
근거: https://expo.dev/changelog/sdk-56
https://expo.dev/changelog/sdk-57

## 2026-10-05 1.2.6 제출 결과

iOS build 39 / Android versionCode 72의 EAS production 빌드 및 스토어 제출이 모두 FINISHED. iOS App Store Connect, Android Google Play 내부 테스트. 상세 기록: [1.2.6 배포](2026-10-05-1.2.6.md).

## 2026-10-06 Android 1.2.6 빌드 73

구형 StatusBar backgroundColor/translucent 지정 제거 및 공지 이미지·썸네일 디코딩 전 크기 축소를 반영했다. 타입 검사·린트 통과(기존 미사용 변수 경고 1개), 233개 테스트 파일/1,890개 테스트 통과.

- 빌드 FINISHED: https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/builds/8d1ce29e-e117-4cd0-bfd3-4bdf2b790f11
- Google Play 내부 테스트 제출 FINISHED: https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/submissions/75dc684d-1978-4b91-ba01-5d9ca6a00815

Android 실기기 연결이 없어 설치본 검증은 미수행. Play Console 권고 해소 여부는 아직 확인하지 않았으며 AGP 8.12.0과 의존성 내부 구형 API 호출은 유지된다. 이번 수정은 Android 빌드만 업로드했다. 일반 사용자 공개 완료를 의미하지 않는다. 기록: artifacts/release-1.2.6/android-73/.

## 2026-10-06 Android 1.2.6 빌드 74 — AGP 9 검증 후보

Expo 58.0.5(next/베타), React Native 0.88.0-rc.3, AGP 9.2.1, Gradle 9.4.1을 별도 작업 디렉터리에서 검증했다. 주 작업 소스는 SDK 56을 유지하며 후보 변경은 `artifacts/android-agp9-candidate/upgrade.patch` 및 `source/`에 보관했다.

233개 파일/1,890개 테스트, 타입 검사, 린트(기존 경고 1개), 로컬 Android 릴리스 빌드 통과. EAS 빌드와 Google Play 내부 테스트 제출 모두 FINISHED.

- 빌드: https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/builds/efc7cf60-c940-4e88-a8d0-756fd0a7b6ad
- 제출: https://expo.dev/accounts/josephuk77/projects/faithlog-frontend/submissions/ed2de5ec-2d69-4933-87e0-96b5810bf128

Mac 잠금으로 Play Console의 새 빌드 권고 및 설치본 UI 확인은 미완료다. React Native WindowUtil에는 구형 시스템 바/컷아웃 호환 코드가 남아 있고 이미지 라이브러리 내부 디코딩 경로도 있으므로 세 권고가 모두 해소됐다고 판단하지 않는다. 일반 사용자 공개 및 SDK 58 기반 iOS 배포는 수행하지 않았다.

### 잠금 해제 후 Play Console 재확인

74번은 내부 테스터에게 제공됨, 운영은 72번으로 확인했다. 74번 번들 분석은 DEX 최적화 높음, 최적화 82%, 난독화 83%, 축소 83%, 전체 DEX 6.92MB이며 R8 전체 모드·리소스 축소·리소스 축소 최적화·클래스 리패키징이 표시된다. 운영 권고 3개 화면의 보고서 링크는 versionCode=72다. 사전 출시 보고서는 아직 생성되지 않아 74번 구형 API/비트맵 권고 소멸 여부는 확인할 수 없다.

Android 15 에뮬레이터에 로컬 APK 설치 성공(versionName=1.2.6, 로컬 versionCode=1; Play 서명 74번과 다름). Android Emulator를 화면 제어 도구에서 선택할 수 없어 설치본 UI 검증은 미완료다. Mac 잠금 문제는 해소됐다.
