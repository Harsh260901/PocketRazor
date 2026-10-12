import { useState } from 'react';
import { Box, Text, Heading, Button, IconButton, CloseIcon, ChevronRightIcon, MicIcon } from '@razorpay/blade/components';
import { formatRupees } from './plansData.js';

/**
 * What the voice assistant shows after a question. Everything here was
 * worked out from the app's records (see assistant.js). Buttons that could
 * move money say "Review & …" and open the usual confirm screen.
 */
export default function AnswerSheet({ asked, result, chips = [], onAction, onPickMember, onAskAgain, onTypeInstead, onClose }) {
  const a = result;
  const [showAll, setShowAll] = useState(false);
  // Group answers ("who's expiring today?"): everyone is ticked; untick anyone you don't want to send to
  const [picked, setPicked] = useState(() => new Set(a.rows.map((r) => r.memberId).filter(Boolean)));
  const toggle = (id) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows = showAll || a.selectable ? a.rows : a.rows.slice(0, 4);
  const more = a.rows.length - rows.length;
  // The "Review & send links" button only sends to the ticked members
  const run = (x) => (x.type === 'renew' && a.selectable ? onAction({ ...x, memberIds: x.memberIds.filter((id) => picked.has(id)) }) : onAction(x));
  const labelFor = (x) => (x.type === 'renew' && a.selectable ? `${x.label} (${x.memberIds.filter((id) => picked.has(id)).length})` : x.label);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Answer">
        <div className="sheet-handle" />
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap="spacing.3">
          <Box>
            <Text size="small" color="surface.text.gray.muted">
              You asked: "{asked}"
            </Text>
            <Box marginTop="spacing.1">
              <Heading size="small" weight="semibold">
                {a.title}
              </Heading>
            </Box>
          </Box>
          <IconButton icon={CloseIcon} accessibilityLabel="Close" onClick={onClose} />
        </Box>

        {a.detail.map((d) => (
          <Box key={d} marginTop="spacing.1">
            <Text size="small" color="surface.text.gray.muted">
              {d}
            </Text>
          </Box>
        ))}

        {a.split && (
          <div className="answer-split">
            <div style={{ background: '#eef3fe' }}>
              <b>{formatRupees(a.split.razorpay)}</b>Via Razorpay
            </div>
            <div style={{ background: '#f5f7fa' }}>
              <b>{formatRupees(a.split.recorded)}</b>Cash/UPI
            </div>
          </div>
        )}

        {a.rows.length > 0 && (
          <div className="answer-rows">
            {rows.map((r) =>
              a.selectable && r.memberId ? (
                <label key={r.label} className="answer-row is-pick">
                  <input type="checkbox" checked={picked.has(r.memberId)} onChange={() => toggle(r.memberId)} aria-label={r.label} />
                  <span style={{ flex: 1 }}>{r.label}</span>
                  <b>{r.value}</b>
                </label>
              ) : r.memberId ? (
                <button key={r.label} className="answer-row" onClick={() => onPickMember(r.memberId)}>
                  <span>{r.label}</span>
                  <b>{r.value}</b>
                </button>
              ) : (
                <div key={r.label} className="answer-row">
                  <span>{r.label}</span>
                  <b>{r.value}</b>
                </div>
              ),
            )}
            {more > 0 && (
              <button className="answer-row" onClick={() => setShowAll(true)} style={{ color: '#1566f1' }}>
                <span>+ {more} more</span>
              </button>
            )}
          </div>
        )}

        {/* "Which Arjun do you mean?" */}
        {a.choices?.map((c) => (
          <button key={c.id} className="answer-choice" onClick={() => onAction({ type: 'choose', id: c.id })}>
            <span>{c.label}</span>
            <ChevronRightIcon size="medium" color="surface.icon.gray.muted" />
          </button>
        ))}

        {a.lock && (
          <div className="answer-lock">
            🔒 Voice never renews, sends or saves on its own. Tap below to review and confirm.
          </div>
        )}

        {a.kind === 'unknown' && chips.length > 0 && (
          <div className="ask-chips" style={{ justifyContent: 'flex-start' }}>
            {chips.map((c) => (
              <button key={c.label} type="button" onClick={c.onPick}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        <Box marginTop="spacing.5" display="flex" gap="spacing.3">
          {a.kind === 'unknown' || a.kind === 'choose' || a.kind === 'not_found' ? (
            <>
              <div style={{ flex: 1 }} className="rzp-blue-btn">
                <Button isFullWidth icon={MicIcon} iconPosition="left" onClick={onAskAgain}>
                  Ask again
                </Button>
              </div>
              <Box flex="1">
                {a.kind === 'not_found' ? (
                  <Button variant="secondary" isFullWidth onClick={() => onAction(a.actions[0])}>
                    {a.actions[0].label}
                  </Button>
                ) : (
                  <Button variant="secondary" isFullWidth onClick={onTypeInstead}>
                    Type instead
                  </Button>
                )}
              </Box>
            </>
          ) : (
            a.actions.map((act) =>
              act.primary ? (
                <div key={act.label} style={{ flex: 1.4 }} className="rzp-blue-btn">
                  <Button
                    isFullWidth
                    isDisabled={act.type === 'renew' && a.selectable && !act.memberIds.some((id) => picked.has(id))}
                    onClick={() => run(act)}
                  >
                    {labelFor(act)}
                  </Button>
                </div>
              ) : (
                <Box key={act.label} flex="1">
                  <Button variant="secondary" isFullWidth onClick={() => run(act)}>
                    {act.label}
                  </Button>
                </Box>
              ),
            )
          )}
        </Box>

        <Box marginTop="spacing.4" display="flex" justifyContent="center">
          <Text size="xsmall" color="surface.text.gray.muted">
            {a.source === 'links' ? "Answers come from Razorpay's own link records" : 'Answers come from your records, not AI guesses'}
          </Text>
        </Box>
      </div>
    </div>
  );
}

/** Confirm before resending several payment links (from a voice answer). */
export function ResendSheet({ links, onResend, onClose }) {
  const [state, setState] = useState('confirm'); // confirm | sending | done
  const [sent, setSent] = useState(0);
  const total = links.reduce((s, l) => s + l.amount, 0);
  const go = async () => {
    setState('sending');
    let ok = 0;
    for (const l of links) {
      try {
        await onResend(l.id);
        ok += 1;
      } catch {
        /* counted as not sent */
      }
    }
    setSent(ok);
    setState('done');
  };
  return (
    <div className="sheet-backdrop" onClick={state === 'sending' ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Resend payment links">
        <div className="sheet-handle" />
        {state !== 'done' ? (
          <>
            <Heading size="medium" weight="semibold">
              Resend {links.length === 1 ? 'the payment link' : `${links.length} payment links`}?
            </Heading>
            <Box marginTop="spacing.4" padding="spacing.4" borderRadius="medium" backgroundColor="surface.background.gray.moderate">
              <Text size="large" weight="semibold">
                {formatRupees(total)}
              </Text>
              <Text size="small" color="surface.text.gray.muted">
                {links.map((l) => l.memberName.split(' ')[0]).join(', ')}
              </Text>
            </Box>
            <Box marginTop="spacing.3">
              <Text size="small" color="surface.text.gray.muted">
                Razorpay texts each member the same link again.
              </Text>
            </Box>
            <Box marginTop="spacing.5" display="flex" gap="spacing.3">
              <div style={{ flex: 1 }} className="rzp-blue-btn">
                <Button isFullWidth isLoading={state === 'sending'} onClick={go}>
                  {links.length === 1 ? 'Resend link' : `Resend ${links.length} links`}
                </Button>
              </div>
              <Box flex="1">
                <Button variant="secondary" isFullWidth isDisabled={state === 'sending'} onClick={onClose}>
                  Cancel
                </Button>
              </Box>
            </Box>
          </>
        ) : (
          <>
            <Heading size="medium" weight="semibold">
              {sent === links.length ? 'Links sent again' : `Sent ${sent} of ${links.length}`}
            </Heading>
            <div style={{ marginTop: 20 }} className="rzp-blue-btn">
              <Button isFullWidth onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
