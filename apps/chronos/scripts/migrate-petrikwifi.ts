import { Database } from 'bun:sqlite';
import { db } from '../src/database';
import {
  wifiDevice,
  wifiNas,
  wifiUser,
} from '../src/database/schema/wifi';
import { WIFI_ENTRA_CREATOR_ID } from '../src/utils/wifi/constants';
import { eq } from 'drizzle-orm';
import { canonicalizeMac } from '../src/utils/wifi/mac';
import { randomUUID } from 'crypto';

async function main() {
  const sqliteDbPath = process.env.PETRIKWIFI_DB_PATH;
  if (!sqliteDbPath) {
    console.error('PETRIKWIFI_DB_PATH is not set');
    process.exit(1);
  }

  console.log(`Reading from ${sqliteDbPath}`);
  const sqlite = new Database(sqliteDbPath);

  const users = sqlite.query('SELECT * FROM Users').all() as any[];
  console.log(`Migrating ${users.length} users...`);

  // We need to map old SQLite integer userID to new UUIDs
  const userIdMap = new Map<number, string>();

  for (const user of users) {
    const allowedDevices = user.allowedDevices ? JSON.parse(user.allowedDevices) : [];
    
    const [inserted] = await db.insert(wifiUser).values({
      username: user.username,
      encryptedPassword: user.password,
      salt: user.salt,
      banned: Boolean(user.banned),
      createdBy: WIFI_ENTRA_CREATOR_ID,
      comment: user.comment,
      allowedMacAddresses: allowedDevices,
    }).returning({ id: wifiUser.id });
    
    if (inserted) {
      userIdMap.set(user.userID, inserted.id);
    }
  }

  const devices = sqlite.query('SELECT * FROM Devices').all() as any[];
  console.log(`Migrating ${devices.length} devices...`);

  for (const device of devices) {
    const macAddress = canonicalizeMac(device.device);
    const wifiUserId = userIdMap.get(device.userID);
    if (!wifiUserId && !device.banned) {
      console.warn(`Device ${macAddress} has unknown userID ${device.userID} and is not banned, skipping`);
      continue;
    }

    const lastActiveAt = device.lastActive ? new Date(device.lastActive) : null;

    try {
      await db.insert(wifiDevice).values({
        macAddress,
        wifiUserId: wifiUserId || null,
        nickname: device.comment,
        banned: Boolean(device.banned),
        lastActiveAt,
      });
    } catch (e: any) {
      if (e.message?.includes('duplicate key value')) {
        // Just skip duplicates
        console.warn(`Device ${macAddress} already exists, skipping`);
      } else {
        throw e;
      }
    }
  }

  const aps = sqlite.query('SELECT * FROM APs').all() as any[];
  console.log(`Migrating ${aps.length} APs...`);

  for (const ap of aps) {
    const macAddress = canonicalizeMac(ap.AP);
    try {
      await db.insert(wifiNas).values({
        macAddress,
        ipAddress: ap.IP,
        comment: ap.comment,
      });
    } catch (e: any) {
      if (e.message?.includes('duplicate key value')) {
        console.warn(`NAS ${macAddress} already exists, skipping`);
      } else {
        throw e;
      }
    }
  }

  console.log('Migration complete!');
  process.exit(0);
}

main().catch(console.error);
