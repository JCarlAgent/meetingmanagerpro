import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Campaign } from '@/types';
import { 
  Truck, 
  Package, 
  CheckCircle2, 
  MapPin,
  Calendar,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface DeliveryData {
  id: string;
  campaign_id: string;
  total_pieces: number;
  in_transit: number;
  out_for_delivery: number;
  delivered: number;
  returned: number;
  estimated_start_date: string;
  estimated_end_date: string;
  geographic_data: Record<string, Record<string, number>>;
  tracking_data: Array<{ date: string; count: number }>;
  last_updated: string;
}

interface DeliveryTrackingProps {
  campaign: Campaign;
  compact?: boolean;
}

const DeliveryTracking: React.FC<DeliveryTrackingProps> = ({ campaign, compact = false }) => {
  const [deliveryData, setDeliveryData] = useState<DeliveryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    fetchTrackingData();
  }, [campaign.id]);

  const fetchTrackingData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('usps-tracking', {
        body: { action: 'get_tracking', campaign_id: campaign.id }
      });

      if (error) {
        console.error('Error fetching tracking:', error);
        setIsLoading(false);
        return;
      }
      
      // Handle the response structure from edge function
      // Response is: { success: true, data: { ...trackingData } }
      let trackingData = null;
      if (data?.data) {
        trackingData = data.data;
      } else if (data?.success && data?.total_pieces) {
        // Direct data without nesting
        trackingData = data;
      }
      
      if (trackingData) {
        setDeliveryData(trackingData);
      }
    } catch (error) {
      console.error('Error fetching tracking:', error);
    } finally {
      setIsLoading(false);
    }
  };


  const refreshTracking = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('usps-tracking', {
        body: { action: 'refresh_tracking', campaign_id: campaign.id }
      });

      if (error) {
        console.error('Error refreshing tracking:', error);
        setIsRefreshing(false);
        return;
      }
      
      // Handle the response structure from edge function
      let trackingData = null;
      if (data?.data) {
        trackingData = data.data;
      } else if (data?.success && data?.total_pieces) {
        trackingData = data;
      }
      
      if (trackingData) {
        setDeliveryData(trackingData);
      }
    } catch (error) {
      console.error('Error refreshing tracking:', error);
    } finally {
      setIsRefreshing(false);
    }
  };


  const getDeliveryPercentage = () => {
    if (!deliveryData) return 0;
    return Math.round((deliveryData.delivered / deliveryData.total_pieces) * 100);
  };

  const getStatusColor = () => {
    const pct = getDeliveryPercentage();
    if (pct >= 90) return 'text-green-400';
    if (pct >= 50) return 'text-cyan-400';
    if (pct > 0) return 'text-amber-400';
    return 'text-slate-400';
  };

  const getStatusText = () => {
    if (!deliveryData) return 'Loading...';
    const pct = getDeliveryPercentage();
    if (pct >= 98) return 'Delivery Complete';
    if (pct >= 90) return 'Nearly Complete';
    if (deliveryData.out_for_delivery > 0) return 'Out for Delivery';
    if (deliveryData.in_transit > 0) return 'In Transit';
    if (pct === 0) return 'Pending';
    return 'In Progress';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse mt-4 pt-4 border-t border-white/10">
        <div className="h-4 bg-slate-700 rounded w-32 mb-2"></div>
        <div className="h-2 bg-slate-700 rounded w-full"></div>
      </div>
    );
  }

  if (!deliveryData) {
    return (
      <div className="mt-4 pt-4 border-t border-white/10 text-sm text-slate-500 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        No tracking data available
      </div>
    );
  }

  // Compact view for campaign cards
  if (compact) {
    return (
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">USPS Delivery</span>
          </div>
          <span className={`text-sm font-semibold ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-500 via-cyan-500 to-green-500 transition-all duration-500"
            style={{ width: `${getDeliveryPercentage()}%` }}
          />
        </div>
        
        {/* Stats Row */}
        <div className="flex items-center justify-between mt-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-amber-400">
              <Package className="w-3 h-3 inline mr-1" />
              {deliveryData.in_transit.toLocaleString()} transit
            </span>
            <span className="text-cyan-400">
              <Truck className="w-3 h-3 inline mr-1" />
              {deliveryData.out_for_delivery.toLocaleString()} out
            </span>
            <span className="text-green-400">
              <CheckCircle2 className="w-3 h-3 inline mr-1" />
              {deliveryData.delivered.toLocaleString()} delivered
            </span>
          </div>
          <span className="text-slate-500">
            {getDeliveryPercentage()}%
          </span>
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Truck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">USPS Informed Delivery</h3>
            <p className="text-xs text-slate-400">Mail piece tracking for #{campaign.project_id}</p>
          </div>
        </div>
        <button
          onClick={refreshTracking}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Status Overview */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className={`text-2xl font-bold ${getStatusColor()}`}>
              {getStatusText()}
            </span>
            <p className="text-sm text-slate-400 mt-1">
              {deliveryData.delivered.toLocaleString()} of {deliveryData.total_pieces.toLocaleString()} pieces delivered
            </p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold ${getStatusColor()}`}>
              {getDeliveryPercentage()}%
            </div>
            <p className="text-xs text-slate-500">Complete</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-4 bg-slate-700 rounded-full overflow-hidden mb-4">
          <div 
            className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-500"
            style={{ width: `${(deliveryData.delivered / deliveryData.total_pieces) * 100}%` }}
          />
          <div 
            className="absolute top-0 h-full bg-cyan-500 transition-all duration-500"
            style={{ 
              left: `${(deliveryData.delivered / deliveryData.total_pieces) * 100}%`,
              width: `${(deliveryData.out_for_delivery / deliveryData.total_pieces) * 100}%` 
            }}
          />
          <div 
            className="absolute top-0 h-full bg-amber-500 transition-all duration-500"
            style={{ 
              left: `${((deliveryData.delivered + deliveryData.out_for_delivery) / deliveryData.total_pieces) * 100}%`,
              width: `${(deliveryData.in_transit / deliveryData.total_pieces) * 100}%` 
            }}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-sm text-slate-300">Delivered ({deliveryData.delivered.toLocaleString()})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
            <span className="text-sm text-slate-300">Out for Delivery ({deliveryData.out_for_delivery.toLocaleString()})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span className="text-sm text-slate-300">In Transit ({deliveryData.in_transit.toLocaleString()})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-sm text-slate-300">Returned ({deliveryData.returned.toLocaleString()})</span>
          </div>
        </div>

        {/* Delivery Timeline */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Estimated Start</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatDate(deliveryData.estimated_start_date)}
            </p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Estimated Complete</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatDate(deliveryData.estimated_end_date)}
            </p>
          </div>
        </div>

        {/* Geographic Distribution */}
        <div className="border-t border-white/10 pt-4">
          <button
            onClick={() => setShowMap(!showMap)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-white">Geographic Distribution</span>
            </div>
            <span className="text-slate-400 text-sm">
              {showMap ? 'Hide' : 'Show'} Details
            </span>
          </button>

          {showMap && deliveryData.geographic_data && (
            <div className="mt-4 grid gap-2">
              {Object.entries(deliveryData.geographic_data).map(([state, cities]) => (
                <div key={state}>
                  <p className="text-sm font-medium text-slate-400 mb-2">{state}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(cities as Record<string, number>)
                      .sort(([, a], [, b]) => b - a)
                      .map(([city, count]) => (
                        <div 
                          key={city}
                          className="bg-slate-900/50 rounded-lg p-3 flex items-center justify-between"
                        >
                          <span className="text-sm text-slate-300">{city}</span>
                          <span className="text-sm font-semibold text-green-400">
                            {count.toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-slate-900/50 border-t border-white/10 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Last updated: {deliveryData.last_updated ? new Date(deliveryData.last_updated).toLocaleString() : 'N/A'}
        </span>
        <span className="text-xs text-slate-500">
          Powered by USPS Informed Delivery
        </span>
      </div>
    </div>
  );
};

export default DeliveryTracking;
