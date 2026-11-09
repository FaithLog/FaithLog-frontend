# 성경 이야기 친구들 · 기본 에셋 v1

FaithLog 앱의 정원·도감·뽑기 결과에 사용할 기본 정지 포즈 5종입니다.
승인된 다윗의 양 시안을 기준으로 이미지 생성 도구로 제작한 오리지널 캐릭터입니다.
GitAnimals의 원본 에셋을 복사하지 않았습니다. 동물은 성경 인물 자체를 묘사하지 않고 이야기에서 영감을 받았습니다.
요나 이야기의 큰 물고기를 고래로 표현한 것은 캐릭터 디자인 선택입니다.

| ID | 이름 | 기본 PNG |
| --- | --- | --- |
| `david-lamb` | 다윗의 양 | ![다윗의 양](david-lamb-idle.png) |
| `noah-bear` | 노아의 곰 | ![노아의 곰](noah-bear-idle.png) |
| `jonah-whale` | 요나의 고래 | ![요나의 고래](jonah-whale-idle.png) |
| `daniel-lion` | 다니엘의 사자 | ![다니엘의 사자](daniel-lion-idle.png) |
| `peace-dove` | 평화의 비둘기 | ![평화의 비둘기](peace-dove-idle.png) |

## React Native에서 사용

```tsx
import { Image } from 'react-native';
import { BIBLE_FRIENDS } from './src/characters/bibleFriends';

const friend = BIBLE_FRIENDS[0];

<Image
  source={friend.source}
  accessibilityLabel={friend.name}
  resizeMode="contain"
  style={{ width: 96, height: 96 }}
/>
```

예제 import는 저장소 루트의 컴포넌트 기준이며 실제 파일 위치에 맞춰 조정합니다.
목록은 Metro가 정적으로 수집할 수 있도록 리터럴 `require()`를 사용합니다.
동적 문자열 `require(path)`나 원격 URL이 필요하지 않습니다.

## 파일 규격과 적용 범위

- 각 PNG는 RGBA 투명 배경이며 여백을 포함한 단일 기본 포즈입니다.
- 원본 크기·바이트 수는 `manifest.json`에 기록했습니다. 기본 PNG 5개의 합계는 약 3.42 MiB입니다.
- 현재 파일은 고해상도 픽셀 스타일 원본입니다. 엄밀한 48×48/64×64 고정 픽셀 격자나 동일한 스프라이트 셀 크기로 정규화된 파일이 아닙니다.
- `contain`으로 표시하고 동일한 컨테이너를 사용합니다. 64~128dp에서 실기기 가독성을 확인한 뒤, 실제 산책 UI에서는 개체별 보이는 크기와 바닥 기준선을 맞춥니다.
- `reference/david-lamb-poses-concept.png`는 앞서 승인된 기본·걷기·터치·들림 **참고 시트**입니다. 등간격 프레임이 아니므로 런타임 애니메이션 시트로 사용하지 않습니다. 목록에서도 참조하지 않습니다.
- 이번 변경은 에셋과 타입 목록만 추가합니다. 앱 화면, 포인트, 뽑기 확률, 움직임 및 상호작용 로직은 연결하지 않습니다.
- 실제 프레임 애니메이션을 추가할 때는 각 상태의 이미지 크기·발 위치·피벗을 통일하고 걷기 루프의 중간 프레임을 별도로 제작합니다.

## 제작 기준

따뜻한 갈색 외곽선, 둥근 아기 동물 비율, 복숭아색 볼, 세이지색 천과 금색 소품을 공유합니다.
캐릭터별 제작 지시는 각각 양(망토·수금), 곰(두건·방주), 고래(목도리·물줄기), 사자(크림색 옷·기도하는 앞발), 비둘기(올리브 잎·깃털 장식)입니다.
이미지는 내장 이미지 생성 도구로 제작했고 원본을 보존했습니다.
