import React from 'react';
import PDFEditor from './PDFEditor';
import '../styles/App.css';

const App: React.FC = () => {
  return (
    <div className="app">
      <header className="app-header">
        <h1>PDF Editor</h1>
      </header>
      <main className="app-main">
        <PDFEditor />
      </main>
    </div>
  );
};

export default App; 

