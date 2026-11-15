import type { OpenComment, PickedElement } from '@deckster/comments/picker';
import type { ReactNode } from 'react';

import { Icon } from '#runtime/icons.tsx';

/**
 * The longest comment text a chip shows, in characters.
 */
const COMMENT_CHARS = 36;

/**
 * The longest element text a chip shows, in characters.
 */
const ELEMENT_CHARS = 40;

/**
 * The size of the icons on the chips, in CSS pixels.
 */
const CHIP_ICON_PX = 13;

/**
 * The size of the remove button's icon on the picked element's chip, in CSS pixels.
 */
const CHIP_REMOVE_ICON_PX = 12;

/**
 * The slide on screen, as the slide chip shows it.
 */
export type SlideChipInfo = {
  /**
   * The slide's number, from 1.
   */
  readonly number: number;

  /**
   * Its title, or an empty string.
   */
  readonly title: string;

  /**
   * Its file relative to the deck folder, such as `slides/title.mdx`.
   */
  readonly file: string;

  /**
   * The step on screen, from 0.
   */
  readonly step: number;

  /**
   * How many steps it has, when known.
   */
  readonly stepCount: number | undefined;
};

/**
 * Props of {@link ContextChips}.
 */
export type ContextChipsProps = {
  /**
   * The slide on screen, or undefined before the deck renders.
   */
  readonly slide: SlideChipInfo | undefined;

  /**
   * The picked element, if any.
   */
  readonly picked: PickedElement | undefined;

  /**
   * Whether the picked element belongs to another slide than the one on screen.
   */
  readonly pickedElsewhere: boolean;

  /**
   * Whether the picker is choosing an element now.
   */
  readonly picking: boolean;

  /**
   * The slide's open review comments.
   */
  readonly comments: readonly OpenComment[];

  /**
   * The ids of the comments attached to the next prompt.
   */
  readonly attached: readonly string[];

  /**
   * Starts or stops the picker.
   */
  readonly onPick: () => void;

  /**
   * Drops the picked element.
   */
  readonly onClearPicked: () => void;

  /**
   * Attaches or detaches a comment.
   */
  readonly onToggleComment: (id: string) => void;
};

/**
 * What the next prompt is about, above the input: the slide and step on screen (following
 * navigation), the picked element with its tag, text and source line, the slide's open review
 * comments (one click attaches one), and the button that picks an element on the slide.
 *
 * @param props - The context and how to change it.
 */
export function ContextChips(props: ContextChipsProps): ReactNode {
  const { slide, picked } = props;
  return (
    <div className="da-context" role="group" aria-label="Context sent with the prompt">
      {slide === undefined ? null : slideChip(slide)}
      {picked === undefined
        ? null
        : pickedChip(picked, {
            elsewhere: props.pickedElsewhere,
            onClear: props.onClearPicked,
          })}
      {props.comments.map((comment) => {
        const on = props.attached.includes(comment.id);
        return (
          <button
            key={comment.id}
            type="button"
            className="da-ctx"
            data-kind="comment"
            aria-pressed={on}
            title={`${on ? 'Detach' : 'Attach'} comment #${comment.number}: ${comment.text}`}
            onClick={() => props.onToggleComment(comment.id)}>
            <Icon name="comment" size={CHIP_ICON_PX} />
            <span className="da-ctx-tag">#{comment.number}</span>
            <span className="da-ctx-main">{clip(comment.text, COMMENT_CHARS)}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="da-ctx-action"
        aria-pressed={props.picking}
        title={props.picking ? 'Cancel picking (Esc)' : 'Pick an element on the slide'}
        onClick={props.onPick}>
        <Icon name="pick" size={CHIP_ICON_PX} />
        {pickLabel(props.picking, picked !== undefined)}
      </button>
    </div>
  );
}

/**
 * The slide chip: the slide's title, its file and the step on screen.
 *
 * @param slide - The slide on screen.
 */
function slideChip(slide: SlideChipInfo): ReactNode {
  return (
    <span
      className="da-ctx"
      data-kind="slide"
      title={`Slide ${slide.number}: ${slide.title || slide.file}, step ${slide.step}`}>
      <Icon name="file" size={CHIP_ICON_PX} />
      <span className="da-ctx-main">{slide.title || `Slide ${slide.number}`}</span>
      <span className="da-ctx-sub">
        {fileName(slide.file)} · step {slide.step}
        {stepCountSuffix(slide.stepCount)}
      </span>
    </span>
  );
}

/**
 * The chip of the picked element: its tag, its text, where it comes from and a button to drop it.
 *
 * @param picked - The element.
 * @param options - Whether it is on another slide than the one on screen, and what drops it.
 */
function pickedChip(
  picked: PickedElement,
  options: { readonly elsewhere: boolean; readonly onClear: () => void },
): ReactNode {
  return (
    <span
      className="da-ctx"
      data-kind="element"
      data-elsewhere={options.elsewhere || undefined}
      title={pickedTitle(picked)}>
      <Icon name="pick" size={CHIP_ICON_PX} />
      <span className="da-ctx-tag">{picked.tag}</span>
      {picked.text === '' ? null : (
        <span className="da-ctx-main">“{clip(picked.text, ELEMENT_CHARS)}”</span>
      )}
      <span className="da-ctx-sub">{sourceLabel(picked)}</span>
      <button
        type="button"
        className="da-ctx-remove"
        aria-label={`Remove the picked element ${picked.label}`}
        onClick={options.onClear}>
        <Icon name="close" size={CHIP_REMOVE_ICON_PX} />
      </button>
    </span>
  );
}

/**
 * The tooltip of the picked element's chip: its label, and its text when it has some.
 *
 * @param picked - The element.
 */
function pickedTitle(picked: PickedElement): string {
  return `${picked.label}${picked.text === '' ? '' : `: ${picked.text}`}`;
}

/**
 * The "/n" shown after the step, where n is the slide's last step. Empty when the count is unknown
 * or the slide has one step or none.
 *
 * @param stepCount - How many steps the slide has, when known.
 */
function stepCountSuffix(stepCount: number | undefined): string {
  if (stepCount === undefined || stepCount <= 1) {
    return '';
  }

  return `/${stepCount - 1}`;
}

/**
 * The pick button's text.
 *
 * @param picking - Whether the picker is choosing now.
 * @param picked - Whether an element is picked already.
 */
function pickLabel(picking: boolean, picked: boolean): string {
  if (picking) {
    return 'Picking… Esc to cancel';
  }

  return picked ? 'Pick another' : 'Pick element';
}

/**
 * The last part of a path.
 *
 * @param file - The path.
 */
function fileName(file: string): string {
  return file.split('/').at(-1) ?? file;
}

/**
 * Where a picked element comes from: its file and line, the layout, or the brand chrome.
 *
 * @param picked - The element.
 */
function sourceLabel(picked: PickedElement): string {
  if (picked.chrome) {
    return 'brand chrome';
  }

  if (picked.stamp === undefined) {
    return 'from the layout';
  }

  const [file = '', line = ''] = picked.stamp.split(':');
  return `${fileName(file)}:${line}`;
}

/**
 * Text cut to a length.
 *
 * @param text - The text.
 * @param length - The most characters.
 */
function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
