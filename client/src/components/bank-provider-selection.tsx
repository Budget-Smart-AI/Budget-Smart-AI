import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Globe, CheckCircle2, AlertCircle, ChevronLeft, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProviderOption {
  id: "plaid" | "mx";
  name: string;
  description: string;
  icon: React.ReactNode;
  coverage: string[];
  features: {
    success: number; // 1-5 rating
    longevity: number; // 1-5 rating
    updates: number; // 1-5 rating (real-time updates)
  };
  isDefault: boolean;
  isRecommended: boolean;
}

interface BankProviderSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userCountry: string;
  onSelectProvider: (provider: "plaid" | "mx") => void;
  onSelectManual: () => void;
}

// Provider ratings (can be updated with real metrics)
const getProviderOptions = (userCountry: string): ProviderOption[] => {
  const isNorthAmerica = ["US", "CA", "MX"].includes(userCountry);

  return [
    {
      id: "mx",
      name: "MX",
      description: "Best for North American banks with excellent reliability",
      icon: <Building2 className="h-6 w-6" />,
      coverage: ["US", "CA"],
      features: {
        success: 5,
        longevity: 5,
        updates: 4,
      },
      isDefault: isNorthAmerica,
      isRecommended: isNorthAmerica,
    },
    {
      id: "plaid",
      name: "Plaid",
      description: "Widest global coverage with 12,000+ financial institutions",
      icon: <Globe className="h-6 w-6" />,
      coverage: ["US", "CA", "GB", "AU", "FR", "DE", "ES", "IE", "NL", "SE", "DK", "NO", "FI", "BE", "AT", "CH", "IT", "PT", "NZ"],
      features: {
        success: 4,
        longevity: 4,
        updates: 5,
      },
      isDefault: !isNorthAmerica,
      isRecommended: !isNorthAmerica,
    },
  ];
};

function FeatureBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value === 5 ? "Excellent" : value === 4 ? "Very Good" : value === 3 ? "Good" : "Fair"}
        </span>
      </div>
      <div className="flex gap-0.5 h-1.5">
        {[1, 2, 3, 4, 5].map((dot) => (
          <div
            key={dot}
            className={`flex-1 rounded-full ${
              dot <= value ? "bg-green-500" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function BankProviderSelectionDialog({
  open,
  onOpenChange,
  userCountry,
  onSelectProvider,
  onSelectManual,
}: BankProviderSelectionDialogProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [showAllOptions, setShowAllOptions] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && userCountry) {
      setProviders(getProviderOptions(userCountry));
      setShowAllOptions(false);
    }
  }, [open, userCountry]);

  // Get default provider
  const defaultProvider = providers.find((p) => p.isDefault);
  const recommendedProvider = providers.find((p) => p.isRecommended);

  const handleSelectProvider = (providerId: "plaid" | "mx") => {
    onSelectProvider(providerId);
    onOpenChange(false);
  };

  if (!showAllOptions) {
    // Simplified view - just show recommended option with "More Options" button
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Connect Your Bank
            </DialogTitle>
            <DialogDescription>
              Choose how to connect your financial accounts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Recommended Provider Card */}
            {recommendedProvider && (
              <Card className="border-2 border-primary/50 bg-primary/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg border shadow-sm">
                        {recommendedProvider.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          {recommendedProvider.name}
                          <Badge variant="default" className="text-[10px]">Recommended</Badge>
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {recommendedProvider.description}
                        </p>
                      </div>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>

                  {/* Feature Bars */}
                  <div className="space-y-2">
                    <FeatureBar label="Success Rate" value={recommendedProvider.features.success} />
                    <FeatureBar label="Longevity" value={recommendedProvider.features.longevity} />
                    <FeatureBar label="Real-time Updates" value={recommendedProvider.features.updates} />
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={() => handleSelectProvider(recommendedProvider.id)}
                  >
                    <Building2 className="h-4 w-4" />
                    Connect with {recommendedProvider.name}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Information text */}
            <p className="text-center text-sm text-muted-foreground px-4">
              BudgetSmart works with multiple data providers to give you the best connection.
            </p>

            {/* Action buttons */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowAllOptions(true)}
              >
                More Connection Options
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  onSelectManual();
                  onOpenChange(false);
                }}
              >
                Add Manual Account
              </Button>
            </div>

            {/* Learn more link */}
            <div className="text-center">
              <a
                href="/help/bank-connections"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                onClick={(e) => {
                  e.preventDefault();
                  toast({
                    title: "Help Center",
                    description: "Opening help documentation about bank connections...",
                  });
                }}
              >
                <Info className="h-3 w-3" />
                Learn more about data providers and connections
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Full view - show all provider options
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -ml-2"
              onClick={() => setShowAllOptions(false)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <DialogTitle className="flex-1">Connection Options</DialogTitle>
          </div>
          <DialogDescription>
            BudgetSmart works with multiple data providers. We offer the best connection first based on 
            success rate, but you can try another connector at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Provider Options */}
          {providers.map((provider) => (
            <Card
              key={provider.id}
              className={`transition-all ${
                provider.isRecommended
                  ? "border-2 border-primary/50 bg-primary/5"
                  : "border"
              }`}
            >
              <CardContent className="p-4 space-y-3">
                {/* Provider Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg border shadow-sm">
                      {provider.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        {provider.name}
                        {provider.isRecommended && (
                          <Badge variant="default" className="text-[10px]">Recommended</Badge>
                        )}
                        {!provider.isRecommended && userCountry && provider.coverage.includes(userCountry) && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            Alternative
                          </Badge>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                  {provider.isRecommended ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  )}
                </div>

                {/* Feature Metrics */}
                <div className="grid grid-cols-3 gap-2 py-2">
                  <div className="text-center space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase">Success</span>
                    <div className="flex gap-0.5 h-1 justify-center">
                      {[1, 2, 3, 4, 5].map((dot) => (
                        <div
                          key={dot}
                          className={`w-1.5 rounded-full ${
                            dot <= provider.features.success ? "bg-green-500" : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase">Longevity</span>
                    <div className="flex gap-0.5 h-1 justify-center">
                      {[1, 2, 3, 4, 5].map((dot) => (
                        <div
                          key={dot}
                          className={`w-1.5 rounded-full ${
                            dot <= provider.features.longevity ? "bg-green-500" : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase">Updates</span>
                    <div className="flex gap-0.5 h-1 justify-center">
                      {[1, 2, 3, 4, 5].map((dot) => (
                        <div
                          key={dot}
                          className={`w-1.5 rounded-full ${
                            dot <= provider.features.updates ? "bg-green-500" : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Coverage Info */}
                <p className="text-xs text-muted-foreground">
                  Coverage: {provider.coverage.slice(0, 5).join(", ")}
                  {provider.coverage.length > 5 && ` +${provider.coverage.length - 5} more`}
                </p>

                {/* Connect Button */}
                <Button
                  variant={provider.isRecommended ? "default" : "outline"}
                  className="w-full gap-2"
                  onClick={() => handleSelectProvider(provider.id)}
                >
                  <Building2 className="h-4 w-4" />
                  Connect with {provider.name}
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Manual Account Option */}
          <Card className="border-dashed border-2">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-50 rounded-lg">
                  <Building2 className="h-6 w-6 text-gray-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Manual Account</h3>
                  <p className="text-xs text-muted-foreground">
                    Track cash, PayPal, Venmo, or accounts not supported by automated connections
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onSelectManual();
                  onOpenChange(false);
                }}
              >
                Add Manual Account
              </Button>
            </CardContent>
          </Card>

          {/* Learn more link */}
          <div className="text-center pt-2">
            <a
              href="/help/bank-connections"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              onClick={(e) => {
                e.preventDefault();
                toast({
                  title: "Help Center",
                  description: "Opening help documentation about bank connections...",
                });
              }}
            >
              <Info className="h-3 w-3" />
              Learn more about data providers and connections
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}