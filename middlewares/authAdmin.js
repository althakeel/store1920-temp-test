import { isAdminEmail } from '@/lib/adminEmails';

const authAdmin = async (userId, email) => {
    try {
        if (!userId || !email) return false;
        return isAdminEmail(email);
    } catch (error) {
        console.error(error);
        return false;
    }
}

export default authAdmin