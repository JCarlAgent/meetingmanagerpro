import React, { useEffect, useState } from 'react';
import { AlertTriangle, CloudLightning, Loader2, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface WeatherAlert {
  jobId: string;
  meetingId: string;
  jobTitle: string;
  city: string;
  state: string;
  startsAt: string;
  alerts: Array<{
    event: string;
    headline: string;
    severity: string;
    description: string;
  }>;
}

export default function WeatherAlertWidget() {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWeatherAlerts() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await supabase.functions.invoke('check-weather-alerts');

        if (response.error) {
          throw new Error(response.error.message || 'Failed to fetch weather alerts');
        }

        if (response.data && response.data.alerts) {
          setAlerts(response.data.alerts);
        }
      } catch (err: any) {
        console.error('Failed to load weather alerts:', err);
        setErrorMsg('Unable to verify weather safety for upcoming meetings.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchWeatherAlerts();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Scanning NWS for live weather threats...</span>
      </div>
    );
  }

  if (alerts.length === 0) {
    return null; // Return nothing if no active severe weather alerts
  }

  return (
    <div className="mb-6 space-y-4">
      {alerts.map((meetingAlert) => (
        <div key={meetingAlert.meetingId} className="bg-red-50 border-l-4 border-red-500 rounded-r-xl shadow-sm p-4 text-red-800 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <div className="bg-red-100 p-2 rounded-full mr-3 text-red-600 shadow-sm mt-1">
                <CloudLightning className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-lg">Severe Weather Warning</h3>
                  <span className="bg-red-200 text-red-700 text-xs px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                    {meetingAlert.alerts[0].event}
                  </span>
                </div>
                <p className="mt-1 flex items-center text-red-700 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4 mr-1 inline" />
                  Your upcoming meeting "{meetingAlert.jobTitle}" in <b className="mx-1">{meetingAlert.city}, {meetingAlert.state}</b> is in the affected path.
                </p>
                <div className="mt-2 text-sm text-red-700 bg-red-100/50 p-2 rounded-md">
                  <p className="font-semibold">{meetingAlert.alerts[0].headline}</p>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setExpandedAlert(expandedAlert === meetingAlert.meetingId ? null : meetingAlert.meetingId)}
              className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
            >
              {expandedAlert === meetingAlert.meetingId ? 'Hide Details' : 'View Details'}
            </button>
          </div>
          
          {expandedAlert === meetingAlert.meetingId && (
            <div className="mt-4 border-t border-red-200 pt-4 pl-12 text-sm">
              <p className="whitespace-pre-line text-red-800 opacity-90 max-h-64 overflow-y-auto pr-4 scrollbar-thin">
                {meetingAlert.alerts[0].description}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
