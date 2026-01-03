import { ulid } from 'ulid';

export const generateUniqueId = (prefix: string): string => {
  return `${prefix}_${ulid()}`;
};

const profileImageNameList: string[] = [
  'Jasper',
  'Nala',
  'Sammy',
  'Harley',
  'Lucy',
  'Bob',
  'Snuggles',
  'Patches',
  'Tiger',
  'Smokey',
  'Leo',
  'Snickers',
  'Oliver',
  'Annie',
  'Socks',
  'Coco',
  'Buddy',
  'Chloe',
  'Callie',
  'Buster',
];

const profileImageCollectionList: string[] = [
  'adventurer-neutral',
  'fun-emoji',
  'lorelei-neutral',
  'avataaars-neutral',
  'big-ears-neutral',
  'bottts-neutral',
  'notionists-neutral',
  'pixel-art-neutral',
];

export const generateRandomAvatar = () => `
https://api.dicebear.com/6.x/${profileImageCollectionList[Math.floor(Math.random() * profileImageCollectionList.length)]}/svg?seed=
${profileImageNameList[Math.floor(Math.random() * profileImageNameList.length)]}
`;
