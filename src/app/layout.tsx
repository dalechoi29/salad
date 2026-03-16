import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "건강한 끼니",
  description: "샐러드의 어원은 소금을 뿌린 채소에요.",
  openGraph: {
    title: "건강한 끼니",
    description: "샐러드의 어원은 소금을 뿌린 채소에요.",
  },
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
