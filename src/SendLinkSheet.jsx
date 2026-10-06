import { useState } from 'react';
import {
  Box,
  Text,
  Heading,
  Button,
  Spinner,
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
} from '@razorpay/blade/components';
import { formatRupees, frequencyLabel } from './plansData.js';
import { memberStatus, fmtPhone } from './membersData.js';

// What the member sees on Razorpay's payment page and in the SMS
export function linkDescription(m) {
  const purpose = memberStatus(m) === 'pending' ? 'membership' : 'renewal';
  return `${m.planName} · ${frequencyLabel(m.price)} ${purpose}`;
}

async function sendLinks(members) {
  const res = await fetch('/api/send-payment-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      links: members.map((m) => ({
        memberId: m.id,
        name: m.name,
        phone: m.phone,
        email: m.email,
        amount: m.price.amount, // same plan and billing option they're on
        description: linkDescription(m),
        purpose: memberStatus(m) === 'pending' ? 'first_payment' : 'renewal',
        // The plan this payment is for (it can change at renewal)
        planId: m.planId,
        planName: m.planName,
        interval: m.price.interval,
        unit: m.price.unit,
      })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.results) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

/**
 * Slide-up panel: confirm → sending → done.
 * Sends each member a Razorpay payment link by SMS for their current
 * plan and billing option (no upgrades yet).
 */
export default function SendLinkSheet({ members, onClose, onSent }) {
  const [step, setStep] = useState('confirm'); // 'confirm' | 'sending' | 'done' | 'error'
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState('');

  const single = members.length === 1 ? members[0] : null;
  const total = members.reduce((sum, m) => sum + m.price.amount, 0);

  const send = async () => {
    setStep('sending');
    try {
      const data = await sendLinks(members);
      const sent = data.results.filter((r) => r.ok);
      onSent(sent); // mark these members as "link sent"
      setOutcome({ ...data, sent, failed: data.results.filter((r) => !r.ok) });
      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('error');
    }
  };

  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? 'Member';

  return (
    <div className="sheet-backdrop" onClick={step === 'sending' ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Send payment link">
        <div className="sheet-handle" />

        {step === 'confirm' && (
          <>
            <Heading size="medium" weight="semibold">
              {single ? `Send payment link to ${single.name}?` : `Send payment links to ${members.length} members?`}
            </Heading>

            <Box marginTop="spacing.4" padding="spacing.4" borderRadius="medium" backgroundColor="surface.background.gray.moderate">
              <Text size="xlarge" weight="semibold" color="surface.text.gray.normal">
                {formatRupees(total)}
              </Text>
              {single ? (
                <>
                  <Text size="small" color="surface.text.gray.muted">
                    {single.planName} · {frequencyLabel(single.price)}
                  </Text>
                  <Text size="small" color="surface.text.gray.muted">
                    By SMS to {fmtPhone(single.phone)}
                  </Text>
                </>
              ) : (
                <Text size="small" color="surface.text.gray.muted">
                  {members
                    .slice(0, 4)
                    .map((m) => m.name.split(' ')[0])
                    .join(', ')}
                  {members.length > 4 ? ` and ${members.length - 4} more` : ''}
                </Text>
              )}
            </Box>

            <Box marginTop="spacing.3">
              <Text size="small" color="surface.text.gray.muted">
                Razorpay texts {single ? 'them' : 'each member'} a secure link to pay for their current plan. Links stay
                valid for 2 days.
              </Text>
            </Box>

            <Box marginTop="spacing.5" display="flex" gap="spacing.3">
              <div style={{ flex: 1 }} className="rzp-blue-btn">
                <Button isFullWidth onClick={send}>
                  {single ? 'Send link' : `Send ${members.length} links`}
                </Button>
              </div>
              <Box flex="1">
                <Button variant="secondary" isFullWidth onClick={onClose}>
                  Cancel
                </Button>
              </Box>
            </Box>
          </>
        )}

        {step === 'sending' && (
          <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.4" paddingY="spacing.8">
            <Spinner accessibilityLabel="Sending" size="large" />
            <Text size="medium" color="surface.text.gray.normal">
              {single ? 'Sending payment link…' : `Sending ${members.length} payment links…`}
            </Text>
          </Box>
        )}

        {step === 'done' && outcome && (
          <>
            <Box display="flex" alignItems="center" gap="spacing.3">
              {outcome.sent.length > 0 ? (
                <CheckCircleIcon size="large" color="feedback.icon.positive.intense" />
              ) : (
                <AlertCircleIcon size="large" color="feedback.icon.negative.intense" />
              )}
              <Heading size="medium" weight="semibold">
                {outcome.sent.length === 0
                  ? "Couldn't send the link"
                  : single
                    ? 'Payment link sent'
                    : `Links sent to ${outcome.sent.length} of ${members.length} members`}
              </Heading>
            </Box>

            {outcome.smsTo && outcome.sent.length > 0 && (
              <Box marginTop="spacing.3">
                <Text size="small" color="surface.text.gray.muted">
                  Testing: the SMS went to your number ({outcome.smsTo}), not the member's.
                </Text>
              </Box>
            )}

            {/* For a single link, show it so you can open Razorpay's payment page */}
            {single && outcome.sent[0]?.shortUrl && (
              <Box marginTop="spacing.4" padding="spacing.4" borderRadius="medium" backgroundColor="surface.background.gray.moderate">
                <Text size="small" color="surface.text.gray.muted">
                  Payment link
                </Text>
                <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                  {outcome.sent[0].shortUrl.replace(/^https?:\/\//, '')}
                </Text>
                <Box marginTop="spacing.3">
                  <Button
                    variant="secondary"
                    size="small"
                    icon={ExternalLinkIcon}
                    iconPosition="right"
                    href={outcome.sent[0].shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open link
                  </Button>
                </Box>
              </Box>
            )}

            {outcome.failed.length > 0 && (
              <Box marginTop="spacing.4" display="flex" flexDirection="column" gap="spacing.2">
                {outcome.failed.map((f) => (
                  <Text key={f.memberId} size="small" color="feedback.text.negative.intense">
                    {single ? f.error : `${nameOf(f.memberId)}: ${f.error}`}
                  </Text>
                ))}
              </Box>
            )}

            <div className="rzp-blue-btn" style={{ marginTop: 20 }}>
              <Button isFullWidth onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <Box display="flex" alignItems="flex-start" gap="spacing.3">
              <Box paddingTop="spacing.1">
                <AlertCircleIcon size="medium" color="feedback.icon.negative.intense" />
              </Box>
              <Text size="medium" color="surface.text.gray.normal">
                {error}
              </Text>
            </Box>
            <Box marginTop="spacing.5" display="flex" gap="spacing.3">
              <div style={{ flex: 1 }} className="rzp-blue-btn">
                <Button isFullWidth onClick={send}>
                  Try again
                </Button>
              </div>
              <Box flex="1">
                <Button variant="secondary" isFullWidth onClick={onClose}>
                  Close
                </Button>
              </Box>
            </Box>
          </>
        )}
      </div>
    </div>
  );
}
