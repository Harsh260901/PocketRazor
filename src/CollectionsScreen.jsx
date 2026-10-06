import { useState } from 'react';
import { Box, Text, Heading, IconButton, ArrowLeftIcon, ChevronRightIcon } from '@razorpay/blade/components';
import { formatRupees, frequencyLabel } from './plansData.js';
import { monthReport, isRazorpayPayment, fmtDay } from './membersData.js';
import { Avatar } from './MemberListScreen.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHOW_FIRST = 8;

function SectionTitle({ children }) {
  return (
    <Box marginTop="spacing.6" marginBottom="spacing.3">
      <Text size="xsmall" weight="semibold" color="surface.text.gray.muted">
        {children}
      </Text>
    </Box>
  );
}

// One tappable "Still to come" row
function DueRow({ amount, label, onClick }) {
  return (
    <button className="due-row" onClick={onClick}>
      <span>
        <span className="due-amount">{formatRupees(amount)}</span>
        <span className="due-label">{label}</span>
      </span>
      <ChevronRightIcon size="medium" color="surface.icon.gray.muted" />
    </button>
  );
}

/**
 * What opens when you tap "Collected this month": money in so far (split into
 * Razorpay-verified and recorded by you), what's still to come, money by plan,
 * and every payment this month.
 */
export default function CollectionsScreen({ members, onBack, onOpenDue, onOpenPending, onOpenMember }) {
  const [showAll, setShowAll] = useState(false);
  const r = monthReport(members);
  const now = new Date();
  const month = MONTHS[now.getMonth()];
  const range = now.getDate() === 1 ? fmtDay(now) : `1–${fmtDay(now)}`;
  const expectedTotal = r.thisMonth + r.expected.amount + r.pending.amount;
  const progress = expectedTotal ? Math.round((r.thisMonth / expectedTotal) * 100) : 0;
  const shown = showAll ? r.payments : r.payments.slice(0, SHOW_FIRST);

  return (
    <div className="full-screen">
      <Box display="flex" alignItems="center" gap="spacing.2" paddingX="spacing.3" paddingY="spacing.3">
        <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onBack} />
        <Heading size="medium" weight="semibold">
          {month} collections
        </Heading>
      </Box>

      <div className="full-screen-body">
        {/* Money in so far */}
        <div className="detail-box collect-hero">
          <Text size="small" color="surface.text.gray.muted">
            Collected · {range}
          </Text>
          <Box marginTop="spacing.1">
            <Heading size="xlarge" weight="semibold">
              {formatRupees(r.thisMonth)}
            </Heading>
          </Box>
          <Text size="small" color="surface.text.gray.muted">
            {r.change !== null ? (
              <>
                <span style={{ color: r.change >= 0 ? '#0a8a4f' : '#d92d20', fontWeight: 600 }}>
                  {r.change >= 0 ? '↑' : '↓'} {Math.abs(r.change)}%
                </span>{' '}
                vs same time last month
              </>
            ) : (
              <>Last month {formatRupees(r.lastMonthTotal)} in total</>
            )}
          </Text>

          <div className="collect-split">
            <div className="is-razorpay">
              <strong>{formatRupees(r.viaRazorpay)}</strong>
              <span>Via Razorpay · verified</span>
            </div>
            <div>
              <strong>{formatRupees(r.recorded)}</strong>
              <span>Cash/UPI · recorded by you</span>
            </div>
          </div>

          {expectedTotal > 0 && (
            <>
              <div className="collect-bar" role="img" aria-label={`${progress}% of expected collected`}>
                <i style={{ width: `${progress}%` }} />
              </div>
              <Text size="small" color="surface.text.gray.muted">
                {progress}% of {formatRupees(expectedTotal)} expected this month
              </Text>
            </>
          )}
        </div>

        {/* What's still to come */}
        <SectionTitle>STILL TO COME</SectionTitle>
        {r.expected.count === 0 && r.pending.count === 0 ? (
          <Text size="small" color="surface.text.gray.muted">
            No more renewals due this month.
          </Text>
        ) : (
          <div className="detail-box">
            {r.expected.count > 0 && (
              <DueRow
                amount={r.expected.amount}
                label={`Expected by ${fmtDay(r.expected.by)} · ${r.expected.count} ${r.expected.count === 1 ? 'renewal' : 'renewals'}`}
                onClick={onOpenDue}
              />
            )}
            {r.pending.count > 0 && (
              <DueRow
                amount={r.pending.amount}
                label={`Payment pending · ${r.pending.count} ${r.pending.count === 1 ? 'member' : 'members'}`}
                onClick={onOpenPending}
              />
            )}
          </div>
        )}

        {/* Money by plan */}
        {r.byPlan.length > 0 && (
          <>
            <SectionTitle>BY PLAN</SectionTitle>
            <div className="detail-box" style={{ paddingTop: 10, paddingBottom: 12 }}>
              {r.byPlan.map((p) => (
                <div key={p.name} className="plan-share">
                  <Box display="flex" justifyContent="space-between">
                    <Text size="small" weight="semibold" color="surface.text.gray.normal">
                      {p.name}
                    </Text>
                    <Text size="small" weight="semibold" color="surface.text.gray.normal">
                      {formatRupees(p.amount)}
                    </Text>
                  </Box>
                  <Text size="small" color="surface.text.gray.muted">
                    {p.count} {p.count === 1 ? 'payment' : 'payments'}
                  </Text>
                  <div className="collect-bar is-thin">
                    <i style={{ width: `${Math.max(2, Math.round((p.amount / r.thisMonth) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Every payment this month */}
        <SectionTitle>PAYMENTS ({r.payments.length})</SectionTitle>
        {r.payments.length === 0 && (
          <Text size="small" color="surface.text.gray.muted">
            No payments yet this month.
          </Text>
        )}
        {shown.map(({ member, payment }, i) => {
          const rz = isRazorpayPayment(payment);
          return (
            <button
              key={`${member.id}-${i}`}
              className="pay-row"
              onClick={() => onOpenMember(member.id)}
              aria-label={`${member.name} paid ${formatRupees(payment.amount)}`}
            >
              <Avatar name={member.name} size={34} />
              <span className="pay-main">
                <span className="pay-name">{member.name}</span>
                <span className="pay-sub">
                  {payment.planName ?? member.planName} · {frequencyLabel(member.price)}
                  <span className={`pay-tag${rz ? ' is-razorpay' : ''}`}>{rz ? 'Razorpay' : payment.method}</span>
                </span>
              </span>
              <span className="pay-amount">
                {formatRupees(payment.amount)}
                <span>{fmtDay(payment.date)}</span>
              </span>
            </button>
          );
        })}
        {!showAll && r.payments.length > SHOW_FIRST && (
          <button className="show-all" onClick={() => setShowAll(true)}>
            Show all {r.payments.length}
          </button>
        )}
      </div>
    </div>
  );
}
