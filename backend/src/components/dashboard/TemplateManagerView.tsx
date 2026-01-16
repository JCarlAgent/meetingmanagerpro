import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { MailTemplate } from '@/types';
import {
  FileImage,
  Upload,
  Eye,
  Pencil,
  Trash2,
  X,
  Check,
  AlertCircle,
  Search,
  Filter,
  ToggleLeft,
  ToggleRight,
  Plus,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';

const INDUSTRIES = [
  { value: 'financial', label: 'Financial Planning', color: 'bg-blue-500' },
  { value: 'medicare', label: 'Medicare', color: 'bg-green-500' },
  { value: 'stem_cell', label: 'Stem Cell Therapy', color: 'bg-purple-500' },
  { value: 'reverse_mortgage', label: 'Reverse Mortgage', color: 'bg-amber-500' },
];

const TemplateManagerView: React.FC = () => {
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<MailTemplate | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    industry: 'financial' as string,
    template_number: 1,
    mail_piece_size: '6x11',
    mail_piece_type: 'postcard',
    is_active: true
  });

  // Add form state
  const [addForm, setAddForm] = useState({
    name: '',
    description: '',
    industry: 'financial' as string,
    template_number: 1,
    mail_piece_size: '6x11',
    mail_piece_type: 'postcard',
    is_active: true
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('mail_templates')
        .select('*')
        .order('industry', { ascending: true })
        .order('template_number', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err: any) {
      setError('Failed to load templates: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (template: MailTemplate) => {
    try {
      const { error } = await supabase
        .from('mail_templates')
        .update({ is_active: !template.is_active, updated_at: new Date().toISOString() })
        .eq('id', template.id);

      if (error) throw error;
      
      setTemplates(prev => prev.map(t => 
        t.id === template.id ? { ...t, is_active: !t.is_active } : t
      ));
      setSuccess(`Template "${template.name}" ${!template.is_active ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      setError('Failed to update template: ' + err.message);
    }
  };

  const handleEdit = (template: MailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      name: template.name,
      description: template.description || '',
      industry: template.industry,
      template_number: template.template_number,
      mail_piece_size: template.mail_piece_size,
      mail_piece_type: template.mail_piece_type,
      is_active: template.is_active
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTemplate) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('mail_templates')
        .update({
          name: editForm.name,
          description: editForm.description,
          industry: editForm.industry,
          template_number: editForm.template_number,
          mail_piece_size: editForm.mail_piece_size,
          mail_piece_type: editForm.mail_piece_type,
          is_active: editForm.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTemplate.id);

      if (error) throw error;
      
      setTemplates(prev => prev.map(t => 
        t.id === selectedTemplate.id ? { ...t, ...editForm, updated_at: new Date().toISOString() } : t
      ));
      setSuccess('Template updated successfully');
      setShowEditModal(false);
    } catch (err: any) {
      setError('Failed to update template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadClick = (template: MailTemplate) => {
    setSelectedTemplate(template);
    setShowUploadModal(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTemplate) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedTemplate.industry}_template_${selectedTemplate.template_number}_${Date.now()}.${fileExt}`;
      const filePath = `templates/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('mail-templates')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('mail-templates')
        .getPublicUrl(filePath);

      // Update template record
      const { error: updateError } = await supabase
        .from('mail_templates')
        .update({
          thumbnail_url: publicUrl,
          preview_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTemplate.id);

      if (updateError) throw updateError;

      setTemplates(prev => prev.map(t => 
        t.id === selectedTemplate.id 
          ? { ...t, thumbnail_url: publicUrl, preview_url: publicUrl, updated_at: new Date().toISOString() } 
          : t
      ));
      setSuccess('Template image uploaded successfully');
      setShowUploadModal(false);
    } catch (err: any) {
      setError('Failed to upload image: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('mail_templates')
        .delete()
        .eq('id', selectedTemplate.id);

      if (error) throw error;
      
      setTemplates(prev => prev.filter(t => t.id !== selectedTemplate.id));
      setSuccess('Template deleted successfully');
      setShowDeleteModal(false);
    } catch (err: any) {
      setError('Failed to delete template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTemplate = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('mail_templates')
        .insert({
          name: addForm.name,
          description: addForm.description,
          industry: addForm.industry,
          template_number: addForm.template_number,
          mail_piece_size: addForm.mail_piece_size,
          mail_piece_type: addForm.mail_piece_type,
          is_active: addForm.is_active
        })
        .select()
        .single();

      if (error) throw error;
      
      setTemplates(prev => [...prev, data]);
      setSuccess('Template added successfully');
      setShowAddModal(false);
      setAddForm({
        name: '',
        description: '',
        industry: 'financial',
        template_number: 1,
        mail_piece_size: '6x11',
        mail_piece_type: 'postcard',
        is_active: true
      });
    } catch (err: any) {
      setError('Failed to add template: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTemplates = templates.filter(t => {
    if (industryFilter !== 'all' && t.industry !== industryFilter) return false;
    if (activeFilter === 'active' && !t.is_active) return false;
    if (activeFilter === 'inactive' && t.is_active) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
    }
    return true;
  });

  const getIndustryInfo = (industry: string) => {
    return INDUSTRIES.find(i => i.value === industry) || INDUSTRIES[0];
  };

  const getTemplatesByIndustry = (industry: string) => {
    return filteredTemplates.filter(t => t.industry === industry);
  };

  // Stats
  const totalTemplates = templates.length;
  const activeTemplates = templates.filter(t => t.is_active).length;
  const templatesWithImages = templates.filter(t => t.thumbnail_url).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileImage className="w-7 h-7 text-red-400" />
            Template Manager
          </h1>
          <p className="text-slate-400 mt-1">Manage mail piece templates for all industries</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Template
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
          <p className="text-green-400">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <FileImage className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalTemplates}</p>
              <p className="text-sm text-slate-400">Total Templates</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeTemplates}</p>
              <p className="text-sm text-slate-400">Active Templates</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{templatesWithImages}</p>
              <p className="text-sm text-slate-400">With Images</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <option value="all">All Industries</option>
              {INDUSTRIES.map(ind => (
                <option key={ind.value} value={ind.value}>{ind.label}</option>
              ))}
            </select>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
            <button
              onClick={fetchTemplates}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Templates by Industry */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {(industryFilter === 'all' ? INDUSTRIES : INDUSTRIES.filter(i => i.value === industryFilter)).map(industry => {
            const industryTemplates = getTemplatesByIndustry(industry.value);
            if (industryTemplates.length === 0 && industryFilter !== 'all') return null;
            
            return (
              <div key={industry.value} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${industry.color}`} />
                  <h2 className="text-lg font-semibold text-white">{industry.label}</h2>
                  <span className="text-sm text-slate-400">
                    ({industryTemplates.length} template{industryTemplates.length !== 1 ? 's' : ''})
                  </span>
                </div>
                
                {industryTemplates.length === 0 ? (
                  <div className="bg-slate-800/30 rounded-xl border border-white/10 p-8 text-center">
                    <FileImage className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">No templates found for this industry</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {industryTemplates.map(template => (
                      <div
                        key={template.id}
                        className={`bg-slate-800/50 rounded-xl border ${template.is_active ? 'border-white/10' : 'border-white/5 opacity-60'} overflow-hidden group hover:border-red-500/30 transition-all`}
                      >
                        {/* Thumbnail */}
                        <div className="relative aspect-video bg-slate-900 overflow-hidden">
                          {template.thumbnail_url ? (
                            <img
                              src={template.thumbnail_url}
                              alt={template.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-12 h-12 text-slate-700" />
                            </div>
                          )}
                          {/* Overlay on hover */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedTemplate(template);
                                setShowPreviewModal(true);
                              }}
                              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                              title="Preview"
                            >
                              <Eye className="w-5 h-5 text-white" />
                            </button>
                            <button
                              onClick={() => handleUploadClick(template)}
                              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                              title="Upload Image"
                            >
                              <Upload className="w-5 h-5 text-white" />
                            </button>
                          </div>
                          {/* Status badge */}
                          <div className="absolute top-2 right-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${template.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                              {template.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          {/* Template number */}
                          <div className="absolute top-2 left-2">
                            <span className="px-2 py-1 text-xs font-bold bg-black/50 text-white rounded-full">
                              #{template.template_number}
                            </span>
                          </div>
                        </div>
                        
                        {/* Info */}
                        <div className="p-4">
                          <h3 className="font-semibold text-white truncate">{template.name}</h3>
                          <p className="text-sm text-slate-400 mt-1 line-clamp-2">{template.description || 'No description'}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                            <span>{template.mail_piece_size}</span>
                            <span>•</span>
                            <span className="capitalize">{template.mail_piece_type}</span>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                            <button
                              onClick={() => handleToggleActive(template)}
                              className={`flex items-center gap-1.5 text-sm ${template.is_active ? 'text-green-400 hover:text-green-300' : 'text-slate-400 hover:text-slate-300'} transition-colors`}
                            >
                              {template.is_active ? (
                                <ToggleRight className="w-5 h-5" />
                              ) : (
                                <ToggleLeft className="w-5 h-5" />
                              )}
                              <span>{template.is_active ? 'Active' : 'Inactive'}</span>
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEdit(template)}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTemplate(template);
                                  setShowDeleteModal(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowPreviewModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedTemplate.name}</h3>
                <p className="text-sm text-slate-400">{getIndustryInfo(selectedTemplate.industry).label} - Template #{selectedTemplate.template_number}</p>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              {selectedTemplate.preview_url ? (
                <img
                  src={selectedTemplate.preview_url}
                  alt={selectedTemplate.name}
                  className="w-full h-auto rounded-lg"
                />
              ) : (
                <div className="aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <ImageIcon className="w-16 h-16 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">No preview image available</p>
                    <button
                      onClick={() => {
                        setShowPreviewModal(false);
                        handleUploadClick(selectedTemplate);
                      }}
                      className="mt-4 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Upload Image
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 uppercase">Size</p>
                  <p className="text-white font-medium">{selectedTemplate.mail_piece_size}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 uppercase">Type</p>
                  <p className="text-white font-medium capitalize">{selectedTemplate.mail_piece_type}</p>
                </div>
              </div>
              {selectedTemplate.description && (
                <div className="mt-4 bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 uppercase mb-1">Description</p>
                  <p className="text-slate-300">{selectedTemplate.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-white/10 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Edit Template</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Template Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Industry</label>
                  <select
                    value={editForm.industry}
                    onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    {INDUSTRIES.map(ind => (
                      <option key={ind.value} value={ind.value}>{ind.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Template #</label>
                  <select
                    value={editForm.template_number}
                    onChange={(e) => setEditForm({ ...editForm, template_number: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    {[1, 2, 3, 4].map(n => (
                      <option key={n} value={n}>Template {n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Mail Piece Size</label>
                  <select
                    value={editForm.mail_piece_size}
                    onChange={(e) => setEditForm({ ...editForm, mail_piece_size: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="6x11">6x11</option>
                    <option value="6x9">6x9</option>
                    <option value="4x6">4x6</option>
                    <option value="8.5x11">8.5x11</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Mail Piece Type</label>
                  <select
                    value={editForm.mail_piece_type}
                    onChange={(e) => setEditForm({ ...editForm, mail_piece_type: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="postcard">Postcard</option>
                    <option value="letter">Letter</option>
                    <option value="self-mailer">Self-Mailer</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${editForm.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-400'}`}
                >
                  {editForm.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  <span>{editForm.is_active ? 'Active' : 'Inactive'}</span>
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-white/10">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving || !editForm.name}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowUploadModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-white/10 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Upload Template Image</h3>
              <button onClick={() => setShowUploadModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-slate-400 mb-4">
                Upload an image for <span className="text-white font-medium">{selectedTemplate.name}</span>
              </p>
              <div 
                className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-red-500/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-10 h-10 text-red-400 animate-spin mb-3" />
                    <p className="text-slate-400">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                    <p className="text-white font-medium mb-1">Click to upload</p>
                    <p className="text-sm text-slate-500">PNG, JPG up to 5MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-white/10 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Delete Template?</h3>
              <p className="text-slate-400 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">"{selectedTemplate.name}"</span>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Template Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-white/10 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Add New Template</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g., Retirement Planning Seminar"
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Brief description of the template..."
                  rows={3}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Industry *</label>
                  <select
                    value={addForm.industry}
                    onChange={(e) => setAddForm({ ...addForm, industry: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    {INDUSTRIES.map(ind => (
                      <option key={ind.value} value={ind.value}>{ind.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Template #</label>
                  <select
                    value={addForm.template_number}
                    onChange={(e) => setAddForm({ ...addForm, template_number: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>Template {n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Mail Piece Size</label>
                  <select
                    value={addForm.mail_piece_size}
                    onChange={(e) => setAddForm({ ...addForm, mail_piece_size: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="6x11">6x11</option>
                    <option value="6x9">6x9</option>
                    <option value="4x6">4x6</option>
                    <option value="8.5x11">8.5x11</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Mail Piece Type</label>
                  <select
                    value={addForm.mail_piece_type}
                    onChange={(e) => setAddForm({ ...addForm, mail_piece_type: e.target.value })}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  >
                    <option value="postcard">Postcard</option>
                    <option value="letter">Letter</option>
                    <option value="self-mailer">Self-Mailer</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAddForm({ ...addForm, is_active: !addForm.is_active })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${addForm.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-400'}`}
                >
                  {addForm.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  <span>{addForm.is_active ? 'Active' : 'Inactive'}</span>
                </button>
                <span className="text-sm text-slate-500">Template will be available for client selection</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-white/10">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTemplate}
                disabled={isSaving || !addForm.name}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManagerView;
