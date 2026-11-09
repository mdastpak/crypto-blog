import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Crypto Blog", template: "%s | Crypto Blog" },
  description: "Prices, markets, and news of crypto assets.",
};

// Locale-aware lang and dir arrive with the i18n work (#2).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
