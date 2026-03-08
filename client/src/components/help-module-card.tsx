import { useState } from "react";
import { type LucideIcon, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ModuleAIChat } from "./module-ai-chat";

export interface FAQ {
  question: string;
  answer: string;
}

export interface ModuleConfig {
  id: string;
  icon: LucideIcon;
  name: string;
  category: string;
  description: string;
  capabilities: string[];
  faqs: FAQ[];
}

interface HelpModuleCardProps {
  module: ModuleConfig;
}

export function HelpModuleCard({ module }: HelpModuleCardProps) {
  const Icon = module.icon;

  return (
    <div
      id={`module-${module.id}`}
      className="bg-card border border-border rounded-2xl p-6 mb-6 scroll-mt-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">{module.name}</h2>
        </div>
        <span className="bg-primary/10 text-primary text-xs rounded-full px-3 py-1 font-medium shrink-0">
          {module.category}
        </span>
      </div>

      {/* Description */}
      <p className="text-muted-foreground text-sm leading-relaxed mb-5">
        {module.description}
      </p>

      {/* What you can do */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          What you can do
        </h3>
        <ul className="space-y-2">
          {module.capabilities.map((cap, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              {cap}
            </li>
          ))}
        </ul>
      </div>

      {/* Common Questions */}
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Common Questions
        </h3>
        <Accordion type="single" collapsible className="space-y-2">
          {module.faqs.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="border border-border rounded-lg px-4 data-[state=open]:bg-muted/40"
            >
              <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline py-3">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground pb-3">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* AI Chat */}
      <ModuleAIChat moduleId={module.id} moduleName={module.name} />
    </div>
  );
}
