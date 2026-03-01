import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, FileText, CheckCircle, XCircle, Loader2, Image as ImageIcon, File, Video, VideoOff, Printer, Trash2, Link2, PencilLine, Receipt, LayoutList } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  category: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  confidence: number;
}

interface TransactionMatch {
  transactionId: string;
  receiptId: string;
  confidence: number;
  matchedAmount: number;
  matchedMerchant: string;
  status: 'auto-matched' | 'needs-review' | 'manual-match';
}

interface UploadResult {
  id: string;
  receipt: ReceiptData;
  matches: TransactionMatch[];
  signedUrl: string;
}

interface StoredReceipt {
  id: string;
  userId: string;
  merchant: string;
  amount: string;
  date: string;
  category: string;
  items: string | null;
  confidence: number;
  imageUrl: string | null;
  matchedTransactionId: string | null;
  matchStatus: string;
  notes: string | null;
  createdAt: string | null;
}

export default function ReceiptScanner() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'results' | 'library'>('upload');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<StoredReceipt | null>(null);
  const [editFields, setEditFields] = useState<{ category: string; notes: string; merchant: string }>({ category: '', notes: '', merchant: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(track => track.stop());
    };
  }, [cameraStream]);

  // Attach stream to video element when it becomes available
  useEffect(() => {
    if (showCamera && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [showCamera, cameraStream]);

  // Load stored receipts
  const { data: libraryData, isLoading: libraryLoading } = useQuery({
    queryKey: ['/api/receipts'],
    queryFn: async () => {
      const res = await fetch('/api/receipts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load receipts');
      return res.json();
    },
  });

  const storedReceipts: StoredReceipt[] = libraryData?.data?.receipts ?? [];

  // Delete receipt mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      toast({ title: 'Receipt deleted' });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
  });

  // Update receipt mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; category?: string; notes?: string; merchant?: string }) => {
      const res = await fetch(`/api/receipts/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Update failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      setEditingReceipt(null);
      toast({ title: 'Receipt updated' });
    },
    onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
  });

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setCameraStream(stream);
      setShowCamera(true);
    } catch (err: any) {
      toast({ title: 'Camera unavailable', description: 'Could not access camera. Please use the file upload option instead.', variant: 'destructive' });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    cameraStream?.getTracks().forEach(track => track.stop());
    setCameraStream(null);
    setShowCamera(false);
  }, [cameraStream]);

  const takePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (blob) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `receipt-${timestamp}.jpg`, { type: 'image/jpeg' });
        setSelectedFiles(prev => [...prev, file]);
        toast({ title: 'Photo captured', description: 'Receipt photo added. You can take more or process now.' });
      }
    }, 'image/jpeg', 0.92);
    stopCamera();
  }, [stopCamera, toast]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    const validFiles = files.filter(file => validTypes.includes(file.type));

    if (validFiles.length !== files.length) {
      toast({ title: 'Invalid file type', description: 'Only JPEG, PNG, GIF, WEBP, and PDF files are allowed.', variant: 'destructive' });
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
    try { event.target.value = ''; } catch { /* ignore */ }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadReceipts = async () => {
    if (selectedFiles.length === 0) {
      toast({ title: 'No files selected', description: 'Please select at least one receipt to upload.', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => formData.append('receipts', file));

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) { clearInterval(progressInterval); return prev; }
          return prev + 8;
        });
      }, 400);

      const response = await fetch('/api/receipts/upload-multiple', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (${response.status})`);
      }

      const data = await response.json();

      if (data.success) {
        const successResults: UploadResult[] = data.results
          .filter((r: any) => r.success)
          .map((r: any) => r.data);
        setResults(successResults);
        setSelectedFiles([]);
        setActiveTab('results');
        queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });

        // Check if any receipts had OCR failures
        const ocrFailures = data.results.filter((r: any) => r.success && r.data?.ocrError);
        if (ocrFailures.length > 0) {
          toast({
            title: 'Receipts stored, OCR incomplete',
            description: `${successResults.length} receipt(s) saved to storage. OCR extraction failed — you can edit details manually.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Processing complete',
            description: `${successResults.length} of ${selectedFiles.length} receipts processed successfully`,
          });
        }
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message || 'Please try again', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const triggerFileSelect = () => fileInputRef.current?.click();

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon className="h-5 w-5" />;
    if (file.type === 'application/pdf') return <FileText className="h-5 w-5" />;
    return <File className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? '$0.00' : `$${num.toFixed(2)}`;
  };

  const handlePrintReceipts = () => {
    window.print();
  };

  const openEditModal = (r: StoredReceipt) => {
    setEditingReceipt(r);
    setEditFields({ category: r.category, notes: r.notes ?? '', merchant: r.merchant });
  };

  const saveEdit = () => {
    if (!editingReceipt) return;
    updateMutation.mutate({ id: editingReceipt.id, ...editFields });
  };

  const CATEGORIES = [
    'Groceries', 'Restaurant & Bars', 'Transportation', 'Entertainment', 'Shopping',
    'Healthcare', 'Education', 'Fitness', 'Travel', 'Maintenance', 'Communications',
    'Gas', 'Clothing', 'Coffee Shops', 'Business Travel & Meals', 'Business Auto Expenses',
    'Uncategorized', 'Other'
  ];

  const matchStatusBadge = (status: string) => {
    if (status === 'auto-matched') return <Badge className="bg-green-100 text-green-700 border-green-200">Auto-matched</Badge>;
    if (status === 'manual-match') return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Manually matched</Badge>;
    return <Badge variant="outline">Unmatched</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
          <div className="relative w-full max-w-2xl">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg" />
            <div className="absolute top-2 right-2">
              <Button size="icon" variant="destructive" onClick={stopCamera}>
                <VideoOff className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex gap-4 mt-6">
            <Button size="lg" onClick={takePhoto} className="px-8">
              <Camera className="mr-2 h-5 w-5" />
              Capture Photo
            </Button>
            <Button size="lg" variant="outline" onClick={stopCamera}>Cancel</Button>
          </div>
          <p className="text-white/70 text-sm mt-3">Position the receipt in the frame, then click Capture</p>
        </div>
      )}

      {/* Edit Receipt Modal */}
      {editingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingReceipt(null)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4 text-foreground">Edit Receipt</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Merchant</label>
                <input
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                  value={editFields.merchant}
                  onChange={e => setEditFields(f => ({ ...f, merchant: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Category</label>
                <select
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                  value={editFields.category}
                  onChange={e => setEditFields(f => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Notes</label>
                <textarea
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                  rows={3}
                  value={editFields.notes}
                  onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={saveEdit} disabled={updateMutation.isPending} className="flex-1">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setEditingReceipt(null)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1 text-foreground">Receipt Scanner</h2>
        <p className="text-muted-foreground">
          Upload receipts or take a photo. Our AI extracts the details and matches them to your transactions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6 gap-1">
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'upload' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('upload')}
        >
          <Upload className="inline h-4 w-4 mr-1" />
          Upload
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'results' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'} ${results.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
          onClick={() => results.length > 0 && setActiveTab('results')}
          disabled={results.length === 0}
        >
          <Receipt className="inline h-4 w-4 mr-1" />
          Scan Results ({results.length})
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'library' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('library')}
        >
          <LayoutList className="inline h-4 w-4 mr-1" />
          All Receipts {storedReceipts.length > 0 && `(${storedReceipts.length})`}
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
        multiple
        className="hidden"
      />

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Upload Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Button onClick={startCamera} className="h-24 flex flex-col items-center justify-center gap-2" variant="outline">
                <Camera className="h-8 w-8" />
                <span>Take Photo</span>
              </Button>
              <Button onClick={triggerFileSelect} className="h-24 flex flex-col items-center justify-center gap-2" variant="outline">
                <Upload className="h-8 w-8" />
                <span>Upload Files</span>
              </Button>
            </div>

            {selectedFiles.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium mb-3 text-foreground">Selected Files ({selectedFiles.length})</h3>
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{getFileIcon(file)}</span>
                        <div>
                          <div className="font-medium text-foreground">{file.name}</div>
                          <div className="text-sm text-muted-foreground">{formatFileSize(file.size)} • {file.type}</div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isUploading && (
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Processing with AI OCR...</span>
                  <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <Button onClick={uploadReceipts} disabled={isUploading || selectedFiles.length === 0} className="w-full" size="lg">
              {isUploading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />Process {selectedFiles.length} Receipt{selectedFiles.length !== 1 ? 's' : ''}</>
              )}
            </Button>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2 text-foreground">Tips for best results:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Ensure receipt is well-lit and in focus</li>
                <li>• Include the entire receipt in the photo</li>
                <li>• PDF receipts should be clear scans, not photos of screens</li>
                <li>• Maximum file size: 10MB per receipt</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan Results Tab */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          {results.map((result, index) => (
            <Card key={index} className="bg-card border-border">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-foreground">
                    {result.receipt.merchant || 'Receipt'} #{index + 1}
                  </CardTitle>
                  <Badge variant={result.receipt.confidence > 0.8 ? 'default' : 'secondary'}>
                    {Math.round(result.receipt.confidence * 100)}% Confidence
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <h4 className="font-medium mb-2 text-foreground">Extracted Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Merchant:</span>
                        <span className="font-medium text-foreground">{result.receipt.merchant}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-medium text-foreground">{formatCurrency(result.receipt.amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date:</span>
                        <span className="font-medium text-foreground">{result.receipt.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Category:</span>
                        <span className="font-medium text-foreground">{result.receipt.category}</span>
                      </div>
                    </div>
                  </div>

                  {result.receipt.items.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 text-foreground">Line Items</h4>
                      <div className="space-y-1">
                        {result.receipt.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{item.name}</span>
                            <span className="text-foreground">{formatCurrency(item.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {result.matches.length > 0 ? (
                  <div>
                    <h4 className="font-medium mb-3 text-foreground">Transaction Matches</h4>
                    <div className="space-y-3">
                      {result.matches.slice(0, 3).map((match, mi) => (
                        <div key={mi} className="p-3 border border-border rounded-lg bg-muted/50">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              {match.status === 'auto-matched'
                                ? <CheckCircle className="h-4 w-4 text-green-500" />
                                : <Link2 className="h-4 w-4 text-yellow-500" />}
                              <span className="font-medium text-foreground text-sm">{match.matchedMerchant}</span>
                            </div>
                            <Badge variant={match.status === 'auto-matched' ? 'default' : 'secondary'}>
                              {match.status === 'auto-matched' ? 'Auto-matched' : 'Review'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div>Amount: <span className="font-medium text-foreground">{formatCurrency(match.matchedAmount)}</span></div>
                            <div>Confidence: <span className="font-medium text-foreground">{Math.round(match.confidence * 100)}%</span></div>
                          </div>
                          {match.status === 'needs-review' && (
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" variant="outline" onClick={async () => {
                                try {
                                  await fetch(`/api/receipts/${result.id}/match`, {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ transactionId: match.transactionId }),
                                  });
                                  queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
                                  toast({ title: 'Receipt matched' });
                                } catch {
                                  toast({ title: 'Match failed', variant: 'destructive' });
                                }
                              }}>Confirm Match</Button>
                              <Button size="sm" variant="ghost">Skip</Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p>No matching transactions found.</p>
                    <p className="text-sm mt-1">You can view and edit this receipt in the All Receipts library.</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setActiveTab('library')}>
                      View in Library
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* All Receipts Library Tab */}
      {activeTab === 'library' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground text-lg">Receipt Library ({storedReceipts.length})</h3>
            {storedReceipts.length > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrintReceipts} className="print:hidden">
                <Printer className="h-4 w-4 mr-2" />
                Print All
              </Button>
            )}
          </div>

          {libraryLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : storedReceipts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-lg font-medium mb-1">No receipts yet</p>
              <p className="text-sm mb-4">Upload your first receipt to get started.</p>
              <Button onClick={() => setActiveTab('upload')}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Receipt
              </Button>
            </div>
          ) : (
            <div className="space-y-3 print:space-y-4">
              {storedReceipts.map(receipt => {
                let items: Array<{ name: string; price: number; quantity: number }> = [];
                try { items = JSON.parse(receipt.items ?? '[]'); } catch { /* ignore */ }

                return (
                  <Card key={receipt.id} className="bg-card border-border print:border print:shadow-none">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-foreground truncate">{receipt.merchant}</span>
                            {matchStatusBadge(receipt.matchStatus)}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm mt-2">
                            <div>
                              <span className="text-muted-foreground">Amount</span>
                              <div className="font-medium text-foreground">{formatCurrency(receipt.amount)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Date</span>
                              <div className="font-medium text-foreground">{receipt.date}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Category</span>
                              <div className="font-medium text-foreground">{receipt.category}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Confidence</span>
                              <div className="font-medium text-foreground">{Math.round((receipt.confidence ?? 0) * 100)}%</div>
                            </div>
                          </div>
                          {receipt.notes && (
                            <div className="mt-2 text-sm text-muted-foreground italic">"{receipt.notes}"</div>
                          )}
                          {items.length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                {items.length} line item{items.length !== 1 ? 's' : ''}
                              </summary>
                              <div className="mt-1 space-y-0.5 pl-2 border-l border-border">
                                {items.map((item, i) => (
                                  <div key={i} className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">{item.name}</span>
                                    <span className="text-foreground">{formatCurrency(item.price)}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 print:hidden">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(receipt)} title="Edit">
                            <PencilLine className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(receipt.id)}
                            disabled={deleteMutation.isPending}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Print summary */}
          {storedReceipts.length > 0 && (
            <div className="mt-4 p-4 bg-muted rounded-lg text-sm hidden print:block">
              <strong>Total receipts:</strong> {storedReceipts.length} |{' '}
              <strong>Total amount:</strong>{' '}
              {formatCurrency(storedReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0))}
            </div>
          )}
          {storedReceipts.length > 0 && (
            <div className="mt-4 p-4 bg-muted rounded-lg text-sm print:hidden flex items-center justify-between">
              <span>
                <strong>{storedReceipts.length}</strong> receipts total •{' '}
                <strong>{formatCurrency(storedReceipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0))}</strong> total spent
              </span>
              <Button variant="outline" size="sm" onClick={handlePrintReceipts}>
                <Printer className="h-4 w-4 mr-2" />
                Print for Tax Records
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
