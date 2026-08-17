import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stagewatch",
  description:
    "Crowdsourced tracker for UK summer internship application stages. Has it fired yet, and was it selective.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
