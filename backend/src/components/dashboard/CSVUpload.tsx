import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Campaign, Event } from '@/types';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  X,
  Download,
  Users
} from 'lucide-react';

interface CSVUploadProps {
  campaigns: Campaign[];
  events: Event[];
  onUploadComplete: () => void;
}

const CSVUpload: React.FC<CSVUploadProps> = ({ campaigns, events, onUploadComplete }) => {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'pending');
  const campaignEvents = events.filter(e => e.campaign_id === selectedCampaign);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadResult(null);
      parseCSVPreview(selectedFile);
    }
  };

  const parseCSVPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const preview = lines.slice(1, 6).map(line => {
        const values = line.split(',');
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim() || '';
        });
        return row;
      }).filter(row => Object.values(row).some(v => v));

      setPreviewData(preview);
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!file || !selectedCampaign) return;

    setIsUploading(true);
    setUploadResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Map common header variations
        const headerMap: { [key: string]: string } = {
          'first_name': 'first_name',
          'firstname': 'first_name',
          'first name': 'first_name',
          'last_name': 'last_name',
          'lastname': 'last_name',
          'last name': 'last_name',
          'email': 'email',
          'email_address': 'email',
          'phone': 'phone',
          'phone_number': 'phone',
          'telephone': 'phone',
          'city': 'city',
          'state': 'state',
          'zip': 'zip',
          'zipcode': 'zip',
          'zip_code': 'zip',
          'guests': 'guests',
          'guest_count': 'guests',
          'notes': 'notes',
          'comments': 'notes',
        };

        const responders = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length < 2) continue;

          const responder: any = {
            campaign_id: selectedCampaign,
            event_id: selectedEvent || null,
            response_source: 'call_center',
            confirmed: false,
            attended: false,
          };

          headers.forEach((header, index) => {
            const mappedHeader = headerMap[header] || header;
            const value = values[index]?.trim().replace(/^"|"$/g, '') || '';
            
            if (mappedHeader === 'guests') {
              responder[mappedHeader] = parseInt(value) || 0;
            } else if (['first_name', 'last_name', 'email', 'phone', 'city', 'state', 'zip', 'notes', 'address'].includes(mappedHeader)) {
              responder[mappedHeader] = value;
            }
          });

          if (responder.first_name && responder.last_name) {
            responders.push(responder);
          }
        }

        if (responders.length === 0) {
          setUploadResult({
            success: false,
            message: 'No valid responders found in CSV. Please check the file format.'
          });
          setIsUploading(false);
          return;
        }

        // Insert responders in batches
        const batchSize = 100;
        let insertedCount = 0;

        for (let i = 0; i < responders.length; i += batchSize) {
          const batch = responders.slice(i, i + batchSize);
          const { error } = await supabase.from('responders').insert(batch);
          
          if (error) {
            console.error('Batch insert error:', error);
          } else {
            insertedCount += batch.length;
          }
        }

        setUploadResult({
          success: true,
          message: `Successfully imported ${insertedCount} responders`,
          count: insertedCount
        });

        onUploadComplete();
      };

      reader.readAsText(file);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadResult({
        success: false,
        message: 'An error occurred during upload'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const template = 'first_name,last_name,email,phone,city,state,zip,guests,notes\nJohn,Doe,john@email.com,919-555-0100,Raleigh,NC,27609,1,Interested in retirement planning';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'responder_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Upload className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">CSV Upload</h3>
            <p className="text-sm text-slate-400">Import responders from call center</p>
          </div>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
      </div>

      <div className="space-y-4">
        {/* Campaign Selection */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Select Campaign</label>
          <select
            value={selectedCampaign}
            onChange={(e) => {
              setSelectedCampaign(e.target.value);
              setSelectedEvent('');
            }}
            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            <option value="">Choose a campaign...</option>
            {activeCampaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                #{campaign.project_id} - {campaign.template_type.replace('_', ' ')} ({campaign.status})
              </option>
            ))}
          </select>
        </div>

        {/* Event Selection */}
        {selectedCampaign && campaignEvents.length > 0 && (
          <div>
            <label className="block text-sm text-slate-400 mb-2">Assign to Event (Optional)</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <option value="">Auto-assign based on capacity</option>
              {campaignEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.venue_name} - {new Date(event.event_date).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* File Upload */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">Upload CSV File</label>
          <div 
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
              file ? 'border-green-500/50 bg-green-500/5' : 'border-white/20 hover:border-white/40'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-green-400" />
                <div className="text-left">
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-sm text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setPreviewData([]);
                  }}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-300">Drag & drop your CSV file here</p>
                <p className="text-sm text-slate-500 mt-1">or click to browse</p>
              </>
            )}
          </div>
        </div>

        {/* Preview */}
        {previewData.length > 0 && (
          <div>
            <label className="block text-sm text-slate-400 mb-2">Preview (First 5 rows)</label>
            <div className="bg-slate-900/50 rounded-lg border border-white/10 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {Object.keys(previewData[0]).map((header) => (
                      <th key={header} className="px-3 py-2 text-left text-slate-400 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, index) => (
                    <tr key={index} className="border-b border-white/5">
                      {Object.values(row).map((value: any, i) => (
                        <td key={i} className="px-3 py-2 text-white truncate max-w-[150px]">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Upload Result */}
        {uploadResult && (
          <div className={`p-4 rounded-lg flex items-center gap-3 ${
            uploadResult.success 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            {uploadResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <div>
              <p className={uploadResult.success ? 'text-green-400' : 'text-red-400'}>
                {uploadResult.message}
              </p>
              {uploadResult.count && (
                <p className="text-sm text-slate-400 mt-1">
                  <Users className="w-4 h-4 inline mr-1" />
                  {uploadResult.count} new responders added
                </p>
              )}
            </div>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!file || !selectedCampaign || isUploading}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {isUploading ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              <span>Upload Responders</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CSVUpload;
