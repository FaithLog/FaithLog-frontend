# 성경 이야기 친구들 · 모션 에셋

기존 5종의 외형과 소품을 참조해 내장 이미지 생성 도구로 제작한 16포즈 시트를 개별 PNG로 분리했습니다.
총 **5종 × 16프레임 = 80장**이며 기존 정지 이미지와 참고 시트는 보존했습니다.

| 모션 | 용도 | 프레임 수 | 각 프레임 표시 시간(ms) | 반복 |
| --- | --- | --- | --- | --- |
| `idle` | 대기·눈 깜빡임 | 4 | 1800, 100, 130, 220 | 예 |
| `walk` | 걷기·고래 헤엄 | 4 | 150, 150, 150, 150 | 예 |
| `happy` | 터치 후 기쁜 반응 | 4 | 120, 180, 240, 240 | 아니요 |
| `held` | 들어 올린 상태·버둥거림 | 2 | 220, 220 | 예 |
| `land` | 내려놓기·착지 회복 | 2 | 150, 200 | 아니요 |

## 앱에서 프레임 선택

```tsx
import { Image } from 'react-native';
import { BIBLE_FRIEND_MOTION_FRAMES } from './src/characters/bibleFriendMotionAssets';
import { getBibleFriendMotionFrameIndex } from './src/characters/bibleFriendMotionTimeline';

const frames = BIBLE_FRIEND_MOTION_FRAMES['david-lamb'].walk;
const index = getBibleFriendMotionFrameIndex('walk', elapsedMs);

<Image
  source={frames[index] ?? frames[0]}
  accessibilityLabel="걷는 다윗의 양"
  resizeMode="contain"
  style={{ width: 96, height: 96 }}
/>
```

예제 import는 저장소 루트의 컴포넌트 기준입니다. `elapsedMs`는 화면의 재생 상태에서 제공해야 합니다.
모션을 바꿀 때 시간을 0으로 초기화하고, 앱이 백그라운드로 가거나 화면을 벗어나면 재생 타이머를 정지합니다.
접근성의 동작 줄이기 설정에서는 첫 프레임만 표시합니다. `happy`와 `land`는 마지막 프레임에 머물기 때문에 앱에서 재생 종료 후 `idle`로 전환할 수 있습니다.
이 파일은 PNG 에셋과 프레임 선택 함수의 사용 예시이며, UI 이벤트·앱 상태·타이머를 자동 연결하는 재생 컴포넌트는 아닙니다.

## 규격

- 모든 프레임: 투명 PNG, **192×192px**, 128색 이하 팔레트 최적화. 원본 생성 이미지의 포즈를 새로 그리지 않고 분리·축소·배치했습니다.
- 피벗 / 바닥 기준: **(96, 176)**. 발 또는 몸체 바닥을 기준선에 맞추고, 캐릭터별 전체 모션에 같은 축소 비율을 적용해 착지 시 눌림 등 포즈 차이를 보존했습니다.
- 가장 긴 외형은 160px 이내입니다. 64~96dp 표시를 우선 권장하며 실기기에서 확인 후 조정합니다.
- 이동 방향을 바꿀 때 전체 프레임을 `scaleX: -1`로 뒤집을 수 있습니다. 소품도 같이 뒤집힙니다.
- 점프의 화면상 높이, 집어 들 때 손가락 위치, 떨어지는 위치는 앱의 위치 애니메이션으로 제어합니다. `happy` 프레임은 바닥 정렬되어 있어 화면상의 점프 궤적을 포함하지 않습니다.
- 고래는 지느러미와 몸통의 흔들림을 사용합니다. 비둘기는 올리브 잎을 든 짧은 걸음으로 표현했으며 별도 비행 루프는 없습니다.
- 원본 시트는 생성형 이미지이므로 프레임 사이 외곽선·소품에 미세한 차이가 있습니다. 완전한 수작업 고정 격자 스프라이트는 아닙니다.

## 시각 확인

저장소 루트에서 `python3 -m http.server 8080`을 실행하고 아래 경로를 열면 로컬 PNG를 실제 타이밍으로 재생합니다.

`http://localhost:8080/assets/characters/bible-friends/motions/preview.html`

미리보기는 개발 확인용이며 FaithLog 앱 화면과 분리되어 있습니다. 외부 URL·폰트·라이브러리를 불러오지 않습니다.
`manifest.json`은 파일 순서·표시 시간·반복 여부·출처 시트 식별자를 기록합니다.
앱 번들에서는 리터럴 `require()`로 작성된 `src/characters/bibleFriendMotionAssets.ts`를 사용합니다.
