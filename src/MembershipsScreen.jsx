import { useState } from 'react';
import {
  Box,
  Card,
  CardBody,
  Text,
  Tabs,
  TabList,
  TabItem,
  TabPanel,
  Button,
  PlusIcon,
  UsersIcon,
  LayersIcon,
  SparklesIcon,
} from '@razorpay/blade/components';

// Grey-bordered "nothing here yet" card, same style as "No payments"
// on the Payments tab of the real app.
function EmptyState({ icon: Icon, title, description }) {
  return (
    <Card elevation="none" padding="spacing.7" borderRadius="large">
      <CardBody>
        <Box display="flex" flexDirection="column" alignItems="center" gap="spacing.3">
          <Icon size="xlarge" color="surface.icon.gray.muted" />
          <Box marginTop="spacing.3">
            <Text size="large" weight="semibold" color="surface.text.gray.normal">
              {title}
            </Text>
          </Box>
          <Text size="medium" color="surface.text.gray.muted" textAlign="center">
            {description}
          </Text>
        </Box>
      </CardBody>
    </Card>
  );
}

/* ---------- One component per tab: build each tab's content here ---------- */

function MembersTab() {
  return (
    <EmptyState
      icon={UsersIcon}
      title="No members yet"
      description="Members who sign up to your plans will show up here."
    />
  );
}

function PlansTab() {
  return (
    <EmptyState
      icon={LayersIcon}
      title="No plans yet"
      description="Create a plan to start collecting membership fees."
    />
  );
}

function RecommendationsTab() {
  return (
    <EmptyState
      icon={SparklesIcon}
      title="No recommendations yet"
      description="Suggestions to grow your memberships will appear here."
    />
  );
}

/* ---------- The screen ---------- */

export default function MembershipsScreen() {
  const [activeTab, setActiveTab] = useState('memberships');

  return (
    <div className="white-screen">
      {/* No page title: the tabs sit at the top, like Transactions / Settlements.
          To go back, tap Products in the bottom nav. */}

      {/* The three tabs, stretched across the full width */}
      <Box paddingTop="spacing.3" />
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        variant="bordered"
        size="small"
        isFullWidthTabItem
      >
        <TabList>
          <TabItem value="memberships">Memberships</TabItem>
          <TabItem value="plans">Plans</TabItem>
          <TabItem value="recommendations">Recommendations</TabItem>
        </TabList>

        <Box paddingX="spacing.5" paddingTop="spacing.5">
          <TabPanel value="memberships">
            <MembersTab />
          </TabPanel>
          <TabPanel value="plans">
            <PlansTab />
          </TabPanel>
          <TabPanel value="recommendations">
            <RecommendationsTab />
          </TabPanel>
        </Box>
      </Tabs>

      {/* Thumb-reach action button, centred just above the bottom nav.
          Only Memberships and Plans tabs get one. */}
      {activeTab === 'memberships' && (
        <ThumbActionButton label="New Member" onClick={() => {}} />
      )}
      {activeTab === 'plans' && (
        <ThumbActionButton label="New Plan" onClick={() => {}} />
      )}
    </div>
  );
}

// Floating "+ New ..." button. Position and colour are set in index.css
// (.thumb-action). onClick does nothing yet: wire it to the add-member /
// create-plan flow when we build those.
function ThumbActionButton({ label, onClick }) {
  return (
    <div className="thumb-action">
      <Button icon={PlusIcon} iconPosition="left" size="large" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}
