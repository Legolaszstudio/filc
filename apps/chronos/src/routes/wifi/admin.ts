import {
  wifiAuthLogListQuerySchema,
  wifiAuthLogSchema,
  wifiDeviceCreateSchema,
  wifiDeviceSchema,
  wifiDeviceUpdateSchema,
  wifiIdParamSchema,
  wifiListQuerySchema,
  wifiNasCreateSchema,
  wifiNasSchema,
  wifiNasUpdateSchema,
  wifiRoleSpeedProfileCreateSchema,
  wifiRoleSpeedProfileSchema,
  wifiRoleSpeedProfileUpdateSchema,
  wifiSpeedProfileCreateSchema,
  wifiSpeedProfileSchema,
  wifiSpeedProfileUpdateSchema,
  wifiUserCreateSchema,
  wifiUserSchema,
  wifiUserUpdateSchema,
} from '@filcdev/api/domains/wifi/admin';
import { permissions } from '@filcdev/api/permissions';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { describeRoute, resolver } from 'hono-openapi';
import { StatusCodes } from 'http-status-codes';
import { db } from '#database';
import {
  wifiAuthLog,
  wifiDevice,
  wifiNas,
  wifiRoleSpeedProfile,
  wifiSpeedProfile,
  wifiUser,
} from '#database/schema/wifi';
import { authRouter } from '#middleware/auth';
import { env } from '#utils/environment';
import { created, notFound, ok } from '#utils/http';
import { filcExt } from '#utils/openapi';
import {
  getWifiController,
  type WifiSpeedProfile,
} from '#utils/wifi/controller';
import { encryptPassword } from '#utils/wifi/encryptor';
import { canonicalizeMac } from '#utils/wifi/mac';
import { wifiFactory } from './_factory';

const response = (
  schema: Parameters<typeof resolver>[0],
  description: string
) => ({
  200: {
    content: { 'application/json': { schema: resolver(schema) } },
    description,
  },
});

const userListSchema = wifiUserSchema.array();
const deviceListSchema = wifiDeviceSchema.array();
const nasListSchema = wifiNasSchema.array();
const speedProfileListSchema = wifiSpeedProfileSchema.array();
const roleProfileListSchema = wifiRoleSpeedProfileSchema.array();

const { schema: wifiUserCreateOpenApiSchema } =
  await resolver(wifiUserCreateSchema).toOpenAPISchema();
const { schema: wifiUserUpdateOpenApiSchema } =
  await resolver(wifiUserUpdateSchema).toOpenAPISchema();
const { schema: wifiDeviceCreateOpenApiSchema } = await resolver(
  wifiDeviceCreateSchema
).toOpenAPISchema();
const { schema: wifiDeviceUpdateOpenApiSchema } = await resolver(
  wifiDeviceUpdateSchema
).toOpenAPISchema();
const { schema: wifiNasCreateOpenApiSchema } =
  await resolver(wifiNasCreateSchema).toOpenAPISchema();
const { schema: wifiNasUpdateOpenApiSchema } =
  await resolver(wifiNasUpdateSchema).toOpenAPISchema();
const { schema: wifiSpeedProfileCreateOpenApiSchema } = await resolver(
  wifiSpeedProfileCreateSchema
).toOpenAPISchema();
const { schema: wifiSpeedProfileUpdateOpenApiSchema } = await resolver(
  wifiSpeedProfileUpdateSchema
).toOpenAPISchema();
const { schema: wifiRoleProfileCreateOpenApiSchema } = await resolver(
  wifiRoleSpeedProfileCreateSchema
).toOpenAPISchema();
const { schema: wifiRoleProfileUpdateOpenApiSchema } = await resolver(
  wifiRoleSpeedProfileUpdateSchema
).toOpenAPISchema();

const configured = () => {
  const controller = getWifiController();
  if (!controller) {
    throw new HTTPException(StatusCodes.SERVICE_UNAVAILABLE, {
      message: 'No WiFi controller is configured',
    });
  }
  return controller;
};

const serializeSpeedProfile = (
  profile: WifiSpeedProfile | undefined,
  isWlanDefault = false
) => {
  if (!profile) {
    throw new HTTPException(StatusCodes.SERVICE_UNAVAILABLE, {
      message: 'UniFi did not return a speed profile',
    });
  }
  return {
    downloadSpeedMbps: profile.downloadSpeedMbps ?? null,
    id: profile.id,
    isWlanDefault,
    name: profile.name,
    uploadSpeedMbps: profile.uploadSpeedMbps ?? null,
  };
};

export const listWifiUsersRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiUserListResponse'),
    description: 'List WiFi user accounts.',
    responses: response(userListSchema, 'WiFi users'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiRead),
  zValidator('query', wifiListQuerySchema),
  async (c) => {
    const { limit, offset, search } = c.req.valid('query');
    const users = await db
      .select()
      .from(wifiUser)
      .where(search ? ilike(wifiUser.username, `%${search}%`) : undefined)
      .orderBy(desc(wifiUser.createdAt))
      .limit(limit)
      .offset(offset);
    return ok(c, users);
  }
);

