import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "건강한 끼니",
  description: "Office salad subscription and review platform",
  formatDetection: {
    email: false,
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
