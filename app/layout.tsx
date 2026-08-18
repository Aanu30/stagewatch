import type { Metadata } from "next";
import DemoBanner from "@/components/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stagewatch",
  description:
    "Crowdsourced tracker for UK summer internship application stages. Has it fired yet, and was it selective.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB">
      <body>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
