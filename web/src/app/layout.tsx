import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CerebrosNews - My Feed",
  description: "CerebrosNews/Inshorts-style news feed with transparency",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${inter.className} overflow-hidden overscroll-none`}>
        {children}
      </body>
    </html>
  );
}
