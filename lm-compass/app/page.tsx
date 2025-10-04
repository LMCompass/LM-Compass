import { ThemeToggleButton } from "@/components/theme/theme-toggle-button";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[auto_1fr_auto] min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <header className="flex justify-between items-center">
        <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
          LM Compass
        </h1>
        <ThemeToggleButton />
      </header>
    </div>
  );
}
