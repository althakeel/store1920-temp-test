'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Mail, AlertCircle, CheckCircle, Clock, LayoutTemplate, PenLine, Users, Eye, X, Sparkles, FolderOpen, Layers, Search, CheckSquare, Square, Inbox, StopCircle, MousePointerClick } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import Loading from '@/components/Loading';
import EmailCampaignBuilder from '@/components/store/EmailCampaignBuilder';
import EmailGalleryPresetCard from '@/components/store/EmailGalleryPresetCard';
import EmailCampaignLandingPages from '@/components/store/EmailCampaignLandingPages';
import { getPresetBlocks } from '@/lib/emailCampaignPresets';
import { listStockImagesForPicker } from '@/lib/emailTemplateStockImages';
import { renderEmailFromBlocks, toEmailPreviewSrcDoc } from '@/lib/emailCampaignBuilder';
import { formatDubaiDateTime, parseDubaiDateTimeLocal } from '@/lib/emailMarketingSchedule';

const TABS = [
  { id: 'send', label: 'Send campaign', icon: Mail },
  { id: 'gallery', label: 'Template gallery', icon: LayoutTemplate },
  { id: 'builder', label: 'Create / customize', icon: PenLine },
  { id: 'pages', label: 'Landing pages', icon: Layers },
  { id: 'leads', label: 'Leads', icon: Inbox },
  { id: 'history', label: 'History', icon: Clock },
];

