import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LogtoProvider } from '@logto/react';
import App from './App';
import './index.css';

const logtoEndpoint = import.meta.env.VITE_LOGTO_ENDPOINT;
const logtoAppId = import.meta.env.VITE_LOGTO_APP_ID;

const logtoConfig = logtoEndpoint && logtoAppId
  ? { endpoint: logtoEndpoint, appId: logtoAppId }
  : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {logtoConfig ? (
      <LogtoProvider config={logtoConfig}>
        <App />
      </LogtoProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
