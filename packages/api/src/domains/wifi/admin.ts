import z from 'zod';

const macAddressSchema = z.string().min(1);

export const wifiUserSchema = z.object({
  allowChangePassword: z.boolean(),
  allowedMacAddresses: z.array(macAddressSchema).nullable(),
  banned: z.boolean(),
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.uuid(),
  id: z.uuid(),
  speedProfileId: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  userId: z.uuid().nullable(),
  username: z.string(),
});

export const wifiDeviceSchema = z.object({
  adminNotes: z.string().nullable(),
  banned: z.boolean(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
  lastActiveAt: z.iso.datetime().nullable(),
  macAddress: macAddressSchema,
  nickname: z.string().nullable(),
  reportedHostname: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  wifiUserId: z.uuid().nullable(),
});

export const wifiNasSchema = z.object({
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
  ipAddress: z.string(),
  macAddress: macAddressSchema,
  updatedAt: z.iso.datetime(),
});

export const wifiSpeedProfileSchema = z.object({
  downloadSpeedMbps: z.number().int().nullable(),
  id: z.string(),
  name: z.string(),
  uploadSpeedMbps: z.number().int().nullable(),
});

export const wifiRoleSpeedProfileSchema = z.object({
  downloadSpeedMbps: z.number().int().nullable(),
  priority: z.number().int(),
  roleName: z.string(),
  speedProfileId: z.string(),
  uploadSpeedMbps: z.number().int().nullable(),
});

export const wifiUserCreateSchema = z.object({
  allowedMacAddresses: z.array(macAddressSchema).optional(),
  comment: z.string().nullable().optional(),
  password: z.string().min(1),
  speedProfileId: z.string().nullable().optional(),
  userId: z.uuid().nullable().optional(),
  username: z.string().min(1),
});

export const wifiUserUpdateSchema = wifiUserCreateSchema.partial().extend({
  allowChangePassword: z.boolean().optional(),
  banned: z.boolean().optional(),
});

export const wifiDeviceCreateSchema = z.object({
  adminNotes: z.string().nullable().optional(),
  banned: z.boolean().optional(),
  macAddress: macAddressSchema,
  nickname: z.string().nullable().optional(),
  wifiUserId: z.uuid().nullable().optional(),
});

export const wifiDeviceUpdateSchema = wifiDeviceCreateSchema.partial();

export const wifiNasCreateSchema = z.object({
  comment: z.string().nullable().optional(),
  ipAddress: z.string(),
  macAddress: macAddressSchema,
});

export const wifiNasUpdateSchema = wifiNasCreateSchema.partial();

export const wifiSpeedProfileCreateSchema = z.object({
  downloadSpeedMbps: z.number().int().min(-1).default(-1),
  name: z.string().min(1),
  uploadSpeedMbps: z.number().int().min(-1).default(-1),
});

export const wifiSpeedProfileUpdateSchema =
  wifiSpeedProfileCreateSchema.partial();

export const wifiRoleSpeedProfileCreateSchema = z.object({
  downloadSpeedMbps: z.number().int().nullable().optional(),
  priority: z.number().int().default(0),
  roleName: z.string().min(1),
  speedProfileId: z.string().min(1),
  uploadSpeedMbps: z.number().int().nullable().optional(),
});

export const wifiRoleSpeedProfileUpdateSchema =
  wifiRoleSpeedProfileCreateSchema.partial();

export type WifiUser = z.infer<typeof wifiUserSchema>;
export type WifiDevice = z.infer<typeof wifiDeviceSchema>;
export type WifiNas = z.infer<typeof wifiNasSchema>;
export type WifiSpeedProfile = z.infer<typeof wifiSpeedProfileSchema>;
