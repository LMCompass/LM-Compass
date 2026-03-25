import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
};

/**
 * Brand mark from /public/logo-light.svg and /public/logo-dark.svg.
 * Switches with the `dark` class on &lt;html&gt; (next-themes).
 */
export function AppLogo({ className }: AppLogoProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVGs from /public */}
      <img
        src="/logo-light.svg"
        alt=""
        className="h-full w-full object-contain dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-dark.svg"
        alt=""
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}
