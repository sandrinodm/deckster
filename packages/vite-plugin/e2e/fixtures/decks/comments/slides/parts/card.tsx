import type { ReactNode } from 'react';

/**
 * Props of {@link Card}.
 */
type CardProps = {
  /**
   * The card's heading.
   */
  title: string;

  /**
   * The card's text.
   */
  children: ReactNode;
};

/**
 * A titled card: a component from the deck folder, not a slide.
 */
export function Card({ title, children }: CardProps): ReactNode {
  return (
    <section className="card">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}
