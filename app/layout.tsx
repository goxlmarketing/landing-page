import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GoXL Ally — The Founder's Compass",
  description:
    "Ally helps founders turn context into clarity, better decisions, and daily action. Register for early access.",
  openGraph: {
    title: "GoXL Ally — The Founder's Compass",
    description: "Clarity, decisions and daily action for founders.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
