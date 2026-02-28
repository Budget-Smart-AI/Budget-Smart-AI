import React, { useState, useRef } from 'react';
import { Camera, Upload, FileText, CheckCircle, XCircle, Loader2, Image as ImageIcon, File } from 'lucide-react';
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
  const [useCamera, setUseCamera] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    // Validate file types
    const validFiles = files.filter(file => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      return validTypes.includes(file.type);
    });
    
    if (validFiles.length !== files.length) {
      toast({
        title: 'Invalid file type',
        description: 'Only JPEG, PNG, GIF, WEBP, and PDF files are allowed.',
        variant: 'destructive'
      });
    }
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
    setUseCamera(false);
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
      selectedFiles.forEach(file => {
        formData.append('receipts', file);
      });

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 300);

      const response = await fetch('/api/receipts/upload-multiple', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        throw new Error('Upload failed');
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

  const triggerCamera = () => {
    setUseCamera(true);
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5" />;
    } else if (file.type === 'application/pdf') {
      return <FileText className="h-5 w-5" />;
    }
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Receipt Scanner</h1>
        <p className="text-gray-600">
          Upload receipts and let our AI automatically extract and match transactions.
          Supports photos from your camera or file uploads (JPEG, PNG, PDF).
        </p>
      </div>

      <div className="flex border-b mb-6">
        <button
          className={`px-4 py-2 font-medium ${activeTab === 'upload' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('upload')}
        >
          Upload Receipts
        </button>
        <button
          className={`px-4 py-2 font-medium ${activeTab === 'results' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
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
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleCameraCapture}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {activeTab === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Upload Methods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Button
                onClick={triggerCamera}
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
                <h3 className="font-medium mb-3">Selected Files ({selectedFiles.length})</h3>
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {getFileIcon(file)}
                        <div>
                          <div className="font-medium">{file.name}</div>
                          <div className="text-sm text-gray-500">
                            {formatFileSize(file.size)} • {file.type}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
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
                  <span className="text-sm font-medium">Processing receipts...</span>
                  <span className="text-sm text-gray-500">{uploadProgress}%</span>
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
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium mb-2">Tips for best results:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
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
            <Card key={index}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Receipt #{index + 1}</CardTitle>
                  <Badge variant={result.receipt.confidence > 0.8 ? 'default' : 'secondary'}>
                    {Math.round(result.receipt.confidence * 100)}% Confidence
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Receipt Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <h4 className="font-medium mb-2">Receipt Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Merchant:</span>
                        <span className="font-medium">{result.receipt.merchant}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Amount:</span>
                        <span className="font-medium">${result.receipt.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Date:</span>
                        <span className="font-medium">{result.receipt.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Category:</span>
                        <span className="font-medium">{result.receipt.category}</span>
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  {result.receipt.items.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Items</h4>
                      <div className="space-y-1">
                        {result.receipt.items.map((item, itemIndex) => (
                          <div key={itemIndex} className="flex justify-between text-sm">
                            <span>{item.name}</span>
                            <span>${item.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Matches */}
                {result.matches.length > 0 ? (
                  <div>
                    <h4 className="font-medium mb-3">Transaction Matches</h4>
                    <div className="space-y-3">
                      {result.matches.map((match, matchIndex) => (
                        <div key={matchIndex} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                              {match.status === 'auto-matched' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                              )}
                              <span className="font-medium">{match.matchedMerchant}</span>
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
                              <span className="text-gray-600">Amount:</span>
                              <span className="ml-2 font-medium">${match.matchedAmount.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Confidence:</span>
                              <span className="ml-2 font-medium">{Math.round(match.confidence * 100)}%</span>
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
                  <div className="text-center py-6 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No matching transactions found.</p>
                    <p className="text-sm mt-1">You can manually categorize this receipt.</p>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" size="sm">
                    View Original
                  </Button>
                  <Button variant="outline" size="sm">
                    Edit Details
                  </Button>
                  <Button variant="outline" size="sm">
                    Categorize
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}