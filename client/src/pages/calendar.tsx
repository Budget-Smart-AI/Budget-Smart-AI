// FEATURE: CALENDAR_VIEW | tier: free | limit: unlimited
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Receipt, DollarSign, Target, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isToday } from "date-fns";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "bill" | "income" | "goal";
  amount: string;
  category?: string;
  recurring?: boolean;
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getEventIcon(type: string) {
  switch (type) {
    case "bill": return <Receipt className="h-3 w-3" />;
    case "income": return <DollarSign className="h-3 w-3" />;
    case "goal": return <Target className="h-3 w-3" />;
    default: return null;
  }
}

function getEventColor(type: string) {
  switch (type) {
    case "bill": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    case "income": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
    case "goal": return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

export default function FinancialCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events", { startDate: format(monthStart, "yyyy-MM-dd"), endDate: format(monthEnd, "yyyy-MM-dd") }],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?startDate=${format(monthStart, "yyyy-MM-dd")}&endDate=${format(monthEnd, "yyyy-MM-dd")}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get events for a specific day
  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return events.filter(e => e.date === dateStr);
  };

  // Calculate monthly totals
  const monthlyBills = events.filter(e => e.type === "bill").reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const monthlyIncome = events.filter(e => e.type === "income").reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // Upcoming events (next 7 days from today)
  const today = new Date();
  const upcomingEvents = events
    .filter(e => {
      const eventDate = parseISO(e.date);
      return eventDate >= today;
    })
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Financial Calendar</h1>
          <p className="text-muted-foreground">View your bills, income, and goals</p>
        </div>
      </div>

      {/* Monthly Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-red-600">
              <Receipt className="h-5 w-5" />
              <CardTitle className="text-base">Bills Due</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlyBills)}</div>
            <p className="text-sm text-muted-foreground">
              {events.filter(e => e.type === "bill").length} bill{events.filter(e => e.type === "bill").length !== 1 ? "s" : ""} · {format(monthStart, "MMM d")}–{format(monthEnd, "MMM d, yyyy")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-green-600">
              <DollarSign className="h-5 w-5" />
              <CardTitle className="text-base">Expected Income</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlyIncome)}</div>
            <p className="text-sm text-muted-foreground">
              {events.filter(e => e.type === "income").length} payments expected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-blue-600">
              <Target className="h-5 w-5" />
              <CardTitle className="text-base">Goal Deadlines</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.filter(e => e.type === "goal").length}</div>
            <p className="text-sm text-muted-foreground">goals with deadlines this month</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{format(currentDate, "MMMM yyyy")}</CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before month start */}
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-24 p-1 bg-muted/30 rounded" />
              ))}

              {days.map(day => {
                const dayEvents = getEventsForDay(day);
                const isCurrentDay = isToday(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-24 p-1 border rounded transition-colors",
                      isCurrentDay && "bg-primary/5 border-primary",
                      !isCurrentDay && "hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "text-sm font-medium mb-1",
                      isCurrentDay && "text-primary"
                    )}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map(event => (
                        <div
                          key={event.id}
                          className={cn(
                            "text-xs p-1 rounded border truncate flex items-center gap-1",
                            getEventColor(event.type)
                          )}
                          title={`${event.title}: ${formatCurrency(event.amount)}`}
                        >
                          {getEventIcon(event.type)}
                          <span className="truncate">{event.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Events Sidebar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No upcoming events this month
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(event => (
                  <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <div className={cn(
                      "p-2 rounded-full",
                      event.type === "bill" && "bg-red-100 text-red-600",
                      event.type === "income" && "bg-green-100 text-green-600",
                      event.type === "goal" && "bg-blue-100 text-blue-600"
                    )}>
                      {getEventIcon(event.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(event.date), "MMM d")}
                      </p>
                      <p className={cn(
                        "text-sm font-medium",
                        event.type === "bill" && "text-red-600",
                        event.type === "income" && "text-green-600",
                        event.type === "goal" && "text-blue-600"
                      )}>
                        {formatCurrency(event.amount)}
                      </p>
                    </div>
                    {event.recurring && (
                      <Badge variant="secondary" className="text-xs">Recurring</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-100 border border-red-200" />
              <span className="text-sm">Bills</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-200" />
              <span className="text-sm">Income</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200" />
              <span className="text-sm">Goals</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
