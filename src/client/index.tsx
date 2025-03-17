// import React from 'react';
// import { createRoot } from 'react-dom/client';
// import App from './components/App';
// import './styles/main.css';

// const container = document.getElementById('root');
// if (!container) {
//   throw new Error('Failed to find the root element');
// }

// const root = createRoot(container);

// root.render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>
// ); 

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App'; // ✅ Ensure App.tsx is in 'src/client/components'
import './styles/main.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Failed to find the root element');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