export const createWifiUserRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiUserResponse'),
    description: 'Create a WiFi user account.',
    requestBody: {
      content: { 'application/json': { schema: wifiUserCreateOpenApiSchema } },
    },
    responses: response(wifiUserSchema, 'WiFi user created'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiUserCreateSchema),
  async (c) => {
    const payload = c.req.valid('json');
    if (!env.wifiEncryptionSecret) {
      throw new HTTPException(StatusCodes.SERVICE_UNAVAILABLE, {
        message: 'WiFi encryption is not configured',
      });
    }
    const encrypted = encryptPassword(
      payload.password,
      payload.username,
      env.wifiEncryptionSecret
    );
    const [user] = await db
      .insert(wifiUser)
      .values({
        allowedMacAddresses: payload.allowedMacAddresses,
        comment: payload.comment,
        createdBy: c.var.session.userId,
        encryptedPassword: encrypted.encryptedPassword,
        salt: encrypted.salt,
        speedProfileId: payload.speedProfileId,
        userId: payload.userId,
        username: payload.username,
      })
      .returning();
    return created(c, { user });
  }
);

export const updateWifiUserRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiUserResponse'),
    description: 'Update a WiFi user account.',
    requestBody: {
      content: { 'application/json': { schema: wifiUserUpdateOpenApiSchema } },
    },
    responses: response(wifiUserSchema, 'WiFi user updated'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiUserUpdateSchema),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const existing = (
      await db
        .select()
        .from(wifiUser)
        .where(eq(wifiUser.id, c.req.valid('param').id))
        .limit(1)
    )[0];
    if (!existing) {
      throw notFound('WiFi user not found');
    }
    if (
      payload.username &&
      payload.username !== existing.username &&
      !payload.password
    ) {
      throw new HTTPException(StatusCodes.BAD_REQUEST, {
        message: 'Changing the username requires changing the password',
      });
    }
    const update: Partial<typeof wifiUser.$inferInsert> = {
      updatedAt: new Date(),
    };
    Object.assign(update, payload);
    (update as Record<string, unknown>).password = undefined;
    if (payload.password) {
      const username = payload.username ?? existing.username;
      if (!env.wifiEncryptionSecret) {
        throw new HTTPException(StatusCodes.BAD_REQUEST, {
          message:
            'Username and encryption configuration are required to change the password',
        });
      }
      const encrypted = encryptPassword(
        payload.password,
        username,
        env.wifiEncryptionSecret
      );
      update.encryptedPassword = encrypted.encryptedPassword;
      update.salt = encrypted.salt;
    }
    const [user] = await db
      .update(wifiUser)
      .set(update)
      .where(eq(wifiUser.id, c.req.valid('param').id))
      .returning();
    if (!user) {
      throw notFound('WiFi user not found');
    }
    return ok(c, user);
  }
);

export const deleteWifiUserRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@nodata'),
    description: 'Delete a WiFi user account.',
    responses: { 200: { description: 'WiFi user deleted' } },
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const [deleted] = await db
      .delete(wifiUser)
      .where(eq(wifiUser.id, c.req.valid('param').id))
      .returning();
    if (!deleted) {
      throw notFound('WiFi user not found');
    }
    return ok(c, undefined);
  }
);

export const listWifiDevicesRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiDeviceListResponse'),
    description: 'List WiFi devices and global MAC bans.',
    responses: response(deviceListSchema, 'WiFi devices'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiRead),
  zValidator('query', wifiListQuerySchema),
  async (c) => {
    const { limit, offset, search } = c.req.valid('query');
    const devices = await db
      .select()
      .from(wifiDevice)
      .where(search ? ilike(wifiDevice.macAddress, `%${search}%`) : undefined)
      .orderBy(desc(wifiDevice.updatedAt))
      .limit(limit)
      .offset(offset);
    return ok(c, devices);
  }
);

export const createWifiDeviceRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiDeviceResponse'),
    description: 'Create a WiFi device or global MAC ban.',
    requestBody: {
      content: {
        'application/json': { schema: wifiDeviceCreateOpenApiSchema },
      },
    },
    responses: response(wifiDeviceSchema, 'WiFi device created'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiDeviceCreateSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const [device] = await db
      .insert(wifiDevice)
      .values({ ...payload, macAddress: canonicalizeMac(payload.macAddress) })
      .returning();
    return created(c, { device });
  }
);

