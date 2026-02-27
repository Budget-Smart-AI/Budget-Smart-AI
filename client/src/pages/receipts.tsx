import React, { useState, useEffect } from 'react';
import { useMediaQuery } from 'react-responsive';
import ReceiptScanner from '../components/receipt-scanner';
import MobileReceiptScanner from '../components/mobile-receipt-scanner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Camera, Upload, CheckCircle, Zap, BarChart3, Smartphone } from 'lucide-react';

export default function ReceiptsPage() {
  const isMobile = useMediaQuery({ maxWidth: 768 });
  const [stats, setStats] = useState({
    totalScanned: 0,
    totalMatched: 0,
    totalSavings: 0,
    timeSaved: 0
  });

  // Mock stats for demonstration
  useEffect(() => {
    setStats({
      totalScanned: 42,
      totalMatched: 38,
      totalSavings: 1250,
      timeSaved: 21
    });
  }, []);

  const features = [
    {
      icon: <Camera className="h-5 w-5" />,
      title: "Camera Capture",
      description: "Take photos of receipts directly from your phone"
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
      description: "Process receipts in seconds with Claude Haiku"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-emerald-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              AI-Powered Receipt Scanner
            </h1>
            <p className="text-xl mb-8 max-w-3xl mx-auto">
              Upload receipts and let our proprietary AI automatically extract, categorize, and match them with your transactions.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                {isMobile ? (
                  <>
                    <Smartphone className="mr-2 h-5 w-5" />
                    Open Mobile Scanner
                  </>
                ) : (
                  <>
                    <Camera className="mr-2 h-5 w-5" />
                    Start Scanning
                  </>
                )}
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                View Tutorial
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">{stats.totalScanned}</div>
              <div className="text-sm text-gray-600">Receipts Scanned</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-emerald-600 mb-2">{stats.totalMatched}</div>
              <div className="text-sm text-gray-600">Auto-Matched</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-amber-600 mb-2">${stats.totalSavings}</div>
              <div className="text-sm text-gray-600">Savings Found</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">{stats.timeSaved}h</div>
              <div className="text-sm text-gray-600">Time Saved</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-3xl font-bold text-center mb-8">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="text-center">
              <CardContent className="pt-6">
                <div className="inline-flex items-center justify-center p-3 bg-blue-100 text-blue-600 rounded-full mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Scanner Component */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Receipt Scanner</CardTitle>
              <Badge variant="outline" className="flex items-center gap-1">
                {isMobile ? (
                  <>
                    <Smartphone className="h-3 w-3" />
                    Mobile Optimized
                  </>
                ) : (
                  "Desktop Version"
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isMobile ? <MobileReceiptScanner /> : <ReceiptScanner />}
          </CardContent>
        </Card>
      </div>

      {/* Benefits */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-gradient-to-r from-blue-50 to-emerald-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-2xl font-bold mb-4">Why Use Our Receipt Scanner?</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Save Time:</strong> No more manual entry - AI does the work</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Improve Accuracy:</strong> 95%+ accuracy vs 70% manual accuracy</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Tax Ready:</strong> All receipts organized and categorized</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Expense Tracking:</strong> Perfect for business expenses and reimbursements</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-4">Perfect For:</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                    <BarChart3 className="h-8 w-8 text-blue-500" />
                    <div>
                      <div className="font-semibold">Business Owners</div>
                      <div className="text-sm text-gray-600">Track expenses and simplify tax time</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                    <Zap className="h-8 w-8 text-emerald-500" />
                    <div>
                      <div className="font-semibold">Frequent Travelers</div>
                      <div className="text-sm text-gray-600">Capture receipts on the go</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
                    <Smartphone className="h-8 w-8 text-purple-500" />
                    <div>
                      <div className="font-semibold">Mobile Users</div>
                      <div className="text-sm text-gray-600">Scan receipts anywhere, anytime</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Simplify Your Receipt Management?</h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Join thousands of users who have automated their receipt tracking with BudgetSmart AI.
        </p>
        <Button size="lg" className="bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700">
          <Camera className="mr-2 h-5 w-5" />
          Start Scanning Receipts
        </Button>
      </div>
    </div>
  );
}