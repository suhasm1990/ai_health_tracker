import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_STORAGE_KEY } from "@/lib/constants";
import { ThemeProvider } from "@/lib/theme";

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "AI Health Tracker | Powered by Google Health API",
  description:
    "Intelligent health, sleep, and fitness telemetry dashboard powered by Google Health API, Fitbit, and connected wearables.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AI Health Tracker" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

/** Applies the stored theme before first paint to avoid a light/dark flash. */
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased min-h-screen selection:bg-emerald-500 selection:text-white transition-colors duration-200">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
