import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">AI Estimation Platform</h1>
        <p className="text-slate-600">Developer Dashboard</p>
      </header>
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-semibold mb-2">Active Projects</h2>
          <p className="text-2xl font-bold">12</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-semibold mb-2">Pending Estimations</h2>
          <p className="text-2xl font-bold text-blue-600">5</p>
        </div>
      </main>
    </div>
  );
}

export default App;
