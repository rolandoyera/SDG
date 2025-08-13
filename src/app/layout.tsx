import type { Metadata } from "next";
import Footer from "@/components/Footer";
import "./globals.css";
import { Montserrat } from "next/font/google";
import Providers from "./Providers";
import Navbar from "@/components/Navbar";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.sarviandesign.com"),
  title: {
    default: "Sarvian Design Group",
    template: "Sarvian Design Group | %s  ",
  },
  description:
    "South Florida architecture and interior luxury design studio in Fort Lauderdale and Miami.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} font-sans antialiased bg-background text-foreground`}>
        <Providers>
          <Navbar />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
