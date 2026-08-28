import { wifiIdParamSchema } from '@filcdev/api/domains/wifi/admin';
import {
  wifiSelfDeviceSchema,
  wifiSelfDeviceUpdateSchema,
  wifiSelfSchema,
} from '@filcdev/api/domains/wifi/self';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { describeRoute, resolver } from 'hono-openapi';
import { db } from '#database';
import { wifiDevice, wifiUser } from '#database/schema/wifi';
import { authRouter } from '#middleware/auth';
import { notFound, ok } from '#utils/http';
import { filcExt } from '#utils/openapi';
import { resolveEffectiveSpeedProfileDetails } from '#utils/wifi/speed-profile';
import { wifiFactory } from './_factory';

const selfDeviceResponseSchema = resolver(wifiSelfDeviceSchema);
const { schema: wifiSelfDeviceUpdateOpenApiSchema } = await resolver(
  wifiSelfDeviceUpdateSchema
).toOpenAPISchema();

const findAccount = (userId: string) =>
  db.select().from(wifiUser).where(eq(wifiUser.userId, userId)).limit(1);

export const getSelfWifiRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt('WiFi', '@unit WifiSelfResponse @field(.wifi, WifiSelf)'),
    description: "Get the authenticated user's WiFi account and devices.",
    responses: {
      200: {
        content: { 'application/json': { schema: resolver(wifiSelfSchema) } },
        description: 'WiFi account',
      },
      404: { description: 'WiFi account not found' },
    },
    tags: ['WiFi'],
  }),
  ...authRouter(),
  async (c) => {
    const account = (await findAccount(c.var.session.userId))[0];
    if (!account) {
      throw notFound('WiFi account not found');
    }

    const devices = await db
      .select()
      .from(wifiDevice)
      .where(eq(wifiDevice.wifiUserId, account.id));
    const speed = await resolveEffectiveSpeedProfileDetails(account);

    return ok(c, {
      wifi: {
        banned: account.banned,
        comment: account.comment,
        devices,
        speedLimit: {
          downloadSpeedMbps: null,
          roleName: speed.roleName,
          source: speed.source,
          speedProfileId: speed.speedProfileId,
          uploadSpeedMbps: null,
        },
        username: account.username,
      },
    });
  }
);

export const updateSelfWifiDeviceRoute = wifiFactory.createHandlers(
  describeRoute({
    ...filcExt(
      'WiFi',
      '@unit WifiSelfDeviceResponse @field(.device, WifiSelfDevice)'
    ),
    description: "Rename one of the authenticated user's WiFi devices.",
    requestBody: {
      content: {
        'application/json': { schema: wifiSelfDeviceUpdateOpenApiSchema },
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: selfDeviceResponseSchema } },
        description: 'Device updated',
      },
    },
    tags: ['WiFi'],
  }),
  ...authRouter(),
  zValidator('json', wifiSelfDeviceUpdateSchema),
  zValidator('param', wifiIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { nickname } = c.req.valid('json');
    const account = (await findAccount(c.var.session.userId))[0];
    if (!account) {
      throw notFound('WiFi account not found');
    }

    const [device] = await db
      .update(wifiDevice)
      .set({ nickname, updatedAt: new Date() })
      .where(and(eq(wifiDevice.id, id), eq(wifiDevice.wifiUserId, account.id)))
      .returning();
    if (!device) {
      throw notFound('WiFi device not found');
    }
    return ok(c, { device });
  }
);
