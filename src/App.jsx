import { useState } from 'react';
import {
  Box,
  Card,
  CardBody,
  Heading,
  Text,
  Badge,
  BottomNav,
  BottomNavItem,
  LinkIcon,
  PaymentPagesIcon,
  InvoicesIcon,
  QRCodeIcon,
  UsersIcon,
  HomeIcon,
  TransactionsIcon,
  GridIcon,
  HelpCircleIcon,
  UserIcon,
} from '@razorpay/blade/components';
import MembershipsScreen from './MembershipsScreen.jsx';

/* ---------- Data: edit these lists to change what the page shows ---------- */

const shareAndCollect = [
  {
    id: 'payment-links',
    icon: LinkIcon,
    title: 'Payment links',
    description: 'Collect payments instantly by sharing a simple link',
  },
  {
    id: 'payment-pages',
    icon: PaymentPagesIcon,
    title: 'Payment pages',
    description: 'Create a custom branded page to collect payments online',
  },
  {
    id: 'invoices',
    icon: InvoicesIcon,
    title: 'Invoices',
    description: 'Send professional invoices and get paid faster',
  },
  {
    // The new product
    id: 'memberships',
    icon: UsersIcon,
    title: 'Memberships',
    description: 'Collect recurring fees from your members automatically',
    isNew: true,
  },
];

const onYourWebsite = [
  {
    id: 'magic-checkout',
    icon: QRCodeIcon,
    title: 'Magic checkout',
    description: 'One-click checkout for higher conversion',
  },
];

/* ---------- Small building blocks ---------- */

// Fake iPhone status bar so it reads as a phone screenshot on desktop
function StatusBar() {
  return (
    <div className="status-bar">
      <span>6:37</span>
      <span className="status-icons">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="#000">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5" width="3" height="7" rx="1" />
          <rect x="10" y="2" width="3" height="10" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" opacity="0.3" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="#000">
          <path d="M8 12 5.5 9a3.5 3.5 0 0 1 5 0L8 12Zm-4.2-4.5L2.3 5.8a8 8 0 0 1 11.4 0l-1.5 1.7a5.8 5.8 0 0 0-8.4 0ZM.8 4.3 0 3.4a11.4 11.4 0 0 1 16 0l-.8.9a10.2 10.2 0 0 0-14.4 0Z" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="#000" opacity="0.4" />
          <rect x="2" y="2" width="11" height="8" rx="2" fill="#f5c400" />
          <rect x="24" y="4" width="1.5" height="4" rx="0.75" fill="#000" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <Box marginTop="spacing.7" marginBottom="spacing.4">
      <Text size="small" weight="semibold" color="surface.text.gray.subtle">
        {children}
      </Text>
    </Box>
  );
}

function ProductCard({ product, onClick }) {
  const Icon = product.icon;
  return (
    <Card
      onClick={onClick}
      accessibilityLabel={product.title}
      elevation="none"
      padding="spacing.5"
      borderRadius="large"
      height="100%"
    >
      <CardBody>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box
            width="40px"
            height="40px"
            borderRadius="round"
            backgroundColor="surface.background.gray.moderate"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Icon size="medium" color="surface.icon.gray.normal" />
          </Box>
          {product.isNew && (
            <Badge color="positive" emphasis="subtle" size="small">
              New
            </Badge>
          )}
        </Box>
        <Box marginTop="spacing.4">
          <Text size="large" weight="semibold" color="surface.text.gray.normal">
            {product.title}
          </Text>
        </Box>
        <Box marginTop="spacing.2">
          <Text size="medium" color="surface.text.gray.muted">
            {product.description}
          </Text>
        </Box>
      </CardBody>
    </Card>
  );
}

/* ---------- Screens ---------- */

function ProductsScreen({ onOpen }) {
  return (
    <Box paddingX="spacing.6" paddingTop="spacing.4">
      <Heading size="xlarge" weight="semibold">
        Products
      </Heading>

      <SectionLabel>SHARE AND COLLECT</SectionLabel>
      <div className="product-grid">
        {shareAndCollect.map((p) => (
          <ProductCard key={p.id} product={p} onClick={() => onOpen(p.id)} />
        ))}
      </div>

      <SectionLabel>ON YOUR WEBSITE</SectionLabel>
      <div className="product-grid">
        {onYourWebsite.map((p) => (
          <ProductCard key={p.id} product={p} onClick={() => onOpen(p.id)} />
        ))}
      </div>
    </Box>
  );
}

/* ---------- App shell ---------- */

const tabs = [
  { title: 'Home', icon: HomeIcon },
  { title: 'Payments', icon: TransactionsIcon },
  { title: 'Products', icon: GridIcon },
  { title: 'Support', icon: HelpCircleIcon },
  { title: 'Account', icon: UserIcon },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('Products');
  const [openProduct, setOpenProduct] = useState(null);

  let content;
  if (activeTab !== 'Products') {
    content = (
      <Box paddingX="spacing.6" paddingTop="spacing.4">
        <Heading size="xlarge" weight="semibold">{activeTab}</Heading>
        <Box marginTop="spacing.4">
          <Text color="surface.text.gray.muted">Not part of this prototype.</Text>
        </Box>
      </Box>
    );
  } else if (openProduct === 'memberships') {
    content = <MembershipsScreen />;
  } else {
    content = (
      <ProductsScreen
        onOpen={(id) => {
          if (id === 'memberships') setOpenProduct(id);
        }}
      />
    );
  }

  return (
    <div className="phone">
      <StatusBar />
      <div className="screen">{content}</div>
      <BottomNav accessibilityLabel="Main navigation">
        {tabs.map((t) => (
          <BottomNavItem
            key={t.title}
            title={t.title}
            icon={t.icon}
            isActive={activeTab === t.title}
            onClick={() => {
              setActiveTab(t.title);
              setOpenProduct(null);
            }}
          />
        ))}
      </BottomNav>
    </div>
  );
}
