import { DollarSign } from "lucide-react";

export function BudgetSmartLogo({ className = "" }: { className?: string }) {
  // Extract size from className if present, default to h-10 w-10
  const sizeMatch = className.match(/h-(\d+)/);
  const size = sizeMatch ? parseInt(sizeMatch[1]) : 10;
  
  // Scale icon to be ~50% of container size
  const iconSize = size >= 14 ? 'h-7 w-7' : 'h-5 w-5';
  
  return (
    <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/30 ${className}`}>
      <DollarSign className={`${iconSize} text-white font-bold`} strokeWidth={3} />
    </div>
  );
}

export function BudgetSmartLogoWithText({ showTagline = true }: { showTagline?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BudgetSmartLogo className="h-10 w-10" />
      <div className="flex flex-col">
        <span className="text-base font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent tracking-tight">
          Budget Smart AI
        </span>
        {showTagline && (
          <span className="text-[10px] text-sidebar-foreground/60 font-medium tracking-wide">
            Smarter Money, Brighter Future
          </span>
        )}
      </div>
    </div>
  );
}
