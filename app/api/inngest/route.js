import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  autoShipWaslahOrder,
  deleteCouponOnExpiry,
  recoverWaslahAutoShipments,
  recoverWaslahPaymentProofs,
  reconcileFailedOnlinePayments,
  sendAbandonedCartWhatsAppReminders,
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
} from "@/inngest/functions";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncUserCreation,
    syncUserUpdation,
    syncUserDeletion,
    deleteCouponOnExpiry,
    autoShipWaslahOrder,
    recoverWaslahAutoShipments,
    recoverWaslahPaymentProofs,
    reconcileFailedOnlinePayments,
    sendAbandonedCartWhatsAppReminders,
  ],
});