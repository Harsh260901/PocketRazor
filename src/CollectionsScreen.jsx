import { Box, Text, Heading, IconButton, ArrowLeftIcon, ChevronRightIcon } from '@razorpay/blade/components';
import { formatRupees, frequencyLabel } from './plansData.js';
import { monthReport, fmtDay } from './membersData.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function SectionTitle({ children }) {
  return (
    <Box marginTop="spacing.4" marginBottom="spacing.2">
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

// Lets a whole card act as a button (it holds headings, so it can't be a <button>)
const tappable = (onClick, label) => ({
  role: 'button',
  tabIndex: 0,
  'aria-label': label,
  onClick,
  onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()),
});

/**
 * What opens when you tap "Collected this month": a one-screen overview of
 * money in so far (split into Razorpay-verified and recorded by you), what's
 * still to come and money by plan. Tap the total or a plan to see payments.
 */
export default function CollectionsScreen({ members, onBack, onOpenDue, onOpenPending, onOpenPayments }) {
  const r = monthReport(members);
  const now = new Date();
  const month = MONTHS[now.getMonth()];
  const range = now.getDate() === 1 ? fmtDay(now) : `1–${fmtDay(now)}`;
  const expectedTotal = r.thisMonth + r.expected.amount + r.pending.amount;
  const progress = expectedTotal ? Math.round((r.thisMonth / expectedTotal) * 100) : 0;

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
        <div className="detail-box collect-hero is-tappable" {...tappable(() => onOpenPayments(null), 'See all payments this month')}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Text size="small" color="surface.text.gray.muted">
              Collected · {range}
            </Text>
            <ChevronRightIcon size="medium" color="surface.icon.gray.muted" />
          </Box>
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

        {/* Money by plan: tap one to see its payments */}
        {r.byPlan.length > 0 && (
          <>
            <SectionTitle>BY PLAN</SectionTitle>
            <div className="detail-box">
              {r.byPlan.map((p) => (
                <button key={p.name} className="plan-share-row" onClick={() => onOpenPayments(p.name)} aria-label={`${p.name} payments`}>
                  <span className="plan-share-main">
                    <span className="plan-share-top">
                      <strong>{p.name}</strong>
                      <strong>{formatRupees(p.amount)}</strong>
                    </span>
                    <span className="plan-share-count">
                      {p.count} {p.count === 1 ? 'payment' : 'payments'}
                    </span>
                    <span className="collect-bar is-thin">
                      <i style={{ width: `${Math.max(2, Math.round((p.amount / r.thisMonth) * 100))}%` }} />
                    </span>
                  </span>
                  <ChevronRightIcon size="medium" color="surface.icon.gray.muted" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
