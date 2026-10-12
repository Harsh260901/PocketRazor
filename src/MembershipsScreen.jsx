import { useEffect, useRef, useState } from 'react';
import { CheckCircleIcon } from '@razorpay/blade/components';
import PlansTab from './PlansTab.jsx';
import PlanFormScreen from './PlanFormScreen.jsx';
import VoiceSheet from './VoiceSheet.jsx';
import MembersTab from './MembersTab.jsx';
import VoiceButton from './VoiceButton.jsx';
import AnswerSheet, { ResendSheet } from './AnswerSheet.jsx';
import { classify, answer as answerFor } from './assistant.js';
import MemberListScreen from './MemberListScreen.jsx';
import MemberDetailsScreen from './MemberDetailsScreen.jsx';
import MemberFormScreen from './MemberFormScreen.jsx';
import SendLinkSheet, { linkDescription } from './SendLinkSheet.jsx';
import CashPaymentSheet, { PayChoiceSheet, currentPlanOf, isPlanChange } from './CashPaymentSheet.jsx';
import CollectionsScreen from './CollectionsScreen.jsx';
import PaymentsScreen from './PaymentsScreen.jsx';
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

const ASK_VOICE = {
  title: 'Ask or do anything',
  subtitle: 'Ask about members, plans, renewals, links or money',
  example: "Who's expiring this week?",
  typeLabel: 'Your question',
  endpoint: '/api/ask',
  thinkingText: 'Working it out…',
  submitLabel: 'Ask',
};

// Example questions shown in the voice panel, by screen
const ASK_CHIPS = {
  home: ["Who's expiring this week?", 'Has Rahul paid?', 'How much this month?', 'Add a member', 'Create a plan'],
  active: ["Who hasn't paid?", 'Has Rahul paid?', "Who's on Gold gym?", 'Add a member'],
  plans: ['How many are on Gold gym?', 'What does yoga cost?', 'Create a plan'],
  collections: ["Who hasn't paid?", 'Who paid this week?', 'How much came by cash?', 'How much from Gold gym?'],
  expiring: ['Renew everyone expiring today', 'Renew everyone expiring this week', 'Has Rahul paid?'],
  expired: ['Renew everyone who expired', 'Who expired this week?', 'Has Vikram paid?'],
  payments: ['Who paid this week?', 'How much came by cash?', 'How much came via Razorpay?', 'How much from Gold gym?'],
  due: ['How much is still to come?', 'Renew everyone expiring today', 'Who expires this week?'],
  pending: ["Who hasn't paid?", "Send links to everyone who hasn't paid", 'Has Dev paid?'],
};

/* ---------- The screen ---------- */

