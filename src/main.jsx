import React from 'react';
import ReactDOM from 'react-dom/client';
import { BladeProvider } from '@razorpay/blade/components';
import { bladeTheme } from '@razorpay/blade/tokens';
import '@razorpay/blade/fonts.css';
import './index.css';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BladeProvider themeTokens={bladeTheme} colorScheme="light">
      <App />
    </BladeProvider>
  </React.StrictMode>,
);
