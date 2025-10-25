import { ThemeToggleButton } from "@/components/theme/theme-toggle-button";
import {PromptInputComponent} from "./prompt-input";

export default function Home() {
  return (
    <div className="font-sans min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-8 sm:p-20">
        <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
          LM Compass
        </h1>
        <ThemeToggleButton />
      </header>
      <div className="flex-1"></div>
      <div className="flex justify-center p-8 pb-20">
        <PromptInputComponent/>
      </div>
    </div>
  );
}
