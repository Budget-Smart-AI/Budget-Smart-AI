import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, Check, Loader2, Image as ImageIcon, FileText, DollarSign, Calendar, Store } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

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

interface UploadResult {
  receipt: ReceiptData;
  matches: any[];
  signedUrl: string;
  processingTime: string;
}

export default function MobileReceiptScanner() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [activeStep, setActiveStep] = useState<'capture' | 'review' | 'results'>('capture');
  const [useCamera, setUseCamera] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    setActiveStep('review');
  };

  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
    setUseCamera(false);
    setActiveStep('review');
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    if (selectedFiles.length === 1) {
      setActiveStep('capture');
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
        setActiveStep('results');
        
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5" />;
    } else if (file.type === 'application/pdf') {
      return <FileText className="h-5 w-5" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  // Mobile-optimized capture screen
  const CaptureScreen = () => (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Scan Receipts</h1>
        <p className="text-gray-600">Take a photo or upload existing receipts</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* Camera Button (Primary action for mobile) */}
        <Button
          onClick={triggerCamera}
          className="w-full h-16 text-lg"
          size="lg"
        >
          <Camera className="mr-2 h-5 w-5" />
          Take Photo
        </Button>

        {/* File Upload Button */}
        <Button
          onClick={triggerFileSelect}
          className="w-full h-16 text-lg"
          variant="outline"
          size="lg"
        >
          <Upload className="mr-2 h-5 w-5" />
          Upload Files
        </Button>

        {/* Hidden inputs */}
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
      </div>

      {/* Tips for mobile */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg max-w-sm">
        <h4 className="font-medium mb-2 text-sm">Tips for best results:</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Hold phone steady over receipt</li>
          <li>• Ensure good lighting</li>
          <li>• Include entire receipt in frame</li>
          <li>• Avoid glare and shadows</li>
        </ul>
      </div>
    </div>
  );

  // Review screen for selected files
  const ReviewScreen = () => (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Review Receipts</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedFiles([]);
            setActiveStep('capture');
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 mb-6">
        {selectedFiles.map((file, index) => (
          <Card key={index} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getFileIcon(file)}
                <div>
                  <div className="font-medium text-sm truncate max-w-[200px]">
                    {file.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {isUploading ? (
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">Processing...</span>
            <span className="text-sm text-gray-500">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
        </div>
      ) : (
        <Button
          onClick={uploadReceipts}
          className="w-full"
          size="lg"
        >
          <Check className="mr-2 h-4 w-4" />
          Process {selectedFiles.length} Receipt{selectedFiles.length !== 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );

  // Results screen
  const ResultsScreen = () => (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Scan Results</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setResults([]);
            setActiveStep('capture');
          }}
        >
          Scan More
        </Button>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="matched">Matched</TabsTrigger>
          <TabsTrigger value="needs-review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {results.map((result, index) => (
            <ReceiptCard key={index} result={result} index={index} />
          ))}
        </TabsContent>

        <TabsContent value="matched" className="space-y-4">
          {results.filter(r => r.matches.length > 0).map((result, index) => (
            <ReceiptCard key={index} result={result} index={index} />
          ))}
        </TabsContent>

        <TabsContent value="needs-review" className="space-y-4">
          {results.filter(r => r.matches.some((m: any) => m.status === 'needs-review')).map((result, index) => (
            <ReceiptCard key={index} result={result} index={index} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );

  // Receipt card component
  const ReceiptCard = ({ result, index }: { result: UploadResult; index: number }) => (
    <Card className="p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-bold text-lg">{result.receipt.merchant}</div>
          <div className="text-sm text-gray-600">{result.receipt.date}</div>
        </div>
        <Badge variant={result.receipt.confidence > 0.8 ? 'default' : 'secondary'}>
          {Math.round(result.receipt.confidence * 100)}%
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-gray-500" />
          <div>
            <div className="text-xs text-gray-500">Amount</div>
            <div className="font-semibold">${result.receipt.amount.toFixed(2)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-gray-500" />
          <div>
            <div className="text-xs text-gray-500">Category</div>
            <div className="font-semibold">{result.receipt.category}</div>
          </div>
        </div>
      </div>

      {result.matches.length > 0 ? (
        <div className="mb-3">
          <div className="text-sm font-medium mb-2">Matches found:</div>
          {result.matches.slice(0, 2).map((match: any, matchIndex: number) => (
            <div key={matchIndex} className="text-xs p-2 bg-gray-50 rounded mb-1">
              <div className="flex justify-between">
                <span>{match.matchedMerchant}</span>
                <Badge variant={
                  match.status === 'auto-matched' ? 'default' : 'secondary'
                }>
                  {Math.round(match.confidence * 100)}%
                </Badge>
              </div>
            </div>
          ))}
          {result.matches.length > 2 && (
            <div className="text-xs text-gray-500 text-center">
              +{result.matches.length - 2} more matches
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500 mb-3">No matches found</div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1">
          View
        </Button>
        <Button size="sm" variant="outline" className="flex-1">
          Edit
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">Receipt Scanner</h1>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">
              {activeStep === 'capture' && 'Step 1/3'}
              {activeStep === 'review' && 'Step 2/3'}
              {activeStep === 'results' && 'Step 3/3'}
            </div>
          </div>
        </div>
        
        {/* Progress indicator */}
        <div className="flex items-center gap-1 mt-2">
          <div className={`h-1 flex-1 rounded-full ${activeStep === 'capture' ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${activeStep === 'review' ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${activeStep === 'results' ? 'bg-blue-600' : 'bg-gray-200'}`} />
        </div>
      </div>

      {/* Content */}
      {activeStep === 'capture' && <CaptureScreen />}
      {activeStep === 'review' && <ReviewScreen />}
      {activeStep === 'results' && <ResultsScreen />}

      {/* Bottom Navigation (for results screen) */}
      {activeStep === 'results' && results.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
          <Button className="w-full" size="lg">
            <Check className="mr-2 h-4 w-4" />
            Save All Results
          </Button>
        </div>
      )}
    </div>
  );
}