// FEATURE: FINANCIAL_VAULT | tier: pro | limit: disabled (free), 50 docs (pro), 100 docs (family)
// FEATURE: VAULT_AI_SEARCH | tier: pro | limit: unlimited
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Shield, Upload, Search, Grid3X3, List, Star, MoreVertical, Download,
  MessageSquare, Pencil, FolderOpen, Trash2, X, FileText, FileImage,
  FileSpreadsheet, File, ChevronRight, ChevronLeft, Send, Loader2,
  Lock, Sparkles, Bell, HardDrive, Eye, RefreshCw, Filter, SortAsc
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays, parseISO } from "date-fns";
import { FeatureGate } from "@/components/FeatureGate";

// ─── Types ────────────────────────────────────────────────────────────────────
interface VaultDocument {
  id: string;
  user_id: string;
  file_name: string;
  display_name: string | null;
  file_key: string;
  file_size: number | null;
  file_type: string | null;
  mime_type: string | null;
  category: string;
  subcategory: string | null;
  description: string | null;
  extracted_data: Record<string, any> | null;
  ai_summary: string | null;
  ai_processing_status: string | null;
  tags: string[] | null;
  expiry_date: string | null;
  expiry_notified: boolean;
  is_favorite: boolean;
  uploaded_at: string;
  updated_at: string;
  signedUrl?: string;
  conversations?: AiConversation[];
}

interface AiConversation {
  id: string;
  document_id: string;
  question: string;
  answer: string;
  created_at: string;
}

interface StorageStats {
  totalFiles: number;
  totalBytes: number;
  totalMB: string;
  byCategory: { category: string; count: string; bytes: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "all", label: "All Documents" },
  { value: "tax", label: "Tax Documents" },
  { value: "insurance", label: "Insurance" },
  { value: "loan", label: "Loans & Mortgages" },
  { value: "investment", label: "Investments" },
  { value: "warranty", label: "Warranties" },
  { value: "utility", label: "Utilities" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  tax: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  insurance: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  loan: "bg-red-500/20 text-red-400 border-red-500/30",
  investment: "bg-green-500/20 text-green-400 border-green-500/30",
  warranty: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  utility: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  other: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null, className = "h-8 w-8") {
  if (!mimeType) return <File className={className} />;
  if (mimeType === "application/pdf") return <FileText className={`${className} text-red-400`} />;
  if (mimeType.startsWith("image/")) return <FileImage className={`${className} text-blue-400`} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className={`${className} text-green-400`} />;
  if (mimeType.includes("word") || mimeType.includes("document"))
    return <FileText className={`${className} text-blue-500`} />;
  return <File className={className} />;
}

function getExpiryBadge(expiryDate: string | null) {
  if (!expiryDate) return null;
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Expired</Badge>;
  if (days <= 30) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Expires in {days}d</Badge>;
  if (days <= 90) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Expires in {days}d</Badge>;
  return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">{format(parseISO(expiryDate), "MMM d, yyyy")}</Badge>;
}

// ─── Onboarding Tutorial ──────────────────────────────────────────────────────
function OnboardingTutorial({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to your Financial Vault",
      body: "This is your secure home for all important financial documents. Completely private, always accessible, powered by AI.",
      button: "Show me around →",
    },
    {
      title: "Upload any financial document",
      body: "Click here to upload PDFs, images, or spreadsheets. You can upload up to 10 files at once. Our AI will read and understand each document automatically.",
      button: "Next →",
    },
    {
      title: "Stay organized effortlessly",
      body: "Documents are automatically sorted into categories. Filter by Tax Documents, Insurance, Loans, and more to find what you need instantly.",
      button: "Next →",
    },
    {
      title: "Ask AI anything about your documents",
      body: "Click any document and go to the AI Assistant tab. Ask questions like 'What is my deductible?' or 'When does this expire?' and get instant answers.",
      button: "Next →",
    },
    {
      title: "Never miss an expiry date",
      body: "When you upload insurance policies or warranties, we automatically detect expiry dates and email you 30 days before they expire. Set it and forget it.",
      button: "Let's go! 🚀",
    },
  ];

