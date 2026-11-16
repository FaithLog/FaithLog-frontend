# FaithLog 진화 전신 에셋 v1 (#336)

이 폴더는 기존 농장 장식 오버레이와 다른 **독립적인 전신 SVG 일러스트**입니다. 13종 × 2단계 × 7개 독립 키 포즈 = **182개 SVG** 입니다.

- 진화 1단계와 2단계의 몸통·다리·귀·뿔·갈기·날개·지느러미·꼬리 비율을 다르게 그렸습니다.
- 7개 포즈: idle, walk-left, walk-right, feed, play, sleep, wake
- 10가지 애니메이션의 80개 논리 프레임: idle8, walk12, feed10, play10, sleep8, wake6, pet6, clean6, happy8, faint6. **80장 수작업 원화가 아니라 키 포즈를 재사용한 위치/회전/호흡 타임라인**입니다.
- 프레임은 투명 SVG 192×192, 기준점 (96,176). `EvolvedAnimalSprite`에서 RN SvgXml로 렌더링합니다.
- `BibleFriendFarmSprite`에서 **base 디자인 13종만** 단계 1/2에 새 전신 원화를 사용합니다. 나머지 의상 117종은 기존 외형 + 장식 SVG를 유지합니다. 미획득 실루엣/미라클 캐릭터는 변경하지 않습니다.
- 기존 서비스 데이터, 뽑기 확률, 친밀도/진화 조건 API 및 운영 배포는 변경하지 않습니다.
- 미리보기: 저장소 루트에서 `python3 -m http.server 8080` 실행 후 `/assets/characters/bible-friends/evolved/preview.html` 열기.
- 실기기에서 64–96dp 크기, 움직임, 애니메이션 성능과 시각 일관성 검수가 필요합니다.
