import { useEffect, useRef, useState } from 'react';
import { MicIcon } from '@razorpay/blade/components';

/**
 * The one voice button, used on the four main screens (Memberships home,
 * Active members, Plans, Collected this month), always in the same spot:
 * bottom centre, just above the app's bottom bar.
 * - A soft white fade sits behind it, so cards slide under it cleanly.
 * - While scrolling down the label hides and it shrinks; scrolling up
 *   brings it back.
 * (The page leaves extra space at the bottom so nothing stays hidden under it.)
 */
export default function VoiceButton({ onClick }) {
  const [compact, setCompact] = useState(false);
  const lastTop = useRef(0);

  useEffect(() => {
    const el = document.querySelector('.screen');
    if (!el) return undefined;
    lastTop.current = el.scrollTop;
    const onScroll = () => {
      const top = el.scrollTop;
      if (top > lastTop.current + 4 && top > 24) setCompact(true);
      else if (top < lastTop.current - 4 || top <= 24) setCompact(false);
      lastTop.current = top;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div className="voice-fade" aria-hidden="true" />
      <div className={`voice-dock${compact ? ' is-compact' : ''}`}>
        <button className="voice-main" aria-label="Ask or do anything" onClick={onClick}>
          <MicIcon size={compact ? 'large' : 'xlarge'} color="surface.icon.staticWhite.normal" />
        </button>
        <span className="voice-label" aria-hidden="true">
          Ask or do anything
        </span>
      </div>
    </>
  );
}
