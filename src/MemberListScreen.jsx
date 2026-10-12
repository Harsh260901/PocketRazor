import {
  Box,
  Card,
  CardBody,
  Text,
  Heading,
  Button,
  IconButton,
  SearchInput,
  ChipGroup,
  Chip,
  ArrowLeftIcon,
  UsersIcon,
  SearchIcon,
  PlusIcon,
  CloseIcon,
} from '@razorpay/blade/components';
import { memberStatus, expiryText, endsText, fmtDay, initials, sentAgo, dueThisMonth, endOfMonth, daysBetween, today } from './membersData.js';
import { frequencyLabel, formatRupees } from './plansData.js';

const LISTS = {
  active: { title: 'Active members', empty: 'No active members yet.' },
  expiring: { title: 'Expiring soon', empty: 'No memberships end in the next 7 days.' },
  expired: { title: 'Expired', empty: 'No memberships ended in the last 30 days.' },
  due: { title: `Due by ${fmtDay(endOfMonth())}`, empty: 'No more renewals due this month.' },
};

// Which members belong in each list, and in what order
export function membersFor(which, members) {
  if (which === 'active') {
    // Active list also shows members whose first payment is pending
    return members
      .filter((m) => ['active', 'expiring', 'pending'].includes(memberStatus(m)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (which === 'due') return dueThisMonth(members); // ends between today and month-end
  if (which === 'expiring') {
    return members.filter((m) => memberStatus(m) === 'expiring').sort((a, b) => a.periodEnd - b.periodEnd);
  }
  return members.filter((m) => memberStatus(m) === 'expired').sort((a, b) => b.periodEnd - a.periodEnd);
}

// "Expired today" / "Expired yesterday" / "Expired 3 days ago"
function expiredAgo(m) {
  const d = daysBetween(m.periodEnd, today());
  if (d <= 0) return 'Expired today';
  if (d === 1) return 'Expired yesterday';
  return `Expired ${d} days ago`;
}

export function Avatar({ name, size = 32, highlight = false }) {
  return (
    <div className={`member-avatar${highlight ? ' is-highlight' : ''}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </div>
  );
}

function MemberCard({ member, which, onOpen, onSendLink }) {
  const status = memberStatus(member);
  const isPending = status === 'pending';
  // Expiring/Expired/Due members get "Renew"; members who haven't paid get "Send link".
  // Both ask how they're paying: a Razorpay payment link, or cash recorded by the owner.
  const needsLink = which !== 'active' || isPending;
  const action = !needsLink ? null : member.linkSent ? 'Resend' : which !== 'active' ? 'Renew' : 'Send link';
  let line3;
  if (isPending)
    line3 = <span style={{ color: '#b45309' }}>Starts {fmtDay(member.periodStart)} · Payment pending</span>;
  else if (which === 'expiring') line3 = <span style={{ color: '#b45309' }}>{expiryText(member)}</span>;
  else if (which === 'due')
    // Same wording for everyone; orange = ends in the next 7 days
    line3 =
      daysBetween(today(), member.periodEnd) <= 7 ? (
        <span style={{ color: '#b45309' }}>{endsText(member)}</span>
      ) : (
        endsText(member)
      );
  else if (which === 'expired') line3 = <span style={{ color: '#d92d20' }}>{expiredAgo(member)}</span>;
  // Active: same "Ends …" wording as everywhere; orange = ends in the next 7 days
  else line3 = status === 'expiring' ? <span style={{ color: '#b45309' }}>{endsText(member)}</span> : endsText(member);
  const sentNote = needsLink && member.linkSent ? (
    <span style={{ color: '#0a7a46' }}> · Link sent {sentAgo(member.linkSent.sentAt)}</span>
  ) : null;

  return (
    <div className="member-card-wrap">
      <Card onClick={onOpen} accessibilityLabel={member.name} elevation="none" padding="spacing.4" borderRadius="large">
        <CardBody>
          <Box display="flex" alignItems="center" gap="spacing.3">
            <Avatar name={member.name} />
            <Box flex="1" minWidth="0px">
              <Text size="medium" weight="semibold" color="surface.text.gray.normal">
                {member.name}
              </Text>
              <Text size="small" color="surface.text.gray.muted">
                {member.planName} · {frequencyLabel(member.price)}
                {` · ${formatRupees(member.price.amount)}`}
              </Text>
              <Text size="small" color="surface.text.gray.muted">
                {line3}
                {sentNote}
              </Text>
            </Box>
            {/* Leave room for the action button, which sits above the card */}
            {action && <Box width={action === 'Renew' ? '64px' : '80px'} />}
          </Box>
        </CardBody>
      </Card>
      {action && (
        <div className="member-card-action">
          <Button variant="secondary" size="small" onClick={onSendLink}>
            {action}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Member lists. Active members, Expiring soon and Expired are main screens
 * (keep the app's bottom bar, header pinned, voice button below): Active has
 * "+ Member" in the header, Expiring and Expired have "Renew all" there.
 * The Due list (opened from Collections) has no header button. With the
 * Payment pending filter on, Active's header button becomes "Send links".
 * `view` holds the search text, filter ('all' | 'pending') and plan, kept by
 * the parent so they're still there when you come back from a member.
 */
export default function MemberListScreen({ which, members, view = {}, onViewChange, onBack, onOpenMember, onSendLinks, onRenewOne, onAddMember, voiceButton = null }) {
  const query = view.query ?? '';
  const filter = view.filter ?? 'all';
  const planFilter = view.plan ?? null;
  const setQuery = (q) => onViewChange({ ...view, query: q });
  const setFilter = (f) => onViewChange({ ...view, filter: f });
  const everyone = membersFor(which, members);
  const all = planFilter ? everyone.filter((m) => m.planName === planFilter) : everyone;
  const pendingCount = which === 'active' ? all.filter((m) => memberStatus(m) === 'pending').length : 0;
  // If the last pending member pays or is removed, fall back to All
  const activeFilter = pendingCount ? filter : 'all';
  const filtered = activeFilter === 'pending' ? all.filter((m) => memberStatus(m) === 'pending') : all;
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const shown = q
    ? filtered.filter((m) => m.name.toLowerCase().includes(q) || (qDigits && m.phone.includes(qDigits)))
    : filtered;
  const total = all.reduce((sum, m) => sum + m.price.amount, 0);
  // Active, Expiring soon and Expired are main screens (bottom bar + voice button);
  // the Due list (opened from Collections) stays a full-screen list
  const isMain = true; // every list keeps the app's bottom bar and the voice button

  const title = (
    <Box display="flex" alignItems="center" gap="spacing.2">
      <IconButton icon={ArrowLeftIcon} size="large" accessibilityLabel="Back" onClick={onBack} />
      <Heading size="medium" weight="semibold">
        {LISTS[which].title} ({all.length})
      </Heading>
    </Box>
  );

  const summary =
    which === 'due' ? `${formatRupees(total)} if everyone renews`
    : which === 'expiring' ? `${formatRupees(total)} if everyone renews · next 7 days`
    : which === 'expired' ? `${formatRupees(total)} to win back · last 30 days`
    : null;

  const filters = (
    <>
      {which === 'active' && everyone.length > 0 && (
        <Box marginBottom="spacing.3">
          <SearchInput
            accessibilityLabel="Search members"
            placeholder="Search by name or phone"
            value={query}
            onChange={({ value }) => setQuery(value ?? '')}
            onClearButtonClick={() => setQuery('')}
          />
        </Box>
      )}
      {/* Came from "Who's on Gold gym?": show the plan, tap ✕ to see everyone */}
      {planFilter && (
        <button className="plan-tag" onClick={() => onViewChange({ ...view, plan: null })} aria-label={`Remove ${planFilter} filter`}>
          {planFilter}
          <CloseIcon size="small" color="interactive.icon.primary.normal" />
        </button>
      )}
      {/* Filter: only shown when someone hasn't paid yet */}
      {pendingCount > 0 && (
        <Box marginBottom="spacing.2">
          <ChipGroup
            accessibilityLabel="Filter members"
            selectionType="single"
            size="small"
            value={activeFilter}
            onChange={({ values }) => setFilter(values[0] ?? 'all')}
          >
            <Chip value="all">{`All (${all.length})`}</Chip>
            <Chip value="pending">{`Payment pending (${pendingCount})`}</Chip>
          </ChipGroup>
        </Box>
      )}
    </>
  );

  const list = (
    <>
      {summary && all.length > 0 && (
        <Box marginBottom="spacing.4">
          <Text size="small" color="surface.text.gray.muted">
            {summary}
          </Text>
        </Box>
      )}
      <Box display="flex" flexDirection="column" gap="spacing.3">
        {shown.map((m) => (
          <MemberCard key={m.id} member={m} which={which} onOpen={() => onOpenMember(m.id)} onSendLink={() => onRenewOne(m)} />
        ))}
      </Box>
      {shown.length === 0 && (
        <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.3" paddingY="spacing.8">
          {q ? <SearchIcon size="xlarge" color="surface.icon.gray.muted" /> : <UsersIcon size="xlarge" color="surface.icon.gray.muted" />}
          <Text size="medium" color="surface.text.gray.muted" textAlign="center">
            {q ? `No members match "${query.trim()}".` : LISTS[which].empty}
          </Text>
        </Box>
      )}
    </>
  );

  if (isMain) {
    return (
      <div className="main-screen">
        <div className="main-header">
          <div className="main-header-row">
            {title}
            {which === 'active' && activeFilter === 'pending' ? (
              // Pending filter: send everyone who hasn't paid a link (confirm screen first)
              <div className="header-add rzp-blue-btn">
                <Button size="small" onClick={() => onSendLinks(filtered)}>
                  {`Send links (${pendingCount})`}
                </Button>
              </div>
            ) : which === 'active' ? (
              <div className="header-add rzp-blue-btn">
                <Button size="small" icon={PlusIcon} iconPosition="left" onClick={onAddMember}>
                  Member
                </Button>
              </div>
            ) : which === 'due' ? null : (
              all.length > 0 && (
                // Send everyone in this list a payment link (confirm screen first)
                <div className="header-add rzp-blue-btn">
                  <Button size="small" onClick={() => onSendLinks(all)}>
                    Renew all
                  </Button>
                </div>
              )
            )}
          </div>
          {filters}
        </div>
        <div className="main-body">{list}</div>
        {voiceButton}
      </div>
    );
  }

  return (
    <div className="full-screen">
      <Box paddingX="spacing.3" paddingY="spacing.3">
        {title}
      </Box>
      <div className="full-screen-body">{list}</div>
    </div>
  );
}
