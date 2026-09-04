import connectDB from '@/lib/mongodb';
import EmailMarketingCampaign from '@/models/EmailMarketingCampaign';
import { getDueCampaignSlots, campaignIsFullyCompleted } from '@/lib/emailMarketingSchedule';
import { sendEmailMarketingCampaign } from '@/lib/emailMarketingCampaignSend';

/**
 * Process active email marketing campaigns that are due right now.
 * Optional storeId limits the sweep to one seller (used by the dashboard Refresh).
 */
export async function runDueEmailMarketingCampaigns({
  now = new Date(),
  dryRun = false,
  storeId = null,
} = {}) {
  await connectDB();

  const query = { status: 'active' };
  if (storeId) query.storeId = storeId;

  const campaigns = await EmailMarketingCampaign.find(query).limit(100);

  const processed = [];
  let slotsRun = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const campaign of campaigns) {
    const due = getDueCampaignSlots(campaign, now);
    if (!due.length) continue;

    for (const slot of due) {
      if (dryRun) {
        processed.push({
          campaignId: String(campaign._id),
          name: campaign.name,
          slotKey: slot.slotKey,
          dryRun: true,
        });
        slotsRun += 1;
        continue;
      }

      const claimed = await EmailMarketingCampaign.findOneAndUpdate(
        {
          _id: campaign._id,
          status: 'active',
          sentSlots: { $ne: slot.slotKey },
        },
        { $addToSet: { sentSlots: slot.slotKey } },
        { new: true },
      );
      if (!claimed) continue;

      try {
        const result = await sendEmailMarketingCampaign(claimed, { slotKey: slot.slotKey });
        const sentCount = Number(result.emailsSent || 0);
        const failedCount = Number(result.emailsFailed || 0);
        const sendBlocked = Boolean(result.blocked || result.error);

        if (sendBlocked && sentCount === 0) {
          await EmailMarketingCampaign.updateOne(
            { _id: campaign._id },
            { $pull: { sentSlots: slot.slotKey } },
          );
          processed.push({
            campaignId: String(campaign._id),
            name: campaign.name,
            slotKey: slot.slotKey,
            error: result.error || 'Send blocked',
          });
          continue;
        }

        claimed.totalSent = Number(claimed.totalSent || 0) + sentCount;
        claimed.totalFailed = Number(claimed.totalFailed || 0) + failedCount;
        claimed.lastRunAt = new Date();
        claimed.runLog = [
          ...(claimed.runLog || []).slice(-40),
          {
            at: new Date(),
            slotKey: slot.slotKey,
            emailsSent: sentCount,
            emailsFailed: failedCount,
          },
        ];

        if (campaignIsFullyCompleted(claimed)) {
          claimed.status = 'completed';
          claimed.stoppedAt = new Date();
        }

        await claimed.save();
        slotsRun += 1;
        emailsSent += sentCount;
        emailsFailed += failedCount;
        processed.push({
          campaignId: String(campaign._id),
          name: campaign.name,
          slotKey: slot.slotKey,
          emailsSent: sentCount,
          emailsFailed: failedCount,
        });
      } catch (error) {
        await EmailMarketingCampaign.updateOne(
          { _id: campaign._id },
          {
            $pull: { sentSlots: slot.slotKey },
            $push: {
              runLog: {
                $each: [{
                  at: new Date(),
                  slotKey: slot.slotKey,
                  emailsSent: 0,
                  emailsFailed: 0,
                  error: error?.message || 'Send failed',
                }],
                $slice: -40,
              },
            },
          },
        ).catch(() => {});
        processed.push({
          campaignId: String(campaign._id),
          name: campaign.name,
          slotKey: slot.slotKey,
          error: error?.message || 'Send failed',
        });
      }
    }
  }

  return {
    checked: campaigns.length,
    slotsRun,
    emailsSent,
    emailsFailed,
    processed,
  };
}
