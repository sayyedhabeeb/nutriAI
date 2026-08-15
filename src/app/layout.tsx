import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { ThemeProvider } from 'next-themes';

export const metadata: Metadata = {
  title: 'NutriAI - Smart Diet Tracker',
  description: 'AI-powered diet recommendation and food tracking platform',
  icons: {
    icon: '/logo.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange={false} storageKey="nutriai-theme">
          {children}
        </ThemeProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}