Setup and deploy instructions

1. Install Firebase CLI and login
   npm install -g firebase-tools
   firebase login

2. Initialize functions (if not already)
   cd functions
   npm install

3. Deploy the function
   firebase deploy --only functions:deleteUserByUid

Notes

- The callable function checks `/admins/{uid}` in Realtime Database to verify the caller is an admin.
  You must add your admin UID to `admins` node (set value to true) for the function to accept requests from your admin account.

- This function deletes the user from Firebase Authentication (admin.auth().deleteUser(uid)), bans their email by creating
  an entry under `bannedUsers/{base64Email}` and removes database nodes `allArtisans/{uid}`, `users/{uid}`, `customers/{uid}`.

- Use the client code in `public/admin.html` to call this function from the admin UI.
