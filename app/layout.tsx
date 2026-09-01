import type { Metadata } from "next";
import DemoBanner from "@/components/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heard Back",
  description:
    "Has anyone heard back yet, and was it selective. Crowdsourced UK summer internship stage tracker.",
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
