import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Zap, Shield, TrendingUp, PieChart, Wallet, Calendar, Users,
  Building2, Target, Receipt, LineChart, PiggyBank, Check, X, Star,
  ArrowRight, Lock, CreditCard, Sparkles, Menu, ExternalLink, Cookie,
  ChevronLeft, ChevronRight, BanknoteIcon, BarChart3, Bell, Smartphone, Gift,
  DollarSign
} from "lucide-react";
import { openCookieSettings } from "@/components/cookie-consent";
import { SalesChatbot } from "@/components/sales-chatbot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Icon mapping for dynamic icon rendering
const iconMap: Record<string, any> = {
  Brain, Zap, Shield, TrendingUp, PieChart, Wallet, Calendar, Users,
  Building2, Target, Receipt, LineChart, PiggyBank, Check, Star, Lock,
  CreditCard, Sparkles, BanknoteIcon, BarChart3, Bell, Smartphone
};

// Hero Slider Data
const heroSlides = [
  {
    icon: Brain,
    title: "AI-Powered Insights",
    subtitle: "Get personalized financial recommendations powered by advanced machine learning",
    gradient: "from-emerald-500 to-teal-500",
    bgGradient: "from-emerald-500/20 to-teal-500/20"
  },
  {
    icon: Shield,
    title: "Bank-Level Security",
    subtitle: "Your data is protected with 256-bit encryption and read-only access",
    gradient: "from-blue-500 to-indigo-500",
    bgGradient: "from-blue-500/20 to-indigo-500/20"
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    subtitle: "Track spending patterns and visualize your financial health instantly",
    gradient: "from-purple-500 to-pink-500",
    bgGradient: "from-purple-500/20 to-pink-500/20"
  },
  {
    icon: BanknoteIcon,
    title: "Smart Budgeting",
    subtitle: "Automatic categorization and intelligent budget recommendations",
    gradient: "from-amber-500 to-orange-500",
    bgGradient: "from-amber-500/20 to-orange-500/20"
  },
  {
    icon: Bell,
    title: "Proactive Alerts",
    subtitle: "Get notified about unusual spending, upcoming bills, and savings opportunities",
    gradient: "from-rose-500 to-red-500",
    bgGradient: "from-rose-500/20 to-red-500/20"
  }
];

