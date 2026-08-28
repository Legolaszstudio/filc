import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '#database';
import { user } from '#database/schema/authentication';
import { wifiRoleSpeedProfile, type wifiUser } from '#database/schema/wifi';
import { SPEED_PROFILE_NONE } from './constants';

export type EffectiveSpeedProfile = {
  roleName: string | null;
  source: 'override' | 'role' | 'wlan_default';
  speedProfileId: string | null;
};

export const resolveEffectiveSpeedProfile = async (
  account: typeof wifiUser.$inferSelect
): Promise<string | null> => {
  const details = await resolveEffectiveSpeedProfileDetails(account);
  return details.speedProfileId;
};

export const resolveEffectiveSpeedProfileDetails = async (
  account: typeof wifiUser.$inferSelect
): Promise<EffectiveSpeedProfile> => {
  if (account.speedProfileId === SPEED_PROFILE_NONE) {
    return { roleName: null, source: 'wlan_default', speedProfileId: null };
  }
  if (account.speedProfileId !== null) {
    return {
      roleName: null,
      source: 'override',
      speedProfileId: account.speedProfileId,
    };
  }
  if (!account.userId) {
    return { roleName: null, source: 'wlan_default', speedProfileId: null };
  }

  const [filcUser] = await db
    .select({ roles: user.roles })
    .from(user)
    .where(eq(user.id, account.userId))
    .limit(1);
  const roles = filcUser?.roles ?? [];
  if (roles.length === 0) {
    return { roleName: null, source: 'wlan_default', speedProfileId: null };
  }

  const mappings = await db
    .select()
    .from(wifiRoleSpeedProfile)
    .where(inArray(wifiRoleSpeedProfile.roleName, roles))
    .orderBy(desc(wifiRoleSpeedProfile.priority));
  const mapping = mappings[0];
  return mapping
    ? {
        roleName: mapping.roleName,
        source: 'role',
        speedProfileId: mapping.speedProfileId,
      }
    : { roleName: null, source: 'wlan_default', speedProfileId: null };
};
