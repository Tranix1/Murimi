# Armament shared backend

This Functions codebase owns the shared backend for Fynage, Murimi and Tengesa. Its Firebase project is `armament-f5a0b`, and `firebase.json` in the Murimi project is the deployment source for `firestore.rules`, `firestore.indexes.json` and the `murimi` Functions codebase.

No production deployment was performed. Before an operator deploys:

1. Set the real `PAYNOW_ID` and `PAYNOW_KEY` with Firebase Secret Manager.
2. Set `ARMAMENT_MONTHLY_AMOUNT_MINOR` in `functions/.env.armament-f5a0b` to the approved integer price in USD cents. Payment creation returns `503` while this value is missing or invalid; no default price is used.
3. Configure Firebase Authentication providers, Functions/Firestore billing, and the approved Paynow merchant callback settings in the Firebase Console.
4. Run `npm run build` from `functions`, then review and explicitly deploy from the Murimi project root with `firebase --project armament-f5a0b deploy --only firestore:rules,firestore:indexes,functions:murimi`.

Never commit `.env.armament-f5a0b` or substitute credentials. Emulator tests use synthetic identities and demo project IDs; they do not access production data.
