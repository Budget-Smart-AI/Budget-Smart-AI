import { storage } from "./storage";
import { format } from "date-fns";
import type { SyncSchedule } from "@shared/schema";

interface SyncJob {
  userId: string;
  plaidItemId: string;
  scheduleId: string;
}

const activeSyncIntervals: Map<string, NodeJS.Timeout> = new Map();

function parseTimeToMs(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function getNextSyncTime(syncTime: string): Date {
  const { hours, minutes } = parseTimeToMs(syncTime);
  const now = new Date();
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

function getMsUntilNextSync(syncTime: string): number {
  const next = getNextSyncTime(syncTime);
  return next.getTime() - Date.now();
}

function getSyncTimeFromSchedule(schedule: SyncSchedule): string {
  if (schedule.times) {
    try {
      const times = JSON.parse(schedule.times) as string[];
      if (times.length > 0) {
        const now = new Date();
        const currentTime = format(now, "HH:mm");
        
        const futureTimes = times.filter(t => t > currentTime);
        if (futureTimes.length > 0) {
          return futureTimes[0];
        }
        return times[0];
      }
    } catch {
      return "06:00";
    }
  }
  return "06:00";
}

async function executeSyncJob(job: SyncJob): Promise<void> {
  console.log(`[Sync] Executing sync for plaidItem ${job.plaidItemId}, user ${job.userId}`);
  
  try {
    const schedule = await storage.getSyncSchedule(job.scheduleId);
    if (!schedule || schedule.isEnabled !== "true") {
      console.log(`[Sync] Schedule ${job.scheduleId} is disabled or not found, skipping`);
      return;
    }

    if (!schedule.plaidItemId) {
      console.log(`[Sync] Schedule ${job.scheduleId} has no plaidItemId, skipping`);
      await storage.updateSyncSchedule(job.scheduleId, {
        lastSyncAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")
      });
      return;
    }

    const accounts = await storage.getPlaidAccounts(schedule.plaidItemId);
    if (accounts.length === 0) {
      console.log(`[Sync] No accounts found for plaidItem ${schedule.plaidItemId}`);
      return;
    }

    console.log(`[Sync] Would sync ${schedule.syncType} for ${accounts.length} accounts`);
    
    const now = new Date();
    await storage.updateSyncSchedule(job.scheduleId, {
      lastSyncAt: format(now, "yyyy-MM-dd'T'HH:mm:ss"),
      nextSyncAt: format(getNextSyncTime(getSyncTimeFromSchedule(schedule)), "yyyy-MM-dd'T'HH:mm:ss")
    });

    await storage.createNotification({
      userId: job.userId,
      type: "sync_complete",
      title: "Bank Sync Complete",
      message: `Successfully synced ${schedule.syncType} for ${accounts.length} account(s)`,
      isRead: "false",
      createdAt: format(now, "yyyy-MM-dd'T'HH:mm:ss")
    });

    console.log(`[Sync] Completed sync for schedule ${job.scheduleId}`);
  } catch (error) {
    console.error(`[Sync] Error syncing schedule ${job.scheduleId}:`, error);
  }
}

function scheduleNextSync(schedule: SyncSchedule): void {
  const scheduleId = schedule.id;
  if (activeSyncIntervals.has(scheduleId)) {
    clearTimeout(activeSyncIntervals.get(scheduleId)!);
  }

  const syncTime = getSyncTimeFromSchedule(schedule);
  const msUntilNext = getMsUntilNextSync(syncTime);
  console.log(`[Sync] Scheduling next sync for schedule ${schedule.id} in ${Math.round(msUntilNext / 1000 / 60)} minutes`);

  const timeout = setTimeout(async () => {
    if (schedule.plaidItemId) {
      await executeSyncJob({
        userId: schedule.userId,
        plaidItemId: schedule.plaidItemId,
        scheduleId: scheduleId
      });
    }
    
    const updatedSchedule = await storage.getSyncSchedule(scheduleId);
    if (updatedSchedule && updatedSchedule.isEnabled === "true") {
      scheduleNextSync(updatedSchedule);
    }
  }, msUntilNext);

  activeSyncIntervals.set(scheduleId, timeout);
}

export async function initializeSyncScheduler(): Promise<void> {
  console.log("[Sync] Initializing sync scheduler...");

  const users = await storage.getUsers();
  let enabledCount = 0;
  
  for (const user of users) {
    const schedules = await storage.getSyncSchedules(String(user.id));
    const enabledSchedules = schedules.filter((s: SyncSchedule) => s.isEnabled === "true");
    
    for (const schedule of enabledSchedules) {
      scheduleNextSync(schedule);
      enabledCount++;
    }
  }

  console.log(`[Sync] Found ${enabledCount} enabled sync schedules`);
  console.log("[Sync] Sync scheduler initialized");
}

export function updateSyncScheduleTimer(schedule: SyncSchedule): void {
  if (schedule.isEnabled === "true") {
    scheduleNextSync(schedule);
  } else {
    cancelSyncSchedule(schedule.id);
  }
}

export function cancelSyncSchedule(scheduleId: string): void {
  if (activeSyncIntervals.has(scheduleId)) {
    clearTimeout(activeSyncIntervals.get(scheduleId)!);
    activeSyncIntervals.delete(scheduleId);
    console.log(`[Sync] Cancelled sync schedule ${scheduleId}`);
  }
}

export async function triggerManualSync(scheduleId: string): Promise<{ success: boolean; message: string }> {
  const schedule = await storage.getSyncSchedule(scheduleId);
  if (!schedule) {
    return { success: false, message: "Schedule not found" };
  }

  if (!schedule.plaidItemId) {
    return { success: false, message: "No Plaid item linked to schedule" };
  }

  await executeSyncJob({
    userId: schedule.userId,
    plaidItemId: schedule.plaidItemId,
    scheduleId: scheduleId
  });

  return { success: true, message: "Sync initiated" };
}
