import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardBody,
  Text,
  Heading,
  Button,
  IconButton,
  Spinner,
  ChipGroup,
  Chip,
  ArrowLeftIcon,
  RefreshIcon,
  CloseIcon,
  ExternalLinkIcon,
  CopyIcon,
  LinkIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from '@razorpay/blade/components';
import { formatRupees } from './plansData.js';
import { linkStatus, when, dayName, methodLabel } from './linksData.js';

const STATUS_STYLE = {
  awaiting: { label: 'Awaiting', bg: '#fdf3e2', fg: '#a35a00' },
  paid: { label: 'Paid', bg: '#e7f6ee', fg: '#0a7a46' },
  expired: { label: 'Expired', bg: '#f1f3f6', fg: '#4a5568' },
};

function StatusPill({ status, long }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="status-badge" style={{ background: s.bg, color: s.fg }}>
      {long && status === 'awaiting' ? 'Awaiting payment' : s.label}
    </span>
  );
}

/* ---------- One link's details (slides up) ---------- */

function LinkSheet({ link, onClose, onResend }) {
  const status = linkStatus(link);
  const [resend, setResend] = useState({ state: 'idle', message: '' }); // idle | sending | done | error
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is shown on screen anyway */
    }
  };

  const doResend = async () => {
    setResend({ state: 'sending', message: '' });
    try {
      await onResend(link.id);
      setResend({ state: 'done', message: 'SMS sent again.' });
    } catch (e) {
      setResend({ state: 'error', message: e.message });
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Payment link for ${link.memberName}`}>
        <div className="sheet-handle" />
        <Box display="flex" justifyContent="space-between" alignItems="center" gap="spacing.3">
          <Heading size="medium" weight="semibold">
            {link.memberName}
          </Heading>
          <Box display="flex" alignItems="center" gap="spacing.2">
            <StatusPill status={status} long />
            <IconButton icon={CloseIcon} accessibilityLabel="Close" onClick={onClose} />
          </Box>
        </Box>
        <Text size="small" color="surface.text.gray.muted">
          {link.description} · {formatRupees(link.amount)}
        </Text>

        {/* What happened */}
        <div className="timeline">
          <div className="timeline-step is-done">
            <Text size="small" weight="semibold" color="surface.text.gray.normal">
              Link sent by SMS
            </Text>
            <Text size="small" color="surface.text.gray.muted">
              {dayName(link.sentAt)}, {when(link.sentAt).replace(/^Yesterday, /, '')}
            </Text>
          </div>
          {status === 'paid' && (
            <div className="timeline-step is-paid">
              <Text size="small" weight="semibold" color="surface.text.gray.normal">
                Paid {link.method ? `by ${methodLabel(link.method)}` : ''}
              </Text>
              <Text size="small" color="surface.text.gray.muted">
                {link.paidAt ? `${dayName(link.paidAt)} · membership renewed` : 'Membership renewed'}
              </Text>
            </div>
          )}
          {status === 'awaiting' && (
            <div className="timeline-step">
              <Text size="small" weight="semibold" color="surface.text.gray.normal">
                Not paid yet
              </Text>
              {link.expiresAt && (
                <Text size="small" color="surface.text.gray.muted">
                  Link expires {dayName(link.expiresAt)}
                </Text>
              )}
            </div>
          )}
          {status === 'expired' && (
            <div className="timeline-step">
              <Text size="small" weight="semibold" color="surface.text.gray.normal">
                Expired without payment
              </Text>
              <Text size="small" color="surface.text.gray.muted">
                Send a fresh link from the member's details.
              </Text>
            </div>
          )}
        </div>

        <div className="link-url-box">{link.url.replace(/^https?:\/\//, '')}</div>

        <Box display="flex" gap="spacing.3">
          <Box flex="1">
            <Button
              variant="secondary"
              isFullWidth
              icon={ExternalLinkIcon}
              iconPosition="left"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
            </Button>
          </Box>
          <Box flex="1">
            <Button variant="secondary" isFullWidth icon={CopyIcon} iconPosition="left" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </Box>
        </Box>

        {status === 'awaiting' && (
          <div className="rzp-blue-btn" style={{ marginTop: 10 }}>
            <Button isFullWidth isLoading={resend.state === 'sending'} onClick={doResend}>
              Resend SMS
            </Button>
          </div>
        )}
        {resend.message && (
          <Box marginTop="spacing.3" display="flex" gap="spacing.2" alignItems="center">
            {resend.state === 'done' ? (
              <CheckCircleIcon size="small" color="feedback.icon.positive.intense" />
            ) : (
              <AlertCircleIcon size="small" color="feedback.icon.negative.intense" />
            )}
            <Text
              size="small"
              color={resend.state === 'done' ? 'feedback.text.positive.intense' : 'feedback.text.negative.intense'}
            >
              {resend.message}
            </Text>
          </Box>
        )}
      </div>
    </div>
  );
}

/* ---------- The tracker ---------- */

/**
 * Every payment link sent in the last 7 days, with its live status from
 * Razorpay. Refreshes when opened and when ↻ is tapped.
 */
export default function PaymentLinksScreen({ links, sync, onRefresh, onResend, onBack }) {
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

  // Ask Razorpay for the latest statuses whenever the screen opens
  useEffect(() => {
    onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withStatus = links.map((l) => ({ ...l, s: linkStatus(l) }));
  const counts = { awaiting: 0, paid: 0, expired: 0 };
  withStatus.forEach((l) => counts[l.s]++);
  const shown = filter === 'all' ? withStatus : withStatus.filter((l) => l.s === filter);
  const open = links.find((l) => l.id === openId);

  return (
    <div className="full-screen">
      <Box display="flex" alignItems="center" justifyContent="space-between" paddingX="spacing.3" paddingY="spacing.3">
        <Box display="flex" alignItems="center" gap="spacing.2">
          <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onBack} />
          <Heading size="medium" weight="semibold">
            Payment links ({links.length})
          </Heading>
        </Box>
        <Box paddingRight="spacing.3">
          {sync.loading ? (
            <Spinner accessibilityLabel="Updating from Razorpay" size="medium" />
          ) : (
            <IconButton icon={RefreshIcon} size="large" accessibilityLabel="Refresh from Razorpay" onClick={onRefresh} />
          )}
        </Box>
      </Box>

      <div className="full-screen-body">
        {/* Members renewed because their link was paid */}
        {sync.renewed?.length > 0 && (
          <div className="renewed-banner">
            <CheckCircleIcon size="small" color="feedback.icon.positive.intense" />
            <Text size="small" color="feedback.text.positive.intense">
              {sync.renewed.length === 1
                ? `${sync.renewed[0]} paid, so their membership was renewed.`
                : `${sync.renewed.length} members paid, so their memberships were renewed.`}
            </Text>
          </div>
        )}

        {sync.error && (
          <Box display="flex" gap="spacing.2" alignItems="flex-start" marginBottom="spacing.4">
            <Box paddingTop="spacing.1">
              <AlertCircleIcon size="small" color="feedback.icon.negative.intense" />
            </Box>
            <Text size="small" color="feedback.text.negative.intense">
              {sync.error}
            </Text>
          </Box>
        )}

        {links.length > 0 && (
          <Box marginBottom="spacing.4">
            <ChipGroup
              accessibilityLabel="Filter payment links"
              selectionType="single"
              size="small"
              value={filter}
              onChange={({ values }) => setFilter(values[0] ?? 'all')}
            >
              <Chip value="all">{`All ${links.length}`}</Chip>
              <Chip value="awaiting">{`Awaiting ${counts.awaiting}`}</Chip>
              <Chip value="paid">{`Paid ${counts.paid}`}</Chip>
              <Chip value="expired">{`Expired ${counts.expired}`}</Chip>
            </ChipGroup>
          </Box>
        )}

        <Box display="flex" flexDirection="column" gap="spacing.3">
          {shown.map((l) => (
            <Card
              key={l.id}
              onClick={() => setOpenId(l.id)}
              accessibilityLabel={`${l.memberName} payment link`}
              elevation="none"
              padding="spacing.4"
              borderRadius="large"
            >
              <CardBody>
                <Box display="flex" justifyContent="space-between" alignItems="center" gap="spacing.3">
                  <Box flex="1" minWidth="0px">
                    <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                      {l.memberName}
                    </Text>
                    <Text size="small" color="surface.text.gray.muted">
                      {l.description}
                    </Text>
                    <Text size="small" color="surface.text.gray.muted">
                      Sent {when(l.sentAt)}
                    </Text>
                  </Box>
                  <Box display="flex" flexDirection="column" alignItems="flex-end" gap="spacing.2">
                    <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                      {formatRupees(l.amount)}
                    </Text>
                    <StatusPill status={l.s} />
                  </Box>
                </Box>
              </CardBody>
            </Card>
          ))}
        </Box>

        {links.length === 0 && !sync.loading && (
          <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.3" paddingY="spacing.8">
            <LinkIcon size="xlarge" color="surface.icon.gray.muted" />
            <Text size="medium" color="surface.text.gray.muted" textAlign="center">
              No payment links in the last 7 days. Send one from Expiring soon, Expired or a member with payment
              pending.
            </Text>
          </Box>
        )}
        {links.length > 0 && shown.length === 0 && (
          <Box paddingY="spacing.6">
            <Text size="medium" color="surface.text.gray.muted" textAlign="center">
              No {filter} links.
            </Text>
          </Box>
        )}

      </div>

      {open && <LinkSheet link={open} onClose={() => setOpenId(null)} onResend={onResend} />}
    </div>
  );
}
