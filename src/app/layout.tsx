import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salad Subscription",
  description: "Office salad subscription and review platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
