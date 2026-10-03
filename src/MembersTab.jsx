import { Box, Card, CardBody, Text, UsersIcon, ClockIcon, AlertCircleIcon, ChevronRightIcon, LinkIcon } from '@razorpay/blade/components';
import { formatRupees } from './plansData.js';
import { collections, memberStatus, isActive } from './membersData.js';
import { weekSummary } from './linksData.js';

// One tappable summary card (Active members / Expiring soon / Expired)
function StatCard({ icon: Icon, label, labelColor, value, sub, onClick }) {
  return (
    <Card onClick={onClick} accessibilityLabel={label} elevation="none" padding="spacing.4" borderRadius="large" height="100%">
      <CardBody>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box display="flex" alignItems="center" gap="spacing.2">
            <Icon size="small" color={labelColor.icon} />
            <Text size="small" color={labelColor.text}>
              {label}
            </Text>
          </Box>
          <ChevronRightIcon size="small" color="surface.icon.gray.muted" />
        </Box>
        <Box marginTop="spacing.2">
          <Text size="xlarge" weight="semibold" color="surface.text.gray.normal">
            {value}
          </Text>
        </Box>
        {sub && (
          <Text size="small" color="surface.text.gray.muted">
            {sub}
          </Text>
        )}
      </CardBody>
    </Card>
  );
}

const GREY = { icon: 'surface.icon.gray.muted', text: 'surface.text.gray.muted' };
const AMBER = { icon: 'feedback.icon.notice.intense', text: 'feedback.text.notice.intense' };
const RED = { icon: 'feedback.icon.negative.intense', text: 'feedback.text.negative.intense' };

/** The Memberships home page: collections + three member cards. */
export default function MembersTab({ members, links = [], onOpenList, onOpenLinks }) {
  const statuses = members.map((m) => memberStatus(m));
  const active = members.filter(isActive);
  const expiringCount = statuses.filter((s) => s === 'expiring').length;
  const expiredCount = statuses.filter((s) => s === 'expired').length;
  const pendingCount = statuses.filter((s) => s === 'pending').length;
  const planCount = new Set(active.map((m) => m.planId)).size;
  const money = collections(members);
  const week = weekSummary(links);

  const activeSub = [
    `Across ${planCount} ${planCount === 1 ? 'plan' : 'plans'}`,
    pendingCount ? `${pendingCount} payment pending` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box display="flex" flexDirection="column" gap="spacing.4">
      {/* Money first: what the merchant cares about most */}
      <Card elevation="none" padding="spacing.4" borderRadius="large">
        <CardBody>
          <Text size="small" color="surface.text.gray.muted">
            Collected this month
          </Text>
          <Box marginTop="spacing.1">
            <Text size="xlarge" weight="semibold" color="surface.text.gray.normal">
              {formatRupees(money.thisMonth)}
            </Text>
          </Box>
          <Text size="small" color="surface.text.gray.muted">
            {money.change !== null ? (
              <>
                <span style={{ color: money.change >= 0 ? '#0a8a4f' : '#d92d20', fontWeight: 600 }}>
                  {money.change >= 0 ? '↑' : '↓'} {Math.abs(money.change)}%
                </span>{' '}
                vs last month
              </>
            ) : (
              <>Last month {formatRupees(money.lastMonthTotal)}</>
            )}
            {money.dueThisWeek > 0 && <> · {formatRupees(money.dueThisWeek)} due this week</>}
          </Text>
        </CardBody>
      </Card>

      <StatCard
        icon={UsersIcon}
        label="Active members"
        labelColor={GREY}
        value={active.length}
        sub={activeSub}
        onClick={() => onOpenList('active')}
      />

      <div className="stat-pair">
        <StatCard
          icon={ClockIcon}
          label="Expiring soon"
          labelColor={AMBER}
          value={expiringCount}
          sub="Next 7 days"
          onClick={() => onOpenList('expiring')}
        />
        <StatCard
          icon={AlertCircleIcon}
          label="Expired"
          labelColor={RED}
          value={expiredCount}
          sub="Last 30 days"
          onClick={() => onOpenList('expired')}
        />
      </div>

      {/* Payment links sent in the last 7 days (links stay valid for 7 days) */}
      <StatCard
        icon={LinkIcon}
        label="Payment links · last 7 days"
        labelColor={GREY}
        value={week.sent ? `${week.sent} sent` : 'None yet'}
        sub={
          week.sent || week.awaiting
            ? [
                week.paid ? `${week.paid} paid` : null,
                week.awaiting ? `${week.awaiting} awaiting · ${formatRupees(week.awaitingAmount)}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Tap to check payments'
            : 'Track the links you send here'
        }
        onClick={onOpenLinks}
      />
    </Box>
  );
}
