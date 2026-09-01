import { eq, lt } from 'drizzle-orm';
import { db } from '#database';
import { wifiSpeedProfile } from '#database/schema/wifi';
import { getWifiController } from './controller';

export async function syncSpeedProfiles() {
  const controller = getWifiController();
  if (!controller) {
    return;
  }

  const profiles = await controller.getSpeedProfiles();
  const syncedAt = new Date();

  // Upsert all fetched profiles
  for (const profile of profiles) {
    await db
      .insert(wifiSpeedProfile)
      .values({
        id: profile.id,
        name: profile.name,
        downloadSpeedMbps: profile.downloadSpeedMbps ?? null,
        uploadSpeedMbps: profile.uploadSpeedMbps ?? null,
        syncedAt,
      })
      .onConflictDoUpdate({
        target: wifiSpeedProfile.id,
        set: {
          name: profile.name,
          downloadSpeedMbps: profile.downloadSpeedMbps ?? null,
          uploadSpeedMbps: profile.uploadSpeedMbps ?? null,
          syncedAt,
        },
      });
  }

  // Delete profiles that no longer exist in the controller
  await db.delete(wifiSpeedProfile).where(lt(wifiSpeedProfile.syncedAt, syncedAt));
}

