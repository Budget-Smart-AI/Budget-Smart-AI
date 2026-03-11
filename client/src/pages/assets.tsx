// FEATURE: ASSET_TRACKING | tier: free | limit: 10 assets
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Home, Car, Gem, Watch, Palette, Wrench, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ASSET_CATEGORIES, type Asset } from "@shared/schema";

const assetFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(ASSET_CATEGORIES),
  description: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.string().optional(),
  currentValue: z.string().min(1, "Current value is required"),
  location: z.string().optional(),
  serialNumber: z.string().optional(),
  notes: z.string().optional(),
});

type AssetFormValues = z.infer<typeof assetFormSchema>;

function formatCurrency(amount: string | number | null | undefined) {
  if (!amount) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "real_estate": return <Home className="h-5 w-5" />;
    case "vehicle": return <Car className="h-5 w-5" />;
    case "collectible": return <Gem className="h-5 w-5" />;
    case "jewelry": return <Watch className="h-5 w-5" />;
    case "art": return <Palette className="h-5 w-5" />;
    case "equipment": return <Wrench className="h-5 w-5" />;
    default: return <Package className="h-5 w-5" />;
  }
}

function formatCategory(category: string) {
  return category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function AssetForm({ asset, onClose }: { asset?: Asset; onClose: () => void }) {
  const { toast } = useToast();
  const isEditing = !!asset;

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: asset?.name || "",
      category: (asset?.category as typeof ASSET_CATEGORIES[number]) || "other",
      description: asset?.description || "",
      purchaseDate: asset?.purchaseDate || "",
      purchasePrice: asset?.purchasePrice || "",
      currentValue: asset?.currentValue || "",
      location: asset?.location || "",
      serialNumber: asset?.serialNumber || "",
      notes: asset?.notes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: AssetFormValues) => apiRequest("POST", "/api/assets", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset added successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to add asset", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (values: AssetFormValues) => apiRequest("PATCH", `/api/assets/${asset?.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset updated successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update asset", variant: "destructive" }),
  });

  const onSubmit = (values: AssetFormValues) => {
    if (isEditing) updateMutation.mutate(values);
    else createMutation.mutate(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Asset Name</FormLabel>
            <FormControl><Input placeholder="My Home, Tesla Model 3, etc." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ASSET_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{formatCategory(cat)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="currentValue" render={({ field }) => (
            <FormItem>
              <FormLabel>Current Value</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="500000" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description (Optional)</FormLabel>
            <FormControl><Textarea placeholder="Brief description of the asset..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="purchaseDate" render={({ field }) => (
            <FormItem>
              <FormLabel>Purchase Date (Optional)</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="purchasePrice" render={({ field }) => (
            <FormItem>
              <FormLabel>Purchase Price (Optional)</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="450000" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="location" render={({ field }) => (
            <FormItem>
              <FormLabel>Location (Optional)</FormLabel>
              <FormControl><Input placeholder="123 Main St, City, State" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="serialNumber" render={({ field }) => (
            <FormItem>
              <FormLabel>Serial/VIN (Optional)</FormLabel>
              <FormControl><Input placeholder="VIN or serial number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (Optional)</FormLabel>
            <FormControl><Textarea placeholder="Any additional notes..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {isEditing ? "Update" : "Add"} Asset
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function Assets() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/assets/${deleteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset deleted" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Failed to delete asset", variant: "destructive" }),
  });

  // Group assets by category
  const assetsByCategory = assets.reduce((acc, asset) => {
    const cat = asset.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(asset);
    return acc;
  }, {} as Record<string, Asset[]>);

  const totalValue = assets.reduce((sum, a) => sum + parseFloat(a.currentValue || "0"), 0);
  const totalPurchasePrice = assets.reduce((sum, a) => sum + parseFloat(a.purchasePrice || "0"), 0);
  const appreciation = totalValue - totalPurchasePrice;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-muted-foreground">Track your physical assets and property</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingAsset(undefined);
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Asset</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAsset ? "Edit" : "Add"} Asset</DialogTitle>
            </DialogHeader>
            <AssetForm asset={editingAsset} onClose={() => {
              setDialogOpen(false);
              setEditingAsset(undefined);
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Asset Value</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalValue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Purchase Price</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalPurchasePrice)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Appreciation</CardDescription>
            <CardTitle className={`text-2xl ${appreciation >= 0 ? "text-green-600" : "text-red-600"}`}>
              {appreciation >= 0 ? "+" : ""}{formatCurrency(appreciation)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Assets by Category */}
      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No assets yet. Add your first asset to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(assetsByCategory).map(([category, categoryAssets]) => (
            <Card key={category}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  {getCategoryIcon(category)}
                  <CardTitle>{formatCategory(category)}</CardTitle>
                  <Badge variant="secondary" className="ml-auto">
                    {formatCurrency(categoryAssets.reduce((sum, a) => sum + parseFloat(a.currentValue || "0"), 0))}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categoryAssets.map(asset => {
                    const value = parseFloat(asset.currentValue || "0");
                    const purchase = parseFloat(asset.purchasePrice || "0");
                    const gain = value - purchase;

                    return (
                      <Card key={asset.id} className="relative">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{asset.name}</CardTitle>
                              {asset.description && (
                                <CardDescription className="line-clamp-1">{asset.description}</CardDescription>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => {
                                setEditingAsset(asset);
                                setDialogOpen(true);
                              }}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteId(asset.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{formatCurrency(value)}</div>
                          {purchase > 0 && (
                            <p className={`text-sm ${gain >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {gain >= 0 ? "+" : ""}{formatCurrency(gain)} since purchase
                            </p>
                          )}
                          {asset.location && (
                            <p className="text-sm text-muted-foreground mt-2">{asset.location}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The asset and its value history will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
