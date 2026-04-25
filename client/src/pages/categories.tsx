// FEATURE: CATEGORIES_MANAGEMENT | tier: free | limit: 20 categories
//
// §6.2.7 Phase B — Categories management page rewired to read directly
// from canonical_categories via /api/categories. Drops the legacy
// EXPENSE_/INCOME_/BILL_CATEGORIES enum imports + the hardcoded
// CATEGORY_ICONS display-name map; everything now flows from the merged
// system + user-owned hook.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Tag, Trash2, Edit, ShoppingCart, UtensilsCrossed, Car, Clapperboard, ShoppingBag,
  Heart, GraduationCap, Dumbbell, Zap, CreditCard, Plane, Wrench, Home, Wifi, Fuel,
  Shirt, ParkingCircle, User, Banknote, Coffee, Train, CarTaxiFront, Sparkles,
  Sofa, FileCheck, Briefcase, Building2, MoreHorizontal, DollarSign, Laptop,
  TrendingUp, Gift, RotateCcw, Receipt, Phone, Tv, Shield, Stethoscope,
  Music, Cloud, Gamepad2, Newspaper, BookOpen, Baby, Dog, Scissors, Pill,
  Droplets, Flame, Trash, Landmark, PiggyBank, CircleDollarSign,
  type LucideIcon,
} from "lucide-react";
import {
  useCanonicalCategories,
  useExpenseCategories,
  useBillCategories,
  useIncomeCategories,
} from "@/lib/canonical-categories";
import type { CanonicalCategory } from "@shared/schema";

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b",
];

// Map icon-name strings (as stored in canonical_categories.icon) to the
// Lucide component. Falls back to Tag for unknown names. Add icons here
// when you add new canonical rows that reference them.
const ICON_BY_NAME: Record<string, LucideIcon> = {
  ShoppingCart, UtensilsCrossed, Car, Clapperboard, ShoppingBag,
  Heart, GraduationCap, Dumbbell, Zap, CreditCard, Plane, Wrench, Home, Wifi, Fuel,
  Shirt, ParkingCircle, User, Banknote, Coffee, Train, CarTaxiFront, Sparkles,
  Sofa, FileCheck, Briefcase, Building2, MoreHorizontal, DollarSign, Laptop,
  TrendingUp, Gift, RotateCcw, Receipt, Phone, Tv, Shield, Stethoscope,
  Music, Cloud, Gamepad2, Newspaper, BookOpen, Baby, Dog, Scissors, Pill,
  Droplets, Flame, Trash, Landmark, PiggyBank, CircleDollarSign, Tag,
};

function resolveIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return Tag;
  return ICON_BY_NAME[iconName] || Tag;
}

// ─── Form / dialog ──────────────────────────────────────────────────────────

interface CategoryFormData {
  displayName: string;
  type: "expense" | "income" | "bill";
  color: string;
}

function fromCanonicalToForm(cat: CanonicalCategory): CategoryFormData {
  // Map the three booleans back to a single dropdown value. User-owned rows
  // have exactly one of these set (createUserCategory enforces this).
  const type: CategoryFormData["type"] = cat.appliesToBill
    ? "bill"
    : cat.appliesToIncome
      ? "income"
      : "expense";
  return {
    displayName: cat.displayName,
    type,
    color: cat.color || "#6366f1",
  };
}

