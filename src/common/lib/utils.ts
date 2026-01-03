import { ulid } from 'ulid';

export const generateUniqueId = (prefix: string): string => {
  return `${prefix}-${ulid()}`;
};
