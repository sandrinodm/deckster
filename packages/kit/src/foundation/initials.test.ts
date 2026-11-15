import { describe, expect, it } from 'vite-plus/test';

import { initialsOf } from '#foundation/initials.ts';

describe('initialsOf', () => {
  it.each([
    ['Dana Okafor', 'DO'],
    ['Dr. Amaka Bello', 'AB'],
    ['A. B. C. de la Cruz III', 'AC'],
    ['Oluwaseun Adeyemi-Clarke', 'OA'],
    ['Ngozi Okonjo-Iweala', 'NO'],
    ['Ludwig van Beethoven', 'LB'],
    ['Vincent van der Berg', 'VB'],
    ['Mohammed bin Salman Al Saud', 'MS'],
    ['Martin Luther King Jr.', 'MK'],
    ['Prof. Jane Smith, PhD', 'JS'],
    ["Patrick O'Brien", 'PO'],
    ['José María García Márquez', 'JM'],
    ['Đặng Thái Sơn', 'ĐS'],
    ['Cher', 'C'],
    ['mary-jane watson', 'MW'],
    ['Tomás Reyes', 'TR'],
  ])('gives %s the initials %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});
