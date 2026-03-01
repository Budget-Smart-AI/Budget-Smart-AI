import React, { useState, useRef } from 'react';
import ReceiptScanner from '../components/receipt-scanner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Camera, Upload, CheckCircle, Zap, BarChart3, Smartphone } from 'lucide-react';

export default function ReceiptsPage() {
  const scannerRef = useRef<HTMLDivElement>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const scrollToScanner = () => {
    scannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const features = [
    {
      icon: <Camera className="h-5 w-5" />,
      title: "Camera Capture",
      description: "Take photos of receipts directly from your camera"
    },
    {
      icon: <Upload className="h-5 w-5" />,
      title: "Multi-Format Upload",
      description: "Upload JPEG, PNG, PDF, and more"
    },
    {
      icon: <CheckCircle className="h-5 w-5" />,
      title: "Auto-Matching",
      description: "AI automatically matches receipts with transactions"
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Fast Processing",
      description: "Process receipts in seconds with Claude AI"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-primary/10 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-3 text-foreground">
              AI-Powered Receipt Scanner
            </h1>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Upload receipts and let our AI automatically extract, categorize, and match them with your transactions.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Button size="lg" onClick={scrollToScanner}>
                <Camera className="mr-2 h-5 w-5" />
                Start Scanning Receipts
              </Button>
              <Button size="lg" variant="outline" onClick={() => setShowTutorial(true)}>
                View Tutorial
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tutorial Dialog */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowTutorial(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4 text-foreground">How to Use the Receipt Scanner</h2>
            <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside">
              <li><strong className="text-foreground">Take a Photo or Upload</strong> — Click "Take Photo" to use your camera, or "Upload Files" to select a saved receipt (JPEG, PNG, or PDF).</li>
              <li><strong className="text-foreground">Review Selected Files</strong> — Confirm the files you want to process and remove any you don't need.</li>
              <li><strong className="text-foreground">Process Receipts</strong> — Click "Process Receipts". Our AI scans each receipt and extracts the merchant, amount, date, and line items.</li>
              <li><strong className="text-foreground">Review Results</strong> — See the extracted data and any automatically matched transactions from your existing records.</li>
              <li><strong className="text-foreground">Match or Add</strong> — If a receipt can't be matched automatically, you can manually match it to an existing transaction or add it as a new expense.</li>
            </ol>
            <div className="mt-4 p-3 bg-muted rounded-lg text-xs text-muted-foreground">
              <strong>Tips:</strong> Ensure receipts are well-lit, in focus, and fully visible. PDF receipts should be clear scans. Maximum file size is 10MB per receipt.
            </div>
            <Button className="mt-5 w-full" onClick={() => { setShowTutorial(false); scrollToScanner(); }}>
              Get Started
            </Button>
          </div>
        </div>
      )}

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-center mb-6 text-foreground">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <Card key={index} className="text-center bg-card border-border">
              <CardContent className="pt-6">
                <div className="inline-flex items-center justify-center p-3 bg-primary/10 text-primary rounded-full mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-semibold mb-2 text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Scanner Component */}
      <div ref={scannerRef} className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 scroll-mt-4">
        <ReceiptScanner />
      </div>

      {/* Benefits */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-bold mb-4 text-foreground">Why Use Our Receipt Scanner?</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground"><strong className="text-foreground">Save Time:</strong> No more manual entry — AI does the work</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground"><strong className="text-foreground">Improve Accuracy:</strong> AI extraction vs manual data entry</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground"><strong className="text-foreground">Tax Ready:</strong> All receipts organized and categorized</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground"><strong className="text-foreground">Expense Tracking:</strong> Perfect for business expenses and reimbursements</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-4 text-foreground">Perfect For:</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <BarChart3 className="h-8 w-8 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Business Owners</div>
                      <div className="text-sm text-muted-foreground">Track expenses and simplify tax time</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Zap className="h-8 w-8 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Frequent Travelers</div>
                      <div className="text-sm text-muted-foreground">Capture receipts on the go</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Smartphone className="h-8 w-8 text-primary flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Mobile Users</div>
                      <div className="text-sm text-muted-foreground">Scan receipts anywhere, anytime</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center">
        <h2 className="text-2xl font-bold mb-3 text-foreground">Ready to Simplify Your Receipt Management?</h2>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Automate your receipt tracking with BudgetSmart AI.
        </p>
        <Button size="lg" onClick={scrollToScanner}>
          <Camera className="mr-2 h-5 w-5" />
          Start Scanning Receipts
        </Button>
      </div>
    </div>
  );
}