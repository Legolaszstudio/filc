import { createFileRoute } from '@tanstack/react-router';
import { Smartphone, Users, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WifiAuthChart } from '@/components/wifi/wifi-auth-chart';
import { useWifiAdminStatsOverview } from '@/hooks/wifi-admin';

export const Route = createFileRoute('/_private/admin/wifi/')({
  component: WifiDashboard,
});

function WifiDashboard() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useWifiAdminStatsOverview();

  if (isLoading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-destructive">
        {t('wifiAdminDashboard.loadErrorMessage')}
      </div>
    );
  }

  const { activeDevices, authSeries, totalDevices, totalUsers } = data;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">
          {t('wifiAdminDashboard.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('wifiAdminDashboard.description')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('wifiAdminDashboard.totalUsers')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('wifiAdminDashboard.totalDevices')}
            </CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{totalDevices}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('wifiAdminDashboard.activeDevices')}
            </CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{activeDevices}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>{t('wifiAdminDashboard.authentications')}</CardTitle>
        </CardHeader>
        <CardContent>
          <WifiAuthChart data={authSeries} />
        </CardContent>
      </Card>
    </div>
  );
}
