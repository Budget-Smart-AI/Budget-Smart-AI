import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Settings, Sparkles, MessageSquare, DollarSign, Scale, HelpCircle,
  Plus, Pencil, Trash2, Save, Eye, ArrowUpDown, GripVertical, Users
} from "lucide-react";

// Types
interface LandingSetting {
  id: string;
  key: string;
  value: string;
  type: string;
  updatedAt: string;
}

interface LandingFeature {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  sortOrder: number;
  isActive: string;
}

interface LandingTestimonial {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  quote: string;
  avatar: string | null;
  rating: number;
  location: string | null;
  sortOrder: number;
  isActive: string;
  isFeatured: string;
}

interface LandingPricing {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  description: string | null;
  features: string;
  isPopular: string;
  ctaText: string;
  ctaUrl: string;
  sortOrder: number;
  isActive: string;
  // Stripe integration fields
  stripePriceId: string | null;
  stripeProductId: string | null;
  maxBankAccounts: number | null;
  maxFamilyMembers: number | null;
  trialDays: number | null;
  requiresCard: string | null;
}

interface LandingComparison {
  id: string;
  feature: string;
  budgetSmart: string;
  mint: string | null;
  ynab: string | null;
  copilot: string | null;
  sortOrder: number;
  isActive: string;
}

interface LandingFaq {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  isActive: string;
}

interface VideoAnnotation {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  position: string;
  style: string;
  icon: string | null;
  sortOrder: number;
  isActive: string;
}

// Icon options for features
const iconOptions = [
  "Brain", "Zap", "Shield", "TrendingUp", "PieChart", "Wallet", "Calendar",
  "Users", "Building2", "Target", "Receipt", "LineChart", "PiggyBank",
  "Check", "Star", "Lock", "CreditCard", "Sparkles"
];

