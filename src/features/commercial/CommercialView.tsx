import React, { useMemo, useState } from 'react';
import { History, Plus, Search, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHarvestFlow } from '../../context/HarvestFlowContext';
import { PRODUCT_SUGGESTIONS } from '../../data/seed';
import type { Order, OrderPriority } from '../../types/domain';
import { formatDateTime, formatKg } from '../../utils/format';
import { OrderStatusBadge, PriorityBadge, ProgressBar } from '../../components/ui/Badges';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { OrderHistoryModal } from '../../components/shared/OrderHistoryModal';

export function CommercialView() {
  const { t } = useTranslation();
  const { state, language, createOrder, getFarmName } = useHarvestFlow();

  const [tab, setTab] = useState<'list' | 'create'>('list');
  const [filter, setFilter] = useState<'all' | 'urgent'>('all');
  const [search, setSearch] = useState('');
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);

  // Create form state
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [priority, setPriority] = useState<OrderPriority>('normal');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...state.orders]
      .filter((o) => (filter === 'urgent' ? o.priority === 'urgent' : true))
      .filter((o) =>
        q ? o.reference.toLowerCase().includes(q) || o.product.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [state.orders, filter, search]);

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const qtyNum = Number(quantity);
    if (!product.trim()) {
      setFormError(t('commercial.validationProduct'));
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setFormError(t('commercial.validationQuantity'));
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmCreate = () => {
    createOrder({
      product: product.trim(),
      quantityKg: Math.round(Number(quantity)),
      priority,
      notes: notes.trim() || undefined,
    });
    setProduct('');
    setQuantity('');
    setPriority('normal');
    setNotes('');
    setConfirmOpen(false);
    setTab('list');
  };

  const getOrderOverallPct = (order: Order): number => {
    if (order.allocations.length === 0) return 0;
    const weighted = order.allocations.reduce(
      (acc, a) => acc + a.allocatedQtyKg * a.currentProgressPct,
      0,
    );
    const total = order.allocations.reduce((acc, a) => acc + a.allocatedQtyKg, 0);
    return total > 0 ? Math.round(weighted / total) : 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a241e]">
            {t('commercial.title')}
          </h1>
          <p className="mt-1 text-sm text-[#5a6b60]">{t('commercial.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => setTab(tab === 'create' ? 'list' : 'create')}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1b5e20] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144718]"
        >
          {tab === 'create' ? (
            t('common.back')
          ) : (
            <>
              <Plus className="h-5 w-5" />
              {t('commercial.createButton')}
            </>
          )}
        </button>
      </div>

      {tab === 'create' ? (
        <form
          onSubmit={handleRequestSubmit}
          className="mx-auto max-w-xl rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-xs sm:p-7"
        >
          <h2 className="text-lg font-semibold text-[#1a241e]">{t('commercial.formTitle')}</h2>

          <div className="mt-5 space-y-5">
            {/* Product */}
            <div>
              <label
                htmlFor="order-product"
                className="block text-sm font-medium text-[#1a241e]"
              >
                {t('commercial.productLabel')} <span className="text-red-600">*</span>
              </label>
              <input
                id="order-product"
                type="text"
                required
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder={t('commercial.productPlaceholder')}
                className="hf-input mt-1.5 w-full rounded-xl border border-emerald-900/15 bg-white px-4 py-3 text-base text-[#1a241e] outline-none transition focus:border-[#1b5e20] focus:ring-2 focus:ring-emerald-700/15"
              />
              <div className="mt-2.5">
                <span className="text-xs font-medium text-[#5a6b60]">
                  {t('commercial.productQuickPick')}:
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PRODUCT_SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setProduct(item)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        product === item
                          ? 'bg-[#1b5e20] text-white'
                          : 'bg-[#f6f9f6] text-[#435349] hover:bg-emerald-50'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label
                htmlFor="order-quantity"
                className="block text-sm font-medium text-[#1a241e]"
              >
                {t('commercial.quantityLabel')} <span className="text-red-600">*</span>
              </label>
              <input
                id="order-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={t('commercial.quantityPlaceholder')}
                className="hf-input mt-1.5 w-full rounded-xl border border-emerald-900/15 bg-white px-4 py-3 text-base text-[#1a241e] outline-none transition focus:border-[#1b5e20] focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>

            {/* Priority */}
            <div>
              <span className="block text-sm font-medium text-[#1a241e]">
                {t('commercial.priorityLabel')}
              </span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPriority('normal')}
                  className={`min-h-12 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    priority === 'normal'
                      ? 'border-[#1b5e20] bg-emerald-50 text-[#1b5e20] ring-2 ring-emerald-700/20'
                      : 'border-emerald-900/15 bg-white text-[#435349] hover:bg-[#f6f9f6]'
                  }`}
                >
                  {t('common.normal')}
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('urgent')}
                  className={`min-h-12 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    priority === 'urgent'
                      ? 'border-red-600 bg-red-50 text-red-700 ring-2 ring-red-600/20'
                      : 'border-emerald-900/15 bg-white text-[#435349] hover:bg-[#f6f9f6]'
                  }`}
                >
                  {t('common.urgent')}
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="order-notes" className="block text-sm font-medium text-[#1a241e]">
                {t('commercial.notesLabel')}
              </label>
              <textarea
                id="order-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('commercial.notesPlaceholder')}
                className="mt-1.5 w-full rounded-xl border border-emerald-900/15 bg-white px-4 py-3 text-sm text-[#1a241e] outline-none transition focus:border-[#1b5e20] focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>

            {formError && (
              <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                {formError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setTab('list')}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-900/15 bg-white px-5 text-sm font-medium text-[#1a241e] hover:bg-emerald-50/50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1b5e20] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#144718]"
              >
                {t('commercial.submitButton')}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Search & filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6b60]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.searchPlaceholder')}
                className="w-full rounded-xl border border-emerald-900/12 bg-white py-2.5 pl-10 pr-4 text-sm text-[#1a241e] outline-none focus:border-[#1b5e20]"
              />
            </div>
            <div className="inline-flex rounded-xl border border-emerald-900/12 bg-white p-1">
              {(['all', 'urgent'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    filter === key
                      ? 'bg-[#1b5e20] text-white'
                      : 'text-[#5a6b60] hover:text-[#1a241e]'
                  }`}
                >
                  {key === 'all' ? t('common.filterAll') : t('common.filterUrgent')}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-emerald-900/8 bg-white p-10 text-center text-sm text-[#5a6b60]">
              {t('commercial.emptyOrders')}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredOrders.map((order) => {
                const overallPct = getOrderOverallPct(order);
                return (
                  <article
                    key={order.id}
                    className={`rounded-2xl border bg-white p-5 shadow-2xs transition ${
                      order.priority === 'urgent' && order.status !== 'completed'
                        ? 'border-red-200 ring-1 ring-red-500/10'
                        : 'border-emerald-900/10'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold tracking-wide text-[#1b5e20]">
                            {order.reference}
                          </span>
                          <PriorityBadge priority={order.priority} />
                          <OrderStatusBadge status={order.status} />
                        </div>
                        <h3 className="mt-2 text-lg font-semibold text-[#1a241e]">
                          {order.product}{' '}
                          <span className="font-normal text-[#5a6b60]">
                            — {formatKg(order.quantityKg, language)}
                          </span>
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => setHistoryOrder(order)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-900/12 px-3.5 text-xs font-semibold text-[#435349] transition hover:bg-emerald-50 hover:text-[#1b5e20]"
                      >
                        <History className="h-4 w-4" />
                        {t('common.viewHistory')}
                      </button>
                    </div>

                    {order.notes && (
                      <p className="mt-2.5 text-sm text-[#5a6b60]">{order.notes}</p>
                    )}

                    <div className="mt-4 border-t border-emerald-900/8 pt-3.5">
                      {order.allocations.length === 0 ? (
                        <p className="flex items-center gap-2 text-xs font-medium text-amber-800">
                          <Sprout className="h-4 w-4" />
                          {t('commercial.awaitingJuan')}
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between text-xs text-[#5a6b60]">
                            <span className="font-medium text-[#1a241e]">
                              {t('commercial.farmsAssignedCount', {
                                count: order.allocations.length,
                              })}
                            </span>
                            <span className="font-semibold text-[#1b5e20]">{overallPct}%</span>
                          </div>
                          <ProgressBar value={overallPct} />
                          <div className="flex flex-wrap gap-2 pt-1">
                            {order.allocations.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f6f9f6] px-2.5 py-1 text-xs text-[#435349]"
                              >
                                <span className="font-medium text-[#1a241e]">
                                  {getFarmName(a.farmId, a.farmNameSnapshot)}
                                </span>
                                <span>{formatKg(a.allocatedQtyKg, language)}</span>
                                <span className="font-semibold text-[#1b5e20]">
                                  · {a.currentProgressPct}%
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5a6b60]">
                      <span>{formatDateTime(order.createdAt, language)}</span>
                      {order.completedAt && (
                        <span className="font-medium text-emerald-800">
                          {t('status.order.completed')} · {formatDateTime(order.completedAt, language)}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={t('commercial.confirmTitle')}
        body={t('commercial.confirmBody', {
          qty: Number(quantity) || 0,
          product: product.trim(),
          priority: priority === 'urgent' ? t('common.urgent') : t('common.normal'),
        })}
        onConfirm={handleConfirmCreate}
        onCancel={() => setConfirmOpen(false)}
      />

      <OrderHistoryModal order={historyOrder} onClose={() => setHistoryOrder(null)} />
    </div>
  );
}
