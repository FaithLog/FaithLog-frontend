# FaithLog 진화형 코스튬 234종

기존 뽑기 캐릭터 구조를 보존하면서 추가한 **13종 × 9가지 기존 비기본 디자인 × Lv.2/Lv.3 = 234개** 투명 PNG 아틀라스입니다.

- 파일: `<species>--<costume-style>--lv2.png`, `<species>--<costume-style>--lv3.png`
- 포맷: 768×768 PNG (192×192 프레임 4열×4행), 파일당 16개 움직임 프레임, 총 3,744개 프레임
- 정적 Metro require 매핑: `src/characters/costumeEvolvedAssets.ts`
- 앱 렌더러: `CostumeEvolvedSprite.tsx` / `BibleFriendFarmSprite.tsx`
- 가챠의 `species:style` 기존 식별자와 확률·포인트 로직은 변경하지 않았습니다. **코스튬 별도 판매 기능도 추가하지 않았습니다.**
- 기본형 13종의 기존 Lv.2/Lv.3 전신 에셋 26개, 돌봄 아틀라스 286개, 예수님 미라클 및 실루엣도 보존합니다.

## 정확한 제작 방식과 한계

코스튬별 기존 16프레임 원화를 소스로 사용하고, Lv.2·Lv.3의 몸체/머리 비율 성장 변형 및 단계별 장식으로 새 PNG를 생성했습니다. **234개의 독립 손그림 진화 원화, 또는 전부 별도로 다시 그린 동물 몸체는 아닙니다.** 진화 기본형 수준의 종별 외형 차이를 재현하려면 추가 수작업 리터칭이 필요합니다.

먹이·놀이·수면 등 돌봄 행동은 현재 코스튬 진화 모션 위에 기존 공용 돌봄 이펙트를 합성합니다. 코스튬별 고유 먹기/수면 그림을 새로 제작했다는 의미는 아닙니다.

전체 이미지 시각 검수: `contact-sheet.jpg` / `manifest.json`.
재생용 생성 명령: `python3 tools/generate_faithlog_costume_evolution.py --root .`.

**실제 홈 화면에서 진화 단계 전달, 서버 상태/친밀도 저장 및 실기기 QA는 별도 연동 대상입니다.**

## 자동 생성 결과 검증

- 총 234개 PNG, 16프레임씩 총 3,744개. GitHub Actions 검증 완료.
- 투명 팔레트 PNG 압축 후 실제 PNG 합계 약 29.4MiB.
- `develop` 병합 전 Frontend CI 및 Companion Integration QA가 모두 통과해야 합니다.