/** Recipients per request so large campaigns send in a queue without timing out. */
const SEND_BATCH_SIZE = 15;
const MAX_CAMPAIGN_RECIPIENTS = 10000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Local datetime-local value a few hours ahead (upcoming only). */
function defaultUpcomingDateTime(hoursAhead = 2) {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function datetimeLocalMin() {
  const date = new Date(Date.now() + 2 * 60 * 1000);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function normalizeScheduleTimes(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ).sort();
}

const GALLERY_LIBRARY_TABS = [
  { id: 'shop', label: 'Shop templates' },
  { id: 'saved', label: 'Saved' },
  { id: 'recent', label: 'Recently sent' },
];

export default function PromotionalEmailsPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState('send');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ sent: 0, failed: 0, pending: 0, opened: 0, clicked: 0, opens: 0, clicks: 0 });
  const [recentFailures, setRecentFailures] = useState([]);
  const [recentClicks, setRecentClicks] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');

  const [presets, setPresets] = useState([]);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [galleryCategory, setGalleryCategory] = useState('All');
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryLibraryTab, setGalleryLibraryTab] = useState('shop');
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [previewProducts, setPreviewProducts] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [heroImages, setHeroImages] = useState([]);
  const [previewModal, setPreviewModal] = useState(null);
  const [templateSource, setTemplateSource] = useState('classic'); // classic | gallery | custom | builder
  const [selectedClassicId, setSelectedClassicId] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [selectedCustomId, setSelectedCustomId] = useState('');

  const [builderName, setBuilderName] = useState('My campaign');
  const [builderSubject, setBuilderSubject] = useState('');
  const [builderPreheader, setBuilderPreheader] = useState('');
  const [builderFontFamily, setBuilderFontFamily] = useState('helvetica');
  const [builderBlocks, setBuilderBlocks] = useState([]);
  const [editingCustomId, setEditingCustomId] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [audiences, setAudiences] = useState([]);
  const [audience, setAudience] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [excludedCustomers, setExcludedCustomers] = useState([]);
  const [selectAllCustomers, setSelectAllCustomers] = useState(false);
  const [visibleCustomerLimit, setVisibleCustomerLimit] = useState(60);

  const [scheduleMode, setScheduleMode] = useState('send'); // send | schedule | auto
  const [scheduleTimes, setScheduleTimes] = useState(() => [defaultUpcomingDateTime(2)]);
  const [autoTimes, setAutoTimes] = useState(['09:00']);
  const [activeCampaigns, setActiveCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0 });
  const [sendSubject, setSendSubject] = useState('');
  const [sendSubjectTouched, setSendSubjectTouched] = useState(false);
  const sendAbortRef = useRef(null);
  const sendCancelRequestedRef = useRef(false);

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsStats, setLeadsStats] = useState({ new: 0, contacted: 0, converted: 0, archived: 0, total: 0 });
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsStatusFilter, setLeadsStatusFilter] = useState('all');
  const [leadsSearch, setLeadsSearch] = useState('');

  useEffect(() => {
    loadHistory(1);
    loadTemplateLibrary();
    loadAudienceCustomers('all');
    loadPreviewProducts();
    loadActiveCampaigns();
  }, []);

  useEffect(() => {
    if (tab === 'history') {
      // Always start at page 1 when switching filter so Failed/Pending aren't empty on a deep page.
      setSendStatus('');
      loadHistory(1);
    }
    if (tab === 'send') loadActiveCampaigns();
    if (tab === 'leads') loadLeads(1);
  }, [statusFilter, tab, leadsStatusFilter]);

  useEffect(() => {
    if (tab === 'history' && page > 1) loadHistory(page);
    if (tab === 'leads' && leadsPage > 1) loadLeads(leadsPage);
  }, [page, leadsPage]);

  const authHeaders = async () => {
    const token = await getToken();
    return { Authorization: `Bearer ${token}` };
  };

  const loadHistory = async (pageNumber = 1) => {
    try {
      setLoading(true);
      const headers = await authHeaders();
      const statusQuery = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const { data } = await axios.get(
        `/api/store/email-history?page=${pageNumber}&limit=20&type=promotional${statusQuery}`,
        { headers },
      );
      setHistory(data.history || []);
      setStats(data.stats || { sent: 0, failed: 0, pending: 0, opened: 0, clicked: 0, opens: 0, clicks: 0 });
      setRecentFailures(Array.isArray(data.recentFailures) ? data.recentFailures : []);
      setRecentClicks(Array.isArray(data.recentClicks) ? data.recentClicks : []);
      setTotal(data.pagination?.total || 0);
      setPage(pageNumber);
    } catch (error) {
      console.error('Error loading promotional email history:', error);
      setSendStatus(error?.response?.data?.error || 'Failed to load email history.');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateLibrary = async () => {
    try {
      setTemplatesLoading(true);
      const headers = await authHeaders();
      const { data } = await axios.get('/api/store/email-marketing/templates', { headers });
      const list = data.presets || [];
      setPresets(list);
      setCustomTemplates(data.customTemplates || []);
      setCategories(data.categories || ['All']);

      const classics = list.filter((item) => item.category === 'Classic');
      if (!selectedClassicId && classics.length) {
        setSelectedClassicId(classics[0].classicId || classics[0].id.replace('classic:', ''));
      }
      const galleryFirst = list.find((item) => item.category !== 'Classic');
      if (!selectedPresetId && galleryFirst) setSelectedPresetId(galleryFirst.id);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadPreviewProducts = async () => {
    try {
      const headers = await authHeaders();
      const { data } = await axios.get('/api/store/email-marketing/products?limit=48', { headers });
      setPreviewProducts(data.products || []);
      setProductCategories(data.categories || []);
      const stock = listStockImagesForPicker().map((item) => item.url);
      setHeroImages([...(data.heroImages || []), ...stock].filter(Boolean).slice(0, 24));
    } catch (error) {
      console.error('Error loading preview products:', error);
      setHeroImages(listStockImagesForPicker().map((item) => item.url));
    }
  };

  const loadAudienceCustomers = async (audienceId = audience) => {
    try {
      setCustomersLoading(true);
      const headers = await authHeaders();
      const { data } = await axios.get(
        `/api/store/email-marketing/audiences?audience=${encodeURIComponent(audienceId)}`,
        { headers },
      );
      setAudiences(data.audiences || []);
      setCustomers(data.customers || []);
      setSelectedCustomers([]);
      setExcludedCustomers([]);
      setSelectAllCustomers(false);
      setAudience(audienceId);
    } catch (error) {
      console.error('Error loading audience customers:', error);
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  };

  const loadActiveCampaigns = async ({ runDue = true, silent = false } = {}) => {
    try {
      if (!silent) setCampaignsLoading(true);
      const headers = await authHeaders();
      const qs = runDue ? 'status=active&runDue=1' : 'status=active';
      const { data } = await axios.get(`/api/store/email-marketing/campaigns?${qs}`, { headers });
      setActiveCampaigns(data.campaigns || []);
      const due = data.dueResult;
      if (due?.slotsRun > 0) {
        const sent = Number(due.emailsSent || 0);
        const failed = Number(due.emailsFailed || 0);
        const firstError = (due.processed || []).map((row) => row.error).find(Boolean);
        setSendStatus(
          firstError && !sent
            ? `Scheduled send failed: ${firstError}`
            : `Scheduled campaign sent: ${sent} email${sent === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.`,
        );
        if (sent > 0) loadHistory(1);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
      if (!silent) setActiveCampaigns([]);
    } finally {
      if (!silent) setCampaignsLoading(false);
    }
  };

  const loadLeads = async (pageNumber = 1) => {
    try {
      setLeadsLoading(true);
      const headers = await authHeaders();
      const params = new URLSearchParams({
        page: String(pageNumber),
        limit: '25',
        status: leadsStatusFilter,
      });
      if (leadsSearch.trim()) params.set('q', leadsSearch.trim());
      const { data } = await axios.get(`/api/store/email-marketing/leads?${params}`, { headers });
      setLeads(data.leads || []);
      setLeadsStats(data.stats || { new: 0, contacted: 0, converted: 0, archived: 0, total: 0 });
      setLeadsTotal(data.pagination?.total || 0);
      setLeadsPage(pageNumber);
    } catch (error) {
      console.error('Error loading leads:', error);
      setLeads([]);
      setSendStatus(error?.response?.data?.error || 'Failed to load leads.');
    } finally {
      setLeadsLoading(false);
    }
  };

  const updateLeadStatus = async (id, status) => {
    try {
      const headers = await authHeaders();
      await axios.patch('/api/store/email-marketing/leads', { id, status }, { headers });
      loadLeads(leadsPage);
    } catch (error) {
      setSendStatus(error?.response?.data?.error || 'Failed to update lead.');
    }
  };

  const deleteLead = async (id) => {
    try {
      const headers = await authHeaders();
      await axios.delete(`/api/store/email-marketing/leads?id=${encodeURIComponent(id)}`, { headers });
      loadLeads(leadsPage);
    } catch (error) {
      setSendStatus(error?.response?.data?.error || 'Failed to delete lead.');
    }
  };

  const stopCampaign = async (campaignId) => {
    try {
      const headers = await authHeaders();
      await axios.patch('/api/store/email-marketing/campaigns', {
        id: campaignId,
        action: 'stop',
      }, { headers });
      setSendStatus('Daily campaign disabled. It will not send again until you create a new one.');
      loadActiveCampaigns({ runDue: false });
    } catch (error) {
      setSendStatus(error?.response?.data?.error || 'Failed to disable campaign.');
    }
  };

  useEffect(() => {
    if (tab !== 'send') return undefined;
    const timerId = window.setInterval(() => {
      loadActiveCampaigns({ runDue: true, silent: true });
    }, 45000);
    return () => window.clearInterval(timerId);
  }, [tab]);

  const classicTemplates = useMemo(
    () => presets.filter((item) => item.category === 'Classic'),
    [presets],
  );

  const defaultSendSubject = useMemo(() => {
    if (templateSource === 'builder') return String(builderSubject || '').trim();
    if (templateSource === 'custom' && selectedCustomId) {
      const saved = customTemplates.find((item) => String(item._id) === String(selectedCustomId));
      return String(saved?.subject || builderSubject || '').trim();
    }
    if (templateSource === 'gallery' && selectedPresetId) {
      const preset = presets.find((item) => item.id === selectedPresetId);
      return String(builderSubject || preset?.subject || '').trim();
    }
    if (templateSource === 'classic' && selectedClassicId) {
      const classic = classicTemplates.find((item) => (
        item.classicId === selectedClassicId
        || item.id === `classic:${selectedClassicId}`
        || item.id === selectedClassicId
      ));
      return String(classic?.subject || '').trim();
    }
    return String(builderSubject || '').trim();
  }, [
    templateSource,
    builderSubject,
    selectedCustomId,
    selectedPresetId,
    selectedClassicId,
    customTemplates,
    presets,
    classicTemplates,
  ]);

  useEffect(() => {
    setSendSubjectTouched(false);
  }, [templateSource, selectedClassicId, selectedPresetId, selectedCustomId]);

  useEffect(() => {
    if (!sendSubjectTouched) {
      setSendSubject(defaultSendSubject);
    }
  }, [defaultSendSubject, sendSubjectTouched]);

  const galleryPresets = useMemo(() => {
    const query = gallerySearch.trim().toLowerCase();
    return presets.filter((item) => {
      if (galleryCategory !== 'All' && item.category !== galleryCategory) return false;
      if (!query) return true;
      return (
        item.name?.toLowerCase().includes(query)
        || item.subject?.toLowerCase().includes(query)
        || item.description?.toLowerCase().includes(query)
        || item.category?.toLowerCase().includes(query)
      );
    });
  }, [presets, galleryCategory, gallerySearch]);

  const recentlySentTemplates = useMemo(() => {
    const seen = new Set();
    const rows = [];
    for (const email of history) {
      const msg = String(email.customMessage || '');
      const templateMatch = msg.match(/template:([^|]+)/);
      const campaignMatch = msg.match(/campaign:([^|]+)/);
      const key = templateMatch?.[1] || campaignMatch?.[1] || email.subject;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const preset = presets.find((item) => (
        item.id === key
        || item.classicId === key
        || item.id === `classic:${key}`
        || item.subject === email.subject
      ));
      const saved = customTemplates.find((item) => String(item._id) === key || item.subject === email.subject);
      rows.push({
        key,
        subject: email.subject,
        sentAt: email.sentAt || email.createdAt,
        preset,
        saved,
      });
      if (rows.length >= 24) break;
    }
    return rows;
  }, [history, presets, customTemplates]);

  const filteredSavedTemplates = useMemo(() => {
    const query = gallerySearch.trim().toLowerCase();
    if (!query) return customTemplates;
    return customTemplates.filter((template) => (
      template.name?.toLowerCase().includes(query)
      || template.subject?.toLowerCase().includes(query)
    ));
  }, [customTemplates, gallerySearch]);

  const templatePreviewHtml = useMemo(() => {
    if (!previewModal) return '';
    let blocks = [];
    if (previewModal.type === 'preset') {
      blocks = getPresetBlocks(previewModal.id) || previewModal.blocks || [];
    } else if (previewModal.type === 'saved') {
      const saved = customTemplates.find((item) => String(item._id) === String(previewModal.id));
      blocks = Array.isArray(saved?.blocks) ? saved.blocks : (previewModal.blocks || []);
    } else {
      blocks = previewModal.blocks || [];
    }
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return '<div style="padding:40px;text-align:center;color:#64748b;font-family:Arial,sans-serif;">No preview available for this template.</div>';
    }
    return renderEmailFromBlocks(blocks, {
      products: previewProducts,
      recipientEmail: 'preview@example.com',
      preheader: previewModal.preheader || '',
      fontFamily: previewModal.fontFamily || builderFontFamily || 'helvetica',
      previewMode: true,
    });
  }, [previewModal, customTemplates, previewProducts, builderFontFamily]);

  const selectedGalleryPreset = useMemo(
    () => (selectedPresetId ? presets.find((item) => item.id === selectedPresetId) : null),
    [presets, selectedPresetId],
  );

  const sendTabMiniPreviewHtml = useMemo(() => {
    if (templateSource !== 'gallery' || !selectedPresetId) return '';
    const blocks = getPresetBlocks(selectedPresetId);
    if (!Array.isArray(blocks) || !blocks.length) return '';
    return renderEmailFromBlocks(blocks, {
      products: previewProducts,
      recipientEmail: 'preview@example.com',
      preheader: '',
      fontFamily: selectedGalleryPreset?.fontFamily || 'helvetica',
      previewMode: true,
    });
  }, [templateSource, selectedPresetId, previewProducts, selectedGalleryPreset]);

  const openTemplatePreview = (payload) => {
    setPreviewModal(payload);
  };

  const closeTemplatePreview = () => setPreviewModal(null);

  const openSelectedCampaignPreview = () => {
    if (templateSource === 'builder') {
      if (!builderBlocks.length) {
        setSendStatus('Please add content in the builder before previewing.');
        return;
      }
      openTemplatePreview({
        type: 'builder',
        name: builderName || 'Builder draft',
        subject: builderSubject || '',
        preheader: builderPreheader || '',
        blocks: builderBlocks,
      });
      return;
    }
    if (templateSource === 'gallery' && selectedPresetId) {
      const preset = presets.find((item) => item.id === selectedPresetId);
      openTemplatePreview({
        type: 'preset',
        id: selectedPresetId,
        name: preset?.name || 'Gallery template',
        subject: preset?.subject || builderSubject || '',
        preheader: builderPreheader || '',
      });
      return;
    }
    if (templateSource === 'custom' && selectedCustomId) {
      const saved = customTemplates.find((item) => String(item._id) === String(selectedCustomId));
      openTemplatePreview({
        type: 'saved',
        id: selectedCustomId,
        name: saved?.name || 'Saved template',
        subject: saved?.subject || '',
        preheader: saved?.preheader || '',
        blocks: saved?.blocks || [],
      });
      return;
    }
    if (templateSource === 'classic' && selectedClassicId) {
      const classic = classicTemplates.find((item) => (
        item.classicId === selectedClassicId
        || item.id === `classic:${selectedClassicId}`
        || item.id === selectedClassicId
      ));
      openTemplatePreview({
        type: 'classic',
        id: classic?.id || `classic:${selectedClassicId}`,
        name: classic?.name || 'Classic template',
        subject: classic?.subject || '',
        description: classic?.description || '',
        blocks: getPresetBlocks(classic?.id) || [],
      });
      return;
    }
    setSendStatus('Please choose a template first, then preview.');
  };

  const hasSelectedTemplate = Boolean(
    templateSource === 'builder'
      ? builderBlocks.length > 0
      : templateSource === 'classic'
        ? selectedClassicId
        : templateSource === 'gallery'
          ? selectedPresetId
          : selectedCustomId,
  );
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => (
      customer.name?.toLowerCase().includes(query)
      || customer.email?.toLowerCase().includes(query)
    ));
  }, [customers, customerSearch]);

  const excludedSet = useMemo(
    () => new Set(excludedCustomers.map((item) => String(item).toLowerCase())),
    [excludedCustomers],
  );
  const selectedSet = useMemo(
    () => new Set(selectedCustomers.map((item) => String(item).toLowerCase())),
    [selectedCustomers],
  );

  const selectedCount = useMemo(() => {
    if (selectAllCustomers) {
      return Math.max(0, filteredCustomers.length - filteredCustomers.filter((c) => excludedSet.has(String(c.id).toLowerCase())).length);
    }
    // Count across full audience, not only the current search filter.
    return selectedCustomers.length;
  }, [filteredCustomers, selectAllCustomers, excludedSet, selectedCustomers]);

  const selectedEmails = useMemo(() => {
    if (selectAllCustomers) {
      return filteredCustomers
        .filter((customer) => !excludedSet.has(String(customer.id).toLowerCase()))
        .filter((customer) => !customer.promotionalOptOut)
        .map((customer) => String(customer.email || '').trim().toLowerCase())
        .filter((email) => email.includes('@'));
    }
    // selectedCustomers already stores unique lowercase emails
    return selectedCustomers
      .map((email) => String(email || '').trim().toLowerCase())
      .filter((email) => email.includes('@'));
  }, [filteredCustomers, selectAllCustomers, excludedSet, selectedCustomers]);

  const isCustomerSelected = (customer) => {
    const id = String(customer?.id || customer?.email || '').trim().toLowerCase();
    if (!id) return false;
    if (selectAllCustomers) return !excludedSet.has(id);
    return selectedSet.has(id);
  };

  const toggleCustomer = (customerOrId) => {
    const id = typeof customerOrId === 'object' && customerOrId
      ? String(customerOrId.id || customerOrId.email || '').trim().toLowerCase()
      : String(customerOrId || '').trim().toLowerCase();
    if (!id || !id.includes('@')) return;

    if (selectAllCustomers) {
      setExcludedCustomers((prev) => (
        prev.map((item) => String(item).toLowerCase()).includes(id)
          ? prev.filter((item) => String(item).toLowerCase() !== id)
          : [...prev, id]
      ));
      return;
    }
    setSelectedCustomers((prev) => {
      const normalized = prev.map((item) => String(item).toLowerCase());
      if (normalized.includes(id)) {
        return prev.filter((item) => String(item).toLowerCase() !== id);
      }
      return [...prev, id];
    });
  };

  const handleSelectAll = (checked) => {
    // Fast path: only flip a flag — never copy thousands of IDs into state.
    setSelectAllCustomers(Boolean(checked));
    setExcludedCustomers([]);
    setSelectedCustomers([]);
  };
  const openPresetInBuilder = async (presetId) => {
    try {
      const headers = await authHeaders();
      if (String(presetId).startsWith('classic:')) {
        const classic = classicTemplates.find((item) => item.id === presetId);
        setBuilderName(classic?.name || 'Classic template');
        setBuilderSubject(classic?.subject || '');
      setBuilderPreheader('');
      setBuilderFontFamily('helvetica');
      setBuilderBlocks(getPresetBlocks('blank-canvas') || []);
        setEditingCustomId('');
        setTemplateSource('builder');
        setTab('builder');
        return;
      }

      const { data } = await axios.get(
        `/api/store/email-marketing/templates?presetId=${encodeURIComponent(presetId)}`,
        { headers },
      );
      const preset = data.preset;
      setBuilderName(preset?.name || 'Campaign');
      setBuilderSubject(preset?.subject || '');
      setBuilderPreheader('');
      setBuilderFontFamily('helvetica');
      setBuilderBlocks(preset?.blocks || getPresetBlocks(presetId) || []);
      setEditingCustomId('');
      setSelectedPresetId(presetId);
      setTemplateSource('builder');
      setTab('builder');
    } catch (error) {
      console.error('Failed to open preset:', error);
      const localBlocks = getPresetBlocks(presetId);
      if (localBlocks) {
        const preset = presets.find((item) => item.id === presetId);
        setBuilderName(preset?.name || 'Campaign');
        setBuilderSubject(preset?.subject || '');
        setBuilderBlocks(localBlocks);
        setTemplateSource('builder');
        setTab('builder');
      }
    }
  };

  const openCustomInBuilder = async (customId) => {
    try {
      const headers = await authHeaders();
      const { data } = await axios.get(
        `/api/store/email-marketing/templates?id=${encodeURIComponent(customId)}`,
        { headers },
      );
      const template = data.template;
      setBuilderName(template.name || 'Custom template');
      setBuilderSubject(template.subject || '');
      setBuilderPreheader(template.preheader || '');
      setBuilderFontFamily(template.fontFamily || 'helvetica');
      setBuilderBlocks(template.blocks || []);
      setEditingCustomId(template._id);
      setSelectedCustomId(template._id);
      setTemplateSource('builder');
      setTab('builder');
    } catch (error) {
      console.error('Failed to open custom template:', error);
    }
  };

  const startBlankBuilder = () => {
    const blocks = getPresetBlocks('blank-canvas') || [];
    setBuilderName('New custom template');
    setBuilderSubject('Your campaign subject');
    setBuilderPreheader('');
    setBuilderFontFamily('helvetica');
    setBuilderBlocks(blocks);
    setEditingCustomId('');
    setTemplateSource('builder');
    setTab('builder');
  };

  const saveBuilderTemplate = async () => {
    if (!builderName.trim() || !builderSubject.trim()) {
      setSendStatus('Please enter template name and subject.');
      return;
    }
    if (!builderBlocks.length) {
      setSendStatus('Add at least one block to the template.');
      return;
    }

    try {
      setSavingTemplate(true);
      setSendStatus('');
      const headers = await authHeaders();
      if (editingCustomId) {
        const { data } = await axios.put('/api/store/email-marketing/templates', {
          id: editingCustomId,
          name: builderName,
          subject: builderSubject,
          preheader: builderPreheader,
          fontFamily: builderFontFamily,
          blocks: builderBlocks,
        }, { headers });
        setSelectedCustomId(data.template._id);
      } else {
        const { data } = await axios.post('/api/store/email-marketing/templates', {
          name: builderName,
          subject: builderSubject,
          preheader: builderPreheader,
          fontFamily: builderFontFamily,
          blocks: builderBlocks,
          sourcePresetId: selectedPresetId || '',
          category: 'Custom',
        }, { headers });
        setEditingCustomId(data.template._id);
        setSelectedCustomId(data.template._id);
      }
      setTemplateSource('custom');
      await loadTemplateLibrary();
      setSendStatus('Template saved. You can send it from the Send campaign tab.');
      setTab('send');
    } catch (error) {
      setSendStatus(error?.response?.data?.error || 'Failed to save template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const buildSendPayload = () => {
    const subject = String(sendSubject || defaultSendSubject || '').trim();
    if (templateSource === 'builder' || (templateSource === 'custom' && builderBlocks.length && !selectedCustomId)) {
      return {
        blocks: builderBlocks,
        subject,
        preheader: builderPreheader,
        fontFamily: builderFontFamily,
        customTemplateId: editingCustomId || undefined,
      };
    }
    if (templateSource === 'custom' && selectedCustomId) {
      return {
        customTemplateId: selectedCustomId,
        subject,
        preheader: builderPreheader,
        fontFamily: builderFontFamily || 'helvetica',
        // Prefer live builder blocks when open so send matches the on-screen design.
        ...(Array.isArray(builderBlocks) && builderBlocks.length ? { blocks: builderBlocks } : {}),
      };
    }
    if (templateSource === 'gallery' && selectedPresetId) {
      const blocks = getPresetBlocks(selectedPresetId);
      return {
        blocks: blocks || builderBlocks,
        subject,
        preheader: builderPreheader,
        fontFamily: builderFontFamily || 'helvetica',
        templateId: selectedPresetId,
      };
    }
    return {
      templateId: selectedClassicId ? `classic:${selectedClassicId}` : selectedClassicId,
      subject,
    };
  };

  const clearAudienceSelection = () => {
    setSelectedCustomers([]);
    setExcludedCustomers([]);
    setSelectAllCustomers(false);
  };

  const cancelSendQueue = () => {
    if (!sending) return;
    sendCancelRequestedRef.current = true;
    sendAbortRef.current?.abort?.();
    setSendStatus('Cancelling send… finishing the current batch, then stopping.');
  };

  const handleSendPromotional = async () => {
    const payload = buildSendPayload();
    const hasTemplate = Boolean(
      payload.templateId
      || payload.customTemplateId
      || (payload.blocks && payload.blocks.length),
    );

    if (!hasTemplate) {
      setSendStatus('Please choose a template, gallery preset, or build a custom email.');
      return;
    }
    if (!String(payload.subject || '').trim()) {
      setSendStatus('Please enter an email subject.');
      return;
    }
    if (selectedEmails.length === 0) {
      setSendStatus('Please select at least one customer with an email.');
      return;
    }
    if (selectedEmails.length > MAX_CAMPAIGN_RECIPIENTS) {
      setSendStatus(
        `Too many recipients (${selectedEmails.length.toLocaleString()}). Maximum is ${MAX_CAMPAIGN_RECIPIENTS.toLocaleString()} emails per send. Narrow the audience and try again.`,
      );
      return;
    }
    const upcomingScheduleTimes = normalizeScheduleTimes(scheduleTimes);
    if (scheduleMode === 'schedule') {
      if (!upcomingScheduleTimes.length) {
        setSendStatus('Add at least one upcoming date and time.');
        return;
      }
      const nowMs = Date.now();
      const hasPast = upcomingScheduleTimes.some((value) => {
        const at = new Date(value);
        return Number.isNaN(at.getTime()) || at.getTime() <= nowMs;
      });
      if (hasPast) {
        setSendStatus('Schedule times must be upcoming date and times (in the future).');
        return;
      }
    }
    if (scheduleMode === 'auto' && !autoTimes.filter(Boolean).length) {
      setSendStatus('Add at least one daily send time.');
      return;
    }

    const emailsToSend = [...selectedEmails];
    sendCancelRequestedRef.current = false;
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    sendAbortRef.current = abortController;

    try {
      setSending(true);
      setSendStatus('');
      setSendProgress({ done: 0, total: emailsToSend.length });
      const headers = await authHeaders();

      if (scheduleMode === 'auto') {
        const { data } = await axios.post('/api/store/email-marketing/campaigns', {
          ...payload,
          name: payload.subject || builderName || 'Daily campaign',
          scheduleMode: 'daily',
          dailyTimes: autoTimes,
          customerEmails: emailsToSend,
          audience,
          timezone: 'Asia/Dubai',
        }, { headers, signal: abortController?.signal });
        if (sendCancelRequestedRef.current) {
          setSendStatus('Send cancelled before the daily campaign was created.');
          return;
        }
        clearAudienceSelection();
        setSendProgress({ done: emailsToSend.length, total: emailsToSend.length });
        setSendStatus(
          data.message
          || `Daily campaign started for ${emailsToSend.length} customer(s). It will keep sending until you disable it.`,
        );
        loadActiveCampaigns();
      } else if (scheduleMode === 'schedule') {
        const { data } = await axios.post('/api/store/email-marketing/campaigns', {
          ...payload,
          name: payload.subject || builderName || 'Scheduled campaign',
          scheduleMode: 'once',
          onceAtList: upcomingScheduleTimes,
          customerEmails: emailsToSend,
          audience,
          timezone: 'Asia/Dubai',
        }, { headers, signal: abortController?.signal });
        if (sendCancelRequestedRef.current) {
          setSendStatus('Send cancelled before the schedule was created.');
          return;
        }
        clearAudienceSelection();
        setSendProgress({ done: emailsToSend.length, total: emailsToSend.length });
        const whenLabel = upcomingScheduleTimes
          .map((value) => formatDubaiDateTime(parseDubaiDateTimeLocal(value)))
          .join(' · ');
        setSendStatus(
          data.message
          || `Queued for ${emailsToSend.length} customer(s) at ${whenLabel}.`,
        );
        loadActiveCampaigns();
      } else {
        let sent = 0;
        let failed = 0;
        let cancelled = false;
        const total = emailsToSend.length;
        const batches = Math.ceil(total / SEND_BATCH_SIZE);

        for (let index = 0; index < total; index += SEND_BATCH_SIZE) {
          if (sendCancelRequestedRef.current) {
            cancelled = true;
            break;
          }

          const chunk = emailsToSend.slice(index, index + SEND_BATCH_SIZE);
          const batchNumber = Math.floor(index / SEND_BATCH_SIZE) + 1;
          setSendStatus(
            total > SEND_BATCH_SIZE
              ? `Sending queue… batch ${batchNumber} of ${batches} (${Math.min(index + chunk.length, total)} / ${total})`
              : 'Sending…',
          );

          const { data } = await axios.post('/api/promotional-emails', {
            ...payload,
            customerEmails: chunk,
            limit: chunk.length,
            totalRecipients: total,
            audience,
            scheduleTime: null,
          }, { headers, signal: abortController?.signal });

          sent += Number(data.emailsSent || 0);
          failed += Number(data.emailsFailed || 0);
          setSendProgress({ done: Math.min(index + chunk.length, total), total });
        }

        if (cancelled || sendCancelRequestedRef.current) {
          setSendStatus(
            `Send cancelled. ${sent} of ${total} email(s) already went out`
            + (failed > 0 ? ` (${failed} failed).` : '.'),
          );
        } else {
          clearAudienceSelection();
          setSendStatus(
            failed > 0
              ? `Sent ${sent} of ${total} customer(s). ${failed} failed — check History.`
              : `Sent to ${sent} customer(s).`,
          );
        }
      }
      loadHistory(1);
    } catch (error) {
      const canceled = sendCancelRequestedRef.current
        || error?.code === 'ERR_CANCELED'
        || error?.name === 'CanceledError'
        || error?.name === 'AbortError';
      if (canceled) {
        setSendStatus('Send cancelled. Emails already sent in earlier batches will still be delivered.');
      } else {
        const msg = error?.response?.data?.error || error?.response?.data?.message || error.message;
        setSendStatus(msg || 'Failed to send promotional emails.');
      }
    } finally {
      sendAbortRef.current = null;
      sendCancelRequestedRef.current = false;
      setSending(false);
    }
  };

  if (loading && tab === 'history' && !history.length) {
    return <Loading />;
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const activeAudience = audiences.find((item) => item.id === audience);

  return (
    <>
    <div className="w-full space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-6 py-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Marketing</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Email Marketing</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Pick a template, choose an audience, then send or schedule
              </p>
            </div>
            {tab === 'send' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 sm:mt-0">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                  {selectedEmails.length} selected
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
                  {filteredCustomers.length} in filter
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto px-4 pt-3 sm:px-6">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'bg-white text-slate-900 shadow-[0_-1px_0_#fff] ring-1 ring-slate-200 ring-b-transparent'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {active ? <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-teal-600" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {sendStatus && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
          sendStatus.includes('Failed') || sendStatus.includes('Please') || sendStatus.includes('cancelled') || sendStatus.includes('Cancelling')
            ? sendStatus.includes('Cancelling') || sendStatus.includes('cancelled')
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : 'border border-red-200 bg-red-50 text-red-800'
            : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          <span>{sendStatus}</span>
          {sending ? (
            <button
              type="button"
              onClick={cancelSendQueue}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50"
            >
              <StopCircle className="h-3.5 w-3.5" />
              Cancel send
            </button>
          ) : null}
        </div>
      )}

      {tab === 'send' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { n: '1', title: 'Template', done: Boolean(templateSource === 'builder' ? builderSubject : templateSource === 'classic' ? selectedClassicId : templateSource === 'gallery' ? selectedPresetId : selectedCustomId) },
              { n: '2', title: 'Audience', done: selectedEmails.length > 0 },
              { n: '3', title: scheduleMode === 'auto' ? 'Daily' : scheduleMode === 'schedule' ? 'Schedule' : 'Send', done: selectedEmails.length > 0 },
            ].map((step) => (
              <div
                key={step.n}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  step.done ? 'border-teal-200 bg-teal-50/70' : 'border-slate-200 bg-white'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  step.done ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {step.done ? '✓' : step.n}
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Step {step.n}</div>
                  <div className="text-xs text-slate-500">{step.title}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h3 className="text-base font-semibold text-slate-900">1. Choose template</h3>
                <p className="mt-0.5 text-xs text-slate-500">Start from classic, gallery, saved, or your builder draft</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { id: 'classic', label: 'Classic', help: 'Ready subjects', icon: Mail },
                  { id: 'gallery', label: 'Gallery', help: 'Sales & welcome', icon: Sparkles },
                  { id: 'custom', label: 'Saved', help: 'Your templates', icon: FolderOpen },
                  { id: 'builder', label: 'Builder', help: 'Drag & drop draft', icon: Layers },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = templateSource === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setTemplateSource(option.id);
                        if (option.id === 'builder' && !builderBlocks.length) startBlankBuilder();
                        if (option.id === 'builder') setTab('builder');
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-teal-600 bg-teal-50/80 ring-1 ring-teal-200'
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <span className={`mt-0.5 rounded-lg p-2 ${active ? 'bg-teal-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{option.help}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                {templateSource === 'classic' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-slate-600">Classic template</label>
                    {templatesLoading ? (
                      <div className="text-sm text-slate-500">Loading templates...</div>
                    ) : (
                      <select
                        value={selectedClassicId}
                        onChange={(e) => setSelectedClassicId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                      >
                        <option value="">Choose a template...</option>
                        {classicTemplates.map((template) => (
                          <option key={template.id} value={template.classicId || template.id.replace('classic:', '')}>
                            {template.subject || template.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" onClick={() => setTab('gallery')} className="text-sm font-medium text-teal-700 hover:underline">
                      Browse full gallery →
                    </button>
                  </div>
                )}

                {templateSource === 'gallery' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-slate-600">Gallery preset</label>
                    <select
                      value={selectedPresetId}
                      onChange={(e) => {
                        setSelectedPresetId(e.target.value);
                        const preset = presets.find((item) => item.id === e.target.value);
                        if (preset) {
                          setBuilderSubject(preset.subject || '');
                          setBuilderName(preset.name || '');
                        }
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="">Choose a preset...</option>
                      {presets.filter((item) => item.category !== 'Classic').map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name} — {preset.subject}
                        </option>
                      ))}
                    </select>

                    {selectedPresetId && selectedGalleryPreset ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-slate-800">{selectedGalleryPreset.name}</div>
                            <div className="truncate text-[11px] text-slate-500">{selectedGalleryPreset.subject}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openTemplatePreview({
                              type: 'preset',
                              id: selectedPresetId,
                              name: selectedGalleryPreset.name,
                              subject: selectedGalleryPreset.subject,
                            })}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-black"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Full preview
                          </button>
                        </div>
                        <div className="relative mx-auto h-44 w-full max-w-[220px] overflow-hidden bg-slate-100">
                          {sendTabMiniPreviewHtml ? (
                            <div className="pointer-events-none absolute left-1/2 top-0 origin-top -translate-x-1/2 scale-[0.34]" style={{ width: 620 }}>
                              <iframe
                                title="Gallery template mini preview"
                                className="h-[520px] w-[620px] border-0 bg-white"
                                sandbox=""
                                srcDoc={toEmailPreviewSrcDoc(sendTabMiniPreviewHtml)}
                              />
                            </div>
                          ) : selectedGalleryPreset.thumbnailImage ? (
                            <img
                              src={selectedGalleryPreset.thumbnailImage}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-full w-full items-end p-3 text-xs font-semibold text-white"
                              style={{ background: `linear-gradient(135deg, ${selectedGalleryPreset.thumbnailColor || '#0f766e'}, #0f172a)` }}
                            >
                              {selectedGalleryPreset.name}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Pick a preset to see a small preview here.</p>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => setTab('gallery')} className="text-sm font-medium text-teal-700 hover:underline">
                        Open gallery
                      </button>
                      <button
                        type="button"
                        onClick={() => selectedPresetId && openPresetInBuilder(selectedPresetId)}
                        className="text-sm font-medium text-teal-700 hover:underline"
                      >
                        Customize this preset
                      </button>
                    </div>
                  </div>
                )}

                {templateSource === 'custom' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-slate-600">Saved template</label>
                    <select
                      value={selectedCustomId}
                      onChange={(e) => setSelectedCustomId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="">Choose a saved template...</option>
                      {customTemplates.map((template) => (
                        <option key={template._id} value={template._id}>
                          {template.name} — {template.subject}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={startBlankBuilder} className="text-sm font-medium text-teal-700 hover:underline">
                        Create with drag & drop
                      </button>
                      {selectedCustomId && (
                        <button
                          type="button"
                          onClick={() => openCustomInBuilder(selectedCustomId)}
                          className="text-sm font-medium text-teal-700 hover:underline"
                        >
                          Edit selected
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {templateSource === 'builder' && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-teal-700">Builder draft</div>
                    <div className="text-base font-semibold text-slate-900">{builderSubject || 'No subject yet'}</div>
                    <div className="text-xs text-slate-500">{builderName || 'Untitled template'}</div>
                    <button
                      type="button"
                      onClick={() => setTab('builder')}
                      className="mt-2 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black"
                    >
                      Continue editing
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">2. Choose audience</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Filter ordered customers who have an email</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  <Users className="h-3.5 w-3.5" />
                  {filteredCustomers.length}
                </span>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Audience filter</label>
                <select
                  value={audience}
                  onChange={(e) => loadAudienceCustomers(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                >
                  {(audiences.length ? audiences : [
                    { id: 'all', label: 'All ordered customers', count: customers.length },
                  ]).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}{typeof item.count === 'number' ? ` (${item.count})` : ''}
                    </option>
                  ))}
                </select>
                {activeAudience?.description && (
                  <p className="mt-1.5 text-xs text-slate-500">{activeAudience.description}</p>
                )}
                {audience === 'unsubscribed' ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    These customers opted out. They cannot be selected for promotional sends.
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Unsubscribed customers are hidden from send lists. Open audience “Unsubscribed (promotional)” to review them.
                  </p>
                )}
              </div>

              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search name or email..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />

              {customersLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading customers...</div>
              ) : (
                <>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectAllCustomers}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 accent-teal-600"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Select all in this filter ({filteredCustomers.length})
                    </span>
                  </label>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40 p-2">
                    {filteredCustomers.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-500">
                        No ordered customers with email in this audience
                      </div>
                    ) : (
                      filteredCustomers.map((customer) => {
                        const checked = isCustomerSelected(customer);
                        const optedOut = Boolean(customer.promotionalOptOut);
                        const rowKey = String(customer.id || customer.email || '').toLowerCase();
                        return (
                          <label
                            key={rowKey}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                              optedOut
                                ? 'border-amber-200 bg-amber-50/70 opacity-90'
                                : checked
                                  ? 'border-teal-300 bg-white shadow-sm'
                                  : 'border-transparent bg-white/70 hover:border-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked && !optedOut}
                              disabled={optedOut}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (optedOut) return;
                                toggleCustomer(customer);
                              }}
                              className="h-4 w-4 accent-teal-600 disabled:cursor-not-allowed"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-medium text-slate-900">{customer.name}</div>
                                {optedOut ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                    Unsubscribed
                                  </span>
                                ) : null}
                              </div>
                              <div className="truncate text-xs text-slate-500">{customer.email}</div>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-slate-400">
                              <div>{customer.totalOrders} order{customer.totalOrders === 1 ? '' : 's'}</div>
                              {customer.country ? <div>{customer.country}</div> : null}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </section>
          </div>

          <section className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="mb-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email subject
              </label>
              <input
                type="text"
                value={sendSubject}
                onChange={(e) => {
                  setSendSubjectTouched(true);
                  setSendSubject(e.target.value);
                }}
                placeholder="Subject line for this send"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Defaults from the template — edit only for this send if you want.
              </p>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode('send')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                    scheduleMode === 'send'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Send now
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('schedule')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                    scheduleMode === 'schedule'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('auto')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                    scheduleMode === 'auto'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Daily until disabled
                </button>
                {scheduleMode === 'schedule' && (
                  <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                    {scheduleTimes.map((value, index) => (
                      <div key={`schedule-time-${index}`} className="flex items-center gap-1">
                        <input
                          type="datetime-local"
                          min={datetimeLocalMin()}
                          value={value}
                          onChange={(e) => {
                            const next = [...scheduleTimes];
                            next[index] = e.target.value;
                            setScheduleTimes(next);
                          }}
                          className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        {scheduleTimes.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setScheduleTimes(scheduleTimes.filter((_, i) => i !== index))}
                            className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setScheduleTimes([
                        ...scheduleTimes,
                        defaultUpcomingDateTime(24 * (scheduleTimes.length + 1)),
                      ])}
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      + Add date
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Asia/Dubai · emails go out automatically at this time (you can leave this page)
                    </span>
                  </div>
                )}
                {scheduleMode === 'auto' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {autoTimes.map((time, index) => (
                      <div key={`auto-time-${index}`} className="flex items-center gap-1">
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => {
                            const next = [...autoTimes];
                            next[index] = e.target.value;
                            setAutoTimes(next);
                          }}
                          className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        {autoTimes.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setAutoTimes(autoTimes.filter((_, i) => i !== index))}
                            className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAutoTimes([...autoTimes, '18:00'])}
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      + Add time
                    </button>
                    <span className="text-[11px] text-slate-500">Asia/Dubai · keeps sending daily until disabled</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="text-sm text-slate-600">
                  {sending && sendProgress.total > 0 ? (
                    <>Queue <strong className="text-slate-900">{sendProgress.done}</strong> / {sendProgress.total}</>
                  ) : selectedEmails.length > MAX_CAMPAIGN_RECIPIENTS ? (
                    <span className="text-red-600">
                      Max {MAX_CAMPAIGN_RECIPIENTS.toLocaleString()} recipients — narrow audience
                    </span>
                  ) : selectedEmails.length > 0 ? (
                    <>Ready for <strong className="text-slate-900">{selectedEmails.length}</strong> customer{selectedEmails.length === 1 ? '' : 's'}</>
                  ) : (
                    <span className="text-slate-400">Select customers to continue</span>
                  )}
                </div>
                {sending ? (
                  <button
                    type="button"
                    onClick={cancelSendQueue}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
                  >
                    <StopCircle className="h-4 w-4" />
                    Cancel send
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleSendPromotional}
                  disabled={sending || selectedEmails.length === 0 || selectedEmails.length > MAX_CAMPAIGN_RECIPIENTS}
                  className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending
                    ? (sendProgress.total > SEND_BATCH_SIZE
                      ? `Queue ${sendProgress.done}/${sendProgress.total}`
                      : 'Processing...')
                    : scheduleMode === 'send'
                      ? 'Send campaign'
                      : scheduleMode === 'auto'
                        ? 'Start daily campaign'
                        : 'Schedule campaign'}
                </button>
              </div>
            </div>
            {sending && sendProgress.total > 0 ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${Math.min(100, Math.round((sendProgress.done / sendProgress.total) * 100))}%` }}
                />
              </div>
            ) : null}
          </section>

          {(campaignsLoading || activeCampaigns.length > 0) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Active scheduled campaigns</h3>
                  <p className="text-xs text-slate-500">
                    Sends automatically at the scheduled Asia/Dubai time. Refresh also sends any campaign whose time has already passed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadActiveCampaigns}
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  Refresh
                </button>
              </div>
              {campaignsLoading ? (
                <div className="mt-3 text-sm text-slate-500">Loading campaigns...</div>
              ) : activeCampaigns.length === 0 ? (
                <div className="mt-3 text-sm text-slate-500">No active scheduled campaigns</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {activeCampaigns.map((campaign) => (
                    <div
                      key={campaign._id}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{campaign.name || campaign.subject}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {campaign.scheduleMode === 'once'
                            ? `Once · ${(Array.isArray(campaign.onceAtList) ? campaign.onceAtList : [])
                              .map((value) => formatDubaiDateTime(value))
                              .join(' · ') || '—'}`
                            : `Daily at ${(campaign.dailyTimes || []).join(', ') || '—'}`}
                          {' · '}
                          {(campaign.customerEmails || []).length} recipients
                          {campaign.lastRunAt ? ` · last run ${formatDubaiDateTime(campaign.lastRunAt)}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => stopCampaign(campaign._id)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Disable
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {tab === 'gallery' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Template gallery</h3>
              <p className="text-sm text-gray-600">
                Choose from shop templates, your saved designs, or recently sent campaigns
              </p>
            </div>
            <button
              type="button"
              onClick={startBlankBuilder}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Create from scratch
            </button>
          </div>

          <div className="flex gap-6 border-b border-gray-200">
            {GALLERY_LIBRARY_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setGalleryLibraryTab(item.id)}
                className={`-mb-px border-b-2 pb-3 text-sm font-medium ${
                  galleryLibraryTab === item.id
                    ? 'border-teal-600 text-teal-800'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <input
              value={gallerySearch}
              onChange={(e) => setGallerySearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:max-w-md"
            />

            {galleryLibraryTab === 'shop' && (
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setGalleryCategory(category)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      galleryCategory === category
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}
          </div>

          {galleryLibraryTab === 'shop' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {templatesLoading ? (
                <div className="col-span-full py-10 text-center text-sm text-gray-500">Loading templates...</div>
              ) : galleryPresets.length === 0 ? (
                <div className="col-span-full py-10 text-center text-sm text-gray-500">No templates in this category</div>
              ) : (
                galleryPresets.map((preset) => (
                  <EmailGalleryPresetCard
                    key={preset.id}
                    preset={preset}
                    onCreate={() => {
                      setSelectedPresetId(preset.id);
                      setBuilderSubject(preset.subject || '');
                      setBuilderName(preset.name || '');
                      const nextBlocks = getPresetBlocks(preset.id);
                      if (nextBlocks) setBuilderBlocks(nextBlocks);
                      setTemplateSource('gallery');
                      setTab('send');
                    }}
                    onCustomize={() => openPresetInBuilder(preset.id)}
                    onPreview={() => openTemplatePreview({
                      type: 'preset',
                      id: preset.id,
                      name: preset.name,
                      subject: preset.subject,
                      category: preset.category,
                      description: preset.description,
                    })}
                  />
                ))
              )}
            </div>
          )}

          {galleryLibraryTab === 'saved' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSavedTemplates.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
                  No saved templates yet. Customize a shop template and click Save template.
                </div>
              ) : (
                filteredSavedTemplates.map((template) => (
                  <div key={template._id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-teal-700">Saved</div>
                    <div className="mt-1 font-semibold text-gray-900">{template.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{template.subject}</div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      Updated {template.updatedAt ? new Date(template.updatedAt).toLocaleString() : '—'}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomId(template._id);
                          setTemplateSource('custom');
                          setTab('send');
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Create email
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomInBuilder(template._id)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium"
                      >
                        Edit images & content
                      </button>
                      <button
                        type="button"
                        onClick={() => openTemplatePreview({
                          type: 'saved',
                          id: template._id,
                          name: template.name,
                          subject: template.subject,
                          preheader: template.preheader,
                          blocks: template.blocks,
                        })}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium"
                      >
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {galleryLibraryTab === 'recent' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentlySentTemplates.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
                  No recently sent campaigns yet. Send an email to see it here.
                </div>
              ) : (
                recentlySentTemplates.map((row) => (
                  <div key={row.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="relative h-36 bg-slate-200">
                      {row.preset?.thumbnailImage ? (
                        <img src={row.preset.thumbnailImage} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-end bg-gradient-to-br from-slate-700 to-slate-900 p-4 text-white">
                          <div className="font-semibold">{row.preset?.name || row.saved?.name || 'Sent campaign'}</div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="font-semibold text-gray-900">
                        {row.preset?.name || row.saved?.name || row.subject}
                      </div>
                      <div className="text-xs text-gray-500">{row.subject}</div>
                      <div className="text-[11px] text-gray-400">
                        Sent {row.sentAt ? new Date(row.sentAt).toLocaleString() : '—'}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {row.preset && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPresetId(row.preset.id);
                                setBuilderSubject(row.preset.subject || row.subject);
                                setTemplateSource('gallery');
                                setTab('send');
                              }}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Send again
                            </button>
                            <button
                              type="button"
                              onClick={() => openPresetInBuilder(row.preset.id)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium"
                            >
                              Customize
                            </button>
                          </>
                        )}
                        {row.saved && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomId(row.saved._id);
                                setTemplateSource('custom');
                                setTab('send');
                              }}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Send again
                            </button>
                            <button
                              type="button"
                              onClick={() => openCustomInBuilder(row.saved._id)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium"
                            >
                              Edit
                            </button>
                          </>
                        )}
                        {!row.preset && !row.saved && (
                          <button
                            type="button"
                            onClick={() => {
                              setBuilderSubject(row.subject || '');
                              setTemplateSource('builder');
                              setTab('builder');
                            }}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium"
                          >
                            Recreate in builder
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'builder' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Create / customize template</h3>
              <p className="text-sm text-gray-600">Drag blocks, edit full details, preview, then save or send</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveBuilderTemplate}
                disabled={savingTemplate}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {savingTemplate ? 'Saving...' : editingCustomId ? 'Update template' : 'Save template'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTemplateSource('builder');
                  setTab('send');
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Use on send tab
              </button>
            </div>
          </div>

          <EmailCampaignBuilder
            blocks={builderBlocks}
            onChange={setBuilderBlocks}
            subject={builderSubject}
            onSubjectChange={setBuilderSubject}
            name={builderName}
            onNameChange={setBuilderName}
            preheader={builderPreheader}
            onPreheaderChange={setBuilderPreheader}
            fontFamily={builderFontFamily}
            onFontFamilyChange={setBuilderFontFamily}
            previewProducts={previewProducts}
            heroImages={heroImages}
            categories={productCategories}
            getToken={getToken}
          />
        </div>
      )}

      {tab === 'pages' && (
        <EmailCampaignLandingPages getToken={getToken} />
      )}

      {tab === 'leads' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard icon={Inbox} title="Total" value={leadsStats.total} color="teal" />
            <StatCard icon={Mail} title="New" value={leadsStats.new} color="blue" />
            <StatCard icon={Users} title="Contacted" value={leadsStats.contacted} color="orange" />
            <StatCard icon={CheckCircle} title="Converted" value={leadsStats.converted} color="green" />
            <StatCard icon={Clock} title="Archived" value={leadsStats.archived} color="gray" />
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Signup & email buyers</h3>
              <p className="text-xs text-slate-500">
                Welcome-offer signups and customers who purchased after clicking your marketing emails (last 30 days).
              </p>
              <p className="text-sm text-slate-500">
                From /welcome-offer and email signup buttons. Email opens and link clicks are on the History tab.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={leadsSearch}
                onChange={(e) => setLeadsSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadLeads(1);
                }}
                placeholder="Search email, name, phone…"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={leadsStatusFilter}
                onChange={(e) => {
                  setLeadsStatusFilter(e.target.value);
                  setLeadsPage(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">All status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="converted">Converted</option>
                <option value="archived">Archived</option>
              </select>
              <button
                type="button"
                onClick={() => loadLeads(1)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Search
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Contact</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Source</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Purchase</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leadsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading leads…</td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No leads yet. Signups from /welcome-offer and email buyers (after they click your campaign link) appear here.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead._id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{lead.email || '—'}</div>
                        {(lead.name || lead.phone) ? (
                          <div className="text-xs text-slate-500">
                            {[lead.name, lead.phone].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                        {lead.heading ? (
                          <div className="mt-0.5 text-[11px] text-slate-400">{lead.heading}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lead.source === 'email_campaign' ? 'Email campaign' : (lead.source || 'welcome_offer')}
                        {lead.campaignName ? (
                          <div className="text-[11px] text-slate-400 line-clamp-2">{lead.campaignName}</div>
                        ) : null}
                        {lead.formStyle ? (
                          <div className="text-[11px] text-slate-400">{lead.formStyle}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status || 'new'}
                          onChange={(e) => updateLeadStatus(lead._id, e.target.value)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="converted">Converted</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lead.convertedOrderId ? (
                          <>
                            <div className="font-medium text-emerald-700">
                              {lead.convertedOrderTotal != null
                                ? `AED ${Number(lead.convertedOrderTotal).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                : 'Order placed'}
                            </div>
                            {lead.convertedAt ? (
                              <div className="text-[11px] text-slate-400">
                                {new Date(lead.convertedAt).toLocaleString()}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(lead.lastSubmittedAt || lead.createdAt).toLocaleString()}
                        {lead.submittedCount > 1 ? (
                          <div className="text-[11px] text-slate-400">{lead.submittedCount} times</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => deleteLead(lead._id)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {Math.ceil(leadsTotal / 25) > 1 ? (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => loadLeads(Math.max(1, leadsPage - 1))}
                disabled={leadsPage <= 1}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {leadsPage} of {Math.max(1, Math.ceil(leadsTotal / 25))}
              </span>
              <button
                type="button"
                onClick={() => loadLeads(leadsPage + 1)}
                disabled={leadsPage >= Math.ceil(leadsTotal / 25)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <button type="button" onClick={() => setStatusFilter('sent')} className="text-left">
              <StatCard icon={CheckCircle} title="Sent" value={stats.sent} color="green" />
            </button>
            <StatCard icon={Eye} title="Opened" value={stats.opened || 0} color="blue" />
            <StatCard icon={MousePointerClick} title="Clicked" value={stats.clicked || 0} color="teal" />
            <button type="button" onClick={() => setStatusFilter('failed')} className="text-left">
              <StatCard icon={AlertCircle} title="Failed" value={stats.failed} color="red" />
            </button>
            <button type="button" onClick={() => setStatusFilter('pending')} className="text-left">
              <StatCard icon={Clock} title="Pending" value={stats.pending} color="orange" />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Opens and clicks update when customers open the email or tap a link. Total open events: {stats.opens || 0}. Total click events: {stats.clicks || 0}.
            {' '}Click Sent / Failed / Pending cards to filter the table.
          </p>

          {Number(stats.failed) > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{stats.failed} email(s) failed to send</p>
                <button
                  type="button"
                  onClick={() => setStatusFilter('failed')}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200"
                >
                  Show failed only
                </button>
              </div>
              {recentFailures.length ? (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {recentFailures.map((row) => (
                    <li key={row._id || `${row.recipientEmail}-${row.sentAt}`}>
                      <span className="font-medium">{row.recipientEmail}</span>
                      {row.errorMessage ? ` — ${row.errorMessage}` : ' — Unknown error'}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 bg-teal-50 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Who clicked</h3>
                <p className="text-sm text-slate-500">Customer and the exact link they opened</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200">
                {stats.clicked || 0} people · {stats.clicks || 0} clicks
              </span>
            </div>
            {recentClicks.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Who</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Link</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentClicks.map((row, idx) => (
                      <tr key={row.id || `${row.recipientEmail}-${idx}`} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-900">{row.recipientEmail}</div>
                          {row.recipientName ? (
                            <div className="text-xs text-slate-500">{row.recipientName}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-teal-700 underline decoration-teal-200 hover:text-teal-900"
                            >
                              {row.url}
                            </a>
                          ) : (
                            <span className="text-slate-400">Unknown link</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">
                          {row.at ? new Date(row.at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No link clicks yet. When someone taps a link in a sent email, they appear here with the URL.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Email history</h3>
              <p className="mt-1 text-sm text-slate-500">
                See who received each email, who opened it, and who clicked a link.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2"
              >
                <option value="all">All status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
              <button
                type="button"
                onClick={() => loadHistory(page)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-300 bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Recipient</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Subject</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Opened</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Clicked</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Error</th>
                </tr>
              </thead>
              <tbody>
                {history.map((email, idx) => (
                  <tr key={email._id || idx} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{email.recipientEmail}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{email.subject}</td>
                    <td className="px-4 py-3"><StatusBadge status={email.status} /></td>
                    <td className="px-4 py-3 text-gray-700">
                      {Number(email.openCount) > 0 ? (
                        <div>
                          <div className="font-medium text-emerald-700">Yes · {email.openCount}</div>
                          <div className="text-xs text-slate-500">
                            {email.lastOpenedAt
                              ? new Date(email.lastOpenedAt).toLocaleString()
                              : (email.firstOpenedAt ? new Date(email.firstOpenedAt).toLocaleString() : '')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {Number(email.clickCount) > 0 ? (
                        <div>
                          <div className="font-medium text-teal-700">Yes · {email.clickCount}</div>
                          <div className="text-xs text-slate-500 max-w-[220px] truncate" title={email.lastClickedUrl || ''}>
                            {email.lastClickedAt
                              ? new Date(email.lastClickedAt).toLocaleString()
                              : ''}
                            {email.lastClickedUrl ? ` · ${email.lastClickedUrl}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(email.sentAt || email.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{email.errorMessage || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {history.length === 0 && (
            <div className="py-8 text-center text-gray-500">No promotional email history found</div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => loadHistory(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => loadHistory(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>

      {previewModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeTemplatePreview}>
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">{previewModal.name || 'Template preview'}</div>
                {previewModal.subject ? (
                  <div className="mt-0.5 text-xs text-gray-500">Subject: {previewModal.subject}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeTemplatePreview}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
              <iframe
                title="Template preview"
                className="mx-auto h-[70vh] w-full max-w-[640px] rounded-lg border border-slate-200 bg-white shadow-sm"
                srcDoc={toEmailPreviewSrcDoc(templatePreviewHtml, { padding: '16px' })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
              <button
                type="button"
                onClick={closeTemplatePreview}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
              >
                Close
              </button>
              {previewModal.type === 'preset' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      openPresetInBuilder(previewModal.id);
                      closeTemplatePreview();
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium"
                  >
                    Customize
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(previewModal.id);
                      setBuilderSubject(previewModal.subject || '');
                      setBuilderName(previewModal.name || '');
                      const blocks = getPresetBlocks(previewModal.id);
                      if (blocks) setBuilderBlocks(blocks);
                      setTemplateSource('gallery');
                      setTab('send');
                      closeTemplatePreview();
                    }}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Use this template
                  </button>
                </>
              ) : null}
              {previewModal.type === 'saved' ? (
                <button
                  type="button"
                  onClick={() => {
                    openCustomInBuilder(previewModal.id);
                    closeTemplatePreview();
                  }}
                  className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Edit template
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StatCard({ icon: IconComponent, title, value, color }) {
  const colorClasses = {
    green: 'border-green-200 bg-green-50 text-green-600',
    red: 'border-red-200 bg-red-50 text-red-600',
    orange: 'border-orange-200 bg-orange-50 text-orange-600',
    teal: 'border-teal-200 bg-teal-50 text-teal-600',
    blue: 'border-blue-200 bg-blue-50 text-blue-600',
    gray: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  return (
    <div className={`space-y-2 rounded-lg border p-4 ${colorClasses[color] || colorClasses.gray}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        {IconComponent && <IconComponent className="h-5 w-5" />}
      </div>
      <div className="text-3xl font-bold">{value ?? 0}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    sent: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}
