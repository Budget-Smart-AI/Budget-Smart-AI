// FEATURE: MERCHANT_MANAGEMENT | tier: free | limit: unlimited
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EXPENSE_CATEGORIES } from "@shared/schema";
import { Search, Store, Pencil, RotateCcw, Loader2 } from "lucide-react";

interface Merchant {
  display_name: string;
  raw_name: string;
  logo_url: string | null;
  category: string | null;
  transaction_count: number;
  total_spent: string;
  last_transaction: string;
}

const editSchema = z.object({
  cleanName: z.string().min(1, "Display name is required").max(200),
  category: z.string().nullable().optional(),
});
type EditFormData = z.infer<typeof editSchema>;

export default function MerchantsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editMerchant, setEditMerchant] = useState<Merchant | null>(null);

  const { data, isLoading } = useQuery<{ merchants: Merchant[] }>({
    queryKey: ["/api/merchants"],
  });

  const merchants = data?.merchants ?? [];

  const filtered = merchants.filter((m) =>
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    m.raw_name.toLowerCase().includes(search.toLowerCase())
  );

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { cleanName: "", category: null },
  });

  const editMutation = useMutation({
    mutationFn: async (values: EditFormData & { rawPattern: string }) => {
      const response = await apiRequest("PATCH", "/api/merchants/edit", values);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      setEditMerchant(null);
      toast({ title: "Merchant updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update merchant", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (rawPattern: string) => {
      const response = await apiRequest("DELETE", "/api/merchants/reset", { rawPattern });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants"] });
      setEditMerchant(null);
      toast({ title: "Merchant reset to default" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset merchant", description: error.message, variant: "destructive" });
    },
  });

  const openEdit = (m: Merchant) => {
    setEditMerchant(m);
    editForm.reset({ cleanName: m.display_name, category: m.category || null });
  };

  const onSubmitEdit = (values: EditFormData) => {
    if (!editMerchant) return;
    editMutation.mutate({ ...values, rawPattern: editMerchant.raw_name });
  };

  const formatCurrency = (val: string | null | undefined) => {
    const num = parseFloat(val ?? "0");
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(isNaN(num) ? 0 : num);
  };

  const formatDate = (val: string | null | undefined) => {
    if (!val) return "—";
    return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Merchants</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All merchants from your transaction history. Edit how they display throughout BudgetSmart.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search merchants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-4 w-4" />
            {isLoading ? "Loading…" : `${filtered.length} merchant${filtered.length !== 1 ? "s" : ""}`}
          </CardTitle>
          {!isLoading && search && (
            <CardDescription>Showing results for "{search}"</CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {merchants.length === 0
                ? "No transactions found yet. Sync your bank accounts to see merchants here."
                : "No merchants match your search."}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((m, idx) => (
                <div key={idx} className="flex items-center gap-4 px-4 py-3">
                  {/* Logo / Initial */}
                  <div className="flex-shrink-0">
                    {m.logo_url ? (
                      <img
                        src={m.logo_url}
                        alt={m.display_name}
                        className="w-10 h-10 rounded-full object-cover border"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm border">
                        {getInitial(m.display_name)}
                      </div>
                    )}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{m.display_name}</p>
                    {m.raw_name !== m.display_name && (
                      <p className="text-xs text-muted-foreground truncate">{m.raw_name}</p>
                    )}
                    {m.category && (
                      <Badge variant="secondary" className="text-xs mt-0.5">{m.category}</Badge>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex flex-col items-end gap-0.5 text-xs text-muted-foreground flex-shrink-0">
                    <span>{m.transaction_count} transaction{m.transaction_count !== 1 ? "s" : ""}</span>
                    <span className="font-medium text-foreground">{formatCurrency(m.total_spent)}</span>
                    <span>Last: {formatDate(m.last_transaction)}</span>
                  </div>

                  {/* Edit button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0"
                    onClick={() => openEdit(m)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editMerchant} onOpenChange={(open) => { if (!open) setEditMerchant(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Merchant</DialogTitle>
            <DialogDescription>
              Customize how this merchant appears throughout BudgetSmart.
            </DialogDescription>
          </DialogHeader>

          {editMerchant && (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="cleanName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Netflix" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        value={field.value || ""}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Preview */}
                <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                      {getInitial(editForm.watch("cleanName") || editMerchant.display_name)}
                    </div>
                    <div>
                      <p className="font-medium">{editForm.watch("cleanName") || editMerchant.display_name}</p>
                      {editForm.watch("category") && (
                        <Badge variant="secondary" className="text-xs">{editForm.watch("category")}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={editMutation.isPending} className="flex-1">
                    {editMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={resetMutation.isPending}
                    onClick={() => resetMutation.mutate(editMerchant.raw_name)}
                  >
                    {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" />Reset</>}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
