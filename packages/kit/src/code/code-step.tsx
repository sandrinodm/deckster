import type { ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';

/**
 * Props of {@link CodeStep}.
 */
export type CodeStepProps = {
  /**
   * The code of this state, an alternative to the children.
   */
  code?: string;

  /**
   * The code of this state as a string child.
   */
  children?: ReactNode;

  /**
   * The state's language when it differs from the `<CodeMove>`'s.
   */
  lang?: string;
};

/**
 * One state of a `<CodeMove>`. It renders nothing itself: the parent reads its code and language.
 * In MDX, a fenced block inside `<CodeMove>` is the shorter way to write a state; use `<CodeStep>`
 * to give a state its own language, or in TSX to pass the code as a string.
 *
 * ```mdx
 * <CodeMove file="user.ts">
 *   <CodeStep>{`const name = 'Ada';`}</CodeStep>
 *   <CodeStep>{`const name: string = 'Ada';`}</CodeStep>
 * </CodeMove>
 * ```
 */
export function CodeStep(props: CodeStepProps): ReactNode {
  checkComponentProps('CodeStep', props);
  return null;
}
