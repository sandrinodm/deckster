import type { ReactNode } from 'react';

import type { CommentType } from '#model/comment-schema.ts';

import { COMMENT_TYPES } from '#model/comment-types.ts';

/**
 * Props of {@link TypePicker}.
 */
type TypePickerProps = {
  /**
   * The type picked, or `null`.
   */
  value: CommentType | null;

  /**
   * Called with the new type; picking the current one again clears it.
   */
  onChange: (type: CommentType | null) => void;
};

/**
 * The optional comment type, as toggle buttons: fix, question, idea.
 */
export function TypePicker({ value, onChange }: TypePickerProps): ReactNode {
  return (
    <fieldset className="dc-types" aria-label="Type">
      {COMMENT_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className="dc-type"
          data-type={type}
          aria-pressed={value === type}
          onClick={() => onChange(value === type ? null : type)}>
          {type}
        </button>
      ))}
    </fieldset>
  );
}
