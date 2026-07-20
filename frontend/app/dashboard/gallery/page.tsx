'use client';

import { useEffect, useState } from 'react';
import { galleryApi } from '@/services/api';
import { Images, RefreshCw, X, Download, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { getRelativeTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

const MEDIA_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
const resolveUrl = (u?: string | null) => (!u ? '' : u.startsWith('/') ? `${MEDIA_BASE}${u}` : u);

export default function GalleryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const { showToast } = useToast();
  const PAGE_SIZE = 102; // 6-col grid × 17 rows — fills cleanly, no blank tail row
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await galleryApi.get('image', p, PAGE_SIZE);
      setItems(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      showToast('Failed to load gallery', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, []);

  const go = (p: number) => {
    setPage(p);
    load(p);
    // The scroller is the inner overflow container, not window — reset it to the top.
    document.getElementById('gallery-scroll')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightbox === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(i => (i === null ? null : Math.min(items.length - 1, i + 1)));
      if (e.key === 'ArrowLeft') setLightbox(i => (i === null ? null : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox, items.length]);

  const active = lightbox !== null ? items[lightbox] : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Images className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gallery</h1>
            <p className="text-xs text-gray-400 mt-0.5">{total} image{total === 1 ? '' : 's'} shared in conversations</p>
          </div>
        </div>
        <button onClick={() => load(page)} className="p-2 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Grid */}
      <div id="gallery-scroll" className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Images className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-700">No images yet</p>
            <p className="text-xs text-gray-400">Images shared in conversations will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {items.map((m, idx) => (
              <button
                key={m.id}
                onClick={() => setLightbox(idx)}
                className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <img
                  src={resolveUrl(m.mediaUrl)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.25'; }}
                />
                <span className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  m.direction === 'inbound' ? 'bg-white/85 text-gray-700' : 'bg-indigo-600 text-white'
                }`}>
                  {m.direction === 'inbound' ? 'IN' : 'OUT'}
                </span>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[11px] font-semibold text-white truncate">{m.customerName ?? m.customerPhone}</p>
                  <p className="text-[10px] text-white/70">{m.createdAt ? getRelativeTime(m.createdAt) : ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={go}
        summary={total > 0 ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : undefined}
      />

      {/* Lightbox */}
      {active && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="h-6 w-6" />
          </button>
          {lightbox! > 0 && (
            <button className="absolute left-3 sm:left-6 text-white/70 hover:text-white" onClick={(e) => { e.stopPropagation(); setLightbox(lightbox! - 1); }}>
              <ChevronLeft className="h-9 w-9" />
            </button>
          )}
          {lightbox! < items.length - 1 && (
            <button className="absolute right-3 sm:right-6 text-white/70 hover:text-white" onClick={(e) => { e.stopPropagation(); setLightbox(lightbox! + 1); }}>
              <ChevronRight className="h-9 w-9" />
            </button>
          )}
          <div className="max-w-4xl max-h-[88vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={resolveUrl(active.mediaUrl)} alt="" className="max-h-[78vh] max-w-full rounded-lg object-contain" />
            <div className="flex items-center flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-white/90">
              <span className="font-semibold">{active.customerName ?? active.customerPhone}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/70">{active.createdAt ? getRelativeTime(active.createdAt) : ''}</span>
              <a href={`/dashboard/conversations?id=${active.conversationId}`} className="ml-1 inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200">
                <ExternalLink className="h-3.5 w-3.5" /> Open chat
              </a>
              <a href={resolveUrl(active.mediaUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200">
                <Download className="h-3.5 w-3.5" /> Full size
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
