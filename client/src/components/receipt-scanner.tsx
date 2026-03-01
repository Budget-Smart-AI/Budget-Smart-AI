import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, FileText, CheckCircle, XCircle, Loader2, Image as ImageIcon, File, Video, VideoOff } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { useToast } from '@/hooks/use-toast';

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
  receipt: ReceiptData;
  matches: TransactionMatch[];
  signedUrl: string;
  processingTime: string;
}

export default function ReceiptScanner() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'results'>('upload');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

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

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setCameraStream(stream);
      setShowCamera(true);
    } catch (err: any) {
      // If camera is unavailable or permission denied, fall back to file input
      setCameraError(err.message || 'Camera not available');
      toast({
        title: 'Camera unavailable',
        description: 'Could not access camera. Please use the file upload option instead.',
        variant: 'destructive'
      });
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
      toast({
        title: 'Invalid file type',
        description: 'Only JPEG, PNG, GIF, WEBP, and PDF files are allowed.',
        variant: 'destructive'
      });
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
    // Reset the input so the same file can be re-selected
    try { event.target.value = ''; } catch { /* ignore if element is detached */ }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadReceipts = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select at least one receipt to upload.',
        variant: 'destructive'
      });
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
          return prev + 10;
        });
      }, 300);

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
        setResults(data.results.filter((r: any) => r.success).map((r: any) => r.data));
        setSelectedFiles([]);
        setActiveTab('results');
        toast({
          title: 'Upload successful',
          description: `${data.results.filter((r: any) => r.success).length} receipts processed`,
        });
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Please try again',
        variant: 'destructive'
      });
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

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
          <div className="relative w-full max-w-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-lg"
            />
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
            <Button size="lg" variant="outline" onClick={stopCamera}>
              Cancel
            </Button>
          </div>
          <p className="text-white/70 text-sm mt-3">Position the receipt in the frame, then click Capture</p>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1 text-foreground">Receipt Scanner</h2>
        <p className="text-muted-foreground">
          Upload receipts or take a photo. Our AI extracts the details and matches them to your transactions.
        </p>
      </div>

      <div className="flex border-b border-border mb-6">
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'upload' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('upload')}
        >
          Upload Receipts
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'results' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'} disabled:opacity-40`}
          onClick={() => setActiveTab('results')}
          disabled={results.length === 0}
        >
          Results ({results.length})
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

      {activeTab === 'upload' && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Upload Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Upload Methods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Button
                onClick={startCamera}
                className="h-24 flex flex-col items-center justify-center gap-2"
                variant="outline"
              >
                <Camera className="h-8 w-8" />
                <span>Take Photo</span>
              </Button>
              <Button
                onClick={triggerFileSelect}
                className="h-24 flex flex-col items-center justify-center gap-2"
                variant="outline"
              >
                <Upload className="h-8 w-8" />
                <span>Upload Files</span>
              </Button>
            </div>

            {/* Selected Files */}
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
                          <div className="text-sm text-muted-foreground">
                            {formatFileSize(file.size)} • {file.type}
                          </div>
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

            {/* Upload Progress */}
            {isUploading && (
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Processing receipts...</span>
                  <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Upload Button */}
            <Button
              onClick={uploadReceipts}
              disabled={isUploading || selectedFiles.length === 0}
              className="w-full"
              size="lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Process {selectedFiles.length} Receipt{selectedFiles.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>

            {/* Tips */}
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

      {activeTab === 'results' && (
        <div className="space-y-6">
          {results.map((result, index) => (
            <Card key={index} className="bg-card border-border">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-foreground">Receipt #{index + 1}</CardTitle>
                  <Badge variant={result.receipt.confidence > 0.8 ? 'default' : 'secondary'}>
                    {Math.round(result.receipt.confidence * 100)}% Confidence
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Receipt Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <h4 className="font-medium mb-2 text-foreground">Receipt Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Merchant:</span>
                        <span className="font-medium text-foreground">{result.receipt.merchant}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-medium text-foreground">${result.receipt.amount.toFixed(2)}</span>
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
                      <h4 className="font-medium mb-2 text-foreground">Items</h4>
                      <div className="space-y-1">
                        {result.receipt.items.map((item, itemIndex) => (
                          <div key={itemIndex} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{item.name}</span>
                            <span className="text-foreground">${item.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Matches */}
                {result.matches.length > 0 ? (
                  <div>
                    <h4 className="font-medium mb-3 text-foreground">Transaction Matches</h4>
                    <div className="space-y-3">
                      {result.matches.map((match, matchIndex) => (
                        <div key={matchIndex} className="p-3 border border-border rounded-lg bg-muted/50">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              {match.status === 'auto-matched' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                              )}
                              <span className="font-medium text-foreground">{match.matchedMerchant}</span>
                            </div>
                            <Badge variant={
                              match.status === 'auto-matched' ? 'default' :
                              match.status === 'needs-review' ? 'secondary' : 'outline'
                            }>
                              {match.status.replace('-', ' ')}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Amount:</span>
                              <span className="ml-2 font-medium text-foreground">${match.matchedAmount.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Confidence:</span>
                              <span className="ml-2 font-medium text-foreground">{Math.round(match.confidence * 100)}%</span>
                            </div>
                          </div>
                          {match.status === 'needs-review' && (
                            <div className="mt-3 flex gap-2">
                              <Button size="sm" variant="outline">Review Match</Button>
                              <Button size="sm" variant="ghost">Ignore</Button>
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
                    <p className="text-sm mt-1">You can manually categorize this receipt.</p>
                    <Button size="sm" variant="outline" className="mt-3">Add as New Expense</Button>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" size="sm">Edit Details</Button>
                  <Button variant="outline" size="sm">Categorize</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}