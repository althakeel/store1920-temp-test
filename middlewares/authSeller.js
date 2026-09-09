import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Store from '@/models/Store';
import StoreUser from '@/models/StoreUser';

const authSeller = async (userId, emailFromToken = '') => {
    try {
        if (!userId) {
            console.log('[authSeller] No userId provided');
            return false;
        }
        await connectDB();
        
        // First check: User owns a store
        const ownedStore = await Store.findOne({ userId: userId }).lean();
        console.log('[authSeller] Owned store found:', ownedStore ? `Yes (${ownedStore._id})` : 'No');
        console.log('[authSeller] Owned store status:', ownedStore?.status);
        
        if (ownedStore && ownedStore.status !== 'rejected') {
            const status = ownedStore.status || 'missing';
            console.log('[authSeller] User owns store with status:', status, ownedStore._id);
            return ownedStore._id.toString();
        }
        
        // Second check: User is a team member with access to another's store
        let teamMembership = await StoreUser.findOne({
            userId: userId,
            status: { $in: ['approved', 'pending'] }
        }).sort({ updatedAt: -1 }).lean();

        // Fallback: match by email if userId wasn't linked yet.
        // Google sign-in on the warehouse app often has no Mongo User row yet,
        // so use the Firebase token email as well as User.email.
        if (!teamMembership) {
            const userProfile = await User.findById(userId).lean();
            const userEmail = String(emailFromToken || userProfile?.email || '')
                .trim()
                .toLowerCase();
            if (userEmail) {
                teamMembership = await StoreUser.findOne({
                    email: userEmail,
                    status: { $in: ['invited', 'pending', 'approved'] }
                }).sort({ updatedAt: -1 }).lean();

                if (teamMembership && !teamMembership.userId) {
                    await StoreUser.findByIdAndUpdate(teamMembership._id, {
                        userId: userId,
                        status: 'approved'
                    });
                    console.log('[authSeller] Linked team membership by email:', teamMembership.storeId);
                }
            }
        }

        if (teamMembership) {
            console.log('[authSeller] Found team membership:', teamMembership.storeId);
            const store = await Store.findById(teamMembership.storeId).lean();
            if (store && store.status !== 'rejected') {
                console.log('[authSeller] User has access to store via team membership:', store._id, 'status:', store.status || 'missing');
                return store._id.toString();
            }
        }
        
        console.log('[authSeller] User has no seller access');
        return false;
    } catch (error) {
        console.log('[authSeller] Error:', error);
        return false;
    }
}

export default authSeller