// Feature Slider Component
function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const slide = heroSlides[currentSlide];
  const IconComponent = slide.icon;

  return (
    <div
      className="relative w-full py-8 px-4"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      <div className="max-w-5xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            {/* Icon */}
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br ${slide.bgGradient} mb-6`}>
              <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${slide.gradient} flex items-center justify-center shadow-lg`}>
                <IconComponent className="w-8 h-8 text-white" />
              </div>
            </div>

            {/* Title */}
            <h2 className={`text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r ${slide.gradient} bg-clip-text text-transparent`}>
              {slide.title}
            </h2>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
              {slide.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            onClick={prevSlide}
            className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5 text-slate-300" />
          </button>

          {/* Dots */}
          <div className="flex gap-2">
            {heroSlides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  idx === currentSlide
                    ? `bg-gradient-to-r ${heroSlides[idx].gradient} w-8`
                    : "bg-slate-600 hover:bg-slate-500"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          <button
            onClick={nextSlide}
            className="p-2 rounded-full bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Pricing plans configuration
const pricingPlans = {
  pro: {
    name: "Pro",
    monthlyPrice: 7.99,
    yearlyPrice: 5.58, // per month when billed yearly ($67/12 = $5.58)
    yearlyTotal: 67, // total yearly cost
    description: "Perfect for individuals taking control of their finances",
    features: [
      "AI-Powered Spending Insights",
      "Automatic Transaction Categorization",
      "Bill Reminders & Tracking",
      "Savings Goals & Progress Tracking",
      "Monthly Budget Reports",
      "Spending Trend Analysis",
      "Up to 2 Bank Accounts",
      "Secure Bank Connections",
      "Email Support"
    ],
    cta: "Get Started Free"
  },
  family: {
    name: "Family",
    monthlyPrice: 14.99,
    yearlyPrice: 10.75, // per month when billed yearly ($129/12 = $10.75)
    yearlyTotal: 129, // total yearly cost
    description: "Best value for households managing finances together",
    features: [
      "Everything in Pro, plus:",
      "Unlimited Bank Accounts",
      "Up to 6 Family Members",
      "Shared Household Budgets",
      "Family Spending Reports",
      "Advanced AI Recommendations",
      "Priority Support",
      "Data Export & API Access"
    ],
    cta: "Get Started Free",
    isPopular: true,
    bonusMonths: 4 // 4 months free when paying yearly
  }
};

// Promotional Banner Component with scrolling text
function PromoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white h-8 overflow-hidden">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="flex items-center h-full animate-marquee whitespace-nowrap">
        {[...Array(6)].map((_, i) => (
          <span key={i} className="mx-8 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            LIMITED TIME: Get 4 FREE MONTHS with Family Plan
            <span className="mx-4">•</span>
            <Gift className="h-4 w-4" />
            Save even more - Offer ends soon!
            <span className="mx-4">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Video Annotation interface
interface VideoAnnotation {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  position: string;
  style: string;
  icon: string | null;
}

// Annotation icon mapping
const annotationIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain: Brain,
  Shield: Shield,
  Target: Target,
  TrendingUp: TrendingUp,
  Users: Users,
  Zap: Zap,
  DollarSign: DollarSign,
  PiggyBank: PiggyBank,
  CreditCard: CreditCard,
  LineChart: LineChart,
  Lock: Lock,
  Bell: Bell,
  Calendar: Calendar,
  Check: Check,
  Sparkles: Sparkles,
};

// Single Annotation Component
function VideoAnnotationPopup({
  annotation,
  isVisible
}: {
  annotation: VideoAnnotation;
  isVisible: boolean;
}) {
  const IconComponent = annotation.icon ? annotationIconMap[annotation.icon] : null;

  // Position classes - moved inward ~200px from edges
  const positionClasses: Record<string, string> = {
    'top-left': 'top-32 left-48',
    'top-right': 'top-32 right-48',
    'bottom-left': 'bottom-48 left-48',
    'bottom-right': 'bottom-48 right-48',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  };

  // Enhanced style variants with glow effects
  const styleVariants: Record<string, string> = {
    'default': 'bg-gradient-to-br from-slate-800/95 to-slate-900/95 border-slate-600/50 text-white ring-1 ring-white/10',
    'highlight': 'bg-gradient-to-br from-emerald-500/95 to-teal-600/95 border-emerald-400/50 text-white shadow-emerald-500/30',
    'security': 'bg-gradient-to-br from-blue-500/95 to-indigo-600/95 border-blue-400/50 text-white shadow-blue-500/30',
    'success': 'bg-gradient-to-br from-green-500/95 to-emerald-600/95 border-green-400/50 text-white shadow-green-500/30',
    'info': 'bg-gradient-to-br from-cyan-500/95 to-blue-600/95 border-cyan-400/50 text-white shadow-cyan-500/30',
    'family': 'bg-gradient-to-br from-purple-500/95 to-pink-600/95 border-purple-400/50 text-white shadow-purple-500/30',
  };

  const iconBgVariants: Record<string, string> = {
    'default': 'bg-white/15 ring-1 ring-white/20',
    'highlight': 'bg-white/20 ring-1 ring-white/30',
    'security': 'bg-white/20 ring-1 ring-white/30',
    'success': 'bg-white/20 ring-1 ring-white/30',
    'info': 'bg-white/20 ring-1 ring-white/30',
    'family': 'bg-white/20 ring-1 ring-white/30',
  };

  // Glow color for each style
  const glowVariants: Record<string, string> = {
    'default': 'shadow-lg',
    'highlight': 'shadow-xl shadow-emerald-500/40',
    'security': 'shadow-xl shadow-blue-500/40',
    'success': 'shadow-xl shadow-green-500/40',
    'info': 'shadow-xl shadow-cyan-500/40',
    'family': 'shadow-xl shadow-purple-500/40',
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className={`absolute z-30 ${positionClasses[annotation.position] || positionClasses['bottom-right']}`}
        >
          <div className={`
            flex items-center gap-3 px-5 py-3.5 rounded-2xl border backdrop-blur-xl
            ${glowVariants[annotation.style] || glowVariants['default']}
            ${styleVariants[annotation.style] || styleVariants['default']}
          `}>
            {IconComponent && (
              <div className={`p-2.5 rounded-xl ${iconBgVariants[annotation.style] || iconBgVariants['default']}`}>
                <IconComponent className="h-5 w-5 text-white drop-shadow-sm" />
              </div>
            )}
            <span className="font-semibold text-sm sm:text-base whitespace-nowrap tracking-tight drop-shadow-sm">
              {annotation.text}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Background Video Component with proper looping and annotations
function BackgroundVideo({ src, annotations = [] }: { src: string; annotations?: VideoAnnotation[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Force all properties
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.removeAttribute('controls');

    // Play the video
    const playVideo = async () => {
      try {
        await video.play();
      } catch {
        // Autoplay blocked - try on interaction
        const tryPlay = () => {
          video.play().catch(() => {});
          document.removeEventListener('click', tryPlay);
          document.removeEventListener('touchstart', tryPlay);
        };
        document.addEventListener('click', tryPlay, { once: true });
        document.addEventListener('touchstart', tryPlay, { once: true });
      }
    };

    playVideo();

    // Handle video end - force restart
    const handleEnded = () => {
      video.currentTime = 0;
      video.play().catch(() => {});
    };

    // Handle timeupdate to detect near-end, track time for annotations, and restart smoothly
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.duration && video.currentTime >= video.duration - 0.1) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    };

    // Safety check - restart if paused
    const checkInterval = setInterval(() => {
      if (video.paused || video.ended) {
        video.currentTime = video.ended ? 0 : video.currentTime;
        video.play().catch(() => {});
      }
    }, 500);

    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      clearInterval(checkInterval);
    };
  }, [src]);

  // Determine which annotations should be visible
  const visibleAnnotations = annotations.map(annotation => ({
    ...annotation,
    isVisible: currentTime >= annotation.startTime && currentTime < annotation.startTime + annotation.duration
  }));

  return (
    <>
      <style>{`
        .bg-video-container video::-webkit-media-controls,
        .bg-video-container video::-webkit-media-controls-panel,
        .bg-video-container video::-webkit-media-controls-play-button,
        .bg-video-container video::-webkit-media-controls-start-playback-button,
        .bg-video-container video::-webkit-media-controls-overlay-play-button,
        .bg-video-container video::-webkit-media-controls-enclosure,
        .bg-video-container video::-webkit-media-controls-current-time-display,
        .bg-video-container video::-webkit-media-controls-time-remaining-display {
          display: none !important;
          -webkit-appearance: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }
        .bg-video-container video::-moz-media-controls {
          display: none !important;
        }
        .bg-video-container video::cue {
          display: none !important;
        }
        .bg-video-container video {
          pointer-events: none !important;
          -webkit-user-select: none !important;
          user-select: none !important;
        }
      `}</style>
      <div className="bg-video-container absolute inset-0 w-full h-full overflow-hidden">
        <video
          ref={videoRef}
          src={src}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture={true}
          controlsList="nodownload nofullscreen noremoteplayback"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ pointerEvents: 'none' }}
          onEnded={(e) => {
            const video = e.currentTarget;
            video.currentTime = 0;
            video.play().catch(() => {});
          }}
        />
        {/* Video Annotations */}
        {visibleAnnotations.map((annotation) => (
          <VideoAnnotationPopup
            key={annotation.id}
            annotation={annotation}
            isVisible={annotation.isVisible}
          />
        ))}
      </div>
    </>
  );
}

// Extended testimonials data
const extendedTestimonials = [
  { name: "Sarah M.", role: "Small Business Owner", location: "Austin, TX", quote: "Budget Smart AI has completely transformed how I manage my business and personal finances. The AI insights are incredibly accurate!", rating: 5 },
  { name: "James L.", role: "Software Engineer", location: "Seattle, WA", quote: "Finally, a budgeting app that actually understands my spending patterns. The automatic categorization saves me hours every month.", rating: 5 },
  { name: "Emily R.", role: "Teacher", location: "Chicago, IL", quote: "As someone who was always stressed about money, this app has given me peace of mind. I can see exactly where every dollar goes.", rating: 5 },
  { name: "Michael T.", role: "Freelancer", location: "Denver, CO", quote: "The bill tracking feature is a lifesaver. I never miss a payment anymore, and my credit score has improved significantly.", rating: 5 },
  { name: "Jessica K.", role: "Marketing Manager", location: "New York, NY", quote: "I've tried dozens of budgeting apps. Budget Smart AI is the only one that stuck. The family sharing feature is perfect for us.", rating: 5 },
  { name: "David H.", role: "Retired", location: "Phoenix, AZ", quote: "Simple enough for someone my age to use, but powerful enough to really make a difference. Highly recommend!", rating: 5 },
  { name: "Amanda S.", role: "Nurse", location: "Boston, MA", quote: "Working irregular hours makes budgeting hard. This app adapts to my schedule and helps me save for my goals.", rating: 5 },
  { name: "Robert J.", role: "Accountant", location: "Miami, FL", quote: "As a finance professional, I'm impressed by the accuracy of the AI categorization. It's like having a personal assistant.", rating: 5 },
  { name: "Lisa W.", role: "Stay-at-home Mom", location: "Portland, OR", quote: "Managing a household budget has never been easier. The savings goals feature helped us save for our family vacation!", rating: 5 },
  { name: "Chris P.", role: "Graduate Student", location: "Los Angeles, CA", quote: "On a tight student budget, every dollar counts. This app helped me find subscriptions I forgot about and save $200/month!", rating: 5 },
  { name: "Nicole B.", role: "Real Estate Agent", location: "Dallas, TX", quote: "With variable income, budgeting was always a challenge. Budget Smart AI's forecasting feature is a game-changer.", rating: 5 },
  { name: "Kevin M.", role: "Restaurant Owner", location: "San Francisco, CA", quote: "I can finally see the full picture of my finances. The reports are clear and actionable. Worth every penny!", rating: 5 },
];

// Sliding Testimonials Component
function TestimonialsSlider({ testimonials }: { testimonials: typeof extendedTestimonials }) {
  return (
    <div className="relative overflow-hidden py-4">
      <style>{`
        @keyframes slideLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .testimonials-track {
          animation: slideLeft 60s linear infinite;
        }
        .testimonials-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="testimonials-track flex gap-6 whitespace-nowrap">
        {/* Duplicate testimonials for seamless loop */}
        {[...testimonials, ...testimonials].map((testimonial, i) => (
          <div
            key={i}
            className="inline-block w-[350px] flex-shrink-0 whitespace-normal"
          >
            <Card className="h-full bg-slate-900/50 border-slate-800 hover:border-emerald-500/30 transition-colors">
              <CardContent className="pt-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-300 mb-4 italic text-sm">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">{testimonial.name}</div>
                    <div className="text-xs text-slate-400">
                      {testimonial.role} - {testimonial.location}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

// Pricing Section Component with Toggle
function PricingSection() {
  const [, navigate] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<"yearly" | "monthly">("yearly");

  const { data: session } = useQuery<{ authenticated?: boolean }>({
    queryKey: ["/api/auth/session"],
    retry: false,
  });

  const handleSubscribe = (planName: string) => {
    if (session?.authenticated === true) {
      // Already logged in — go to the in-app upgrade page
      navigate(`/upgrade?plan=${planName.toLowerCase()}&billing=${billingPeriod}`);
    } else {
      navigate(`/signup?plan=${planName.toLowerCase()}&billing=${billingPeriod}`);
    }
  };

  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Simple Pricing
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Choose Your Plan
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto mb-8">
            Free Plan available. Upgrade for unlimited features.
          </p>

          {/* Billing Toggle - Fixed spacing */}
          <div className="inline-flex items-center justify-center gap-3 bg-slate-800/50 rounded-full px-4 py-2 border border-slate-700/50">
            <span className={`text-sm font-medium transition-colors ${billingPeriod === "monthly" ? "text-white" : "text-slate-400"}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === "yearly" ? "monthly" : "yearly")}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                billingPeriod === "yearly" ? "bg-emerald-500" : "bg-slate-600"
              }`}
              aria-label="Toggle billing period"
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${
                  billingPeriod === "yearly" ? "left-6" : "left-0.5"
                }`}
              />
            </button>
            <span className={`text-sm font-medium transition-colors ${billingPeriod === "yearly" ? "text-white" : "text-slate-400"}`}>
              Yearly
            </span>
            {billingPeriod === "yearly" && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-1">
                Save up to 4 months
              </Badge>
            )}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Pro Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative"
          >
            <Card className="h-full bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl text-white">{pricingPlans.pro.name}</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold text-white">
                    ${billingPeriod === "yearly" ? pricingPlans.pro.yearlyPrice.toFixed(2) : pricingPlans.pro.monthlyPrice.toFixed(2)}
                  </span>
                  <span className="text-slate-400">/month</span>
                </div>
                {billingPeriod === "yearly" && (
                  <p className="text-sm text-emerald-400 mt-1 font-medium">
                    Save 3 months free (billed ${pricingPlans.pro.yearlyTotal}/year)
                  </p>
                )}
                {billingPeriod === "monthly" && (
                  <p className="text-sm text-slate-500 mt-1">
                    Billed monthly
                  </p>
                )}
                <CardDescription className="mt-3">{pricingPlans.pro.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-3 mb-6">
                  {pricingPlans.pro.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSubscribe("pro")}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                >
                  {pricingPlans.pro.cta}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Family Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="relative md:-mt-4 md:mb-4"
          >
            {/* Most Popular Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 px-4 py-1">
                Most Popular
              </Badge>
            </div>
            <Card className="h-full bg-gradient-to-b from-slate-800 to-slate-900 border-emerald-500/50 shadow-xl shadow-emerald-500/10">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl text-white">{pricingPlans.family.name}</CardTitle>

                {/* 4 FREE MONTHS Highlight */}
                <div className="my-3">
                  <motion.div
                    initial={{ scale: 0.9 }}
                    animate={{ scale: [0.95, 1.05, 0.95] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/50"
                  >
                    <Gift className="h-5 w-5 text-amber-400" />
                    <span className="text-amber-400 font-bold text-sm">+4 FREE MONTHS</span>
                    <Sparkles className="h-4 w-4 text-amber-400" />
                  </motion.div>
                  <p className="text-xs text-amber-400/80 mt-1">Limited time offer!</p>
                </div>

                <div className="mt-2">
                  <span className="text-5xl font-bold text-white">
                    ${billingPeriod === "yearly" ? pricingPlans.family.yearlyPrice.toFixed(2) : pricingPlans.family.monthlyPrice.toFixed(2)}
                  </span>
                  <span className="text-slate-400">/month</span>
                </div>
                {billingPeriod === "yearly" && (
                  <p className="text-sm text-amber-400 mt-1 font-medium">
                    Save 4 months free (billed ${pricingPlans.family.yearlyTotal}/year)
                  </p>
                )}
                {billingPeriod === "monthly" && (
                  <p className="text-sm text-slate-500 mt-1">
                    Billed monthly
                  </p>
                )}
                <CardDescription className="mt-3">{pricingPlans.family.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-3 mb-6">
                  {pricingPlans.family.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-300">{feature}</span>
                    </li>
                  ))}
                  {/* Highlight 4 Free Months in features */}
                  <li className="flex items-start gap-2">
                    <Gift className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-amber-400 font-medium">4 Bonus Months Free!</span>
                  </li>
                </ul>
                <Button
                  onClick={() => handleSubscribe("family")}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
                >
                  {pricingPlans.family.cta}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Money-back guarantee */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50">
            <Shield className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-slate-300">Cancel anytime · Secure payments via Stripe</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

interface LandingData {
  settings: Record<string, any>;
  features: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    category: string;
  }>;
  testimonials: Array<{
    id: string;
    name: string;
    role: string | null;
    quote: string;
    rating: number;
    location: string | null;
    isFeatured: string;
  }>;
  pricing: Array<{
    id: string;
    name: string;
    price: string;
    billingPeriod: string;
    description: string | null;
    features: string;
    isPopular: string;
    ctaText: string;
    ctaUrl: string;
    stripePriceId: string | null;
    stripeProductId: string | null;
    maxBankAccounts: number | null;
    maxFamilyMembers: number | null;
    trialDays: number | null;
  }>;
  comparison: Array<{
    id: string;
    feature: string;
    budgetSmart: string;
    mint: string | null;
    ynab: string | null;
    copilot: string | null;
  }>;
  faqs: Array<{
    id: string;
    question: string;
    answer: string;
    category: string;
  }>;
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<LandingData>({
    queryKey: ["/api/landing"],
  });

  // Fetch video annotations
  const { data: videoAnnotations = [] } = useQuery<VideoAnnotation[]>({
    queryKey: ["/api/landing/video-annotations"],
  });

  // Demo login mutation
  const demoLoginMutation = useMutation({
    mutationFn: async () => {
      // Clear ALL cached data before login to prevent data leakage between users
      queryClient.clear();
      const res = await apiRequest("POST", "/api/auth/demo-login");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Welcome to the Demo!",
        description: "You're now viewing Budget Smart AI with sample data. This is read-only mode.",
      });
      setLocation("/dashboard");
    },
    onError: () => {
      toast({
        title: "Demo Unavailable",
        description: "The demo account is currently unavailable. Please try again later.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle hash navigation (e.g., /pricing#pricing)
  useEffect(() => {
    if (window.location.hash) {
      const element = document.querySelector(window.location.hash);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Brain className="h-6 w-6 text-emerald-500 animate-pulse" />
          </div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  const settings = data?.settings || {};
  const features = data?.features || [];
  const testimonials = data?.testimonials || [];
  const comparison = data?.comparison || [];
  const faqs = data?.faqs || [];

  const heroStats = settings.hero_stats || { users: "50,000+", transactions: "10M+", saved: "$5M+" };
  const trustBadges = settings.trust_badges || ["SOC 2 Type II", "GDPR Compliant", "PCI DSS", "Read-Only Access"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white overflow-x-hidden">
      {/* Promotional Banner - Fixed at very top */}
      <PromoBanner />

      {/* Navigation */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-8 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? "bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50" : ""
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/30">
                <Brain className="h-5 w-5 text-white" />
                <div className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-400 flex items-center justify-center shadow-sm">
                  <Zap className="h-2 w-2 text-white" />
                </div>
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">
                {settings.company_name || "Budget Smart AI"}
              </span>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="text-slate-300 hover:text-white transition-colors">Pricing</a>
              <a href="#testimonials" className="text-slate-300 hover:text-white transition-colors">Reviews</a>
              <a href="#faq" className="text-slate-300 hover:text-white transition-colors">FAQ</a>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <a href="https://app.budgetsmart.io/demo">
                <Button
                  variant="outline"
                  className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  data-testid="button-try-demo"
                >
                  Try Demo
                </Button>
              </a>
              <a href="https://app.budgetsmart.io/login" target="_self"> 
                <Button variant="ghost" className="text-slate-300 hover:text-white"> 
                  Sign In 
                </Button> 
              </a> 
              <a href="https://app.budgetsmart.io/signup" target="_self"> 
                <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25"> 
                  Get Started Free 
                </Button> 
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-slate-900/95 backdrop-blur-md border-b border-slate-800"
            >
              <div className="px-4 py-4 space-y-3">
                <a href="#features" className="block py-2 text-slate-300 hover:text-white">Features</a>
                <a href="#pricing" className="block py-2 text-slate-300 hover:text-white">Pricing</a>
                <a href="#testimonials" className="block py-2 text-slate-300 hover:text-white">Reviews</a>
                <a href="#faq" className="block py-2 text-slate-300 hover:text-white">FAQ</a>
                <div className="pt-3 border-t border-slate-800 flex flex-col gap-2">
                  <a href="https://app.budgetsmart.io/demo" target="_self" className="block">
                    <Button
                      variant="outline"
                      className="w-full border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                      data-testid="button-try-demo-mobile"
                    >
                      Try Demo
                    </Button>
                  </a>
                  <a href="https://app.budgetsmart.io/login" target="_self" className="block">
                    <Button variant="outline" className="w-full">Sign In</Button>
                  </a>
                  <a href="https://app.budgetsmart.io/signup" target="_self" className="block">
                    <Button className="w-full bg-gradient-to-r from-emerald-500 to-teal-500">
                      Get Started Free
                    </Button>
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Full-Width Background Video Section - Above the slider */}
      <section className="relative w-full pt-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="relative w-full"
        >
          {/* Video Container - Full width background */}
          <div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[70vh] lg:h-[80vh] overflow-hidden">
            {/* Gradient overlays for blending */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-transparent to-transparent z-10 pointer-events-none h-32" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/50 via-transparent to-slate-950/50 z-10 pointer-events-none" />

            {settings.hero_video_url ? (
              <>
                {/* Check if it's a direct video file (mp4, webm, ogg) or CDN video (BunnyCDN, etc.) */}
                {settings.hero_video_url.match(/\.(mp4|webm|ogg)/i) ||
                 settings.hero_video_url.includes('b-cdn.net') ||
                 settings.hero_video_url.includes('bunnycdn') ||
                 settings.hero_video_url.includes('vz-') ? (
                  <BackgroundVideo src={settings.hero_video_url} annotations={videoAnnotations} />
                ) : (
                  /* For embed URLs - transform to proper background video format */
                  (() => {
                    let videoSrc = settings.hero_video_url;

                    // Handle BunnyCDN Stream embed URLs
                    if (videoSrc.includes('iframe.mediadelivery.net') || videoSrc.includes('video.bunnycdn.com')) {
                      // Add autoplay, loop, muted params for background video
                      const separator = videoSrc.includes('?') ? '&' : '?';
                      videoSrc = `${videoSrc}${separator}autoplay=true&loop=true&muted=true&preload=true&controls=false`;
                    }
                    // Handle YouTube URLs
                    else if (videoSrc.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]+)/)) {
                      const youtubeMatch = videoSrc.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                      if (youtubeMatch) {
                        const videoId = youtubeMatch[1];
                        videoSrc = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&fs=0&iv_load_policy=3`;
                      }
                    }
                    // Handle Vimeo URLs
                    else if (videoSrc.includes('vimeo.com')) {
                      const vimeoMatch = videoSrc.match(/vimeo\.com\/(?:video\/)?(\d+)/);
                      if (vimeoMatch) {
                        videoSrc = `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1&loop=1&background=1&controls=0`;
                      }
                    }
                    // Handle Loom URLs
                    else if (videoSrc.includes('loom.com')) {
                      videoSrc = videoSrc.replace('/share/', '/embed/');
                      videoSrc = `${videoSrc}${videoSrc.includes('?') ? '&' : '?'}autoplay=1&hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true`;
                    }

                    return (
                      <iframe
                        src={videoSrc}
                        className="absolute inset-0 w-full h-full scale-150"
                        style={{
                          border: 'none',
                          pointerEvents: 'none',
                          objectFit: 'cover'
                        }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        loading="lazy"
                      />
                    );
                  })()
                )}
              </>
            ) : (
              /* Animated placeholder when no video */
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="relative">
                      <div className="absolute inset-0 animate-ping">
                        <Brain className="h-24 w-24 text-emerald-500/30" />
                      </div>
                      <Brain className="h-24 w-24 text-emerald-500 animate-pulse" />
                    </div>
                    <p className="text-slate-400 mt-6 text-lg">Experience the Future of Personal Finance</p>
                  </div>
                </div>
                {/* Animated grid background */}
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
                                    linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)`,
                  backgroundSize: '50px 50px'
                }} />
              </div>
            )}

            {/* Floating stats overlay */}
            <div className="absolute bottom-8 left-0 right-0 z-20">
              <div className="max-w-4xl mx-auto px-4">
                <div className="grid grid-cols-3 gap-4 sm:gap-8">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="text-center bg-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50"
                  >
                    <div className="text-2xl sm:text-3xl font-bold text-white">{heroStats.users}</div>
                    <div className="text-xs sm:text-sm text-slate-400">Active Users</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                    className="text-center bg-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50"
                  >
                    <div className="text-2xl sm:text-3xl font-bold text-white">{heroStats.transactions}</div>
                    <div className="text-xs sm:text-sm text-slate-400">Transactions</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.0 }}
                    className="text-center bg-slate-900/80 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50"
                  >
                    <div className="text-2xl sm:text-3xl font-bold text-white">{heroStats.saved}</div>
                    <div className="text-xs sm:text-sm text-slate-400">Money Saved</div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Hero Section with Feature Slider */}
      <section className="relative py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-emerald-500/5 to-teal-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto">
          {/* Feature Slider - Replaces static header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <HeroSlider />
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8 mb-12"
          >
            <a href="https://app.budgetsmart.io/signup" target="_self">
              <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 px-8 py-6 text-lg">
                {settings.hero_cta_primary || "Start Free Trial"}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
            <a href="https://app.budgetsmart.io/signup" target="_self">
              <Button
                size="lg"
                variant="outline"
                className="border-slate-700 hover:bg-slate-800 px-8 py-6 text-lg"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                See How It Works
              </Button>
            </a>
          </motion.div>

          {/* Trust Badges - Compact row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-3 mb-8"
          >
            {trustBadges.map((badge: string, i: number) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs text-slate-300">{badge}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              AI-Powered Features
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need to Master Your Finances
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Our AI works 24/7 to analyze your spending, detect anomalies, and help you make smarter financial decisions.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const IconComponent = iconMap[feature.icon] || Brain;
              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="h-full bg-slate-900/50 border-slate-800 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 group">
                    <CardHeader>
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <IconComponent className="h-6 w-6 text-emerald-400" />
                      </div>
                      <CardTitle className="text-white">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-slate-400">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection />

      {/* Comparison Table */}
      {comparison.length > 0 && (
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                Compare
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                How We Stack Up
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto">
                See how Budget Smart AI compares to other personal finance apps.
              </p>
            </motion.div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-4 px-4 text-slate-400 font-medium">Feature</th>
                    <th className="text-center py-4 px-4">
                      <span className="text-emerald-400 font-bold">Budget Smart AI</span>
                    </th>
                    <th className="text-center py-4 px-4 text-slate-400">Monarch Money</th>
                    <th className="text-center py-4 px-4 text-slate-400">YNAB</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row, i) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-slate-800/50"
                    >
                      <td className="py-4 px-4 text-slate-300">{row.feature}</td>
                      <td className="text-center py-4 px-4">
                        {row.budgetSmart === "yes" ? (
                          <Check className="h-5 w-5 text-emerald-400 mx-auto" />
                        ) : row.budgetSmart === "no" ? (
                          <X className="h-5 w-5 text-slate-600 mx-auto" />
                        ) : row.budgetSmart === "partial" ? (
                          <span className="text-yellow-400">Partial</span>
                        ) : (
                          <span className="text-emerald-400">{row.budgetSmart}</span>
                        )}
                      </td>
                      <td className="text-center py-4 px-4 text-slate-500">
                        {row.mint === "yes" ? <Check className="h-5 w-5 mx-auto" /> :
                         row.mint === "no" ? <X className="h-5 w-5 mx-auto" /> :
                         row.mint === "partial" ? "Partial" : row.mint}
                      </td>
                      <td className="text-center py-4 px-4 text-slate-500">
                        {row.ynab === "yes" ? <Check className="h-5 w-5 mx-auto" /> :
                         row.ynab === "no" ? <X className="h-5 w-5 mx-auto" /> :
                         row.ynab === "partial" ? "Partial" : row.ynab}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              Testimonials
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Loved by Thousands
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              See what our users are saying about their experience with Budget Smart AI.
            </p>
          </motion.div>

          {/* Sliding Testimonials */}
          <TestimonialsSlider testimonials={extendedTestimonials} />
        </div>
      </section>

      {/* Plaid Integration & Security Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">
              Powered by Plaid
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Enterprise-Grade Security & Connectivity
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              We partner with Plaid to securely connect to over 12,000 financial institutions,
              ensuring your data is protected with the highest industry standards.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {/* Security Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <Card className="h-full bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-blue-500/50 transition-all">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4">
                    <Lock className="h-6 w-6 text-blue-400" />
                  </div>
                  <CardTitle className="text-white">256-bit Encryption</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    All data is encrypted in transit and at rest using bank-level AES-256 encryption,
                    the same standard used by major financial institutions.
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <Card className="h-full bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-emerald-500/50 transition-all">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4">
                    <Shield className="h-6 w-6 text-emerald-400" />
                  </div>
                  <CardTitle className="text-white">Read-Only Access</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    We only request read-only permissions. We can never move money, make transactions,
                    or modify your accounts in any way.
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <Card className="h-full bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-purple-500/50 transition-all">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
                    <CreditCard className="h-6 w-6 text-purple-400" />
                  </div>
                  <CardTitle className="text-white">No Credential Storage</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    Your bank login credentials are never stored on our servers. Authentication
                    is handled securely by Plaid's trusted infrastructure.
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
            >
              <Card className="h-full bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-amber-500/50 transition-all">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-4">
                    <Users className="h-6 w-6 text-amber-400" />
                  </div>
                  <CardTitle className="text-white">SOC 2 Type II Certified</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    Our infrastructure meets rigorous security standards with SOC 2 Type II
                    certification, demonstrating our commitment to data protection.
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
            >
              <Card className="h-full bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-rose-500/50 transition-all">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-rose-500/20 flex items-center justify-center mb-4">
                    <Target className="h-6 w-6 text-rose-400" />
                  </div>
                  <CardTitle className="text-white">GDPR & CCPA Compliant</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    Full compliance with global privacy regulations. You control your data
                    with easy export and deletion options available anytime.
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 }}
            >
              <Card className="h-full bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-teal-500/50 transition-all">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-teal-500/20 flex items-center justify-center mb-4">
                    <Building2 className="h-6 w-6 text-teal-400" />
                  </div>
                  <CardTitle className="text-white">12,000+ Institutions</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-slate-400">
                    Connect securely to over 12,000 banks, credit unions, and financial
                    institutions across the United States and Canada.
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Trust Badges */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap justify-center gap-4"
          >
            {trustBadges.map((badge: string, i: number) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span className="text-slate-300">{badge}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      {faqs.length > 0 && (
        <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <Badge className="mb-4 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                FAQ
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Frequently Asked Questions
              </h2>
            </motion.div>

            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, i) => (
                <motion.div
                  key={faq.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <AccordionItem value={faq.id} className="border border-slate-800 rounded-lg px-4 bg-slate-900/50">
                    <AccordionTrigger className="text-left hover:no-underline py-4">
                      <span className="text-white">{faq.question}</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-slate-400 pb-4">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-600" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCAyLTRzLTItMi0yLTQgMi00IDItNCAyIDIgMiA0LTIgNC0yIDQgMiAyIDIgNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20" />
            <div className="relative px-8 py-16 sm:px-16 sm:py-20 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Take Control of Your Finances?
              </h2>
              <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
                Join thousands of users who have already transformed their financial lives with Budget Smart AI.
              </p>
              <a href="https://app.budgetsmart.io/signup" target="_self">
                <Button size="lg" className="bg-white text-emerald-600 hover:bg-slate-100 px-8 py-6 text-lg shadow-xl">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <p className="mt-4 text-sm text-white/60">
                Free Plan available. No credit card required.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">
                  {settings.company_name || "Budget Smart AI"}
                </span>
              </div>
              <p className="text-slate-400 max-w-sm">
                {settings.footer_description || "AI-first personal finance platform helping you make smarter financial decisions."}
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="text-slate-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#testimonials" className="text-slate-400 hover:text-white transition-colors">Reviews</a></li>
                <li><a href="#faq" className="text-slate-400 hover:text-white transition-colors">FAQ</a></li>
                <li><Link href="/affiliate" className="text-slate-400 hover:text-white transition-colors">Affiliate Program</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-slate-400 hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-slate-400 hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="/affiliate-terms" className="text-slate-400 hover:text-white transition-colors">Affiliate Terms</Link></li>
                <li><Link href="/security" className="text-slate-400 hover:text-white transition-colors">Security & Compliance</Link></li>
                <li><Link href="/trust" className="text-slate-400 hover:text-white transition-colors">Trust Center</Link></li>
                <li><Link href="/contact" className="text-slate-400 hover:text-white transition-colors">Contact</Link></li>
                <li><Link href="/support" className="text-slate-400 hover:text-white transition-colors">Support</Link></li>
                <li><button onClick={openCookieSettings} className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"><Cookie className="w-3 h-3" />Cookie Settings</button></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-400 text-sm">
              &copy; {new Date().getFullYear()} {settings.company_name || "Budget Smart AI"}. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              {settings.social_twitter && (
                <a href={settings.social_twitter} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors">
                  <ExternalLink className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* Sales Chatbot */}
      <SalesChatbot />
    </div>
  );
}
