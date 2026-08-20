/**
 * @file src/routes/api/[...path]/handlers/commerce.ts
 * @description Guest-capable commerce API. Not `/api/plugins/*` — guests must
 * not need `plugins:execute`. CSRF is enforced by the dispatcher for mutations.
 *
 * Every collection query is tenant-scoped via CommerceStore.
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/content/types";
import type { LocalCMS } from "@src/services/sdk";
import { AppError, isAppError, raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { pluginRegistry } from "@src/plugins/registry";
import { requireCommerceTenantId } from "@src/plugins/commerce/tenant";
import { createCommerceStore } from "@src/plugins/commerce/store";
import {
  addCartItem,
  getOrCreateCart,
  mergeCartOnLogin,
  setCartCoupon,
  updateCartItem,
  type CartView,
} from "@src/plugins/commerce/cart-service";
import { ensureCartSessionId } from "@src/plugins/commerce/cart-session";
import { breakdownToMajors, cartIsDigitalOnly, quoteCart } from "@src/plugins/commerce/quotes";
import {
  cancelOrder,
  canCancelOrder,
  OFFLINE_METHODS,
  placeOrder,
  refundOrder,
  transitionOrder,
  type PaymentMethod,
} from "@src/plugins/commerce/order-service";
import { checkoutPanes, isCommercePro, requireCommercePro } from "@src/plugins/commerce/pro";
import {
  formatOrderItems,
  sendLowStock,
  sendOrderReceived,
  sendOrderRefunded,
  sendOrderShipped,
} from "@src/plugins/commerce/mail";
import { deleteAddress, listAddresses, saveAddress } from "@src/plugins/commerce/addresses";
import {
  paidStatuses,
  signDownloadToken,
  verifyDownloadToken,
} from "@src/plugins/commerce/downloads.server";
import { expandVariantMatrix } from "@src/plugins/commerce/variants";
import { orderAnalytics } from "@src/plugins/commerce/analytics";
import { ensureCsrfToken } from "@utils/security/csrf-utils";
import { isSecureCookieContext } from "@src/databases/auth/constants";
import { successResponse, createdResponse } from "./base";

async function assertPluginEnabled(tenantId: string): Promise<void> {
  const state = await pluginRegistry.getPluginState("commerce", tenantId);
  const enabled = state ? state.enabled : pluginRegistry.get("commerce")?.metadata?.enabled;
  if (!enabled) {
    raise(403, "Commerce plugin is not enabled.", "COMMERCE_DISABLED");
  }
}

async function currencyFor(tenantId: string): Promise<string> {
  const state = await pluginRegistry.getPluginState("commerce", tenantId);
  const fromSettings = (state?.settings as { currency?: string } | undefined)?.currency;
  return (fromSettings || "EUR").toUpperCase();
}

async function readJson(event: RequestEvent): Promise<Record<string, unknown>> {
  try {
    const body = await event.request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleCommerceRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  try {
    const scoped = requireCommerceTenantId(tenantId);
    await assertPluginEnabled(String(scoped));
    const store = createCommerceStore(cms, scoped);
    if (!(await store.hasCollection("carts")) || !(await store.hasCollection("products"))) {
      raise(503, "Ecommerce preset collections are missing.", "COMMERCE_PRESET_MISSING");
    }

    const action = (segments[1] || "").toLowerCase();
    const user = event.locals.user as {
      _id?: string;
      isAnonymous?: boolean;
      email?: string;
    } | null;
    const customerId = user && !user.isAnonymous && user._id ? String(user._id) : null;
    const currency = await currencyFor(String(scoped));
    const sessionId = ensureCartSessionId(event.cookies, event.url);
    const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
    ensureCsrfToken(event.cookies, isSecure);

    if (customerId && action === "cart" && event.request.method === "GET") {
      const merged = await mergeCartOnLogin(store, { sessionId, customerId, currency });
      return successResponse(event, merged);
    }

    switch (action) {
      case "cart": {
        if (event.request.method === "GET") {
          const cart = await getOrCreateCart(store, { sessionId, customerId, currency });
          return successResponse(event, cart);
        }
        const body = await readJson(event);
        if (event.request.method === "POST") {
          const cart = await addCartItem(store, {
            sessionId,
            customerId,
            currency,
            productId: String(body.productId || ""),
            variantSku: body.variantSku ? String(body.variantSku) : undefined,
            qty: Number(body.qty ?? 1),
            allowBundles: await isCommercePro(),
          });
          return successResponse(event, cart);
        }
        if (event.request.method === "PATCH" || event.request.method === "DELETE") {
          const cart = await updateCartItem(store, {
            sessionId,
            customerId,
            currency,
            productId: String(body.productId || ""),
            variantSku: body.variantSku ? String(body.variantSku) : undefined,
            qty: event.request.method === "DELETE" ? 0 : Number(body.qty ?? 0),
          });
          return successResponse(event, cart);
        }
        raise(405, "Method not allowed.", "METHOD_NOT_ALLOWED");
      }

      case "quote": {
        const body = await readJson(event);
        const cart = await getOrCreateCart(store, { sessionId, customerId, currency });
        const digitalOnly = cartIsDigitalOnly(cart);
        const breakdown = await quoteCart(
          store,
          cart,
          {
            country: body.country ? String(body.country) : undefined,
            state: body.state ? String(body.state) : undefined,
            giftCardCode: body.giftCardCode ? String(body.giftCardCode) : undefined,
          },
          { allowGiftCards: await isCommercePro() },
        );
        return successResponse(event, {
          cart,
          totals: breakdownToMajors(breakdown),
          skipShipping: digitalOnly,
        });
      }

      case "coupon": {
        const body = await readJson(event);
        const code = body.code == null || body.code === "" ? null : String(body.code);
        if (code) {
          const withCode = await setCartCoupon(store, {
            sessionId,
            customerId,
            currency,
            code,
          });
          await quoteCart(store, withCode, {}, { allowGiftCards: false });
          return successResponse(event, withCode);
        }
        const cleared = await setCartCoupon(store, {
          sessionId,
          customerId,
          currency,
          code: null,
        });
        return successResponse(event, cleared);
      }

      case "checkout": {
        const body = await readJson(event);
        const cart = await getOrCreateCart(store, { sessionId, customerId, currency });
        const method = String(body.paymentMethod || "stripe") as PaymentMethod;
        if (method !== "stripe" && !(OFFLINE_METHODS as readonly string[]).includes(method)) {
          raise(400, "Unknown payment method.", "PAYMENT_METHOD");
        }
        const breakdown = await quoteCart(
          store,
          cart,
          {
            country: body.country ? String(body.country) : undefined,
            state: body.state ? String(body.state) : undefined,
            giftCardCode: body.giftCardCode ? String(body.giftCardCode) : undefined,
          },
          { allowGiftCards: await isCommercePro() },
        );
        const order = await placeOrder(store, cart, breakdown, {
          email: String(body.email || user?.["email"] || ""),
          country: body.country ? String(body.country) : undefined,
          state: body.state ? String(body.state) : undefined,
          shippingAddress: body.shippingAddress ? String(body.shippingAddress) : undefined,
          billingAddress: body.billingAddress ? String(body.billingAddress) : undefined,
          notes: body.notes ? String(body.notes) : undefined,
          paymentMethod: method,
        });
        const mailPayload = {
          orderNumber: String(order.orderNumber),
          email: String(order.customerEmail),
          total: `${breakdownToMajors(breakdown).grandTotal} ${currency}`,
          status: String(order.status),
          items: formatOrderItems((order.items as CartView["items"]) || cart.items),
          hostLink: "/account/orders",
        };
        await sendOrderReceived(String(scoped), mailPayload);
        for (const alert of (order.lowStock as Array<{
          sku: string;
          title: string;
          qty: number;
          threshold: number;
        }>) || []) {
          await sendLowStock(String(scoped), alert);
        }
        const state = await pluginRegistry.getPluginState("commerce", String(scoped));
        const bank = (state?.settings as { bankTransferInstructions?: string } | undefined)
          ?.bankTransferInstructions;
        return createdResponse(event, {
          order,
          totals: breakdownToMajors(breakdown),
          skipShipping: cartIsDigitalOnly(cart),
          instructions:
            method === "bank_transfer" ? bank : method === "cod" ? "Pay on delivery." : undefined,
        });
      }

      case "pay": {
        const body = await readJson(event);
        if (body.amount != null) {
          logger.warn("[Commerce] Ignoring client-supplied payment amount (F1).");
        }
        const orderId = String(body.orderId || "");
        if (!orderId)
          raise(
            400,
            "orderId is required. Payment amount is taken from the order.",
            "ORDER_REQUIRED",
          );
        const order = await store.findOne("orders", { _id: orderId });
        if (!order) raise(404, "Order not found.", "ORDER_NOT_FOUND");
        const amount = Number(order.totalCents);
        if (!Number.isInteger(amount) || amount < 0) {
          raise(400, "Order total is not payable.", "INVALID_TOTAL");
        }
        const { stripePaymentGateway } = await import("@src/plugins/stripe/server/payment-gateway");
        const intent = await stripePaymentGateway.createIntent({
          amount,
          currency: String(order.currency || currency),
          orderId,
          tenantId: String(scoped),
          receiptEmail: String(order.customerEmail || ""),
        });
        await store.update("orders", orderId, { stripePaymentIntentId: intent.id });
        return successResponse(event, {
          clientSecret: intent.clientSecret,
          intentId: intent.id,
          amount: intent.amount,
          currency: intent.currency,
        });
      }

      case "confirm": {
        const body = await readJson(event);
        const intentId = String(body.intentId || "");
        const orderId = String(body.orderId || "");
        if (!intentId || !orderId)
          raise(400, "intentId and orderId are required.", "CONFIRM_REQUIRED");
        const order = await store.findOne("orders", { _id: orderId });
        if (!order) raise(404, "Order not found.", "ORDER_NOT_FOUND");
        const { stripePaymentGateway } = await import("@src/plugins/stripe/server/payment-gateway");
        const intent = await stripePaymentGateway.retrieveIntent(intentId, String(scoped));
        if (intent.amount !== Number(order.totalCents)) {
          raise(409, "Paid amount does not match order grandTotal.", "AMOUNT_MISMATCH");
        }
        if (intent.status !== "succeeded") {
          raise(409, `Payment not completed (${intent.status}).`, "PAYMENT_INCOMPLETE");
        }
        const updated = await transitionOrder(store, orderId, "processing");
        return successResponse(event, updated);
      }

      case "panes": {
        const state = await pluginRegistry.getPluginState("commerce", String(scoped));
        const custom = (state?.settings as { checkoutPanes?: string[] } | undefined)?.checkoutPanes;
        const panes = await checkoutPanes(custom);
        return successResponse(event, { panes });
      }

      case "subscribe": {
        await requireCommercePro("Subscriptions");
        raise(
          501,
          "Subscriptions are licensed; Stripe Billing wiring is available via Commerce Pro.",
          "NOT_IMPLEMENTED",
        );
      }

      case "orders": {
        const orderId = segments[2];
        const sub = (segments[3] || "").toLowerCase();
        if (!user || user.isAnonymous) {
          raise(401, "Authentication required to read orders.", "UNAUTHORIZED");
        }
        const isAdmin = Boolean((user as { isAdmin?: boolean }).isAdmin);
        const owns = (order: Record<string, unknown>) =>
          isAdmin ||
          String(order.customer || "") === String(user._id) ||
          String(order.customerEmail || "") === String((user as { email?: string }).email || "");

        if (orderId && sub === "refund" && event.request.method !== "GET") {
          if (!isAdmin) raise(403, "Only store staff can refund.", "FORBIDDEN");
          const refunded = await refundOrder(store, orderId);
          await sendOrderRefunded({
            orderNumber: String(refunded.orderNumber),
            email: String(refunded.customerEmail),
            total: String(refunded.total ?? ""),
            status: "refunded",
            items: formatOrderItems((refunded.items as CartView["items"]) || []),
          });
          return successResponse(event, refunded);
        }
        if (orderId && sub === "cancel" && event.request.method !== "GET") {
          const order = await store.findOne("orders", { _id: orderId });
          if (!order || !owns(order)) raise(404, "Order not found.", "ORDER_NOT_FOUND");
          const cancelled = await cancelOrder(store, orderId);
          return successResponse(event, cancelled);
        }
        if (orderId && sub === "reorder" && event.request.method !== "GET") {
          const order = await store.findOne("orders", { _id: orderId });
          if (!order || !owns(order)) raise(404, "Order not found.", "ORDER_NOT_FOUND");
          const items = Array.isArray(order.items) ? (order.items as CartView["items"]) : [];
          let cart = await getOrCreateCart(store, { sessionId, customerId, currency });
          for (const line of items) {
            cart = await addCartItem(store, {
              sessionId,
              customerId,
              currency,
              productId: line.productId,
              variantSku: line.variantSku,
              qty: line.qty,
            });
          }
          return successResponse(event, cart);
        }
        if (orderId && sub === "ship" && event.request.method !== "GET") {
          if (!isAdmin) raise(403, "Only store staff can mark shipped.", "FORBIDDEN");
          const body = await readJson(event);
          const shipped = await transitionOrder(store, orderId, "shipped");
          if (body.trackingUrl) {
            await store.update("orders", orderId, { trackingUrl: String(body.trackingUrl) });
          }
          await sendOrderShipped({
            orderNumber: String(shipped.orderNumber),
            email: String(shipped.customerEmail),
            total: String(shipped.total ?? ""),
            status: "shipped",
            items: formatOrderItems((shipped.items as CartView["items"]) || []),
            trackingUrl: String(body.trackingUrl || shipped.trackingUrl || ""),
          });
          return successResponse(event, shipped);
        }
        if (orderId && sub === "downloads") {
          const order = await store.findOne("orders", { _id: orderId });
          if (!order || !owns(order)) raise(404, "Order not found.", "ORDER_NOT_FOUND");
          if (!paidStatuses().has(String(order.status))) {
            raise(403, "Downloads are available after payment.", "NOT_PAID");
          }
          const items = Array.isArray(order.items) ? (order.items as CartView["items"]) : [];
          const files = [];
          for (const line of items) {
            if (!line.downloadable) continue;
            const product = await store.findOne("products", { _id: line.productId });
            const file = product?.downloadFile;
            files.push({
              productId: line.productId,
              title: line.title,
              token: signDownloadToken({
                tenantId: String(scoped),
                orderId,
                productId: line.productId,
              }),
              file: file ?? null,
            });
          }
          return successResponse(event, files);
        }
        if (orderId) {
          const order = await store.findOne("orders", { _id: orderId });
          if (!order || !owns(order)) raise(404, "Order not found.", "ORDER_NOT_FOUND");
          return successResponse(event, { ...order, canCancel: canCancelOrder(order) });
        }
        const list = await store.findMany(
          "orders",
          customerId && !isAdmin ? { customer: customerId } : {},
          { limit: 50 },
        );
        return successResponse(event, list);
      }

      case "addresses": {
        if (!customerId) raise(401, "Sign in to manage addresses.", "UNAUTHORIZED");
        const id = segments[2];
        if (event.request.method === "GET") {
          return successResponse(event, await listAddresses(store, customerId));
        }
        if (event.request.method === "DELETE" && id) {
          await deleteAddress(store, customerId, id);
          return successResponse(event, { deleted: true });
        }
        const body = await readJson(event);
        const saved = await saveAddress(store, customerId, body as never, id);
        return successResponse(event, saved);
      }

      case "downloads": {
        const token = event.url.searchParams.get("token") || "";
        const claims = verifyDownloadToken(token);
        if (claims.tenantId !== String(scoped))
          raise(403, "Download tenant mismatch.", "TENANT_MISMATCH");
        const order = await store.findOne("orders", { _id: claims.orderId });
        if (!order || !paidStatuses().has(String(order.status))) {
          raise(404, "Download not available.", "NOT_FOUND");
        }
        const product = await store.findOne("products", { _id: claims.productId });
        if (!product?.downloadable) raise(404, "File not found.", "NOT_FOUND");
        return successResponse(event, { file: product.downloadFile, productId: claims.productId });
      }

      case "variants": {
        if (!user || user.isAnonymous) raise(401, "Authentication required.", "UNAUTHORIZED");
        const body = await readJson(event);
        const attributes = Array.isArray(body.attributes) ? body.attributes : [];
        const generated = expandVariantMatrix(attributes as never, {
          skuPrefix: body.skuPrefix ? String(body.skuPrefix) : undefined,
          price: Number(body.price ?? 0),
        });
        const productId = body.productId ? String(body.productId) : "";
        if (productId && event.request.method === "POST" && segments[2] === "apply") {
          const product = await store.findOne("products", { _id: productId });
          if (!product) raise(404, "Product not found.", "PRODUCT_NOT_FOUND");
          await store.update("products", productId, { variants: generated });
        }
        return successResponse(event, { variants: generated, count: generated.length });
      }

      case "analytics": {
        if (!user || !(user as { isAdmin?: boolean }).isAdmin) {
          raise(403, "Store analytics require an admin.", "FORBIDDEN");
        }
        await requireCommercePro("Store analytics");
        return successResponse(event, await orderAnalytics(store));
      }

      default:
        raise(404, `Unknown commerce action '${action}'.`, "NOT_FOUND");
    }
  } catch (err: unknown) {
    rethrow(err);
    if (!isAppError(err)) {
      logger.error("[Commerce] route failed", err);
    }
    if (isAppError(err)) throw err;
    throw new AppError((err as Error).message || "Commerce operation failed", 500);
  }
}
