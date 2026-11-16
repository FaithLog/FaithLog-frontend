# FaithLog 동물농장 · 돌봄/진화 시각 에셋 v1

기존 13종 캐릭터의 **192×192 PNG 원본과 16프레임 모션은 변경하지 않습니다.** 신규 파일은 위에 얹는 **투명 SVG 이펙트/장식 레이어**입니다. 캐릭터별 별도 진화 몸체 원화나 80개의 고유 손그림 프레임으로 오인하지 마세요.

- **캐릭터 13종 × 진화 장식 2단계 = 26개 SVG**. 각 캐릭터에 다른 상징 모티프(수금/방주/물결/방패/올리브/초승달/책/잎/방울/밀/편지/하트/꽃)와 헤드 장식 및 고급 단계의 광채를 배치했습니다.
- **공용 돌봄 시각 모션 10종, 총 44개의 투명 SVG 프레임**: 먹이/놀이/수면/배변/청소/쓰다듬기/허기/아픔/기절/진화. 실제 사망 처리는 포함하지 않습니다.
- 모든 SVG는 **192×192 viewBox**, 기준점 **(96,176)**를 유지합니다. 기존 에셋 위에 올리는 레이어라서 원본 포즈를 훼손하지 않습니다.
- **RN 사용**: `src/characters/BibleFriendFarmSprite.tsx` (내부에서 기존 `BibleFriendDesignSprite` 재사용), `farmActionElapsedMs`를 부모의 공유 시계로 제공합니다. `reduceMotion`은 0번 프레임을 유지합니다. 재생 끝난 비루프 애니메이션은 부모에서 `farmAction`을 해제해야 합니다.
- 미획득 실루엣은 장식/행동 이펙트를 숨깁니다. 예수님 미라클 캐릭터 렌더러는 이 작업의 대상이 아닙니다.

```tsx
<BibleFriendFarmSprite
  designId="hope-rabbit:base"
  evolutionStage={2}
  farmAction="feed"
  farmActionElapsedMs={elapsedMs}
  size={96}
/>
```

## 확인 방법

루트에서 `python3 -m http.server 8080` 실행 후 `/assets/characters/bible-friends/farm/preview.html`을 열어 캐릭터별 성장 장식 및 돌봄 모션을 확인합니다. `manifest.json`의 파일 목록과 단계/프레임 규격을 기준으로 검사할 수 있습니다. `farmMotionTimeline.test.ts`는 13종 일치·프레임 수·타이밍 범위를 확인합니다.

## 이 에셋 패치에서 *하지 않은* 작업

- 기존 PNG를 동물별로 재작화한 진화 원화, 캐릭터 고유 먹기/수면 포즈 및 80프레임 새 스프라이트 시트
- 사용자 데이터·친밀도·먹이·청소·진화 조건·죽음/회복 정책과 DB/API 설계 및 구현
- 홈/동물관리 실제 호출부 연결, 실기기 QA, 운영 배포

위 기능들은 이슈 후속 작업으로 분리합니다. 실기기 64–96dp에서 보이는 위치와 의상 간 겹침을 검토해야 합니다.
