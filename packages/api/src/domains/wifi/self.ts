import z from 'zod';

export const wifiSelfDeviceSchema = z.object({
  banned: z.boolean(),
  id: z.uuid(),
  lastActiveAt: z.iso.datetime().nullable(),
  macAddress: z.string(),
  nickname: z.string().nullable(),
  reportedHostname: z.string().nullable(),
});

export const wifiSpeedLimitInfoSchema = z.object({
  downloadSpeedMbps: z.number().int().nullable(),
  roleName: z.string().nullable(),
  source: z.enum(['override', 'role', 'wlan_default']),
  speedProfileId: z.string().nullable(),
  uploadSpeedMbps: z.number().int().nullable(),
});

export const wifiSelfSchema = z.object({
  allowChangePassword: z.boolean(),
  banned: z.boolean(),
  comment: z.string().nullable(),
  devices: z.array(wifiSelfDeviceSchema),
  speedLimit: wifiSpeedLimitInfoSchema,
  username: z.string(),
});

export type WifiSelf = z.infer<typeof wifiSelfSchema>;
export type WifiSelfDevice = z.infer<typeof wifiSelfDeviceSchema>;
export type WifiSpeedLimitInfo = z.infer<typeof wifiSpeedLimitInfoSchema>;
