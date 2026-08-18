'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

interface SwaggerUIClientProps {
  specUrl?: string;
}

export default function SwaggerUIClient({ specUrl = '/api/docs' }: SwaggerUIClientProps) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto mb-6 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            🥗 NutriAI API Specification
          </h1>
          <p className="text-slate-300 text-sm mt-1">
            SwappFit Integration Microservice Backend & AI REST API Hub
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition shadow-md"
          >
            Download OpenAPI JSON
          </a>
        </div>
      </div>
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden p-2 sm:p-6 text-slate-900">
        <SwaggerUI url={specUrl} />
      </div>
    </div>
  );
}
