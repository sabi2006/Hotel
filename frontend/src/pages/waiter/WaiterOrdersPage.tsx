import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { ReceiptIcon } from "@/components/Icons";
import { Input, Select } from "@/components/Input";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { Spinner } from "@/components/Spinner";
import { useRealtime } from "@/hooks/useRealtime";
import { getErrorMessage } from "@/services/api";
import { ordersService } from "@/services/orders";
import { ORDER_STATUS_LABELS } from "@/types";
import type { Order, OrderStatus } from "@/types";
import { formatCurrency, formatDateTime } from "@/utils/format";

export default function WaiterOrdersPage() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const page = await ordersService.list({
        orderStatus: statusFilter || undefined,
        pageSize: 100,
      });
      setOrders(page.items);
      setError(null);
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not load orders"));
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  useRealtime(() => void load());

  const query = search.trim().toLowerCase();
  const visible = query
    ? orders.filter(
        (order) =>
          order.invoiceNumber.toLowerCase().includes(query) ||
          order.tableNumber.toLowerCase().includes(query) ||
          String(order.orderNumber).includes(query) ||
          (order.customer.name ?? "").toLowerCase().includes(query),
      )
    : orders;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1F2220] font-sans">
          All Orders Directory
        </h1>
        <p className="mt-0.5 text-xs font-medium text-[#6F716D]">
          Real-time order logs, table allocations, and billing status.
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Filter controls */}
      <div className="card p-4 flex flex-wrap gap-4 items-end shadow-2xs bg-white border border-[#EBE7DF]">
        <div className="min-w-64 flex-1">
          <Input
            label="Search Orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice #, table, customer name..."
          />
        </div>
        <div className="min-w-48">
          <Select
            label="Status Filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | OrderStatus)}
          >
            <option value="">All Statuses</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Loading orders" />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No orders found"
          description="Orders you take will appear here as soon as they are opened."
          icon={<ReceiptIcon size={28} />}
        />
      ) : (
        <div className="card overflow-hidden shadow-xs bg-white border border-[#EBE7DF]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#F0EBE1] text-xs sm:text-sm select-none">
              <thead className="bg-[#FAF8F5] text-left text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">
                <tr>
                  <th className="px-5 py-3.5">Invoice &amp; Customer</th>
                  <th className="px-5 py-3.5">Table</th>
                  <th className="px-5 py-3.5">Items</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Grand Total</th>
                  <th className="px-5 py-3.5">Created Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EBE1] bg-white">
                {visible.map((order) => (
                  <tr
                    key={order._id}
                    onClick={() => navigate(`/waiter/order/${order._id}`)}
                    className="cursor-pointer hover:bg-[#FAF8F5] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-[#1F2220]">{order.invoiceNumber}</div>
                      {order.customer.name && (
                        <div className="text-xs text-[#6F716D] font-medium">{order.customer.name}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#424541]">Table {order.tableNumber}</td>
                    <td className="px-5 py-3.5 text-[#5F615D] font-medium">{order.items.length} items</td>
                    <td className="px-5 py-3.5">
                      <OrderStatusBadge status={order.orderStatus} />
                    </td>
                    <td className="px-5 py-3.5 text-right font-extrabold text-[#1F2220] tabular-nums">
                      {formatCurrency(order.grandTotal)}
                    </td>
                    <td className="px-5 py-3.5 text-[#8E908C] font-medium">{formatDateTime(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
