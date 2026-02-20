import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Mail, Bell, Calendar, Clock, Save, Send, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const REMINDER_DAYS = [
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
  { value: "5", label: "5 days before" },
  { value: "7", label: "1 week before" },
];

interface TestEmailResult {
  success: boolean;
  message: string;
  details?: string;
}

export default function EmailSettings() {
  const { toast } = useToast();
  const [testEmailResult, setTestEmailResult] = useState<TestEmailResult | null>(null);

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ["/api/notification-settings"],
  });

  const [formData, setFormData] = useState({
    emailEnabled: true,
    emailAddress: "",
    billReminderDays: 1,
    billReminderTime: "09:00",
    budgetAlertEnabled: true,
    budgetAlertThreshold: 80,
    weeklyDigestEnabled: false,
    weeklyDigestDay: 0,
    monthlyReportEnabled: true,
    inAppNotificationsEnabled: true,
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notification-settings/test-email");
      return response.json();
    },
    onSuccess: (data: TestEmailResult) => {
      setTestEmailResult(data);
      if (data.success) {
        toast({ title: "Test email sent!", description: "Check your inbox" });
      } else {
        toast({ title: "Test email failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      setTestEmailResult({
        success: false,
        message: "Failed to send test email",
        details: error.message || "Unknown error occurred"
      });
      toast({ title: "Test email failed", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        emailEnabled: settings.emailEnabled === "true",
        emailAddress: settings.emailAddress || "",
        billReminderDays: settings.billReminderDays || 1,
        billReminderTime: settings.billReminderTime || "09:00",
        budgetAlertEnabled: settings.budgetAlertEnabled === "true",
        budgetAlertThreshold: settings.budgetAlertThreshold || 80,
        weeklyDigestEnabled: settings.weeklyDigestEnabled === "true",
        weeklyDigestDay: settings.weeklyDigestDay || 0,
        monthlyReportEnabled: settings.monthlyReportEnabled === "true",
        inAppNotificationsEnabled: settings.inAppNotificationsEnabled === "true",
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", "/api/notification-settings", {
        emailEnabled: data.emailEnabled ? "true" : "false",
        emailAddress: data.emailAddress || null,
        billReminderDays: data.billReminderDays,
        billReminderTime: data.billReminderTime,
        budgetAlertEnabled: data.budgetAlertEnabled ? "true" : "false",
        budgetAlertThreshold: data.budgetAlertThreshold,
        weeklyDigestEnabled: data.weeklyDigestEnabled ? "true" : "false",
        weeklyDigestDay: data.weeklyDigestDay,
        monthlyReportEnabled: data.monthlyReportEnabled ? "true" : "false",
        inAppNotificationsEnabled: data.inAppNotificationsEnabled ? "true" : "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-settings"] });
      toast({ title: "Settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Email & Notification Settings</h1>
            <HelpTooltip
              title="About Email Settings"
              content="Configure when and how you receive email notifications. Set reminder timing for bills, choose notification frequency, and set preferred delivery times to stay informed without being overwhelmed."
            />
          </div>
          <p className="text-muted-foreground">Configure how and when you receive alerts</p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-settings">
          <Save className="w-4 h-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Settings
          </CardTitle>
          <CardDescription>Configure your email notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="emailEnabled">Enable Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive notifications via email</p>
            </div>
            <Switch
              id="emailEnabled"
              checked={formData.emailEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, emailEnabled: checked })}
              data-testid="switch-email-enabled"
            />
          </div>

          {formData.emailEnabled && (
            <div className="space-y-2">
              <Label htmlFor="emailAddress">Notification Email Address</Label>
              <Input
                id="emailAddress"
                type="email"
                placeholder="your@email.com, spouse@email.com"
                value={formData.emailAddress}
                onChange={(e) => setFormData({ ...formData, emailAddress: e.target.value })}
                data-testid="input-email-address"
              />
              <p className="text-sm text-muted-foreground">
                Leave blank to use your account email. You can add multiple emails separated by commas.
              </p>
            </div>
          )}

          {formData.emailEnabled && (
            <div className="border-t pt-6 space-y-4">
              <div>
                <Label>Test Email Configuration</Label>
                <p className="text-sm text-muted-foreground">
                  Send a test email to verify your email notifications are working
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTestEmailResult(null);
                    testEmailMutation.mutate();
                  }}
                  disabled={testEmailMutation.isPending}
                  data-testid="button-test-email"
                >
                  {testEmailMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Test Email
                    </>
                  )}
                </Button>
              </div>

              {testEmailResult && (
                <div
                  className={`p-4 rounded-lg border ${
                    testEmailResult.success
                      ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                      : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {testEmailResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p
                        className={`font-medium ${
                          testEmailResult.success
                            ? "text-green-800 dark:text-green-200"
                            : "text-red-800 dark:text-red-200"
                        }`}
                      >
                        {testEmailResult.message}
                      </p>
                      {testEmailResult.details && (
                        <p
                          className={`text-sm mt-1 ${
                            testEmailResult.success
                              ? "text-green-700 dark:text-green-300"
                              : "text-red-700 dark:text-red-300"
                          }`}
                        >
                          {testEmailResult.details}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Bill Reminders
          </CardTitle>
          <CardDescription>Get reminded before your bills are due</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Remind me</Label>
              <Select
                value={String(formData.billReminderDays)}
                onValueChange={(value) => setFormData({ ...formData, billReminderDays: parseInt(value) })}
              >
                <SelectTrigger data-testid="select-reminder-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_DAYS.map((day) => (
                    <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billReminderTime">At time</Label>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Input
                  id="billReminderTime"
                  type="time"
                  value={formData.billReminderTime}
                  onChange={(e) => setFormData({ ...formData, billReminderTime: e.target.value })}
                  data-testid="input-reminder-time"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Budget Alerts
          </CardTitle>
          <CardDescription>Get notified when you're approaching budget limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="budgetAlertEnabled">Enable Budget Alerts</Label>
              <p className="text-sm text-muted-foreground">Alert when spending exceeds threshold</p>
            </div>
            <Switch
              id="budgetAlertEnabled"
              checked={formData.budgetAlertEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, budgetAlertEnabled: checked })}
              data-testid="switch-budget-alert"
            />
          </div>

          {formData.budgetAlertEnabled && (
            <div className="space-y-2">
              <Label htmlFor="budgetAlertThreshold">Alert Threshold</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="budgetAlertThreshold"
                  type="number"
                  min="50"
                  max="100"
                  value={formData.budgetAlertThreshold}
                  onChange={(e) => setFormData({ ...formData, budgetAlertThreshold: parseInt(e.target.value) })}
                  className="w-24"
                  data-testid="input-budget-threshold"
                />
                <span className="text-sm text-muted-foreground">% of budget</span>
              </div>
              <p className="text-sm text-muted-foreground">
                You'll be notified when spending reaches {formData.budgetAlertThreshold}% of your budget
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Digest Reports</CardTitle>
          <CardDescription>Periodic summary reports of your finances</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="weeklyDigestEnabled">Weekly Digest</Label>
              <p className="text-sm text-muted-foreground">Summary of your weekly spending</p>
            </div>
            <Switch
              id="weeklyDigestEnabled"
              checked={formData.weeklyDigestEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, weeklyDigestEnabled: checked })}
              data-testid="switch-weekly-digest"
            />
          </div>

          {formData.weeklyDigestEnabled && (
            <div className="space-y-2">
              <Label>Send on</Label>
              <Select
                value={String(formData.weeklyDigestDay)}
                onValueChange={(value) => setFormData({ ...formData, weeklyDigestDay: parseInt(value) })}
              >
                <SelectTrigger className="w-48" data-testid="select-weekly-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="monthlyReportEnabled">Monthly Report</Label>
              <p className="text-sm text-muted-foreground">Detailed monthly financial summary</p>
            </div>
            <Switch
              id="monthlyReportEnabled"
              checked={formData.monthlyReportEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, monthlyReportEnabled: checked })}
              data-testid="switch-monthly-report"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>In-App Notifications</CardTitle>
          <CardDescription>Notifications shown within the app</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="inAppNotificationsEnabled">Enable In-App Notifications</Label>
              <p className="text-sm text-muted-foreground">Show notifications in the app's notification center</p>
            </div>
            <Switch
              id="inAppNotificationsEnabled"
              checked={formData.inAppNotificationsEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, inAppNotificationsEnabled: checked })}
              data-testid="switch-in-app"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
