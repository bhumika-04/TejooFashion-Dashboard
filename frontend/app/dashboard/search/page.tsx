'use client';

import { useState, useRef } from 'react';
import { searchApi } from '@/services/api';
import { Search, MessageSquare, UserRound, Users, Inbox, X } from 'lucide-react';
import { getRelativeTime } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type ResultType = 'conversation' | 'message' | 'customer' | 'user';

interface SearchResult {
  resultType: ResultType;
  id: number;
  title: string;
  subtitle?: string;
  meta?: string;
  date?: string;
  conversationId?: number;
}

interface SearchResults {
  conversations: SearchResult[];
  messages: SearchResult[];
  customers: SearchResult[];
  users: SearchResult[];
  total: number;
}

const typeIcon: Record<ResultType, React.ReactNode> = {
  conversation: <MessageSquare className="h-4 w-4 text-emerald-500" />,
  message: <Inbox className="h-4 w-4 text-green-500" />,
  customer: <UserRound className="h-4 w-4 text-orange-500" />,
  user: <Users className="h-4 w-4 text-blue-500" />,
};

const typeBg: Record<ResultType, string> = {
  conversation: 'bg-emerald-50',
  message: 'bg-green-50',
  customer: 'bg-orange-50',
  user: 'bg-blue-50',
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const router = useRouter();
  const timer = useRef<NodeJS.Timeout | null>(null);

  const doSearch = async (q: string) => {
    if (q.length < 2) { setResults(null); setSearched(false); return; }
    setLoading(true);
    try {
      const res = await searchApi.search(q, 20);
      setResults(res.data.results);
      setSearched(true);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (val: string) => {
    setQuery(val);
    if (timer.current) clearTimeout(timer.current);
    if (!val.trim()) { setResults(null); setSearched(false); return; }
    timer.current = setTimeout(() => doSearch(val.trim()), 400);
  };

  const clearSearch = () => { setQuery(''); setResults(null); setSearched(false); };

  const handleClick = (r: SearchResult) => {
    if (r.resultType === 'conversation') router.push('/dashboard/conversations');
    else if (r.resultType === 'message') router.push('/dashboard/conversations');
    else if (r.resultType === 'customer') router.push('/dashboard/customers');
    else if (r.resultType === 'user') router.push('/dashboard/users');
  };

  const Section = ({ title, items, type }: { title: string; items: SearchResult[]; type: ResultType }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2 px-1">
          {typeIcon[type]}
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
          <span className="text-xs text-gray-300 ml-auto">{items.length}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {items.map(r => (
            <button
              key={r.id}
              onClick={() => handleClick(r)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3"
            >
              <div className={`mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${typeBg[type]}`}>
                {typeIcon[type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                {r.subtitle && <p className="text-xs text-gray-500 truncate">{r.subtitle}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                {r.meta && <p className="text-xs text-gray-400">{r.meta}</p>}
                {r.date && <p className="text-[11px] text-gray-300 mt-0.5">{getRelativeTime(r.date)}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-beige">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Global Search</h1>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={e => handleInput(e.target.value)}
            placeholder="Search conversations, messages, customers, users…"
            className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          {query && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="text-center text-gray-400 text-sm py-12">Searching…</div>
        )}
        {!loading && searched && results && results.total === 0 && (
          <div className="text-center text-gray-400 text-sm py-12">
            No results found for <span className="font-medium text-gray-600">"{query}"</span>
          </div>
        )}
        {!loading && results && results.total > 0 && (
          <>
            <p className="text-xs text-gray-400 mb-4">
              {results.total} result{results.total !== 1 ? 's' : ''} for <span className="font-medium text-gray-600">"{query}"</span>
            </p>
            <Section title="Conversations" items={results.conversations} type="conversation" />
            <Section title="Messages" items={results.messages} type="message" />
            <Section title="Customers" items={results.customers} type="customer" />
            <Section title="Users" items={results.users} type="user" />
          </>
        )}
        {!loading && !searched && (
          <div className="text-center text-gray-400 text-sm py-16">
            <Search className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p>Start typing to search across all data</p>
            <p className="text-xs mt-1">Minimum 2 characters</p>
          </div>
        )}
      </div>
    </div>
  );
}
