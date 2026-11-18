import { useBrand } from '@deckster/brand/runtime';
import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import { useId, useRef, type ReactNode } from 'react';

import type { conversationLayoutContract } from '#layouts/conversation-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { enterProps, useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/conversation-layout.css';

/**
 * Messages enter after the shared header and context.
 */
const FIRST_MESSAGE_ORDER = 2;

/**
 * Every fit level keeps attribution in its own column. Sparse exchanges try headline type first;
 * the whole transcript steps down together, including messages hidden by reveal.
 */
const CONVERSATION_LEVELS = [
  { text: 'headline', spacing: 'roomy' },
  { text: 'title', spacing: 'roomy' },
  { text: 'lead', spacing: 'normal' },
  { text: 'body', spacing: 'normal' },
  { text: 'body', spacing: 'tight' },
  { text: 'small', spacing: 'tight' },
] as const;

/**
 * A short exchange in staggered panels with a dedicated speaker column. The right side is the lit
 * item. All turns reserve their final geometry before the first reveal.
 */
function ConversationLayout({
  frontmatter,
  slots,
}: LayoutProps<typeof conversationLayoutContract>): ReactNode {
  const titleId = useId();
  const isStatic = useStatic();
  const contextEnter = useEnter(1);
  const { surface } = useBrand();
  const lit = surface.name === 'accent' || surface.name === 'gradient' ? 'inverse' : 'accent';
  const { messages, reveal } = frontmatter;
  const region = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLOListElement>(null);
  const key = JSON.stringify([
    messages,
    frontmatter.title,
    slots.body === undefined,
    slots.footnote === undefined,
  ]);
  const { level } = useFitLevel(region, transcript, CONVERSATION_LEVELS.length, key, {
    restartOnFontLoad: true,
    overflow: true,
  });
  const size = CONVERSATION_LEVELS[level] ?? CONVERSATION_LEVELS.at(-1)!;
  const seenSpeakers = new Set<string>();
  return (
    <Frame
      layout="conversation"
      variant={{
        'data-count': String(messages.length),
        'data-level': String(level),
        'data-spacing': size.spacing,
      }}>
      <SlideHeader
        titleId={titleId}
        eyebrow={frontmatter.eyebrow}
        title={frontmatter.title}
        maxLines={1}
      />
      {slots.body === undefined ? null : (
        <div className="kit-conversation-context kit-prose kit-body" {...contextEnter}>
          {slots.body}
        </div>
      )}
      <Region ref={region} className="kit-conversation-region">
        <ol ref={transcript} className="kit-conversation" aria-labelledby={titleId}>
          {messages.map((message, index) => {
            const firstMessage = !seenSpeakers.has(message.name);
            seenSpeakers.add(message.name);

            const content = (
              <li
                key={index}
                className="kit-conversation-message"
                data-side={message.side}
                data-surface={message.side === 'right' ? lit : undefined}
                {...enterProps(FIRST_MESSAGE_ORDER + index, isStatic)}>
                <div className="kit-conversation-speaker">
                  <p className="kit-conversation-name kit-type-label">
                    {smartPunctuation(message.name)}
                  </p>
                  {!firstMessage || message.role === undefined ? null : (
                    <p className="kit-conversation-role kit-type-caption">
                      {smartPunctuation(message.role)}
                    </p>
                  )}
                </div>
                <p className={`kit-conversation-text kit-type-${size.text}`}>
                  {smartPunctuation(message.text)}
                </p>
              </li>
            );
            return reveal ? (
              <Step key={index} at={index + 1}>
                {content}
              </Step>
            ) : (
              content
            );
          })}
        </ol>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

/**
 * The `conversation` layout's runtime component; unknown fields are rejected by its contract.
 */
export const conversationLayout = defineLayout<typeof conversationLayoutContract>({
  name: 'conversation',
  component: ConversationLayout,
});
