const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();

// Utility to encode email for db key (same approach as client)
function encodeEmail(email) {
    return Buffer.from(email).toString('base64').replace(/[.#$/\[\]]/g, '_');
}

// Callable function to delete a user by UID (only callable by an admin listed in /admins)
exports.deleteUserByUid = functions.https.onCall(async (data, context) => {
    // ensure the function is called by an authenticated user
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Request had no authentication');
    }

    const callerUid = context.auth.uid;
    try {
        // check if caller is an admin (simple pattern: admins/{callerUid} exists)
        const adminSnap = await db.ref(`admins/${callerUid}`).once('value');
        if (!adminSnap.exists()) {
            throw new functions.https.HttpsError('permission-denied', 'Caller is not an admin');
        }

        const uidToDelete = data && data.uid;
        if (!uidToDelete) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing target uid');
        }

        // fetch user data from database (try artisans then users)
        const artisanSnap = await db.ref(`allArtisans/${uidToDelete}`).once('value');
        const userSnap = await db.ref(`users/${uidToDelete}`).once('value');

        const artisanData = artisanSnap.val();
        const userData = userSnap.val();

        const emailToBan = (artisanData && artisanData.email) || (userData && userData.email) || null;

        // if we have an email, add to bannedUsers to prevent re-signup
        if (emailToBan) {
            const encoded = encodeEmail(emailToBan);
            await db.ref(`bannedUsers/${encoded}`).set({
                email: emailToBan,
                bannedAt: Date.now(),
                reason: 'Banned by admin via deleteUserByUid'
            });
        }

        // delete from Firebase Authentication
        try {
            await admin.auth().deleteUser(uidToDelete);
        } catch (err) {
            // if user is not found in auth, continue (we still remove DB nodes and ban email)
            if (err.code === 'auth/user-not-found') {
                console.warn('User not found in Auth, continuing to cleanup DB and ban email');
            } else {
                throw err;
            }
        }

        // remove user DB records (artisan + users + customers + any other relevant nodes)
        await Promise.all([
            db.ref(`allArtisans/${uidToDelete}`).remove(),
            db.ref(`users/${uidToDelete}`).remove(),
            db.ref(`customers/${uidToDelete}`).remove()
        ]);

        return { success: true };
    } catch (error) {
        console.error('deleteUserByUid error:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', error.message || 'Internal error');
    }
});