export default function MembershipsScreen() {
  // Plans and members live here so they survive switching tabs and screens.
  // They reset when the page reloads (no database yet).
  const [plans, setPlans] = useState(SAMPLE_PLANS);
  const [members, setMembers] = useState(() => buildSampleMembers(SAMPLE_PLANS));

  // Plan forms: null, 'new', { voice }, or the id of the plan being edited
  const [planForm, setPlanForm] = useState(null);
  // Member screens, e.g. { type: 'list', which: 'expiring', view: { query, filter } },
  // { type: 'details', id, from }, { type: 'form', id?, voice?, from }
  const [screen, setScreen] = useState(null);
  // Which voice panel is open: null, 'plan', 'member' or { ask: true, typing }
  const [voice, setVoice] = useState(null);
  // The assistant's answer: { asked, intent, result } (null = closed)
  const [answer, setAnswer] = useState(null);
  const [resendFor, setResendFor] = useState(null); // links to resend (after confirming)
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
    setScreen((sc) => sc?.from ?? null); // back to where they started (home or Active members)
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

  /* ----- Voice assistant ----- */
  const data = { members, plans, links: visibleLinks };
  const context =
    screen?.type === 'plans' ? 'plans'
    : screen?.type === 'collections' ? 'collections'
    : screen?.type === 'payments' ? 'payments'
    : screen?.type === 'list' && screen.which === 'active' && screen.view?.filter === 'pending' ? 'pending'
    : screen?.type === 'list' ? screen.which
    : 'home';

  // What was asked → open a filled form (commands) or show an answer (questions)
  const handleAsked = (intent, words) => {
    setVoice(null);
    if (intent.intent === 'add_member') {
      setAnswer(null);
      setScreen(intent.fields ? { type: 'form', voice: { fields: intent.fields, transcript: words }, from: screen } : { type: 'form', from: screen });
      return;
    }
    if (intent.intent === 'create_plan') {
      setAnswer(null);
      setPlanForm(intent.fields?.name || intent.fields?.prices?.length ? { voice: { fields: intent.fields, transcript: words } } : 'new');
      return;
    }
    setAnswer({ asked: words, intent, result: answerFor(intent, data) });
  };

  // Tapping an example: answered straight away from the records (no AI needed)
  const askChips = ASK_CHIPS[context].map((label) => ({
    label,
    onPick: () => {
      if (label === 'Add a member') return setVoice('member');
      if (label === 'Create a plan') return setVoice('plan');
      return handleAsked(classify(label, data), label);
    },
  }));

  // Buttons on an answer. Anything that moves money opens the usual confirm screen.
  const runAction = (act) => {
    const from = screen;
    if (act.type === 'reanswer') {
      setAnswer({ ...answer, intent: act.intent, result: answerFor(act.intent, data) });
      return;
    }
    if (act.type === 'choose') {
      const intent = { ...answer.intent, memberId: act.id };
      setAnswer({ ...answer, intent, result: answerFor(intent, data) });
      return;
    }
    setAnswer(null);
    if (act.type === 'renew') {
      const list = act.memberIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);
      if (list.length === 1) renewOne(list[0]); // "link or cash?" then confirm
      else if (list.length) sendLinksTo(list); // confirm sheet for everyone
    } else if (act.type === 'resend') setResendFor(visibleLinks.filter((l) => act.linkIds.includes(l.id)));
    // Already on that screen? Just change its filters instead of stacking another copy
    else if (act.type === 'list' && from?.type === 'list' && from.which === act.which) setScreen({ ...from, view: act.view ?? {} });
    else if (act.type === 'payments' && from?.type === 'payments') setScreen({ ...from, view: act.view ?? {} });
    else if (act.type === 'list') setScreen({ type: 'list', which: act.which, view: act.view ?? {}, from });
    else if (act.type === 'member') setScreen({ type: 'details', id: act.id, from });
    else if (act.type === 'collections') setScreen({ type: 'collections' });
    else if (act.type === 'links') setScreen({ type: 'links', from });
    else if (act.type === 'payments') setScreen({ type: 'payments', view: act.view ?? {}, from });
    else if (act.type === 'plans') setScreen({ type: 'plans' });
  };

  const voiceButton = <VoiceButton onClick={() => setVoice({ ask: true })} />;

  const assistantSheets = (
    <>
      {voice?.ask && (
        <VoiceSheet
          key={voice.typing ? 'typing' : 'voice'}
          {...ASK_VOICE}
          startTyping={Boolean(voice.typing)}
          extraBody={{ plans: plans.map(({ id, name, prices }) => ({ id, name, prices })) }}
          chips={askChips}
          localFallback={(words) => classify(words, data)}
          onClose={() => setVoice(null)}
          onResult={(intent, words) => handleAsked(intent, words)}
        />
      )}
      {answer && (
        <AnswerSheet
          key={`${answer.result.title}-${answer.result.rows.length}`}
          asked={answer.asked}
          result={answer.result}
          chips={askChips.slice(0, 2)}
          onAction={runAction}
          onPickMember={(id) => runAction({ type: 'member', id })}
          onAskAgain={() => {
            setAnswer(null);
            setVoice({ ask: true });
          }}
          onTypeInstead={() => {
            setAnswer(null);
            setVoice({ ask: true, typing: true });
          }}
          onClose={() => setAnswer(null)}
        />
      )}
      {resendFor && <ResendSheet links={resendFor} onResend={resendLink} onClose={() => setResendFor(null)} />}
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
            setScreen({ type: 'form', voice: { fields, transcript }, from: screen });
          }}
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
      {linkSheet}
      {assistantSheets}
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
            onOpenPayments={(plan) => setScreen({ type: 'payments', view: { plan }, from: screen })}
            voiceButton={voiceButton}
          />
        </>
      );
    }

    if (screen?.type === 'payments') {
      return (
        <PaymentsScreen
          members={members}
          view={screen.view}
          onViewChange={(view) => setScreen({ ...screen, view })}
          onBack={() => setScreen(screen.from ?? null)}
          onOpenMember={(id) => setScreen({ type: 'details', id, from: screen })}
          voiceButton={voiceButton}
        />
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
            setScreen(screen.from ?? null);
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
            onAddMember={() => setScreen({ type: 'form', from: screen })}
            voiceButton={voiceButton}
          />
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

    /* ----- Plans (own screen, from the Plans card) ----- */
    if (screen?.type === 'plans') {
      return (
        <>
          <PlansTab
            plans={plans}
            members={members}
            onBack={() => setScreen(null)}
            onNewPlan={() => setPlanForm('new')}
            onEditPlan={(id) => setPlanForm(id)}
            onDeletePlan={deletePlan}
          />
          {voiceButton}
        </>
      );
    }

    /* ----- Memberships home: six cards and the voice button ----- */
    return (
      <>
        <MembersTab
          members={members}
          plans={plans}
          links={visibleLinks}
          onOpenList={(which) => setScreen({ type: 'list', which })}
          onOpenLinks={() => setScreen({ type: 'links' })}
          onOpenCollections={() => setScreen({ type: 'collections' })}
          onOpenPlans={() => setScreen({ type: 'plans' })}
        />
        {voiceButton}
      </>
    );
  }
}