  const current = steps[step];

  const handleNext = () => {
    if (step === steps.length - 1) {
      localStorage.setItem("vault_tutorial_complete", "true");
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-12 sm:items-center">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl bg-card border shadow-2xl p-6">
        <button
          onClick={() => {
            localStorage.setItem("vault_tutorial_complete", "true");
            onComplete();
          }}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground text-xs"
        >
          Skip tutorial
        </button>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div className="text-xs text-muted-foreground">Step {step + 1} of {steps.length}</div>
        </div>
        <h3 className="text-lg font-bold mb-2">{current.title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{current.body}</p>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all ${i === step ? "w-5 bg-amber-400" : "w-2 bg-muted"}`} />
            ))}
          </div>
          <Button size="sm" onClick={handleNext} className="bg-amber-500 hover:bg-amber-600 text-white">
            {current.button}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
interface UploadFile {
  file: File;
  displayName: string;
  category: string;
  expiryDate: string;
  id: string;
}

function UploadModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, "pending" | "done" | "error">>({});
  const [uploadDone, setUploadDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const guessCategory = (filename: string): string => {
    const lower = filename.toLowerCase();
    if (lower.includes("t4") || lower.includes("t1") || lower.includes("tax") || lower.includes("notice")) return "tax";
    if (lower.includes("insurance") || lower.includes("policy") || lower.includes("insur")) return "insurance";
    if (lower.includes("mortgage") || lower.includes("loan")) return "loan";
    if (lower.includes("invest") || lower.includes("rrsp") || lower.includes("tfsa")) return "investment";
    if (lower.includes("warrant")) return "warranty";
    if (lower.includes("bill") || lower.includes("hydro") || lower.includes("electric") || lower.includes("utility")) return "utility";
    return "other";
  };

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles).slice(0, 10 - files.length);
    const mapped: UploadFile[] = arr.map(f => ({
      file: f,
      displayName: f.name.replace(/\.[^.]+$/, ""),
      category: guessCategory(f.name),
      expiryDate: "",
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    setFiles(prev => [...prev, ...mapped].slice(0, 10));
  };

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));
  const updateFile = (id: string, patch: Partial<UploadFile>) => setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

  const handleUploadAll = async () => {
    if (files.length === 0) return;
    setUploading(true);
    const prog: Record<string, "pending" | "done" | "error"> = {};
    files.forEach(f => { prog[f.id] = "pending"; });
    setUploadProgress({ ...prog });

    for (const f of files) {
      try {
        const formData = new FormData();
        formData.append("file", f.file);
        formData.append("display_name", f.displayName);
        formData.append("category", f.category);
        if (f.expiryDate) formData.append("expiry_date", f.expiryDate);

        const res = await fetch("/api/vault/upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        prog[f.id] = "done";
      } catch {
        prog[f.id] = "error";
      }
      setUploadProgress({ ...prog });
    }

    setUploading(false);
    setUploadDone(true);
    toast({ title: "Upload complete", description: "AI is analyzing your documents..." });
    setTimeout(() => {
      onSuccess();
      onClose();
      setFiles([]);
      setUploadDone(false);
    }, 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border shadow-2xl">
        <div className="sticky top-0 bg-card border-b p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Upload Documents</h2>
            <p className="text-xs text-muted-foreground">Up to 10 files · 50MB each</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {uploadDone ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">Documents Uploaded!</h3>
              <p className="text-muted-foreground text-sm flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                AI is analyzing your documents...
              </p>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-amber-400 bg-amber-400/5" : "border-border hover:border-amber-400/50"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium mb-1">Drag files here or click to browse</p>
                <p className="text-xs text-muted-foreground">PDF, Images, Word, Excel, CSV · 50MB per file</p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  className="hidden"
                  onChange={e => addFiles(e.target.files)}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{files.length} file{files.length !== 1 ? "s" : ""} selected</p>
                  {files.map(f => (
                    <div key={f.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {getFileIcon(f.file.type, "h-5 w-5")}
                        <span className="text-sm font-medium flex-1 truncate">{f.file.name}</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(f.file.size)}</span>
                        {uploadProgress[f.id] === "done" && <span className="text-emerald-400 text-xs">✓</span>}
                        {uploadProgress[f.id] === "error" && <span className="text-red-400 text-xs">✗</span>}
                        {uploadProgress[f.id] === "pending" && uploading && <Loader2 className="h-3 w-3 animate-spin" />}
                        {!uploading && <button onClick={() => removeFile(f.id)}><X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" /></button>}
                      </div>
                      {!uploading && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={f.displayName}
                            onChange={e => updateFile(f.id, { displayName: e.target.value })}
                            placeholder="Display name"
                            className="h-7 text-xs"
                          />
                          <Select value={f.category} onValueChange={v => updateFile(f.id, { category: v })}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.filter(c => c.value !== "all").map(c => (
                                <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="date"
                            value={f.expiryDate}
                            onChange={e => updateFile(f.id, { expiryDate: e.target.value })}
                            placeholder="Expiry date (optional)"
                            className="h-7 text-xs col-span-2"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                disabled={files.length === 0 || uploading}
                onClick={handleUploadAll}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Upload All ({files.length} file{files.length !== 1 ? "s" : ""})</>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Document Drawer ──────────────────────────────────────────────────────────
function DocumentDrawer({ doc, onClose, onUpdate }: { doc: VaultDocument; onClose: () => void; onUpdate: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"document" | "ai">("document");
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(doc.display_name || doc.file_name);
  const [category, setCategory] = useState(doc.category);
  const [description, setDescription] = useState(doc.description || "");
  const [expiryDate, setExpiryDate] = useState(doc.expiry_date ? doc.expiry_date.split("T")[0] : "");
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState<AiConversation[]>(doc.conversations || []);
  const [asking, setAsking] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: fullDoc, isLoading: loadingDoc } = useQuery<{ success: boolean; data: VaultDocument }>({
    queryKey: [`/api/vault/documents/${doc.id}`],
    // Poll every 3 seconds while AI is still pending; stop once completed or failed
    refetchInterval: (query) => {
      const data = query.state.data as { success: boolean; data: VaultDocument } | undefined;
      const status = data?.data?.ai_processing_status;
      if (status === "completed" || status === "failed") return false;
      return 3000;
    },
  });

  const currentDoc = fullDoc?.data || doc;
  const conversations2 = currentDoc.conversations || conversations;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations2]);

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/vault/documents/${doc.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, category, description, expiry_date: expiryDate || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Saved", description: "Document updated successfully" });
      setEditing(false);
      onUpdate();
      queryClient.invalidateQueries({ queryKey: [`/api/vault/documents/${doc.id}`] });
    } catch {
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    }
  };

  const handleAsk = async () => {
    if (!question.trim() || asking) return;
    const q = question.trim();
    setQuestion("");
    setAsking(true);
    try {
      const res = await fetch(`/api/vault/documents/${doc.id}/ask`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setConversations(prev => [...prev, {
        id: Date.now().toString(),
        document_id: doc.id,
        question: q,
        answer: data.data.answer,
        created_at: new Date().toISOString(),
      }]);
    } catch {
      toast({ title: "Error", description: "Failed to get AI response", variant: "destructive" });
    } finally {
      setAsking(false);
    }
  };

  const handleReprocess = async () => {
    if (reprocessing) return;
    setReprocessing(true);
    try {
      const res = await fetch(`/api/vault/documents/${doc.id}/reprocess`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "AI analysis started", description: "Analyzing your document again..." });
      queryClient.invalidateQueries({ queryKey: [`/api/vault/documents/${doc.id}`] });
    } catch {
      toast({ title: "Error", description: "Failed to start AI analysis", variant: "destructive" });
    } finally {
      setReprocessing(false);
    }
  };

  const exampleQuestions: Record<string, string[]> = {
    insurance: ["What is my deductible?", "When does this policy expire?", "What is covered?"],
    tax: ["What is my total income?", "What year is this for?", "What employer issued this?"],
    loan: ["What is my interest rate?", "When is my final payment?", "What is my current balance?"],
    default: ["Summarize this document", "Are there any important dates?", "What action do I need to take?"],
  };
  const qExamples = exampleQuestions[currentDoc.category] || exampleQuestions.default;

  const extractedData = currentDoc.extracted_data;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl lg:max-w-2xl bg-card border-l shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="border-b p-4 flex items-start justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {getFileIcon(currentDoc.mime_type, "h-8 w-8 shrink-0")}
            <div className="min-w-0">
              <h2 className="font-bold truncate">{currentDoc.display_name || currentDoc.file_name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge className={`text-xs ${CATEGORY_COLORS[currentDoc.category] || CATEGORY_COLORS.other}`}>
                  {CATEGORIES.find(c => c.value === currentDoc.category)?.label || currentDoc.category}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatFileSize(currentDoc.file_size)}</span>
                {getExpiryBadge(currentDoc.expiry_date)}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={v => setTab(v as any)} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="mx-4 mt-3 shrink-0">
            <TabsTrigger value="document" className="flex-1">Document</TabsTrigger>
            <TabsTrigger value="ai" className="flex-1">AI Assistant</TabsTrigger>
          </TabsList>

          {/* Document Tab */}
          <TabsContent value="document" className="flex-1 overflow-y-auto p-4 space-y-4 mt-0">
            {/* Preview */}
            {currentDoc.signedUrl && (
              <div className="rounded-xl overflow-hidden border bg-muted/30 max-h-72">
                {currentDoc.mime_type?.startsWith("image/") ? (
                  <img src={currentDoc.signedUrl} alt={currentDoc.file_name} className="w-full h-full object-contain" />
                ) : currentDoc.mime_type === "application/pdf" ? (
                  <iframe src={currentDoc.signedUrl} className="w-full h-72" title="PDF Preview" />
                ) : (
                  <div className="flex items-center justify-center h-40 gap-3">
                    {getFileIcon(currentDoc.mime_type, "h-12 w-12")}
                    <div>
                      <p className="font-medium">{currentDoc.file_name}</p>
                      <a href={currentDoc.signedUrl} download className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                        <Download className="h-3 w-3" />Download to view
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Details</h3>
                <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)} className="h-7 text-xs">
                  {editing ? "Cancel" : <><Pencil className="h-3 w-3 mr-1" />Edit</>}
                </Button>
              </div>

              {editing ? (
                <div className="space-y-2">
                  <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name" className="text-sm" />
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c.value !== "all").map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="text-sm resize-none" rows={2} />
                  <div>
                    <label className="text-xs text-muted-foreground">Expiry Date (optional)</label>
                    <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="text-sm mt-1" />
                  </div>
                  <Button size="sm" onClick={handleSave} className="bg-amber-500 hover:bg-amber-600 text-white">Save Changes</Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><span className="text-muted-foreground text-xs">Name</span><p className="font-medium truncate">{currentDoc.display_name || currentDoc.file_name}</p></div>
                  <div><span className="text-muted-foreground text-xs">Category</span><p className="font-medium capitalize">{currentDoc.category}</p></div>
                  <div><span className="text-muted-foreground text-xs">Size</span><p className="font-medium">{formatFileSize(currentDoc.file_size)}</p></div>
                  <div><span className="text-muted-foreground text-xs">Type</span><p className="font-medium">{currentDoc.file_type || "—"}</p></div>
                  <div><span className="text-muted-foreground text-xs">Uploaded</span><p className="font-medium">{format(new Date(currentDoc.uploaded_at), "MMM d, yyyy")}</p></div>
                  {currentDoc.expiry_date && <div><span className="text-muted-foreground text-xs">Expires</span><p className="font-medium">{format(parseISO(currentDoc.expiry_date), "MMM d, yyyy")}</p></div>}
                  {currentDoc.description && <div className="col-span-2"><span className="text-muted-foreground text-xs">Description</span><p>{currentDoc.description}</p></div>}
                </div>
              )}

              {currentDoc.tags && currentDoc.tags.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {currentDoc.tags.map(tag => (
                      <span key={tag} className="text-xs bg-muted px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* AI Tab */}
          <TabsContent value="ai" className="flex-1 flex flex-col overflow-hidden mt-0 px-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* AI Summary */}
              {currentDoc.ai_processing_status === "failed" ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-red-500/20 flex items-center justify-center">
                      <X className="h-3 w-3 text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-400">AI analysis could not be completed</p>
                      <p className="text-xs text-muted-foreground mt-0.5">There was a problem analyzing this document. You can try again.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                        onClick={handleReprocess}
                        disabled={reprocessing}
                      >
                        {reprocessing ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                        Retry AI Analysis
                      </Button>
                    </div>
                  </div>
                </div>
              ) : currentDoc.ai_summary ? (
                <div className="rounded-xl border bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-semibold">AI Summary</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{currentDoc.ai_summary}</p>
                </div>
              ) : currentDoc.ai_processing_status !== "completed" ? (
                <div className="rounded-xl border bg-amber-500/5 p-4 flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">AI is reading your document...</p>
                    <p className="text-xs text-muted-foreground">This usually takes a few seconds</p>
                  </div>
                </div>
              ) : null}

              {/* Extracted data */}
              {extractedData && Object.keys(extractedData).length > 0 && (
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-semibold mb-3">Key Information</p>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(extractedData).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-start gap-2 text-sm">
                        <span className="text-muted-foreground capitalize shrink-0">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                        <span className="font-medium text-right break-all">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation */}
              <div>
                <p className="text-sm font-semibold mb-3">Ask anything about this document</p>

                {conversations2.length > 0 && (
                  <div className="space-y-3 mb-3">
                    {conversations2.map((conv) => (
                      <div key={conv.id} className="space-y-2">
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm">
                            {conv.question}
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
                            {conv.answer}
                          </div>
                        </div>
                      </div>
                    ))}
                    {asking && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                          <div className="flex gap-1">
                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Example questions */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {qExamples.map(q => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className="text-xs px-2.5 py-1 rounded-full border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat input */}
            <div className="border-t p-3 shrink-0">
              <div className="flex gap-2">
                <Input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="Ask a question..."
                  className="text-sm"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
                  disabled={asking}
                />
                <Button size="icon" onClick={handleAsk} disabled={!question.trim() || asking} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
                  {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onUpload }: { onUpload: () => void }) {
  const chips = ["T4 Tax Form", "Insurance Policy", "Mortgage Statement", "Car Warranty", "Investment Statement"];
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-6">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="30" width="80" height="70" rx="8" fill="currentColor" className="text-muted/30" />
          <rect x="30" y="20" width="60" height="70" rx="8" fill="currentColor" className="text-muted/50" />
          <rect x="40" y="10" width="40" height="70" rx="8" fill="currentColor" className="text-muted/70" />
          <circle cx="60" cy="55" r="15" fill="currentColor" className="text-amber-500/30" />
          <path d="M54 55l4 4 8-8" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold mb-2">Your vault is empty</h2>
      <p className="text-muted-foreground max-w-sm mb-6 text-sm leading-relaxed">
        Upload your first document and let AI do the heavy lifting. Tax returns, insurance policies, warranties — keep everything in one secure place.
      </p>
      <Button onClick={onUpload} className="bg-amber-500 hover:bg-amber-600 text-white mb-6">
        <Upload className="h-4 w-4 mr-2" />Upload Your First Document
      </Button>
      <div className="flex flex-wrap gap-2 justify-center">
        {chips.map(c => (
          <button
            key={c}
            onClick={onUpload}
            className="text-xs px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 transition-colors"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Document Card ─────────────────────────────────────────────────────────────
function DocumentCard({ doc, onClick, onDelete, onToggleFavorite }: {
  doc: VaultDocument;
  onClick: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const aiProcessing = doc.ai_processing_status === "pending";
  const aiFailed = doc.ai_processing_status === "failed";

  return (
    <div
      className="border rounded-xl bg-card hover:border-amber-500/40 transition-all cursor-pointer group relative overflow-hidden"
      onClick={onClick}
    >
      {/* AI processing indicator */}
      {aiProcessing && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-amber-500/20 border border-amber-500/30 rounded-full px-2 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] text-amber-400 font-medium">AI Reading...</span>
        </div>
      )}
      {aiFailed && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-red-500/20 border border-red-500/30 rounded-full px-2 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="text-[10px] text-red-400 font-medium">AI Failed</span>
        </div>
      )}

      <div className="p-4">
        {/* File icon / thumbnail */}
        <div className="mb-3">
          {doc.mime_type?.startsWith("image/") && doc.signedUrl ? (
            <img src={doc.signedUrl} alt={doc.file_name} className="w-full h-24 object-cover rounded-lg" />
          ) : (
            <div className="h-16 flex items-center justify-center">
              {getFileIcon(doc.mime_type, "h-10 w-10")}
            </div>
          )}
        </div>

        {/* Name */}
        <p className="font-medium text-sm truncate mb-1.5" title={doc.display_name || doc.file_name}>
          {doc.display_name || doc.file_name}
        </p>

        {/* Category badge */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <Badge className={`text-xs ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}>
            {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
          </Badge>
          {getExpiryBadge(doc.expiry_date)}
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatFileSize(doc.file_size)}</span>
          <span>{format(new Date(doc.uploaded_at), "MMM d, yyyy")}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t px-3 py-2 flex items-center justify-between">
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          className={`p-1 rounded hover:bg-muted transition-colors ${doc.is_favorite ? "text-amber-400" : "text-muted-foreground"}`}
        >
          <Star className={`h-3.5 w-3.5 ${doc.is_favorite ? "fill-current" : ""}`} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={e => e.stopPropagation()}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onClick(); }}>
              <Eye className="h-3.5 w-3.5 mr-2" />View
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async e => {
                e.stopPropagation();
                const res = await fetch(`/api/vault/documents/${doc.id}/download`, { credentials: "include" });
                const data = await res.json();
                if (data.data?.signedUrl) window.open(data.data.signedUrl, "_blank");
              }}
            >
              <Download className="h-3.5 w-3.5 mr-2" />Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onDelete(); }} className="text-red-400 focus:text-red-400">
              <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VaultPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("vault_tutorial_complete")) {
      setShowTutorial(true);
    }
    if (!localStorage.getItem("vault_welcome_dismissed")) {
      setShowWelcomeBanner(true);
    }
  }, []);

  const { data: docsData, isLoading } = useQuery<{ success: boolean; data: { documents: VaultDocument[]; total: number } }>({
    queryKey: ["/api/vault/documents", activeCategory, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (search) params.set("search", search);
      const res = await fetch(`/api/vault/documents?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: statsData } = useQuery<{ success: boolean; data: StorageStats }>({
    queryKey: ["/api/vault/storage-stats"],
  });

  const { data: allDocsData } = useQuery<{ success: boolean; data: { documents: VaultDocument[]; total: number } }>({
    queryKey: ["/api/vault/documents", "all", ""],
    queryFn: async () => {
      const res = await fetch("/api/vault/documents?limit=100", { credentials: "include" });
      return res.json();
    },
  });

  const documents = docsData?.data?.documents || [];
  const stats = statsData?.data;

  // Category counts
  const allDocs = allDocsData?.data?.documents || [];
  const categoryCounts: Record<string, number> = { all: allDocs.length };
  for (const d of allDocs) {
    categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      await fetch(`/api/vault/documents/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Deleted", description: "Document removed from vault" });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/storage-stats"] });
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch {
      toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
    }
  };

  const handleToggleFavorite = async (doc: VaultDocument) => {
    try {
      await fetch(`/api/vault/documents/${doc.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: !doc.is_favorite }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vault/documents"] });
    } catch {
      toast({ title: "Error", description: "Failed to update favorite", variant: "destructive" });
    }
  };

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/vault/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vault/storage-stats"] });
  };

  return (
    <div className="space-y-4">
      {/* Tutorial */}
      {showTutorial && <OnboardingTutorial onComplete={() => setShowTutorial(false)} />}

      {/* Welcome Banner */}
      {showWelcomeBanner && (
        <div className="relative rounded-xl border bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent p-5 overflow-hidden">
          <button
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setShowWelcomeBanner(false);
              localStorage.setItem("vault_welcome_dismissed", "true");
            }}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-4 pr-8">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <Lock className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold mb-1">Welcome to your Financial Vault 🔒</h2>
              <p className="text-sm text-muted-foreground mb-3">
                Store all your important financial documents in one secure place. Our AI automatically reads and understands your documents so you can ask questions, find information instantly, and never miss an expiry date.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: Sparkles, title: "AI-Powered Understanding", desc: "Ask any question about your documents" },
                  { icon: Bell, title: "Expiry Alerts", desc: "Never miss an insurance renewal or warranty" },
                  { icon: HardDrive, title: "Unlimited Storage", desc: "Store everything, no limits" },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-2 text-sm">
                    <Icon className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{title}</p>
                      <p className="text-muted-foreground text-xs">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="mt-3 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => {
                  setShowWelcomeBanner(false);
                  localStorage.setItem("vault_welcome_dismissed", "true");
                }}
              >
                Got it, let's go!
              </Button>
            </div>
          </div>
        </div>
      )}

      <FeatureGate
        feature="financial_vault"
        displayName="vault documents"
        bullets={[
          "Store sensitive financial documents securely",
          "Search and organize documents in one protected place",
          "Prepare records faster for taxes and reviews",
        ]}
      >
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-400/10 to-transparent border p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <Shield className="h-7 w-7 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Financial Vault</h1>
                <p className="text-muted-foreground text-sm">Your secure, AI-powered document storage. Unlimited storage included.</p>
                {stats && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {stats.totalFiles} document{stats.totalFiles !== 1 ? "s" : ""} · {stats.totalMB} MB used
                  </p>
                )}
              </div>
            </div>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
              onClick={() => setShowUpload(true)}
            >
              <Upload className="h-4 w-4 mr-2" />Upload Documents
            </Button>
          </div>
        </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all border ${
              activeCategory === cat.value
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-card hover:bg-muted border-border text-muted-foreground"
            }`}
          >
            {cat.label}
            {categoryCounts[cat.value] !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeCategory === cat.value ? "bg-white/20" : "bg-muted"}`}>
                {categoryCounts[cat.value] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents, tags, or content..."
            className="pl-9"
          />
        </div>
        <div className="flex border rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 ${viewMode === "grid" ? "bg-muted" : "hover:bg-muted/50"} transition-colors`}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 ${viewMode === "list" ? "bg-muted" : "hover:bg-muted/50"} transition-colors`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Documents */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="border rounded-xl h-48 bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState onUpload={() => setShowUpload(true)} />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map(doc => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onClick={() => setSelectedDoc(doc)}
              onDelete={() => handleDelete(doc.id)}
              onToggleFavorite={() => handleToggleFavorite(doc)}
            />
          ))}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">Category</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Size</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Uploaded</th>
                <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Expiry</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr
                  key={doc.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {getFileIcon(doc.mime_type, "h-5 w-5 shrink-0")}
                      <span className="font-medium truncate max-w-[200px]">{doc.display_name || doc.file_name}</span>
                    </div>
                  </td>
                  <td className="p-3 hidden sm:table-cell">
                    <Badge className={`text-xs ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}>
                      {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{formatFileSize(doc.file_size)}</td>
                  <td className="p-3 text-muted-foreground hidden lg:table-cell">{format(new Date(doc.uploaded_at), "MMM d, yyyy")}</td>
                  <td className="p-3 hidden md:table-cell">{getExpiryBadge(doc.expiry_date)}</td>
                  <td className="p-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button onClick={e => e.stopPropagation()} className="p-1 rounded hover:bg-muted">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); setSelectedDoc(doc); }}>
                          <Eye className="h-3.5 w-3.5 mr-2" />View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(doc.id); }} className="text-red-400">
                          <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </FeatureGate>

      {/* Upload Modal */}
      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* Document Drawer */}
      {selectedDoc && (
        <DocumentDrawer
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/vault/documents"] });
          }}
        />
      )}
    </div>
  );
}
