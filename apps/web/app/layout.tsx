import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Virtual Wardrobe | Reconstruction Lab", description: "Sprint 0 avatar reconstruction lab" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
