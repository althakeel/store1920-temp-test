import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ isSeller: false, reason: "missing-auth-header" }, { status: 200 });
        }

        const idToken = authHeader.split(" ")[1];
        const { getAuth } = await import("@/lib/firebase-admin");

        let decodedToken;
        try {
            if (!process.env.GCLOUD_PROJECT && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                process.env.GCLOUD_PROJECT = serviceAccount.project_id;
                process.env.GOOGLE_CLOUD_PROJECT = serviceAccount.project_id;
            }
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (err) {
            return NextResponse.json(
                { isSeller: false, reason: "invalid-token", error: err.message },
                { status: 200 }
            );
        }

        const userId = decodedToken.uid;
        const { default: dbConnect } = await import("@/lib/mongodb");

        try {
            await dbConnect();
        } catch (dbError) {
            return NextResponse.json(
                {
                    isSeller: false,
                    reason: "database-unavailable",
                    message: dbError?.message || "Failed to connect to database",
                },
                { status: 503 }
            );
        }

        const { resolveDashboardAccess } = await import("@/lib/storeAccessControl");
        const { canViewStoreActivityHistory } = await import("@/lib/storeActivityLog");
        const access = await resolveDashboardAccess(userId, decodedToken);

        if (!access.isSeller) {
            return NextResponse.json(
                { isSeller: false, userId, reason: "not-seller-or-not-approved" },
                { status: 200 }
            );
        }

        return NextResponse.json({
            isSeller: true,
            storeInfo: access.store,
            userId,
            isOwner: access.isOwner,
            accessRole: access.accessRole,
            permissions: access.permissions,
            canManageTeamAccess: access.isOwner,
            canViewActivityHistory: canViewStoreActivityHistory(decodedToken.email, access.permissions),
        });
    } catch (error) {
        console.error("[is-seller API] Error:", error);
        return NextResponse.json(
            {
                isSeller: false,
                reason: "server-error",
                message: error?.message || "Internal server error",
            },
            { status: 503 }
        );
    }
}
