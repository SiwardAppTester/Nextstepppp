import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nextsteppp",
  description: "Your AI coach. Personal task manager.",
};

// Runs before React hydrates → no flash of wrong theme / sidebar state.
const preHydrationInit = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  var s = localStorage.getItem('sidebar');
  if (s === 'collapsed') document.documentElement.setAttribute('data-sidebar', 'collapsed');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: preHydrationInit }} />
      </head>
      <body className="ambient-bg min-h-dvh">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