export const updateWifiDeviceRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiDeviceResponse'),
    description: 'Update a WiFi device or global MAC ban.',
    requestBody: {
      content: {
        'application/json': { schema: wifiDeviceUpdateOpenApiSchema },
      },
    },
    responses: response(wifiDeviceSchema, 'WiFi device updated'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiDeviceUpdateSchema),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const update = {
      ...payload,
      ...(payload.macAddress
        ? { macAddress: canonicalizeMac(payload.macAddress) }
        : {}),
      updatedAt: new Date(),
    };
    const [device] = await db
      .update(wifiDevice)
      .set(update)
      .where(eq(wifiDevice.id, c.req.valid('param').id))
      .returning();
    if (!device) {
      throw notFound('WiFi device not found');
    }
    return ok(c, device);
  }
);

export const deleteWifiDeviceRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@nodata'),
    description: 'Delete a WiFi device or global MAC ban.',
    responses: { 200: { description: 'WiFi device deleted' } },
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const [deleted] = await db
      .delete(wifiDevice)
      .where(eq(wifiDevice.id, c.req.valid('param').id))
      .returning();
    if (!deleted) {
      throw notFound('WiFi device not found');
    }
    return ok(c, undefined);
  }
);

export const listWifiNasRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiNasListResponse'),
    description: 'List authorized WiFi NAS devices.',
    responses: response(nasListSchema, 'WiFi NAS devices'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiRead),
  async (c) =>
    ok(c, await db.select().from(wifiNas).orderBy(desc(wifiNas.updatedAt)))
);

export const createWifiNasRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiNasResponse'),
    description: 'Register a WiFi NAS device.',
    requestBody: {
      content: { 'application/json': { schema: wifiNasCreateOpenApiSchema } },
    },
    responses: response(wifiNasSchema, 'WiFi NAS created'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiNasCreateSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const [nas] = await db
      .insert(wifiNas)
      .values({ ...payload, macAddress: canonicalizeMac(payload.macAddress) })
      .returning();
    return created(c, { nas });
  }
);

export const updateWifiNasRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiNasResponse'),
    description: 'Update a WiFi NAS device.',
    requestBody: {
      content: { 'application/json': { schema: wifiNasUpdateOpenApiSchema } },
    },
    responses: response(wifiNasSchema, 'WiFi NAS updated'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiNasUpdateSchema),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const update = {
      ...payload,
      ...(payload.macAddress
        ? { macAddress: canonicalizeMac(payload.macAddress) }
        : {}),
      updatedAt: new Date(),
    };
    const [nas] = await db
      .update(wifiNas)
      .set(update)
      .where(eq(wifiNas.id, c.req.valid('param').id))
      .returning();
    if (!nas) {
      throw notFound('WiFi NAS not found');
    }
    return ok(c, nas);
  }
);

export const deleteWifiNasRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@nodata'),
    description: 'Delete a WiFi NAS device.',
    responses: { 200: { description: 'WiFi NAS deleted' } },
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const [deleted] = await db
      .delete(wifiNas)
      .where(eq(wifiNas.id, c.req.valid('param').id))
      .returning();
    if (!deleted) {
      throw notFound('WiFi NAS not found');
    }
    return ok(c, undefined);
  }
);

export const listWifiSpeedProfilesRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiSpeedProfileListResponse'),
    description: 'List UniFi WiFi speed profiles.',
    responses: response(speedProfileListSchema, 'WiFi speed profiles'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiRead),
  async (c) => {
    const profiles = await configured().getSpeedProfiles();
    const dbProfiles = await db
      .select({
        id: wifiSpeedProfile.id,
        isWlanDefault: wifiSpeedProfile.isWlanDefault,
      })
      .from(wifiSpeedProfile);

    return ok(
      c,
      profiles.map((p) => {
        const dbProfile = dbProfiles.find((dbp) => dbp.id === p.id);
        return serializeSpeedProfile(p, dbProfile?.isWlanDefault ?? false);
      })
    );
  }
);

export const createWifiSpeedProfileRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiSpeedProfileResponse'),
    description: 'Create a UniFi WiFi speed profile.',
    requestBody: {
      content: {
        'application/json': { schema: wifiSpeedProfileCreateOpenApiSchema },
      },
    },
    responses: response(wifiSpeedProfileSchema, 'WiFi speed profile created'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiSpeedProfileCreateSchema),
  async (c) => {
    const controller = configured();
    const payload = c.req.valid('json');
    const profile = await controller.createSpeedProfile(payload);
    return created(c, { profile: serializeSpeedProfile(profile) });
  }
);

export const updateWifiSpeedProfileRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiSpeedProfileResponse'),
    description: 'Update a UniFi WiFi speed profile.',
    requestBody: {
      content: {
        'application/json': { schema: wifiSpeedProfileUpdateOpenApiSchema },
      },
    },
    responses: response(wifiSpeedProfileSchema, 'WiFi speed profile updated'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiSpeedProfileUpdateSchema),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const controller = configured();
    const payload = c.req.valid('json');
    const current = (await controller.getSpeedProfiles()).find(
      (speedProfile) => speedProfile.id === c.req.valid('param').id
    );
    if (!current) {
      throw notFound('WiFi speed profile not found');
    }
    const profile = await controller.updateSpeedProfile(
      c.req.valid('param').id,
      {
        downloadSpeedMbps:
          payload.downloadSpeedMbps ?? current.downloadSpeedMbps ?? -1,
        name: payload.name ?? current.name,
        uploadSpeedMbps:
          payload.uploadSpeedMbps ?? current.uploadSpeedMbps ?? -1,
      }
    );
    const [dbProfile] = await db
      .select({ isWlanDefault: wifiSpeedProfile.isWlanDefault })
      .from(wifiSpeedProfile)
      .where(eq(wifiSpeedProfile.id, profile.id))
      .limit(1);
    return ok(
      c,
      serializeSpeedProfile(profile, dbProfile?.isWlanDefault ?? false)
    );
  }
);

export const deleteWifiSpeedProfileRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@nodata'),
    description: 'Delete a UniFi WiFi speed profile.',
    responses: { 200: { description: 'WiFi speed profile deleted' } },
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    await configured().deleteSpeedProfile(c.req.valid('param').id);
    return ok(c, undefined);
  }
);

export const listWifiRoleProfilesRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiRoleSpeedProfileListResponse'),
    description: 'List WiFi role speed-profile mappings.',
    responses: response(roleProfileListSchema, 'WiFi role mappings'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiRead),
  async (c) =>
    ok(
      c,
      await db
        .select()
        .from(wifiRoleSpeedProfile)
        .orderBy(desc(wifiRoleSpeedProfile.priority))
    )
);

export const createWifiRoleProfileRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiRoleSpeedProfileResponse'),
    description: 'Create a WiFi role speed-profile mapping.',
    requestBody: {
      content: {
        'application/json': { schema: wifiRoleProfileCreateOpenApiSchema },
      },
    },
    responses: response(
      wifiRoleSpeedProfileSchema,
      'WiFi role mapping created'
    ),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiRoleSpeedProfileCreateSchema),
  async (c) => {
    const [mapping] = await db
      .insert(wifiRoleSpeedProfile)
      .values(c.req.valid('json'))
      .returning();
    return created(c, { mapping });
  }
);

export const updateWifiRoleProfileRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiRoleSpeedProfileResponse'),
    description: 'Update a WiFi role speed-profile mapping.',
    requestBody: {
      content: {
        'application/json': { schema: wifiRoleProfileUpdateOpenApiSchema },
      },
    },
    responses: response(
      wifiRoleSpeedProfileSchema,
      'WiFi role mapping updated'
    ),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('json', wifiRoleSpeedProfileUpdateSchema),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const [mapping] = await db
      .update(wifiRoleSpeedProfile)
      .set(c.req.valid('json'))
      .where(eq(wifiRoleSpeedProfile.roleName, c.req.valid('param').id))
      .returning();
    if (!mapping) {
      throw notFound('WiFi role mapping not found');
    }
    return ok(c, mapping);
  }
);

export const deleteWifiRoleProfileRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@nodata'),
    description: 'Delete a WiFi role speed-profile mapping.',
    responses: { 200: { description: 'WiFi role mapping deleted' } },
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiWrite),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const [deleted] = await db
      .delete(wifiRoleSpeedProfile)
      .where(eq(wifiRoleSpeedProfile.roleName, c.req.valid('param').id))
      .returning();
    if (!deleted) {
      throw notFound('WiFi role mapping not found');
    }
    return ok(c, undefined);
  }
);

const authLogListSchema = wifiAuthLogSchema.array();

export const listWifiAuthLogsRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiAuthLogListResponse'),
    description: 'List WiFi auth logs.',
    responses: response(authLogListSchema, 'WiFi auth logs'),
    tags: ['WiFi'],
  }),
  ...authRouter(permissions.wifiRead),
  zValidator('query', wifiAuthLogListQuerySchema),
  async (c) => {
    const { limit, offset, search, failureReason, result } =
      c.req.valid('query');
    const logs = await db
      .select()
      .from(wifiAuthLog)
      .where(
        and(
          search
            ? or(
                ilike(wifiAuthLog.username, `%${search}%`),
                ilike(wifiAuthLog.macAddress, `%${search}%`),
                ilike(wifiAuthLog.nasIpAddress, `%${search}%`)
              )
            : undefined,
          failureReason
            ? eq(wifiAuthLog.failureReason, failureReason)
            : undefined,
          result === undefined ? undefined : eq(wifiAuthLog.result, result)
        )
      )
      .orderBy(desc(wifiAuthLog.timestamp))
      .limit(limit)
      .offset(offset);
    return ok(c, logs);
  }
);
