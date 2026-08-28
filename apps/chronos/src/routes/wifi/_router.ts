import { wifiFactory } from '#routes/wifi/_factory';
import { authorizeRadiusRoute } from '#routes/wifi/radius';

export const wifiRouter = wifiFactory
  .createApp()
  .post('/radius/authorize', ...authorizeRadiusRoute);
