import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Droplets, Flame, Trash, Landmark, PiggyBank, CircleDollarSign
} from "lucide-react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, BILL_CATEGORIES } from "@shared/schema";

interface CustomCategory {
  id: string;
  name: string;
  type: string;
  color: string;
  icon?: string;
  isActive: string;
}

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b",
];

const CATEGORY_ICONS: Record<string, any> = {
  "Groceries": ShoppingCart,
  "Restaurant & Bars": UtensilsCrossed,
  "Transportation": Car,
  "Entertainment": Clapperboard,
  "Shopping": ShoppingBag,
  "Healthcare": Heart,
  "Education": GraduationCap,
  "Fitness": Dumbbell,
  "Electrical": Zap,
  "Credit Card": CreditCard,
  "Travel": Plane,
  "Maintenance": Wrench,
  "Mortgage": Home,
  "Communications": Wifi,
  "Gas": Fuel,
  "Clothing": Shirt,
  "Parking & Tolls": ParkingCircle,
  "Personal": User,
  "Cash & ATM": Banknote,
  "Coffee Shops": Coffee,
  "Public Transit": Train,
  "Taxi & Ride Share": CarTaxiFront,
  "Fun Money": Sparkles,
  "Furniture & Houseware": Sofa,
  "Check": FileCheck,
  "Business Travel & Meals": Briefcase,
  "Business Auto Expenses": Building2,
  "Other": MoreHorizontal,
  "Salary": DollarSign,
  "Freelance": Laptop,
  "Business": Briefcase,
  "Investments": TrendingUp,
  "Rental": Home,
  "Gifts": Gift,
  "Refunds": RotateCcw,
  "Rent": Home,
  "Utilities": Zap,
  "Internet": Wifi,
  "Phone": Phone,
  "Subscriptions": Tv,
  "Insurance": Shield,
  "Medical": Stethoscope,
  "Loans": Landmark,
  "Streaming": Tv,
  "Music": Music,
  "Cloud Storage": Cloud,
  "Gaming": Gamepad2,
  "News & Magazines": Newspaper,
  "Learning": BookOpen,
  "Childcare": Baby,
  "Pet Care": Dog,
  "Beauty": Scissors,
  "Pharmacy": Pill,
  "Water": Droplets,
  "Heating": Flame,
  "Waste": Trash,
  "Savings": PiggyBank,
  "Membership": CircleDollarSign,
};

function getCategoryIcon(categoryName: string) {
  const IconComponent = CATEGORY_ICONS[categoryName] || Tag;
  return IconComponent;
}

function CategoryDialog({
  onSuccess,
  editingCategory,
  open,
  onOpenChange
}: {
  onSuccess: () => void;
  editingCategory?: CustomCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    type: "expense",
    color: "#6366f1",
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && editingCategory) {
      setFormData({
        name: editingCategory.name,
        type: editingCategory.type,
        color: editingCategory.color,
      });
    } else if (newOpen && !editingCategory) {
      setFormData({ name: "", type: "expense", color: "#6366f1" });
    }
    onOpenChange(newOpen);
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/custom-categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      toast({ title: "Category created" });
      onOpenChange(false);
      setFormData({ name: "", type: "expense", color: "#6366f1" });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to create category", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/custom-categories/${editingCategory!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      toast({ title: "Category updated" });
      onOpenChange(false);
      setFormData({ name: "", type: "expense", color: "#6366f1" });
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
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              data-testid="input-category-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Category Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
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
            disabled={isPending || !formData.name}
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

function CategoryItem({ name, color }: { name: string; color?: string }) {
  const Icon = getCategoryIcon(name);
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" style={color ? { color } : undefined} />
      <span className="truncate">{name}</span>
    </div>
  );
}

function CustomCategoryItem({ 
  category, 
  onEdit, 
  onDelete 
}: { 
  category: CustomCategory; 
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
          style={{ backgroundColor: category.color }}
        />
        <span className="text-sm">{category.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          data-testid={`button-edit-${category.id}`}
        >
          <Edit className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          data-testid={`button-delete-${category.id}`}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function Categories() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);

  const { data: customCategories = [], isLoading } = useQuery<CustomCategory[]>({
    queryKey: ["/api/custom-categories"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/custom-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      toast({ title: "Category deleted" });
    },
  });

  const handleEditCategory = (category: CustomCategory) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const expenseCategories = customCategories.filter(c => c.type === "expense");
  const incomeCategories = customCategories.filter(c => c.type === "income");
  const billCategories = customCategories.filter(c => c.type === "bill");

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              Expense Categories
            </CardTitle>
            <CardDescription>
              {EXPENSE_CATEGORIES.length} default categories + {expenseCategories.length} custom
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">Default Categories</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <CategoryItem key={cat} name={cat} />
                ))}
              </div>
            </div>
            {expenseCategories.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Custom Categories</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {expenseCategories.map((cat) => (
                    <CustomCategoryItem
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Income Categories
            </CardTitle>
            <CardDescription>
              {INCOME_CATEGORIES.length} default categories + {incomeCategories.length} custom
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">Default Categories</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {INCOME_CATEGORIES.map((cat) => (
                  <CategoryItem key={cat} name={cat} />
                ))}
              </div>
            </div>
            {incomeCategories.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Custom Categories</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {incomeCategories.map((cat) => (
                    <CustomCategoryItem
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-orange-500" />
              Bill Categories
            </CardTitle>
            <CardDescription>
              {BILL_CATEGORIES.length} default categories + {billCategories.length} custom
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-3">Default Categories</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {BILL_CATEGORIES.map((cat) => (
                  <CategoryItem key={cat} name={cat} />
                ))}
              </div>
            </div>
            {billCategories.length > 0 && (
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">Custom Categories</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {billCategories.map((cat) => (
                    <CustomCategoryItem
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
