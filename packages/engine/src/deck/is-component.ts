import type { ComponentType } from 'react';

/**
 * Whether a value can be rendered as a component: a function, or an object React wraps components
 * in (`memo`, `forwardRef`, `lazy`).
 *
 * @param value - The value to test.
 */
export function isComponent(value: unknown): value is ComponentType {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in value)
  );
}
