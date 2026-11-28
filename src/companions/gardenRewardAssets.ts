import type {ImageSourcePropType} from 'react-native';

export const rewardDecorations = [
  {id: 'bond-david-lamb', name: '작은 하프', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/david-lamb.png')},
  {id: 'bond-noah-bear', name: '나무 방주', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/noah-bear.png')},
  {id: 'bond-jonah-whale', name: '파도 분수', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/jonah-whale.png')},
  {id: 'bond-daniel-lion', name: '사자 문장', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/daniel-lion.png')},
  {id: 'bond-peace-dove', name: '올리브 화환', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/peace-dove.png')},
  {id: 'bond-hope-rabbit', name: '당근 화단', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/hope-rabbit.png')},
  {id: 'bond-word-fox', name: '여우 책방', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/word-fox.png')},
  {id: 'bond-gentle-deer', name: '뿔꽃 화분', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/gentle-deer.png')},
  {id: 'bond-companion-donkey', name: '여행 보물함', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/companion-donkey.png')},
  {id: 'bond-joy-chick', name: '달걀 등불', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/joy-chick.png')},
  {id: 'bond-peace-penguin', name: '얼음 펭귄', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/peace-penguin.png')},
  {id: 'bond-love-otter', name: '수달 분수', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/love-otter.png')},
  {id: 'bond-patience-turtle', name: '이끼 거북 화분', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/patience-turtle.png')},
  {id: 'season-spring-decoration', name: '봄 벚꽃 화분', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/spring.png')},
  {id: 'season-summer-decoration', name: '여름 해바라기 물그릇', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/summer.png')},
  {id: 'season-autumn-decoration', name: '가을 호박 등불', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/autumn.png')},
  {id: 'season-winter-decoration', name: '겨울 눈꽃 등불', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/winter.png')},
] as const;

export const rewardBackgrounds = [
  {id: 'season-spring-background', name: '봄 벚꽃 정원', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/spring-background.jpg')},
  {id: 'season-summer-background', name: '여름 호숫가', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/summer-background.jpg')},
  {id: 'season-autumn-background', name: '가을 단풍 정원', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/autumn-background.jpg')},
  {id: 'season-winter-background', name: '겨울 눈꽃 정원', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/winter-background.jpg')},
  {id: 'community-background', name: '함께 가꾼 정원', source: (): ImageSourcePropType => require('../../assets/gardens/rewards/community-background.jpg')},
] as const;

export const rewardIcons = {
  snack: (): ImageSourcePropType => require('../../assets/gardens/rewards/snack.png'),
  craftMaterial: (): ImageSourcePropType => require('../../assets/gardens/rewards/craft-material.png'),
  community: (): ImageSourcePropType => require('../../assets/gardens/rewards/community.png'),
};
