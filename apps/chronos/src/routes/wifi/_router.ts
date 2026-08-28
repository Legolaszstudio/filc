import { wifiFactory } from '#routes/wifi/_factory';
import {
  createWifiDeviceRoute,
  createWifiNasRoute,
  createWifiRoleProfileRoute,
  createWifiSpeedProfileRoute,
  createWifiUserRoute,
  deleteWifiDeviceRoute,
  deleteWifiNasRoute,
  deleteWifiRoleProfileRoute,
  deleteWifiSpeedProfileRoute,
  deleteWifiUserRoute,
  listWifiDevicesRoute,
  listWifiNasRoute,
  listWifiRoleProfilesRoute,
  listWifiSpeedProfilesRoute,
  listWifiUsersRoute,
  updateWifiDeviceRoute,
  updateWifiNasRoute,
  updateWifiRoleProfileRoute,
  updateWifiSpeedProfileRoute,
  updateWifiUserRoute,
} from '#routes/wifi/admin';
import { authorizeRadiusRoute } from '#routes/wifi/radius';
import { getSelfWifiRoute, updateSelfWifiDeviceRoute } from '#routes/wifi/self';
import { wifiStatsRoute } from '#routes/wifi/stats';
import { env } from '#utils/environment';

export const wifiRouter = wifiFactory
  .createApp()
  .use('*', async (c, next) => {
    if (!env.wifiEnabled) {
      return c.json(
        {
          code: 'WIFI_DISABLED',
          error: 'Service Unavailable',
          message: 'WiFi is disabled.',
        },
        503
      );
    }
    return await next();
  })
  .post('/radius/authorize', ...authorizeRadiusRoute)
  .get('/self', ...getSelfWifiRoute)
  .put('/self/devices/:id', ...updateSelfWifiDeviceRoute)
  .get('/stats/overview', ...wifiStatsRoute)
  .get('/users', ...listWifiUsersRoute)
  .post('/users', ...createWifiUserRoute)
  .put('/users/:id', ...updateWifiUserRoute)
  .delete('/users/:id', ...deleteWifiUserRoute)
  .get('/devices', ...listWifiDevicesRoute)
  .post('/devices', ...createWifiDeviceRoute)
  .put('/devices/:id', ...updateWifiDeviceRoute)
  .delete('/devices/:id', ...deleteWifiDeviceRoute)
  .get('/nas', ...listWifiNasRoute)
  .post('/nas', ...createWifiNasRoute)
  .put('/nas/:id', ...updateWifiNasRoute)
  .delete('/nas/:id', ...deleteWifiNasRoute)
  .get('/speed-profiles', ...listWifiSpeedProfilesRoute)
  .post('/speed-profiles', ...createWifiSpeedProfileRoute)
  .put('/speed-profiles/:id', ...updateWifiSpeedProfileRoute)
  .delete('/speed-profiles/:id', ...deleteWifiSpeedProfileRoute)
  .get('/role-speed-profiles', ...listWifiRoleProfilesRoute)
  .post('/role-speed-profiles', ...createWifiRoleProfileRoute)
  .put('/role-speed-profiles/:id', ...updateWifiRoleProfileRoute)
  .delete('/role-speed-profiles/:id', ...deleteWifiRoleProfileRoute);
