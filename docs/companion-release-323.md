# #323 캐릭터 출시 및 연결 QA

사용자 승인: develop 프론트·백엔드 연결 QA 후 배포. 앱 버전은 1.3.0로 올리고 개발 모드 전용 공개 가드를 해제한다. 인증된 화면은 항상 실제 서버 API와 계정별 거래 복구 저장소를 사용한다.

QA workflow는 backend 00a74c41c6c3e8a66b2910bb60bcccd80e58f36b를 고정하여 별도 PostgreSQL17/Redis7와 함께 실행한다. fixture 생성은 loopback의 faithlog_companion_qa DB만 허용하고 실사용자 데이터·FCM·메일 provider를 사용하지 않는다. 기존 실제 HTTP/페이지 회귀에 131종 카탈로그·standard-v2·미라클0.01%·판매가1,000,000P 검증을 추가했다. 미션 수령/remount/계정 격리·판매·정원 충돌·1회/10회 뽑기·응답 유실 복구를 실행한다.

검증 결과와 배포 상태는 최종 PR/작업 보고에서 확인한다. 모바일 실기기 터치/성능 및 스토어 심사 결과는 자동 HTTP 검증과 별개다.
