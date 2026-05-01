/**
 * 404 page.
 *
 * UAT-15 fix (2026-04-30): the previous version of this page leaked the
 * dev-mode placeholder copy "Did you forget to add the page to the router?"
 * to end users. That message landed in front of UAT testers when they
 * navigated to /wealth, /forecast, or /money-timeline (group-only nav
 * items / legacy URLs that have no route registered). Replaced with
 * user-friendly copy and a link back to the dashboard.
 */
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 pb-6">
          <div className="flex mb-3 gap-2 items-center">
            <AlertCircle className="h-7 w-7 text-amber-500" />
            <h1 className="text-2xl font-bold">Page not found</h1>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            We couldn't find the page you're looking for. It may have moved or been
            renamed.
          </p>

          <div className="mt-5">
            <Link href="/dashboard">
              <Button variant="default" size="sm" className="gap-2" data-testid="button-404-back-home">
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
