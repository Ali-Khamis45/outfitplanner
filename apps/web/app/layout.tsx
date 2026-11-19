import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "../components/shell/AppShell";
import "./globals.css";
import "./shell.css";

const interfaceFont = localFont({ src: "./fonts/Manrope.ttf", variable: "--font-interface", display: "swap", weight: "200 800" });
const editorialFont = localFont({ src: [{ path: "./fonts/InstrumentSerif-Regular.ttf", style: "normal", weight: "400" }, { path: "./fonts/InstrumentSerif-Italic.ttf", style: "italic", weight: "400" }], variable: "--font-editorial", display: "swap" });
export const metadata: Metadata = { title: "Virtual Wardrobe | Your personal edit", description: "Get to know your wardrobe. Explore your pieces, see their fit, and plan what to wear." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${interfaceFont.variable} ${editorialFont.variable}`}><body><AppShell>{children}</AppShell></body></html>;
}
