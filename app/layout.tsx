import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "demo. | Product Demo Engine",
  description: "Turn what you built into a demo people understand."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
