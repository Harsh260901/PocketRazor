import { useState } from 'react';
import {
  Box,
  Text,
  Heading,
  Button,
  IconButton,
  Divider,
  ArrowLeftIcon,
  EditIcon,
  TrashIcon,
  ExternalLinkIcon,
} from '@razorpay/blade/components';
import { memberStatus, expiryText, fmtDay, fmtFull, fmtPhone, sentAgo } from './membersData.js';
import { formatRupees, frequencyLabel } from './plansData.js';
import { Avatar } from './MemberListScreen.jsx';

const BADGES = {
  active: { bg: '#e7f6ee', fg: '#0a7a46' },
  expiring: { bg: '#fdf3e2', fg: '#a35a00' },
  expired: { bg: '#fdecec', fg: '#c0262d' },
  lapsed: { bg: '#f1f3f6', fg: '#4a5568' },
  pending: { bg: '#fdf3e2', fg: '#a35a00' },
};

function badgeText(m, status) {
  if (status === 'pending') return 'Payment pending';
  if (status === 'active') return `Active · ends ${fmtDay(m.periodEnd)}`;
  return expiryText(m);
}

function Row({ label, value }) {
  return (
    <Box display="flex" justifyContent="space-between" paddingY="spacing.2" gap="spacing.4">
      <Text size="small" color="surface.text.gray.muted">
        {label}
      </Text>
      <Text size="small" color="surface.text.gray.normal" textAlign="right">
        {value}
      </Text>
    </Box>
  );
}

function SectionTitle({ children }) {
  return (
    <Box marginTop="spacing.6" marginBottom="spacing.2">
      <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
        {children}
      </Text>
    </Box>
  );
}

/** Full-screen details for one member. */
export default function MemberDetailsScreen({ member, onBack, onEdit, onRemove, onRenew }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const status = memberStatus(member);
  const badge = BADGES[status];
  const canRenew = status === 'expiring' || status === 'expired' || status === 'lapsed';

  return (
    <div className="full-screen">
      <Box display="flex" alignItems="center" gap="spacing.2" paddingX="spacing.3" paddingY="spacing.3">
        <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onBack} />
        <Heading size="medium" weight="semibold">
          Member details
        </Heading>
        {/* Edit contact details and Remove live up here, out of the way */}
        <Box marginLeft="auto" display="flex" gap="spacing.5" paddingRight="spacing.3">
          <IconButton icon={EditIcon} size="large" accessibilityLabel="Edit member" onClick={onEdit} />
          <IconButton icon={TrashIcon} size="large" accessibilityLabel="Remove member" onClick={() => setConfirmRemove(true)} />
        </Box>
      </Box>

      <div className="full-screen-body">
        {/* Who */}
        <Box display="flex" alignItems="center" gap="spacing.4">
          <Avatar name={member.name} size={48} highlight />
          <Box>
            <Text size="large" weight="semibold" color="surface.text.gray.normal">
              {member.name}
            </Text>
            <Text size="small" color="surface.text.gray.muted">
              {fmtPhone(member.phone)}
            </Text>
            {member.email && (
              <Text size="small" color="surface.text.gray.muted">
                {member.email}
              </Text>
            )}
          </Box>
        </Box>
        <Box marginTop="spacing.4">
          <span className="status-badge" style={{ background: badge.bg, color: badge.fg }}>
            {badgeText(member, status)}
          </span>
        </Box>

        {/* Last payment link sent to this member */}
        {member.linkSent && (canRenew || status === 'pending') && (
          <div className="link-sent-box">
            <Box display="flex" justifyContent="space-between" alignItems="center" gap="spacing.3">
              <Box>
                <Text size="small" weight="semibold" color="surface.text.gray.normal">
                  Payment link sent {sentAgo(member.linkSent.sentAt)}
                </Text>
                <Text size="small" color="surface.text.gray.muted">
                  {member.linkSent.url.replace(/^https?:\/\//, '')}
                </Text>
              </Box>
              <Button
                variant="tertiary"
                size="small"
                icon={ExternalLinkIcon}
                iconPosition="right"
                href={member.linkSent.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </Button>
            </Box>
          </div>
        )}

        {/* Plan */}
        <SectionTitle>PLAN</SectionTitle>
        <div className="detail-box">
          <Row label="Plan" value={member.planName} />
          <Row label="Billing" value={`${frequencyLabel(member.price)} · ${formatRupees(member.price.amount)}`} />
          {status === 'pending' ? (
            <Row label="Starts" value={fmtFull(member.periodStart)} />
          ) : (
            <Row
              label={status === 'expired' || status === 'lapsed' ? 'Last period' : 'Current period'}
              value={`${fmtDay(member.periodStart)} – ${fmtFull(member.periodEnd)}`}
            />
          )}
          <Row label="Member since" value={fmtFull(member.memberSince)} />
        </div>

        {/* Payments */}
        <SectionTitle>PAYMENTS</SectionTitle>
        {member.payments.length === 0 ? (
          <Text size="small" color="surface.text.gray.muted">
            No payments yet.
          </Text>
        ) : (
          member.payments.map((p, i) => (
            <Box key={i}>
              {i > 0 && <Divider />}
              <Box display="flex" justifyContent="space-between" paddingY="spacing.3">
                <Text size="small" color="surface.text.gray.normal">
                  {fmtFull(p.date)} · {p.method}
                </Text>
                <Text size="small" weight="semibold" color="surface.text.gray.normal">
                  {formatRupees(p.amount)}
                </Text>
              </Box>
            </Box>
          ))
        )}
      </div>

      {/* One button: opens the renewal panel (change plan, then link or cash) */}
      {(canRenew || status === 'pending') && (
        <div className="full-screen-footer rzp-blue-btn">
          <Button size="large" isFullWidth onClick={onRenew}>
            {status === 'pending' ? 'Collect payment' : 'Renew'}
          </Button>
        </div>
      )}

      {/* Are you sure? */}
      {confirmRemove && (
        <div className="sheet-backdrop" onClick={() => setConfirmRemove(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Remove member">
            <div className="sheet-handle" />
            <Heading size="medium" weight="semibold">
              Remove {member.name}?
            </Heading>
            <Box marginTop="spacing.2" marginBottom="spacing.5">
              <Text size="small" color="surface.text.gray.muted">
                They'll be removed from your members along with their payment history. You can't undo this.
              </Text>
            </Box>
            <Box display="flex" gap="spacing.3">
              <Box flex="1">
                <Button variant="secondary" isFullWidth onClick={() => setConfirmRemove(false)}>
                  Cancel
                </Button>
              </Box>
              <Box flex="1">
                <Button color="negative" isFullWidth onClick={onRemove}>
                  Remove
                </Button>
              </Box>
            </Box>
          </div>
        </div>
      )}
    </div>
  );
}
