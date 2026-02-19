import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={dmSans.variable}>
      <style
        dangerouslySetInnerHTML={{
          __html: `.landing-page h1, .landing-page h2, .landing-page h3, .landing-page .font-heading { font-family: var(--font-dm-sans), sans-serif; }`,
        }}
      />
      <div className="landing-page">{children}</div>
    </div>
  );
}
