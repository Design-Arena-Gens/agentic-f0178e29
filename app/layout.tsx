import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentiment Video Cutter",
  description: "Cut videos based on sentiment analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
