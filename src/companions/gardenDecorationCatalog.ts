import type {ImageSourcePropType} from 'react-native';

import {rewardDecorations} from './gardenRewardAssets';

export const freeDecorations = [
  {id: 'flower', name: '화분', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/flower.png')},
  {id: 'lantern', name: '등불', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/lantern.png')},
  {id: 'fountain', name: '분수', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/fountain.png')},
  {id: 'bench', name: '나무 벤치', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/bench.png')},
  {id: 'birdhouse', name: '새집', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/birdhouse.png')},
  {id: 'fence', name: '하얀 울타리', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/fence.png')},
  {id: 'stepping-stone', name: '잎사귀 디딤돌', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/stepping-stone.png')},
  {id: 'sign', name: '하트 표지판', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/sign.png')},
  {id: 'watering-can', name: '물뿌리개', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/watering-can.png')},
] as const;

export const gardenShopCategories = ['돌봄', '식물', '가구', '장식'] as const;

export const gardenShopDecorations = [
  {id: 'lamb-shelter', name: '양 쉼터', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/lamb-shelter.png')},
  {id: 'leaf-cushion', name: '잎사귀 방석', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/leaf-cushion.png')},
  {id: 'ceramic-water-bowl', name: '도자기 물그릇', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/ceramic-water-bowl.png')},
  {id: 'hay-feeder', name: '건초통', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/hay-feeder.png')},
  {id: 'dove-perch', name: '비둘기 횃대', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/dove-perch.png')},
  {id: 'seed-dish', name: '모이 접시', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/seed-dish.png')},
  {id: 'shell-bath', name: '조개 목욕통', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/shell-bath.png')},
  {id: 'crescent-bed', name: '초승달 침대', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/crescent-bed.png')},
  {id: 'blanket-basket', name: '담요 바구니', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/blanket-basket.png')},
  {id: 'ribbon-cabbage', name: '리본 양배추', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/ribbon-cabbage.png')},
  {id: 'mossy-basking-rock', name: '이끼 바위', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/mossy-basking-rock.png')},
  {id: 'hollow-log', name: '통나무 터널', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/hollow-log.png')},
  {id: 'acorn-birdhouse', name: '도토리 새집', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/acorn-birdhouse.png')},
  {id: 'paw-rug', name: '발바닥 러그', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/paw-rug.png')},
  {id: 'golden-birdbath', name: '황금 새 목욕통', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/golden-birdbath.png')},
  {id: 'strawberry-pet-house', name: '딸기 펫하우스', category: '돌봄', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/strawberry-pet-house.png')},
  {id: 'olive-sapling', name: '올리브 화분', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/olive-sapling.png')},
  {id: 'yellow-flower-trough', name: '노란 꽃 화단', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/yellow-flower-trough.png')},
  {id: 'carrot-planter', name: '당근 화분', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/carrot-planter.png')},
  {id: 'blue-watering-can', name: '파란 물뿌리개', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/blue-watering-can.png')},
  {id: 'blossom-arch', name: '꽃 아치', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/blossom-arch.png')},
  {id: 'lavender-planter', name: '라벤더 화분', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/lavender-planter.png')},
  {id: 'wooden-wheelbarrow', name: '나무 손수레', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/wooden-wheelbarrow.png')},
  {id: 'strawberry-hanging-basket', name: '딸기 걸이화분', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/strawberry-hanging-basket.png')},
  {id: 'succulent-stand', name: '다육이 선반', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/succulent-stand.png')},
  {id: 'tulip-boot-planter', name: '튤립 장화 화분', category: '식물', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/tulip-boot-planter.png')},
  {id: 'mini-dock', name: '작은 나무 부두', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/mini-dock.png')},
  {id: 'leaf-stepping-stone', name: '나뭇잎 디딤돌', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/leaf-stepping-stone.png')},
  {id: 'leaf-pond', name: '잎사귀 연못', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/leaf-pond.png')},
  {id: 'mushroom-stool', name: '버섯 의자', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/mushroom-stool.png')},
  {id: 'berry-stump-table', name: '열매 그루터기 탁자', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/berry-stump-table.png')},
  {id: 'sunflower-parasol', name: '해바라기 파라솔', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/sunflower-parasol.png')},
  {id: 'wave-hammock', name: '물결 해먹', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/wave-hammock.png')},
  {id: 'cloud-swing', name: '구름 그네', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/cloud-swing.png')},
  {id: 'clover-seat', name: '클로버 의자', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/clover-seat.png')},
  {id: 'blue-rain-barrel', name: '파란 빗물통', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/blue-rain-barrel.png')},
  {id: 'garden-book-stand', name: '정원 독서대', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/garden-book-stand.png')},
  {id: 'stone-bridge', name: '돌다리', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/stone-bridge.png')},
  {id: 'woodland-well', name: '숲속 우물', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/woodland-well.png')},
  {id: 'leaf-umbrella', name: '잎사귀 우산', category: '가구', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/leaf-umbrella.png')},
  {id: 'star-lantern', name: '별 랜턴', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/star-lantern.png')},
  {id: 'wooden-bell-arch', name: '나무 종 아치', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/wooden-bell-arch.png')},
  {id: 'honey-pot', name: '꿀단지', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/honey-pot.png')},
  {id: 'apple-crate', name: '사과 상자', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/apple-crate.png')},
  {id: 'chapel-ornament', name: '미니 예배당', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/chapel-ornament.png')},
  {id: 'rainbow-pinwheel', name: '무지개 바람개비', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/rainbow-pinwheel.png')},
  {id: 'pumpkin-lantern', name: '호박 랜턴', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/pumpkin-lantern.png')},
  {id: 'picnic-hamper', name: '피크닉 바구니', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/picnic-hamper.png')},
  {id: 'stone-sundial', name: '해시계', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/stone-sundial.png')},
  {id: 'pastel-kite', name: '파스텔 연', category: '장식', source: (): ImageSourcePropType => require('../../assets/gardens/decorations/pastel-kite.png')},
] as const;

export type DecorationId = typeof freeDecorations[number]['id'] | typeof gardenShopDecorations[number]['id'] | typeof rewardDecorations[number]['id'];
export const gardenDecorations = [...freeDecorations, ...gardenShopDecorations, ...rewardDecorations];
