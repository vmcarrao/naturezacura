# Setup Guide: Natureza Cura Configuration

This guide details the crucial steps required to prepare the application for production, specifically resolving the configuration placeholders identified in Phase 1.

## 1. Firebase Configuration

The client-side application needs access to your Firebase project. This determines where data (like appointments) is saved.

1. Open `config.js` in the root of your project.
2. Locate the `firebase` object within `AppConfig`.
3. Replace the placeholders with your actual Firebase project settings:

```javascript
// config.js
firebase: {
    apiKey: "AIzaSyB...", // Your real API Key
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abc123def"
}
```

**Where to find these:** Go to your Firebase Console -> Project Overview -> Settings (Gear Icon) -> Project settings -> General. Scroll down to "Your apps" to find the snippet.

## 2. Firebase Functions Configuration

Your backend (Stripe operations) is powered by Firebase Functions. You need to supply the environment keys.

Open your terminal and run the following command to securely set these variables in Firebase Functions (execute from the `functions/` directory):

```bash
firebase functions:config:set stripe.secret_key="sk_live_YOUR_KEY" stripe.webhook_secret="whsec_YOUR_KEY" calendly.token="YOUR_CALENDLY_TOKEN" app.url="https://naturezacura.com.br"
```

* `stripe.secret_key`: Find this in the Stripe Dashboard (Developers > API keys).
* `stripe.webhook_secret`: Generated when you setup the webhook in Stripe (see Step 3).
* `calendly.token`: Generate a Personal Access Token in your Calendly integrations page.
* `app.url`: The live URL where you will deploy this website (used for Stripe redirect).

After setting these, deploy the functions:

```bash
npm run deploy
```

## 3. Stripe Webhooks

Stripe needs a valid URL to tell your backend when a payment is successful.

1. Go to **Stripe Dashboard > Developers > Webhooks**.
2. Click **Add an endpoint**.
3. Set the **Endpoint URL** to your deployed Firebase Function URL. It usually looks like:
    `https://us-central1-[your-project-id].cloudfunctions.net/stripeWebhook`
4. Select events to listen to. At minimum, you MUST select `checkout.session.completed`.
5. Click **Add endpoint**.
6. Stripe will now reveal a **Signing secret** (starts with `whsec_...`). Set this securely using the `firebase functions:config:set` command mentioned in Step 2.
