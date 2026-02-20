import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface HelpTooltipProps {
  title: string;
  content: string;
  learnMoreLink?: string;
}

export function HelpTooltip({ title, content, learnMoreLink = "/help" }: HelpTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors"
          aria-label={`Help: ${title}`}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" side="bottom" align="start">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">{title}</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">{content}</p>
          {learnMoreLink && (
            <a
              href={learnMoreLink}
              className="inline-block text-xs text-primary hover:underline mt-1"
            >
              Learn more in Help Center
            </a>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
