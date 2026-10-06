import { useEffect, useRef, useState } from 'react';
import { Box, Tabs, TabList, TabItem, TabPanel, Button, PlusIcon, MicIcon, CheckCircleIcon } from '@razorpay/blade/components';
import PlansTab from './PlansTab.jsx';
import PlanFormScreen from './PlanFormScreen.jsx';
import VoiceSheet from './VoiceSheet.jsx';
import MembersTab from './MembersTab.jsx';
import MemberListScreen from './MemberListScreen.jsx';
import MemberDetailsScreen from './MemberDetailsScreen.jsx';
import MemberFormScreen from './MemberFormScreen.jsx';
import SendLinkSheet, { linkDescription } from './SendLinkSheet.jsx';
import CashPaymentSheet, { PayChoiceSheet, currentPlanOf, isPlanChange } from './CashPaymentSheet.jsx';
import CollectionsScreen from './CollectionsScreen.jsx';
import PaymentLinksScreen from './PaymentLinksScreen.jsx';
import { fetchLinks, resendLink, methodLabel, linkStatus, CHECK_EVERY_MS } from './linksData.js';
import { SAMPLE_PLANS, formatRupees } from './plansData.js';
import {
  buildSampleMembers,
  makeMember,
  applyPayment,
  periodAfterPayment,
  fmtDay,
} from './membersData.js';

/* ---------- Voice panel wording for each feature ---------- */

const PLAN_VOICE = {
  title: 'Describe your plan',
  subtitle: 'Say the plan name, prices and how often you bill',
  example: 'Zumba classes, 1,200 rupees a month and 3,000 for three months',
  typeLabel: 'Your plan',
  endpoint: '/api/parse-plan',
  isUseful: (d) => Boolean(d.name || d.prices?.length),
  nothingFoundMessage: "Couldn't find plan details in that. Say the plan name and its price.",
};

const MEMBER_VOICE = {
  title: 'Describe the member',
  subtitle: 'Say their name, phone number and which plan',
  example: 'Add Meera Iyer, 99887 76655, yoga monthly, she paid cash',
  typeLabel: 'New member',
  endpoint: '/api/parse-member',
  isUseful: (d) => Boolean(d.name || d.phone || d.planId || d.planSaid),
  nothingFoundMessage: "Couldn't find member details in that. Say their name, phone number and plan.",
};

/* ---------- The screen ---------- */

