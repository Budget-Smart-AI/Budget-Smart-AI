const LOGO_FULL_URL = "https://files.budgetsmart.io/logo-full-h512.png";
const LOGO_ICON_URL = "https://files.budgetsmart.io/apple-touch-icon.png";

export function BudgetSmartLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src={LOGO_ICON_URL}
      alt="Budget Smart AI"
      className={`rounded-xl ${className}`}
      draggable={false}
    />
  );
}

export function BudgetSmartLogoWithText({ showTagline = true }: { showTagline?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={LOGO_FULL_URL}
        alt="Budget Smart AI"
        className="h-10 w-auto"
        draggable={false}
      />
    </div>
  );
}
