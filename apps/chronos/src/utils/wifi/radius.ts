import { and, eq } from 'drizzle-orm';
import { db } from '#database';
import {
  wifiAuthLog,
  wifiDevice,
  wifiNas,
  wifiUser,
} from '#database/schema/wifi';
import {
  RADIUS_HEALTH_USERNAME,
  RADIUS_SESSION_TIMEOUT_SECONDS,
} from './constants';
import type { WifiController } from './controller';
import { decryptPassword } from './encryptor';
import { canonicalizeMac } from './mac';
import { resolveEffectiveSpeedProfile } from './speed-profile';

export type RadiusAuthorizeRequest = {
  IP?: string;
  NAS?: string;
  destination?: string;
  password: string;
  sharedSecret?: string;
  source: string;
  username: string;
};

export type RadiusAuthorizeResult = {
  body: Record<string, unknown>;
  status: 200 | 400 | 403 | 404 | 500;
};

export type RadiusAuthorizeOptions = {
  encryptionSecret: string;
  freeradiusIp: string;
  realIp?: string | undefined;
  sessionTimeoutSeconds?: number;
  sharedSecret: string;
  controller?: WifiController | undefined;
};

const reject = (
  status: RadiusAuthorizeResult['status'],
  message: string,
  code: string
) => ({
  body: { code, error: status === 404 ? 'Not Found' : 'Forbidden', message },
  status,
});

const normalizeSourceMac = (value: string): string => {
  try {
    return canonicalizeMac(value);
  } catch {
    return value.trim().toLowerCase();
  }
};

const normalizeNasMac = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  try {
    return canonicalizeMac(value);
  } catch {
    return null;
  }
};

type RadiusLogger = (
  result: boolean,
  failureReason: string | null,
  wifiUserId?: string
) => Promise<void>;

const validateRequestSource = async (
  request: RadiusAuthorizeRequest,
  options: RadiusAuthorizeOptions,
  nasMac: string | null,
  log: RadiusLogger
): Promise<RadiusAuthorizeResult | null> => {
  if (request.username === RADIUS_HEALTH_USERNAME) {
    if (request.source !== '02-00-00-00-00-01' || request.IP !== '127.0.0.1') {
      await log(false, 'forbidden_source');
      return reject(
        403,
        'You are not allowed to access this resource.',
        'FORBIDDEN'
      );
    }
    return null;
  }
  if (options.realIp !== options.freeradiusIp) {
    await log(false, 'forbidden_source');
    return reject(
      403,
      'You are not allowed to access this resource.',
      'FORBIDDEN'
    );
  }
  if (!(nasMac && request.IP)) {
    await log(false, 'nas_not_found');
    return reject(
      403,
      'You are not allowed to access this resource.',
      'FORBIDDEN'
    );
  }
  const [nas] = await db
    .select()
    .from(wifiNas)
    .where(
      and(eq(wifiNas.macAddress, nasMac), eq(wifiNas.ipAddress, request.IP))
    )
    .limit(1);
  if (!nas) {
    await log(false, 'nas_not_found');
    return reject(
      403,
      'You are not allowed to access this resource.',
      'FORBIDDEN'
    );
  }
  return null;
};

const enrichControllerDevice = (
  mac: string,
  account: typeof wifiUser.$inferSelect,
  controller: WifiController
): void => {
  Promise.all([
    controller
      .fetchClientHostname(mac)
      .then((reportedHostname) =>
        reportedHostname
          ? db
              .update(wifiDevice)
              .set({ reportedHostname, updatedAt: new Date() })
              .where(eq(wifiDevice.macAddress, mac))
          : undefined
      ),
    resolveEffectiveSpeedProfile(account).then((profileId) =>
      profileId ? controller.applySpeedProfile(mac, profileId) : undefined
    ),
  ]).catch(() => undefined);
};

export const authorizeRadius = async (
  request: RadiusAuthorizeRequest,
  options: RadiusAuthorizeOptions
): Promise<RadiusAuthorizeResult> => {
  const mac = normalizeSourceMac(request.source);
  const nasMac = normalizeNasMac(request.NAS);
  if (!options.sharedSecret || request.sharedSecret !== options.sharedSecret) {
    return reject(
      403,
      'You are not allowed to access this resource.',
      'FORBIDDEN'
    );
  }
  const log = async (
    result: boolean,
    failureReason: string | null,
    wifiUserId?: string
  ) => {
    await db.insert(wifiAuthLog).values({
      failureReason,
      macAddress: mac,
      nasIpAddress: request.IP ?? null,
      nasMacAddress: nasMac,
      result,
      username: request.username,
      wifiUserId,
    });
  };
  const sourceError = await validateRequestSource(
    request,
    options,
    nasMac,
    log
  );
  if (sourceError) {
    return sourceError;
  }
  const [globalDevice] = await db
    .select({ banned: wifiDevice.banned })
    .from(wifiDevice)
    .where(eq(wifiDevice.macAddress, mac))
    .limit(1);
  if (globalDevice?.banned) {
    await log(false, 'mac_banned_global');
    return reject(
      403,
      'You are not allowed to access this resource.',
      'FORBIDDEN'
    );
  }
  const [account] = await db
    .select()
    .from(wifiUser)
    .where(eq(wifiUser.username, request.username))
    .limit(1);
  if (!account) {
    await log(false, 'not_found');
    return reject(404, 'The requested user was not found.', 'NOT_FOUND');
  }
  if (account.banned) {
    await log(false, 'banned', account.id);
    return reject(
      403,
      'You are not allowed to access this resource.',
      'FORBIDDEN'
    );
  }
  const allowedMacs = account.allowedMacAddresses ?? [];
  if (
    allowedMacs.length > 0 &&
    !allowedMacs.some((allowed) => {
      try {
        return canonicalizeMac(allowed) === mac;
      } catch {
        return false;
      }
    })
  ) {
    await log(false, 'not_whitelisted', account.id);
    return reject(
      403,
      'This device is not allowed for this user.',
      'NOT_WHITELISTED'
    );
  }
  try {
    const password = decryptPassword(
      account.encryptedPassword,
      account.username,
      options.encryptionSecret,
      account.salt
    );
    if (password !== request.password) {
      await log(false, 'invalid_password', account.id);
      return reject(
        403,
        'You are not allowed to access this resource.',
        'FORBIDDEN'
      );
    }
    await db
      .insert(wifiDevice)
      .values({
        lastActiveAt: new Date(),
        macAddress: mac,
        wifiUserId: account.id,
      })
      .onConflictDoUpdate({
        set: {
          lastActiveAt: new Date(),
          updatedAt: new Date(),
          wifiUserId: account.id,
        },
        target: wifiDevice.macAddress,
      });
    await log(true, null, account.id);
    if (options.controller) {
      enrichControllerDevice(mac, account, options.controller);
    }
    return {
      body: {
        'Cleartext-Password': password,
        'control:Cleartext-Password': password,
        'Session-Timeout':
          options.sessionTimeoutSeconds ?? RADIUS_SESSION_TIMEOUT_SECONDS,
      },
      status: 200,
    };
  } catch {
    await log(false, 'invalid_password', account.id);
    return reject(
      500,
      'Internal error while authorizing WiFi user.',
      'INTERNAL_ERROR'
    );
  }
};
