# Online saving setup (Firebase)

**Status: done (26 Nov 2026).** The project is `stack-a-castle`, and its settings are in [`js/firebase-config.js`](../js/firebase-config.js). These steps are kept as a record, and for setting up a copy of the game under another Firebase project.

Firebase redesigned its console in 2026: there is no "Build" menu anymore. Use the **Search for products** box at the top left, or the product categories in the left menu (**Security** holds Authentication, **Databases & Storage** holds Firestore).

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

1. Open **Authentication** (search for it, or left menu **Security → Authentication**), then click **Get started**.
2. On the **Sign-in method** tab, click **Google**.
3. Switch **Enable** on, choose your email as the support email, then click **Save**.

## 4. Allow the GitHub Pages site to sign in

1. Still in **Authentication**, open the **Settings** tab, then **Authorized domains**.
2. Click **Add domain**, enter **`leirocky.github.io`**, then click **Add**.

## 5. Create the database and lock it down

1. Open **Firestore** (search for it, or left menu **Databases & Storage → Firestore**), then click **Create database**.
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

## 6. Put the config in the game

Paste the values from step 2 into [`js/firebase-config.js`](../js/firebase-config.js) and push. The game then shows **Sign in to save online** in the ⋯ menu.

## If sign-in shows an error

The game's message names the setting to check:

| Message | Fix |
|---|---|
| "This website isn't on Firebase's allowed list yet" | Step 4: add the site's domain. |
| "Google sign-in isn't turned on in Firebase yet" | Step 3: enable Google. |
| "The online database isn't set up yet" | Step 5: create the Firestore database. |
| "Online save was refused" | Step 5: publish the rules exactly as shown. |

## Questions

- **Does a child need their own Google account?** No. Sign in with a parent's account on the devices that should share one castle. Each Google account gets its own castle.
- **What if we skip this?** The game keeps working with browser saving and file backups.
