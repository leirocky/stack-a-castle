# Turning on online saving (Firebase)

This is a one-time setup, about 10 minutes, done by the repo owner in a web browser. When it's finished, send the config from step 2. The code changes are tracked in [PROGRESS.md](PROGRESS.md).

Firebase's free **Spark** plan is enough. It allows tens of thousands of saves a day; this game uses a handful per play session. No credit card is needed.

## 1. Create the project

1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name it **stack-a-castle**.
4. Turn **Google Analytics off**. It isn't needed.
5. Click **Create project**, then **Continue**.

## 2. Register the web app and copy its config

1. On the project's home page, click the **web** icon (`</>`), labelled "Add app".
2. App nickname: **stack-a-castle-web**. Leave "Firebase Hosting" **unchecked**; GitHub Pages is the host.
3. Click **Register app**.
4. Firebase shows a code block with `const firebaseConfig = { ... }`. **Copy just that object.** It looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "stack-a-castle-xxxx.firebaseapp.com",
     projectId: "stack-a-castle-xxxx",
     storageBucket: "stack-a-castle-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```

   These values are **safe to share and to put in a public repo**. They only name the project. Security comes from the rules in step 5.
5. Click **Continue to console**.

## 3. Turn on Google sign-in

1. In the left menu: **Build → Authentication → Get started**.
2. On the **Sign-in method** tab, click **Google**.
3. Switch **Enable** on, choose your email as the support email, then click **Save**.

## 4. Allow the GitHub Pages site to sign in

1. Still in **Authentication**, open the **Settings** tab, then **Authorized domains**.
2. Click **Add domain**, enter **`leirocky.github.io`**, then click **Add**.

## 5. Create the database and lock it down

1. Left menu: **Build → Firestore Database → Create database**.
2. Location: pick a US one (for example **nam5** or **us-west1**). This can't be changed later.
3. Start in **production mode**, then click **Create**.
4. Open the **Rules** tab, replace everything with the following, and click **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Each signed-in player can read and write only their own castle.
       match /castles/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

## 6. Send the config

Paste the `firebaseConfig` object from step 2 into the chat. The code will then:

- add a **Sign in to save online** button to the ⋯ menu (playing without signing in still works),
- upload the device's castle the first time you sign in,
- load the castle on any device where you're signed in, with changes syncing live,
- keep saving to the browser as a backup.

## Questions

- **Does a child need their own Google account?** No. Sign in with a parent's account on the devices that should share one castle. Each Google account gets its own castle.
- **What if we skip this?** The game keeps working with browser saving and file backups.