export default function AdminLanding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("settings");

  // Queries
  const { data: settings = [] } = useQuery<LandingSetting[]>({
    queryKey: ["/api/admin/landing/settings"],
  });

  const { data: features = [] } = useQuery<LandingFeature[]>({
    queryKey: ["/api/admin/landing/features"],
  });

  const { data: testimonials = [] } = useQuery<LandingTestimonial[]>({
    queryKey: ["/api/admin/landing/testimonials"],
  });

  const { data: pricing = [] } = useQuery<LandingPricing[]>({
    queryKey: ["/api/admin/landing/pricing"],
  });

  const { data: comparison = [], isLoading: comparisonLoading, isError: comparisonError, error: comparisonErrorDetails } = useQuery<LandingComparison[]>({
    queryKey: ["/api/admin/landing/comparison"],
  });

  const { data: faqs = [] } = useQuery<LandingFaq[]>({
    queryKey: ["/api/admin/landing/faqs"],
  });

  const { data: videoAnnotations = [] } = useQuery<VideoAnnotation[]>({
    queryKey: ["/api/admin/landing/video-annotations"],
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Landing Page Admin</h1>
          <p className="text-muted-foreground">Manage your public website content</p>
        </div>
        <Button variant="outline" asChild>
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Eye className="h-4 w-4 mr-2" />
            Preview Site
          </a>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 md:grid-cols-8 w-full max-w-5xl gap-1">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Features</span>
          </TabsTrigger>
          <TabsTrigger value="testimonials" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Reviews</span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="comparison" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <span className="hidden sm:inline">Compare</span>
          </TabsTrigger>
          <TabsTrigger value="faq" className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">FAQ</span>
          </TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Video</span>
          </TabsTrigger>
          <TabsTrigger value="affiliate" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Affiliate</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <SettingsTab settings={settings} />
        </TabsContent>

        <TabsContent value="features" className="mt-6">
          <FeaturesTab features={features} />
        </TabsContent>

        <TabsContent value="testimonials" className="mt-6">
          <TestimonialsTab testimonials={testimonials} />
        </TabsContent>

        <TabsContent value="pricing" className="mt-6">
          <PricingTab pricing={pricing} />
        </TabsContent>

        <TabsContent value="comparison" className="mt-6">
          <ComparisonTab comparison={comparison} isLoading={comparisonLoading} isError={comparisonError} error={comparisonErrorDetails} />
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          <FaqTab faqs={faqs} />
        </TabsContent>

        <TabsContent value="video" className="mt-6">
          <VideoAnnotationsTab annotations={videoAnnotations} />
        </TabsContent>

        <TabsContent value="affiliate" className="mt-6">
          <AffiliateTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Settings Tab Component
function SettingsTab({ settings }: { settings: LandingSetting[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: async ({ key, value, type }: { key: string; value: string; type: string }) => {
      return apiRequest("PUT", `/api/admin/landing/settings/${key}`, { value, type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/settings"] });
      toast({ title: "Setting updated successfully" });
      setEditingKey(null);
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const settingsGroups = {
    hero: ["hero_title", "hero_subtitle", "hero_cta_primary", "hero_cta_secondary", "hero_video_url", "hero_stats"],
    branding: ["company_name", "company_tagline", "footer_description"],
    security: ["security_badge_text", "trust_badges"],
    social: ["social_twitter", "social_linkedin", "social_facebook"],
  };

  const getSettingValue = (key: string) => {
    const setting = settings.find(s => s.key === key);
    return setting?.value || "";
  };

  const getSettingType = (key: string) => {
    const setting = settings.find(s => s.key === key);
    return setting?.type || "text";
  };

  const handleSave = (key: string) => {
    updateMutation.mutate({ key, value: editValue, type: getSettingType(key) });
  };

  const renderSettingInput = (key: string, label: string) => {
    const value = getSettingValue(key);
    const isEditing = editingKey === key;
    const isJson = getSettingType(key) === "json";

    return (
      <div key={key} className="space-y-2">
        <Label htmlFor={key}>{label}</Label>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              {isJson ? (
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1 font-mono text-sm"
                  rows={3}
                />
              ) : (
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1"
                />
              )}
              <Button onClick={() => handleSave(key)} size="sm">
                <Save className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditingKey(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1 p-2 bg-muted rounded-md text-sm truncate">
                {value || <span className="text-muted-foreground">Not set</span>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingKey(key);
                  setEditValue(value);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Hero Section</CardTitle>
          <CardDescription>Configure the main hero section content</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSettingInput("hero_title", "Hero Title")}
          {renderSettingInput("hero_subtitle", "Hero Subtitle")}
          {renderSettingInput("hero_cta_primary", "Primary CTA Button")}
          {renderSettingInput("hero_cta_secondary", "Secondary CTA Button")}
          {renderSettingInput("hero_video_url", "Demo Video URL")}
          {renderSettingInput("hero_stats", "Stats (JSON)")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Company name and descriptions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSettingInput("company_name", "Company Name")}
          {renderSettingInput("company_tagline", "Tagline")}
          {renderSettingInput("footer_description", "Footer Description")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security & Trust</CardTitle>
          <CardDescription>Security badges and trust indicators</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSettingInput("security_badge_text", "Security Badge Text")}
          {renderSettingInput("trust_badges", "Trust Badges (JSON Array)")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Social Links</CardTitle>
          <CardDescription>Social media profile URLs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSettingInput("social_twitter", "Twitter/X URL")}
          {renderSettingInput("social_linkedin", "LinkedIn URL")}
          {renderSettingInput("social_facebook", "Facebook URL")}
        </CardContent>
      </Card>
    </div>
  );
}

// Features Tab Component
function FeaturesTab({ features }: { features: LandingFeature[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<LandingFeature | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    icon: "Brain",
    category: "core",
    sortOrder: 0,
    isActive: "true",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/landing/features", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/features"] });
      toast({ title: "Feature created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create feature", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/admin/landing/features/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/features"] });
      toast({ title: "Feature updated successfully" });
      setDialogOpen(false);
      setEditingFeature(null);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update feature", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/landing/features/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/features"] });
      toast({ title: "Feature deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete feature", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      icon: "Brain",
      category: "core",
      sortOrder: 0,
      isActive: "true",
    });
  };

  const openEditDialog = (feature: LandingFeature) => {
    setEditingFeature(feature);
    setFormData({
      title: feature.title,
      description: feature.description,
      icon: feature.icon,
      category: feature.category || "core",
      sortOrder: feature.sortOrder || 0,
      isActive: feature.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingFeature) {
      updateMutation.mutate({ id: editingFeature.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Features</CardTitle>
          <CardDescription>Manage feature cards displayed on the landing page</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingFeature(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Feature
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingFeature ? "Edit Feature" : "Add Feature"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map((icon) => (
                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai">AI Features</SelectItem>
                      <SelectItem value="core">Core Features</SelectItem>
                      <SelectItem value="automation">Automation</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={formData.isActive === "true"}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked ? "true" : "false" })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>
                {editingFeature ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Icon</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {features.map((feature) => (
              <TableRow key={feature.id}>
                <TableCell className="font-medium">{feature.title}</TableCell>
                <TableCell>{feature.icon}</TableCell>
                <TableCell>
                  <Badge variant="outline">{feature.category}</Badge>
                </TableCell>
                <TableCell>{feature.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant={feature.isActive === "true" ? "default" : "secondary"}>
                    {feature.isActive === "true" ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(feature)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(feature.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Testimonials Tab Component
function TestimonialsTab({ testimonials }: { testimonials: LandingTestimonial[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LandingTestimonial | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    company: "",
    quote: "",
    rating: 5,
    location: "",
    sortOrder: 0,
    isActive: "true",
    isFeatured: "false",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/landing/testimonials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/testimonials"] });
      toast({ title: "Testimonial created successfully" });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/admin/landing/testimonials/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/testimonials"] });
      toast({ title: "Testimonial updated successfully" });
      setDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/landing/testimonials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/testimonials"] });
      toast({ title: "Testimonial deleted successfully" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      role: "",
      company: "",
      quote: "",
      rating: 5,
      location: "",
      sortOrder: 0,
      isActive: "true",
      isFeatured: "false",
    });
  };

  const openEditDialog = (item: LandingTestimonial) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      role: item.role || "",
      company: item.company || "",
      quote: item.quote,
      rating: item.rating || 5,
      location: item.location || "",
      sortOrder: item.sortOrder || 0,
      isActive: item.isActive,
      isFeatured: item.isFeatured || "false",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Testimonials</CardTitle>
          <CardDescription>Manage customer reviews and testimonials</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Testimonial
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Testimonial" : "Add Testimonial"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role/Title</Label>
                  <Input
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="San Francisco, CA"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quote</Label>
                <Textarea
                  value={formData.quote}
                  onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Rating (1-5)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={formData.rating}
                    onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) || 5 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex flex-col gap-2 pt-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isActive === "true"}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked ? "true" : "false" })}
                    />
                    <Label>Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.isFeatured === "true"}
                      onCheckedChange={(checked) => setFormData({ ...formData, isFeatured: checked ? "true" : "false" })}
                    />
                    <Label>Featured</Label>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>
                {editingItem ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {testimonials.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.role}</TableCell>
                <TableCell className="max-w-xs truncate">{item.quote}</TableCell>
                <TableCell>{"*".repeat(item.rating || 5)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Badge variant={item.isActive === "true" ? "default" : "secondary"}>
                      {item.isActive === "true" ? "Active" : "Inactive"}
                    </Badge>
                    {item.isFeatured === "true" && (
                      <Badge variant="outline">Featured</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Pricing Tab Component
function PricingTab({ pricing }: { pricing: LandingPricing[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LandingPricing | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "0",
    billingPeriod: "monthly",
    description: "",
    features: "[]",
    isPopular: "false",
    ctaText: "Get Started",
    ctaUrl: "/login",
    sortOrder: 0,
    isActive: "true",
    // Stripe integration fields
    stripePriceId: "",
    stripeProductId: "",
    maxBankAccounts: 1,
    maxFamilyMembers: 1,
    trialDays: 0,
    requiresCard: "true",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/landing/pricing", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/pricing"] });
      toast({ title: "Pricing plan created successfully" });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/admin/landing/pricing/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/pricing"] });
      toast({ title: "Pricing plan updated successfully" });
      setDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/landing/pricing/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/pricing"] });
      toast({ title: "Pricing plan deleted successfully" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      price: "0",
      billingPeriod: "monthly",
      description: "",
      features: "[]",
      isPopular: "false",
      ctaText: "Get Started",
      ctaUrl: "/login",
      sortOrder: 0,
      isActive: "true",
      stripePriceId: "",
      stripeProductId: "",
      maxBankAccounts: 1,
      maxFamilyMembers: 1,
      trialDays: 0,
      requiresCard: "true",
    });
  };

  const openEditDialog = (item: LandingPricing) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price: item.price,
      billingPeriod: item.billingPeriod || "monthly",
      description: item.description || "",
      features: item.features,
      isPopular: item.isPopular || "false",
      ctaText: item.ctaText || "Get Started",
      ctaUrl: item.ctaUrl || "/login",
      sortOrder: item.sortOrder || 0,
      isActive: item.isActive,
      stripePriceId: item.stripePriceId || "",
      stripeProductId: item.stripeProductId || "",
      maxBankAccounts: item.maxBankAccounts || 1,
      maxFamilyMembers: item.maxFamilyMembers || 1,
      trialDays: item.trialDays || 0,
      requiresCard: item.requiresCard || "true",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Pricing Plans</CardTitle>
          <CardDescription>Manage pricing tiers and their features</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Pricing Plan" : "Add Pricing Plan"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plan Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Pro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Price</Label>
                  <Input
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="9.99"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Billing Period</Label>
                  <Select value={formData.billingPeriod} onValueChange={(v) => setFormData({ ...formData, billingPeriod: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Perfect for serious budgeters"
                />
              </div>
              <div className="space-y-2">
                <Label>Features (JSON Array)</Label>
                <Textarea
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  rows={4}
                  className="font-mono text-sm"
                  placeholder='["Feature 1", "Feature 2"]'
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CTA Text</Label>
                  <Input
                    value={formData.ctaText}
                    onChange={(e) => setFormData({ ...formData, ctaText: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CTA URL</Label>
                  <Input
                    value={formData.ctaUrl}
                    onChange={(e) => setFormData({ ...formData, ctaUrl: e.target.value })}
                  />
                </div>
              </div>

              {/* Stripe Integration Section */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-semibold mb-3 text-sm text-muted-foreground">Stripe Integration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Stripe Price ID</Label>
                    <Input
                      value={formData.stripePriceId}
                      onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value })}
                      placeholder="price_xxxxxxxxxxxxx"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Stripe Product ID</Label>
                    <Input
                      value={formData.stripeProductId}
                      onChange={(e) => setFormData({ ...formData, stripeProductId: e.target.value })}
                      placeholder="prod_xxxxxxxxxxxxx"
                    />
                  </div>
                </div>
              </div>

              {/* Plan Limits Section */}
              <div className="border-t pt-4 mt-4">
                <h4 className="font-semibold mb-3 text-sm text-muted-foreground">Plan Limits</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Max Bank Accounts</Label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.maxBankAccounts}
                      onChange={(e) => setFormData({ ...formData, maxBankAccounts: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Family Members</Label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.maxFamilyMembers}
                      onChange={(e) => setFormData({ ...formData, maxFamilyMembers: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Trial Days</Label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.trialDays}
                      onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isActive === "true"}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked ? "true" : "false" })}
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isPopular === "true"}
                    onCheckedChange={(checked) => setFormData({ ...formData, isPopular: checked ? "true" : "false" })}
                  />
                  <Label>Popular (Highlighted)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.requiresCard === "true"}
                    onCheckedChange={(checked) => setFormData({ ...formData, requiresCard: checked ? "true" : "false" })}
                  />
                  <Label>Requires Card for Trial</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>
                {editingItem ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Stripe Price ID</TableHead>
              <TableHead>Limits</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pricing.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>${parseFloat(item.price).toFixed(2)}</TableCell>
                <TableCell>{item.billingPeriod}</TableCell>
                <TableCell>
                  {item.stripePriceId ? (
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {item.stripePriceId.slice(0, 20)}...
                    </code>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not set</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">
                    {item.maxBankAccounts || 1} accts / {item.maxFamilyMembers || 1} members
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant={item.isActive === "true" ? "default" : "secondary"}>
                      {item.isActive === "true" ? "Active" : "Inactive"}
                    </Badge>
                    {item.isPopular === "true" && (
                      <Badge className="bg-emerald-500">Popular</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Comparison Tab Component
function ComparisonTab({ comparison, isLoading, isError, error }: { comparison: LandingComparison[]; isLoading?: boolean; isError?: boolean; error?: Error | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LandingComparison | null>(null);
  const [formData, setFormData] = useState({
    feature: "",
    budgetSmart: "yes",
    mint: "",
    ynab: "",
    sortOrder: 0,
    isActive: "true",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/landing/comparison", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/comparison"] });
      toast({ title: "Comparison row created successfully" });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/admin/landing/comparison/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/comparison"] });
      toast({ title: "Comparison row updated successfully" });
      setDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/landing/comparison/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/comparison"] });
      toast({ title: "Comparison row deleted successfully" });
    },
  });

  const resetForm = () => {
    setFormData({
      feature: "",
      budgetSmart: "yes",
      mint: "",
      ynab: "",
      sortOrder: 0,
      isActive: "true",
    });
  };

  const openEditDialog = (item: LandingComparison) => {
    setEditingItem(item);
    setFormData({
      feature: item.feature,
      budgetSmart: item.budgetSmart,
      mint: item.mint || "",
      ynab: item.ynab || "",
      sortOrder: item.sortOrder || 0,
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Comparison Table</CardTitle>
          <CardDescription>Manage the feature comparison table</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Row
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Comparison Row" : "Add Comparison Row"}</DialogTitle>
              <DialogDescription>Use "yes", "no", "partial", or custom text for values</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Feature Name</Label>
                <Input
                  value={formData.feature}
                  onChange={(e) => setFormData({ ...formData, feature: e.target.value })}
                  placeholder="AI Financial Coach"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Budget Smart AI</Label>
                  <Input
                    value={formData.budgetSmart}
                    onChange={(e) => setFormData({ ...formData, budgetSmart: e.target.value })}
                    placeholder="yes"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Monarch Money</Label>
                  <Input
                    value={formData.mint}
                    onChange={(e) => setFormData({ ...formData, mint: e.target.value })}
                    placeholder="no"
                  />
                </div>
                <div className="space-y-2">
                  <Label>YNAB</Label>
                  <Input
                    value={formData.ynab}
                    onChange={(e) => setFormData({ ...formData, ynab: e.target.value })}
                    placeholder="no"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={formData.isActive === "true"}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked ? "true" : "false" })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>
                {editingItem ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Loading comparison data...
          </div>
        )}
        {isError && (
          <div className="text-center py-8 text-destructive">
            Failed to load comparison data: {error?.message || "Unknown error"}
          </div>
        )}
        {!isLoading && !isError && comparison.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No comparison data found. Click "Add Row" to create your first comparison entry.
          </div>
        )}
        {!isLoading && !isError && comparison.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Budget Smart AI</TableHead>
                <TableHead>Monarch Money</TableHead>
                <TableHead>YNAB</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.feature}</TableCell>
                  <TableCell>{item.budgetSmart}</TableCell>
                  <TableCell>{item.mint}</TableCell>
                  <TableCell>{item.ynab}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// FAQ Tab Component
function FaqTab({ faqs }: { faqs: LandingFaq[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LandingFaq | null>(null);
  const [formData, setFormData] = useState({
    question: "",
    answer: "",
    category: "general",
    sortOrder: 0,
    isActive: "true",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/landing/faqs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/faqs"] });
      toast({ title: "FAQ created successfully" });
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/admin/landing/faqs/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/faqs"] });
      toast({ title: "FAQ updated successfully" });
      setDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/landing/faqs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/faqs"] });
      toast({ title: "FAQ deleted successfully" });
    },
  });

  const resetForm = () => {
    setFormData({
      question: "",
      answer: "",
      category: "general",
      sortOrder: 0,
      isActive: "true",
    });
  };

  const openEditDialog = (item: LandingFaq) => {
    setEditingItem(item);
    setFormData({
      question: item.question,
      answer: item.answer,
      category: item.category || "general",
      sortOrder: item.sortOrder || 0,
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>FAQ</CardTitle>
          <CardDescription>Manage frequently asked questions</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add FAQ
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Question</Label>
                <Input
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Answer</Label>
                <Textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="pricing">Pricing</SelectItem>
                      <SelectItem value="features">Features</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={formData.isActive === "true"}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked ? "true" : "false" })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>
                {editingItem ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faqs.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium max-w-sm truncate">{item.question}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.category}</Badge>
                </TableCell>
                <TableCell>{item.sortOrder}</TableCell>
                <TableCell>
                  <Badge variant={item.isActive === "true" ? "default" : "secondary"}>
                    {item.isActive === "true" ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Affiliate Tab Component
//
// Two-tier lifetime-recurring model (locked-in 2026-04-17):
//   • Standard 40% on every active referral.
//   • Boosted 50% once an affiliate hits 250+ active referrals (re-rates ALL).
//   • 180-day attribution cookie · $100 PayPal minimum payout.
function AffiliateTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    commissionPercent: 40,
    boostedCommissionPercent: 50,
    boostedAfterReferrals: 250,
    cookieDurationDays: 180,
    payoutMethod: "PayPal",
    payoutMinimum: 100,
    commissionRecurrence: "lifetime",
    partneroUrl: "https://affiliate.budgetsmart.io",
  });
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/affiliate/settings"],
    queryFn: async () => {
      const res = await fetch("/api/affiliate/settings");
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Load settings into form when they arrive
  if (settings && !hasLoaded) {
    setFormData({
      commissionPercent: settings.commissionPercent ?? 40,
      boostedCommissionPercent: settings.boostedCommissionPercent ?? 50,
      boostedAfterReferrals: settings.boostedAfterReferrals ?? 250,
      cookieDurationDays: settings.cookieDurationDays ?? 180,
      payoutMethod: settings.payoutMethod ?? "PayPal",
      payoutMinimum: settings.payoutMinimum ?? 100,
      commissionRecurrence: settings.commissionRecurrence ?? "lifetime",
      partneroUrl: settings.partneroUrl || "https://affiliate.budgetsmart.io",
    });
    setHasLoaded(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("PUT", "/api/admin/affiliate/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/affiliate/settings"] });
      toast({ title: "Affiliate settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Affiliate Program Settings</CardTitle>
          <CardDescription>
            Two-tier lifetime recurring commissions. Standard rate kicks in from
            day one; the boosted rate unlocks once an affiliate reaches the
            referral threshold and re-rates all of their referrals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Partnero Integration */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Partnero Integration</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>Partnero Dashboard URL</Label>
                <Input
                  value={formData.partneroUrl}
                  onChange={(e) => setFormData({ ...formData, partneroUrl: e.target.value })}
                  placeholder="https://affiliate.budgetsmart.io"
                />
                <p className="text-xs text-muted-foreground">
                  Public URL where affiliates sign up and manage their account.
                  Use the custom-domain CNAME (affiliate.budgetsmart.io), not the partnero.com URL.
                </p>
              </div>
            </div>
          </div>

          {/* Commission Rates */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-semibold text-lg">Commission Rates</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Standard Commission (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.commissionPercent}
                  onChange={(e) => setFormData({ ...formData, commissionPercent: parseInt(e.target.value) || 40 })}
                />
                <p className="text-xs text-muted-foreground">Lifetime recurring rate from day one</p>
              </div>
              <div className="space-y-2">
                <Label>Boosted Commission (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.boostedCommissionPercent}
                  onChange={(e) => setFormData({ ...formData, boostedCommissionPercent: parseInt(e.target.value) || 50 })}
                />
                <p className="text-xs text-muted-foreground">Re-rates ALL of the affiliate's referrals</p>
              </div>
              <div className="space-y-2">
                <Label>Boost Threshold (referrals)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.boostedAfterReferrals}
                  onChange={(e) => setFormData({ ...formData, boostedAfterReferrals: parseInt(e.target.value) || 250 })}
                />
                <p className="text-xs text-muted-foreground">Active paying referrals required to unlock boost</p>
              </div>
            </div>
          </div>

          {/* Attribution & Payouts */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-semibold text-lg">Attribution & Payouts</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cookie Duration (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.cookieDurationDays}
                  onChange={(e) => setFormData({ ...formData, cookieDurationDays: parseInt(e.target.value) || 180 })}
                />
                <p className="text-xs text-muted-foreground">Attribution window from first click to signup</p>
              </div>
              <div className="space-y-2">
                <Label>Payout Method</Label>
                <Input
                  value={formData.payoutMethod}
                  onChange={(e) => setFormData({ ...formData, payoutMethod: e.target.value })}
                  placeholder="PayPal"
                />
                <p className="text-xs text-muted-foreground">Method shown on the public affiliate page</p>
              </div>
              <div className="space-y-2">
                <Label>Minimum Payout ($)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.payoutMinimum}
                  onChange={(e) => setFormData({ ...formData, payoutMinimum: parseInt(e.target.value) || 100 })}
                />
                <p className="text-xs text-muted-foreground">Below this, balance rolls over</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              These values display on the public affiliate page and in the
              affiliate-terms doc. The actual cookie + payout enforcement
              happens inside Partnero — keep this UI in sync with the Partnero
              portal settings.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle>Affiliate Page Preview</CardTitle>
          <CardDescription>View how your affiliate page looks to visitors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button variant="outline" asChild>
              <a href="/affiliate" target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4 mr-2" />
                Preview Affiliate Page
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={formData.partneroUrl} target="_blank" rel="noopener noreferrer">
                <Users className="h-4 w-4 mr-2" />
                Open Partnero Dashboard
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Video Annotations Tab Component
function VideoAnnotationsTab({ annotations }: { annotations: VideoAnnotation[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VideoAnnotation | null>(null);
  const [formData, setFormData] = useState({
    text: "",
    startTime: 0,
    duration: 4,
    position: "bottom-right",
    style: "default",
    icon: "Brain",
    sortOrder: 0,
    isActive: "true",
  });

  const positionOptions = [
    { value: "top-left", label: "Top Left" },
    { value: "top-right", label: "Top Right" },
    { value: "bottom-left", label: "Bottom Left" },
    { value: "bottom-right", label: "Bottom Right" },
    { value: "center", label: "Center" },
  ];

  const styleOptions = [
    { value: "default", label: "Default (Dark)", color: "bg-slate-700" },
    { value: "highlight", label: "Highlight (Green)", color: "bg-emerald-500" },
    { value: "security", label: "Security (Blue)", color: "bg-blue-500" },
    { value: "success", label: "Success (Green)", color: "bg-green-500" },
    { value: "info", label: "Info (Cyan)", color: "bg-cyan-500" },
    { value: "family", label: "Family (Purple)", color: "bg-purple-500" },
  ];

  const iconOptions = [
    "Brain", "Shield", "Target", "TrendingUp", "Users", "Zap",
    "DollarSign", "PiggyBank", "CreditCard", "LineChart", "Lock",
    "Bell", "Calendar", "Check", "Sparkles"
  ];

  const resetForm = () => {
    setFormData({
      text: "",
      startTime: 0,
      duration: 4,
      position: "bottom-right",
      style: "default",
      icon: "Brain",
      sortOrder: 0,
      isActive: "true",
    });
    setEditingItem(null);
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/landing/video-annotations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/video-annotations"] });
      toast({ title: "Annotation created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create annotation", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/admin/landing/video-annotations/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/video-annotations"] });
      toast({ title: "Annotation updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update annotation", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/landing/video-annotations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/video-annotations"] });
      toast({ title: "Annotation deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete annotation", variant: "destructive" });
    },
  });

  const handleEdit = (item: VideoAnnotation) => {
    setEditingItem(item);
    setFormData({
      text: item.text,
      startTime: item.startTime,
      duration: item.duration,
      position: item.position,
      style: item.style,
      icon: item.icon || "Brain",
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Video Annotations</CardTitle>
          <CardDescription>
            Timed popup annotations that appear on the landing page video to highlight features
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Annotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Annotation" : "Add New Annotation"}</DialogTitle>
              <DialogDescription>
                Configure when and where the annotation appears on the video
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Text</Label>
                <Input
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  placeholder="e.g., AI-Powered Budget Tracking"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time (seconds)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration (seconds)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseFloat(e.target.value) || 4 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select value={formData.position} onValueChange={(v) => setFormData({ ...formData, position: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {positionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Select value={formData.style} onValueChange={(v) => setFormData({ ...formData, style: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {styleOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${opt.color}`} />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map((icon) => (
                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.isActive === "true"}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked ? "true" : "false" })}
                />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {editingItem ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Text</TableHead>
              <TableHead>Timing</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Style</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {annotations.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium max-w-[200px] truncate">{item.text}</TableCell>
                <TableCell>
                  <span className="text-sm">
                    {item.startTime}s - {item.startTime + item.duration}s
                  </span>
                </TableCell>
                <TableCell className="capitalize">{item.position.replace("-", " ")}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">{item.style}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={item.isActive === "true" ? "default" : "secondary"}>
                    {item.isActive === "true" ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {annotations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No annotations yet. Add your first annotation to highlight features in the video.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
