import { type LucideIcon } from "lucide-react";

export interface ModuleNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: ModuleNavItem[];
}

interface HelpNavSidebarProps {
  groups: NavGroup[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function HelpNavSidebar({ groups, activeId, onSelect }: HelpNavSidebarProps) {
  return (
    <nav className="w-full space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeId === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onSelect(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-primary font-medium"
                        : "text-foreground hover:bg-muted border-l-2 border-transparent"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
