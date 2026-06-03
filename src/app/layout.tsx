import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  weight: ["100", "300", "400", "500", "700", "800", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Secretary-General's Reports",
  description:
    "A consolidated view of Secretary-General's reports from 2023 to 2025, drawn from the United Nations Digital Library.",
  openGraph: {
    title: "Secretary-General's Reports",
    description:
      "A consolidated view of Secretary-General's reports from 2023 to 2025, drawn from the United Nations Digital Library.",
    type: "website",
    locale: "en_US",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#009edb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${roboto.className} antialiased`}>
      <body>
        {children}
        <GoogleAnalytics gaId="G-XYZ" />
      </body>
    </html>
  );
}
