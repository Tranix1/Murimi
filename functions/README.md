# Murimi account deletion function

The callables are scoped to Firebase project `murimi-9a3e7` and region `us-central1`:

- `deleteMurimiAccount` requires a recent authentication event, recursively deletes `/users/{uid}` and its subcollections, then deletes the Firebase Authentication user.
- `deleteMurimiFarmAccount` recursively deletes only `/users/{uid}/farmAccounts/{accountId}` and its subcollections. It leaves the user's other farm accounts and sign-in intact.

Before deploying, install Firebase CLI and authenticate with an account that can deploy Functions and manage Authentication users. From the repository root, run:

```sh
firebase deploy --only functions --project murimi-9a3e7
```

The project must have Cloud Functions enabled and meet the Firebase billing requirements. Do not deploy this function to the legacy `transix-470b3` project.