function CategoryDialog({
  onSuccess,
  editingCategory,
  open,
  onOpenChange,
}: {
  onSuccess: () => void;
  editingCategory?: CanonicalCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<CategoryFormData>({
    displayName: "",
    type: "expense",
    color: "#6366f1",
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && editingCategory) {
      setFormData(fromCanonicalToForm(editingCategory));
    } else if (newOpen && !editingCategory) {
      setFormData({ displayName: "", type: "expense", color: "#6366f1" });
    }
    onOpenChange(newOpen);
  };

  // Convert form's single `type` value to the three boolean flags the API expects.
  const buildPayload = (data: CategoryFormData) => ({
    displayName: data.displayName,
    appliesToExpense: data.type === "expense",
    appliesToBill: data.type === "bill",
    appliesToIncome: data.type === "income",
    color: data.color,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      await apiRequest("POST", "/api/categories", buildPayload(data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category created" });
      onOpenChange(false);
      setFormData({ displayName: "", type: "expense", color: "#6366f1" });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to create category", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      await apiRequest("PATCH", `/api/categories/${editingCategory!.id}`, buildPayload(data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category updated" });
      onOpenChange(false);
      setFormData({ displayName: "", type: "expense", color: "#6366f1" });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to update category", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (editingCategory) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingCategory ? "Edit Category" : "Create Custom Category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Category Name</Label>
            <Input
              id="name"
              placeholder="e.g., Pet Expenses, Side Hustle"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              data-testid="input-category-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Category Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) =>
                setFormData({ ...formData, type: value as CategoryFormData["type"] })
              }
              disabled={!!editingCategory}
            >
              <SelectTrigger data-testid="select-category-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense Category</SelectItem>
                <SelectItem value="income">Income Category</SelectItem>
                <SelectItem value="bill">Bill Category</SelectItem>
              </SelectContent>
            </Select>
            {editingCategory && (
              <p className="text-xs text-muted-foreground">Category type cannot be changed after creation</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${formData.color === color ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                  data-testid={`button-color-${color}`}
                />
              ))}
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isPending || !formData.displayName.trim()}
            className="w-full"
            data-testid="button-save-category"
          >
            {isPending ? "Saving..." : editingCategory ? "Update Category" : "Create Category"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── List items ─────────────────────────────────────────────────────────────

function SystemCategoryItem({ category }: { category: CanonicalCategory }) {
  const Icon = resolveIcon(category.icon);
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm">
      <Icon
        className="w-4 h-4 text-muted-foreground flex-shrink-0"
        style={category.color ? { color: category.color } : undefined}
      />
      <span className="truncate">{category.displayName}</span>
    </div>
  );
}

function UserCategoryItem({
  category,
  onEdit,
  onDelete,
}: {
  category: CanonicalCategory;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-2 border rounded-md hover-elevate"
      data-testid={`category-${category.id}`}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{ backgroundColor: category.color || "#6366f1" }}
        />
        <span className="text-sm">{category.displayName}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-${category.id}`}>
          <Edit className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-${category.id}`}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Categories() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CanonicalCategory | null>(null);

  const { isLoading } = useCanonicalCategories();

  // Filtered views from the unified hook. Each one mixes system (user_id IS NULL)
  // and user-owned (user_id = me) rows; we partition for display below.
  const expenseAll = useExpenseCategories();
  const billAll = useBillCategories();
  const incomeAll = useIncomeCategories();

  const partitionByOwnership = (rows: CanonicalCategory[]) => ({
    system: rows.filter((r) => r.userId === null),
    user: rows.filter((r) => r.userId !== null),
  });
  const expense = partitionByOwnership(expenseAll);
  const income = partitionByOwnership(incomeAll);
  const bill = partitionByOwnership(billAll);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete category", variant: "destructive" });
    },
  });

  const handleEditCategory = (category: CanonicalCategory) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Categories</h1>
            <HelpTooltip
              title="About Categories"
              content="Organize your finances with categories. Default categories cover common expenses, income, and bills. Create custom categories with your own colors for personalized tracking."
            />
          </div>
          <p className="text-muted-foreground">Manage expense, income, and bill categories</p>
        </div>
        <Button onClick={handleAddCategory} data-testid="button-add-category">
          <Plus className="w-4 h-4 mr-2" />
          Add Custom Category
        </Button>
      </div>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingCategory={editingCategory}
        onSuccess={() => setEditingCategory(null)}
      />

      <div className="space-y-6">
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              Expense Categories
            </CardTitle>
            <CardDescription>
              {expense.system.length} default categories + {expense.user.length} custom
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">Default Categories</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {expense.system.map((cat) => (
                  <SystemCategoryItem key={cat.id} category={cat} />
                ))}
              </div>
            </div>
            {expense.user.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Custom Categories</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {expense.user.map((cat) => (
                    <UserCategoryItem
                      key={cat.id}
                      category={cat}
                      onEdit={() => handleEditCategory(cat)}
                      onDelete={() => deleteMutation.mutate(cat.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Income Categories
            </CardTitle>
            <CardDescription>
              {income.system.length} default categories + {income.user.length} custom
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">Default Categories</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {income.system.map((cat) => (
                  <SystemCategoryItem key={cat.id} category={cat} />
                ))}
              </div>
            </div>
            {income.user.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Custom Categories</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {income.user.map((cat) => (
                    <UserCategoryItem
                      key={cat.id}
                      category={cat}
                      onEdit={() => handleEditCategory(cat)}
                      onDelete={() => deleteMutation.mutate(cat.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-orange-500" />
              Bill Categories
            </CardTitle>
            <CardDescription>
              {bill.system.length} default categories + {bill.user.length} custom
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">Default Categories</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {bill.system.map((cat) => (
                  <SystemCategoryItem key={cat.id} category={cat} />
                ))}
              </div>
            </div>
            {bill.user.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Custom Categories</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {bill.user.map((cat) => (
                    <UserCategoryItem
                      key={cat.id}
                      category={cat}
                      onEdit={() => handleEditCategory(cat)}
                      onDelete={() => deleteMutation.mutate(cat.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
