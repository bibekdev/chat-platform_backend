import { randomBytes } from 'node:crypto';

export const generateUniqueId = (prefix: string): string => {
  const randomHex = randomBytes(14).toString('hex');
  return `${prefix}_${randomHex}`;
};

const profileImageNameList: string[] = [
  'Kimberly',
  'Easton',
  'Caleb',
  'Robert',
  'Jack',
  'Sawyer',
  'Katherine',
  'Mason',
  'Leah',
  'Jocelyn',
  'Jessica',
  'Kingston',
  'Sophia',
  'Liliana',
  'Jade',
  'Riley',
  'George',
  'Adrian',
  'Jameson',
  'Emergy',
];

const profileImageCollectionList: string[] = [
  'avataaars',
  'lorelei',
  'micah',
  'personas',
  'open-peeps',
  'miniavs',
  'notionists',
];

export const generateRandomAvatar = () => `
https://api.dicebear.com/9.x/${profileImageCollectionList[Math.floor(Math.random() * profileImageCollectionList.length)]}/svg?seed=
${profileImageNameList[Math.floor(Math.random() * profileImageNameList.length)]}
`;