export default function MembershipsScreen() {
  const [activeTab, setActiveTab] = useState('memberships');

  // Plans and members live here so they survive switching tabs and screens.
  // They reset when the page reloads (no database yet).
  const [plans, setPlans] = useState(SAMPLE_PLANS);
  const [members, setMembers] = useState(() => buildSampleMembers(SAMPLE_PLANS));

  // Plan forms: null, 'new', { voice }, or the id of the plan being edited
  const [planForm, setPlanForm] = useState(null);
  // Member screens, e.g. { type: 'list', which: 'expiring', view: { query, filter } },
  // { type: 'details', id, from }, { type: 'form', id?, voice?, from }
  const [screen, setScreen] = useState(null);
  // Which voice panel is open: null, 'plan' or 'member'
  const [voice, setVoice] = useState(null);
  // Members about to be sent a Razorpay payment link (null = panel closed)
  const [linkFor, setLinkFor] = useState(null);
  // Payment links sent (from this session, plus whatever Razorpay reports)
  const [links, setLinks] = useState([]);
  const [sync, setSync] = useState({ loading: false, error: '', updatedAt: null, renewed: [] });
  const renewedLinkIds = useRef(new Set()); // paid links already turned into renewals
  const checking = useRef(false); // a Razorpay check is already running
  // Pop-up notice, e.g. "Rahul Kumar paid. Membership renewed." from the
  // automatic check (tap opens the tracker), or "… cash recorded"
  const [paidNotice, setPaidNotice] = useState(null);
  // Member asked "link or cash?" after tapping Renew, and member recording cash
  const [choiceFor, setChoiceFor] = useState(null); // member id
  const [cashFor, setCashFor] = useState(null); // { id, plan }
  const [linkPlan, setLinkPlan] = useState(null); // plan picked in the renewal panel, for a single link

  /* ----- Plans ----- */
  const createPlan = ({ name, description, prices }) => {
    const plan = { id: `p${Date.now()}`, name, description, prices, createdAt: new Date().toISOString() };
    setPlans((ps) => [plan, ...ps]); // newest first
    setPlanForm(null);
  };
  const updatePlan = (id, changes) => {
    setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...changes, updatedAt: new Date().toISOString() } : p)));
    setPlanForm(null);
  };
  const deletePlan = (id) => setPlans((ps) => ps.filter((p) => p.id !== id));

  /* ----- Members ----- */
  const addMember = (fields) => {
    setMembers((ms) => [makeMember(fields), ...ms]);
    setScreen(null); // back to the Memberships page, where the counts update
  };

  // Edit member changes contact details only (the plan changes at renewal)
  const updateMember = (id, fields) =>
    setMembers((ms) =>
      ms.map((m) => (m.id === id ? { ...m, name: fields.name, phone: fields.phone, email: fields.email } : m)),
    );

  const removeMember = (id) => setMembers((ms) => ms.filter((m) => m.id !== id));

  // Remember which members were sent a link, and when; add them to the tracker
  // `sentTo` = the members as sent (with a changed plan, if one was picked)
  const markLinksSent = (sent, sentTo = members) => {
    const byId = Object.fromEntries(sent.map((r) => [r.memberId, r]));
    setMembers((ms) =>
      ms.map((m) =>
        byId[m.id] ? { ...m, linkSent: { id: byId[m.id].id, url: byId[m.id].shortUrl, sentAt: new Date() } } : m,
      ),
    );
    const now = Date.now();
    const fresh = sent.map((r) => {
      const m = sentTo.find((x) => x.id === r.memberId);
      return {
        id: r.id,
        memberId: r.memberId,
        memberName: m?.name ?? 'Member',
        description: m ? linkDescription(m) : '',
        amount: m?.price.amount ?? 0,
        url: r.shortUrl,
        status: r.status ?? 'created',
        sentAt: now,
        expiresAt: now + 2 * 24 * 60 * 60 * 1000, // links are valid for 2 days
        paidAt: null,
        method: null,
        plan: m ? { planId: m.planId, planName: m.planName, interval: m.price.interval, unit: m.price.unit } : null,
      };
    });
    setLinks((ls) => [...fresh, ...ls.filter((l) => !fresh.some((f) => f.id === l.id))]);
  };

  // A paid link renews the member: one more billing period, plus the payment
  // (If the plan was changed when the link was sent, they switch to it now.)
  const renewFromLink = (m, link) => {
    const p = link.plan;
    const plan =
      p?.planName && p.interval && p.unit
        ? { planId: p.planId || m.planId, planName: p.planName, price: { interval: Number(p.interval), unit: p.unit, amount: link.amount } }
        : null;
    return applyPayment(
      m,
      { date: link.paidAt ?? Date.now(), amount: link.amount, method: `${methodLabel(link.method)} · payment link` },
      plan && isPlanChange(m, plan) ? plan : null,
    );
  };

  // Cash or UPI paid straight to the owner, recorded by hand
  const recordCash = (member, { date, method }, plan = currentPlanOf(member)) => {
    const { end, firstPayment } = periodAfterPayment(member, date, plan.price);
    // If they also had a payment link open, don't renew them a second time from it
    if (member.linkSent?.id) renewedLinkIds.current.add(member.linkSent.id);
    setMembers((ms) =>
      ms.map((m) =>
        m.id === member.id
          ? applyPayment(m, { date, amount: plan.price.amount, method }, isPlanChange(m, plan) ? plan : null)
          : m,
      ),
    );
    setCashFor(null);
    setPaidNotice({
      text: `${member.name} ${firstPayment ? 'marked as paid' : `renewed till ${fmtDay(end)}`} · ${formatRupees(
        plan.price.amount,
      )} ${method === 'Cash' ? 'cash' : 'UPI'} recorded`,
      at: Date.now(),
    });
  };

  // Ask Razorpay for the latest statuses; renew anyone whose link is now paid.
  // background: the automatic once-a-minute check (no spinner, no error text).
  const refreshLinks = async ({ background = false } = {}) => {
    if (checking.current) return;
    checking.current = true;
    if (!background) setSync((s) => ({ ...s, loading: true, error: '' }));
    try {
      const remote = await fetchLinks();
      const merged = [...remote, ...links.filter((l) => !remote.some((r) => r.id === l.id))].sort(
        (a, b) => b.sentAt - a.sentAt,
      );
      const newlyPaid = merged.filter((l) => l.status === 'paid' && !renewedLinkIds.current.has(l.id));
      // Only members still in the app (a removed member can't be renewed)
      const renewedNames = members.filter((m) => newlyPaid.some((l) => l.memberId === m.id)).map((m) => m.name);
      if (newlyPaid.length) {
        setMembers((ms) =>
          ms.map((m) => {
            const link = newlyPaid.find((l) => l.memberId === m.id);
            return link ? renewFromLink(m, link) : m;
          }),
        );
        newlyPaid.forEach((l) => renewedLinkIds.current.add(l.id));
      }
      setLinks(merged);
      setSync((s) => ({
        loading: false,
        error: '',
        updatedAt: Date.now(),
        renewed: [...s.renewed, ...renewedNames],
      }));
      // Not looking at the tracker? Pop up a notice so the payment isn't missed
      if (renewedNames.length && screen?.type !== 'links')
        setPaidNotice({
          text:
            renewedNames.length === 1
              ? `${renewedNames[0]} paid. Membership renewed.`
              : `${renewedNames.length} members paid. Memberships renewed.`,
          openLinks: true,
          at: Date.now(),
        });
    } catch (e) {
      if (!background) setSync((s) => ({ ...s, loading: false, error: e.message }));
    } finally {
      checking.current = false;
    }
  };

  // Automatic check: once a minute while any link is still awaiting payment,
  // and straight away when you come back to this tab (e.g. after paying in
  // another tab). Paused while the tab is hidden, to save Razorpay calls.
  // Only links for members who are in the app right now. Razorpay keeps every
  // link forever, so links for members you've removed (or test members lost
  // when the page reloaded) are hidden.
  const memberIds = new Set(members.map((m) => m.id));
  const visibleLinks = links.filter((l) => memberIds.has(l.memberId));

  const refreshRef = useRef(refreshLinks);
  refreshRef.current = refreshLinks; // always the latest members and links
  const hasAwaiting = visibleLinks.some((l) => linkStatus(l) === 'awaiting');
  useEffect(() => {
    if (!hasAwaiting) return undefined;
    const check = () => {
      if (document.visibilityState === 'visible') refreshRef.current({ background: true });
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [hasAwaiting]);

  // Hide the notice after a few seconds
  useEffect(() => {
    if (!paidNotice) return undefined;
    const t = setTimeout(() => setPaidNotice(null), 6000);
    return () => clearTimeout(t);
  }, [paidNotice]);

  // Payment links for one or many members (bulk buttons, member details)
  const sendLinksTo = (list) => {
    setLinkPlan(null);
    setLinkFor(list.map((m) => m.id));
  };
  // Renew / Send link on one member's card: ask "link or cash?" first
  const renewOne = (m) => setChoiceFor(m.id);
  const choiceMember = members.find((m) => m.id === choiceFor);
  const cashMember = members.find((m) => m.id === cashFor?.id);
  // Members as the link will be sent: with the changed plan, if one was picked
  const linkMembers = (linkFor ?? []).map((id) => {
    const m = members.find((x) => x.id === id);
    return m && linkPlan && isPlanChange(m, linkPlan)
      ? { ...m, planId: linkPlan.planId, planName: linkPlan.planName, price: linkPlan.price }
      : m;
  }).filter(Boolean);
  const linkSheet = (
    <>
      {linkFor && (
        <SendLinkSheet
          members={linkMembers}
          onClose={() => {
            setLinkFor(null);
            setLinkPlan(null);
          }}
          onSent={(sent) => markLinksSent(sent, linkMembers)}
        />
      )}
      {choiceMember && (
        <PayChoiceSheet
          member={choiceMember}
          plans={plans}
          onClose={() => setChoiceFor(null)}
          onLink={(plan) => {
            setChoiceFor(null);
            setLinkPlan(plan);
            setLinkFor([choiceMember.id]);
          }}
          onCash={(plan) => {
            setChoiceFor(null);
            setCashFor({ id: choiceMember.id, plan });
          }}
        />
      )}
      {cashMember && (
        <CashPaymentSheet
          member={cashMember}
          plan={cashFor.plan ?? currentPlanOf(cashMember)}
          onClose={() => setCashFor(null)}
          onSave={(payment) => recordCash(cashMember, payment, cashFor.plan ?? currentPlanOf(cashMember))}
        />
      )}
    </>
  );

  const notice = paidNotice && (
    <button
      key={paidNotice.at}
      className="paid-toast"
      role="status"
      onClick={() => {
        setPaidNotice(null);
        if (paidNotice.openLinks) setScreen({ type: 'links' });
      }}
    >
      <CheckCircleIcon size="medium" color="feedback.icon.positive.intense" />
      <span>{paidNotice.text}</span>
    </button>
  );

  return (
    <>
      {renderPage()}
      {notice}
    </>
  );

  function renderPage() {
    /* ----- Plan forms ----- */
    if (planForm === 'new') {
      return <PlanFormScreen onCancel={() => setPlanForm(null)} onSave={createPlan} />;
    }
    if (planForm?.voice) {
      return (
        <PlanFormScreen
          prefill={planForm.voice.fields}
          voiceTranscript={planForm.voice.transcript}
          onCancel={() => setPlanForm(null)}
          onSave={createPlan}
        />
      );
    }
    const editingPlan = plans.find((p) => p.id === planForm);
    if (editingPlan) {
      return (
        <PlanFormScreen
          initialPlan={editingPlan}
          onCancel={() => setPlanForm(null)}
          onSave={(changes) => updatePlan(editingPlan.id, changes)}
        />
      );
    }

    /* ----- Member screens ----- */
    if (screen?.type === 'collections') {
      return (
        <>
          <CollectionsScreen
            members={members}
            onBack={() => setScreen(null)}
            onOpenDue={() => setScreen({ type: 'list', which: 'due', from: screen })}
            onOpenPending={() => setScreen({ type: 'list', which: 'active', view: { filter: 'pending' }, from: screen })}
            onOpenMember={(id) => setScreen({ type: 'details', id, from: screen })}
          />
          {linkSheet}
        </>
      );
    }

    if (screen?.type === 'links') {
      return (
        <PaymentLinksScreen
          links={visibleLinks}
          sync={sync}
          onRefresh={refreshLinks}
          onResend={resendLink}
          onBack={() => {
            setSync((s) => ({ ...s, renewed: [] }));
            setScreen(null);
          }}
        />
      );
    }

    if (screen?.type === 'list') {
      return (
        <>
          <MemberListScreen
            which={screen.which}
            members={members}
            view={screen.view}
            onViewChange={(view) => setScreen({ ...screen, view })}
            onBack={() => setScreen(screen.from ?? null)}
            onOpenMember={(id) => setScreen({ type: 'details', id, from: screen })}
            onSendLinks={sendLinksTo}
            onRenewOne={renewOne}
          />
          {linkSheet}
        </>
      );
    }

    if (screen?.type === 'details') {
      const member = members.find((m) => m.id === screen.id);
      if (member) {
        return (
          <>
            <MemberDetailsScreen
              member={member}
              onBack={() => setScreen(screen.from ?? null)}
              onEdit={() => setScreen({ type: 'form', id: member.id, from: screen })}
              onRemove={() => {
                removeMember(member.id);
                setScreen(screen.from ?? null);
              }}
              onRenew={() => renewOne(member)}
            />
            {linkSheet}
          </>
        );
      }
    }

    if (screen?.type === 'form') {
      const editing = screen.id ? members.find((m) => m.id === screen.id) : null;
      return (
        <MemberFormScreen
          plans={plans}
          initialMember={editing}
          prefill={screen.voice?.fields}
          voiceTranscript={screen.voice?.transcript}
          onCancel={() => setScreen(screen.from ?? null)}
          onSave={(fields) => {
            if (editing) {
              updateMember(editing.id, fields);
              setScreen(screen.from ?? null); // back to their details
            } else {
              addMember(fields);
            }
          }}
        />
      );
    }

    /* ----- Tabs ----- */
    return (
      <div className="white-screen">
        {/* No page title: the tabs sit at the top, like Transactions / Settlements.
            To go back, tap Products in the bottom nav. */}
        <Box paddingTop="spacing.3" />
        <Tabs value={activeTab} onChange={setActiveTab} variant="bordered" size="small" isFullWidthTabItem>
          <TabList>
            <TabItem value="memberships">Memberships</TabItem>
            <TabItem value="plans">Plans</TabItem>
          </TabList>

          <Box paddingX="spacing.5" paddingTop="spacing.5">
            <TabPanel value="memberships">
              <MembersTab
                members={members}
                links={visibleLinks}
                onOpenList={(which) => setScreen({ type: 'list', which })}
                onOpenLinks={() => setScreen({ type: 'links' })}
              onOpenCollections={() => setScreen({ type: 'collections' })}
              />
            </TabPanel>
            <TabPanel value="plans">
              <PlansTab plans={plans} onEditPlan={(id) => setPlanForm(id)} onDeletePlan={deletePlan} />
            </TabPanel>
          </Box>
        </Tabs>

        {/* Thumb-reach buttons, centred just above the bottom nav */}
        {activeTab === 'memberships' && (
          <ThumbActionButton label="New Member" onClick={() => setScreen({ type: 'form' })}>
            {/* AI: talk to add a member */}
            <button className="voice-fab" aria-label="Talk to add a member" onClick={() => setVoice('member')}>
              <MicIcon size="large" color="surface.icon.staticWhite.normal" />
            </button>
          </ThumbActionButton>
        )}
        {activeTab === 'plans' && (
          <ThumbActionButton label="New Plan" onClick={() => setPlanForm('new')}>
            {/* AI: talk to build a plan */}
            <button className="voice-fab" aria-label="Talk to build a plan" onClick={() => setVoice('plan')}>
              <MicIcon size="large" color="surface.icon.staticWhite.normal" />
            </button>
          </ThumbActionButton>
        )}

        {voice === 'plan' && (
          <VoiceSheet
            {...PLAN_VOICE}
            onClose={() => setVoice(null)}
            onResult={(fields, transcript) => {
              setVoice(null);
              setPlanForm({ voice: { fields, transcript } });
            }}
          />
        )}
        {voice === 'member' && (
          <VoiceSheet
            {...MEMBER_VOICE}
            extraBody={{ plans: plans.map(({ id, name, prices }) => ({ id, name, prices })) }}
            onClose={() => setVoice(null)}
            onResult={(fields, transcript) => {
              setVoice(null);
              setScreen({ type: 'form', voice: { fields, transcript } });
            }}
          />
        )}
      </div>
    );
  }
}

// Floating "+ New ..." button. Position and colour are set in index.css
// (.thumb-action). `children` = the round mic shown beside it.
function ThumbActionButton({ label, onClick, children }) {
  return (
    <div className="thumb-action">
      <Button icon={PlusIcon} iconPosition="left" size="large" onClick={onClick}>
        {label}
      </Button>
      {children}
    </div>
  );
}
