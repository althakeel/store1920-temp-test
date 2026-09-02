import connectDB from '@/lib/mongodb';
import EmailMarketingCampaign from '@/models/EmailMarketingCampaign';
import { getDueCampaignSlots, campaignIsFullyCompleted } from '@/lib/emailMarketingSchedule';
import { sendEmailMarketingCampaign } from '@/lib/emailMarketingCampaignSend';

/**
 * Process all active email marketing campaigns that are due right now.
 */
export async function runDueEmailMarketingCampaigns({ now = new Date(), dryRun = false } = {}) {
  await connectDB();

  const campaigns = await EmailMarketingCampaign.find({
    status: 'active',
  }).limit(100);

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

      try {
        const result = await sendEmailMarketingCampaign(campaign, { slotKey: slot.slotKey });
        campaign.sentSlots = Array.from(new Set([...(campaign.sentSlots || []), slot.slotKey]));
        campaign.totalSent = Number(campaign.totalSent || 0) + Number(result.emailsSent || 0);
        campaign.totalFailed = Number(campaign.totalFailed || 0) + Number(result.emailsFailed || 0);
        campaign.lastRunAt = new Date();
        campaign.runLog = [
          ...(campaign.runLog || []).slice(-40),
          {
            at: new Date(),
            slotKey: slot.slotKey,
            emailsSent: result.emailsSent || 0,
            emailsFailed: result.emailsFailed || 0,
          },
        ];

        if (campaignIsFullyCompleted(campaign)) {
          campaign.status = 'completed';
          campaign.stoppedAt = new Date();
        }

        await campaign.save();
        slotsRun += 1;
        emailsSent += result.emailsSent || 0;
        emailsFailed += result.emailsFailed || 0;
        processed.push({
          campaignId: String(campaign._id),
          name: campaign.name,
          slotKey: slot.slotKey,
          emailsSent: result.emailsSent || 0,
          emailsFailed: result.emailsFailed || 0,
        });
      } catch (error) {
        campaign.runLog = [
          ...(campaign.runLog || []).slice(-40),
          {
            at: new Date(),
            slotKey: slot.slotKey,
            emailsSent: 0,
            emailsFailed: 0,
            error: error?.message || 'Send failed',
          },
        ];
        await campaign.save().catch(() => {});
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
