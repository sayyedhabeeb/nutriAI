import { Metadata } from 'next';
import SwaggerUIClient from '@/components/SwaggerUIClient';

export const metadata: Metadata = {
  title: 'NutriAI API Documentation | SwappFit Integration',
  description: 'Interactive OpenAPI 3.0 Swagger UI documentation for NutriAI backend services.',
};

export default function DocsPage() {
  return <SwaggerUIClient specUrl="/api/docs" />;
}
